import { google } from "googleapis";

function s(v) {
  return String(v === undefined || v === null ? "" : v).trim();
}
function lower(v) {
  return s(v).toLowerCase();
}
function isMonthKey(v) {
  return /^\d{4}-\d{2}$/.test(s(v));
}
function looksLikeHeader(row) {
  const r = (row || []).map((c) => lower(c));
  return r.includes("tipo") || r.includes("meetingid") || r.includes("monthkey") || r.includes("sdr");
}
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && s(obj[k]) !== "") return obj[k];
  }
  return "";
}

function canonicalizeFromObject(obj, fallbackMonthKey) {
  return {
    timestamp: s(pick(obj, ["timestamp", "Timestamp", "time", "Time"])),
    tipo: s(pick(obj, ["tipo", "Tipo", "TIPO"])),
    status: s(pick(obj, ["status", "Status", "STATUS"])),
    meetingId: s(pick(obj, ["meetingId", "meetingID", "MeetingId", "MeetingID", "MEETINGID"])),
    sdr: lower(pick(obj, ["sdr", "SDR", "Sdr"])),
    ae: s(pick(obj, ["ae", "AE", "Ae"])),
    oportunidade: s(pick(obj, ["oportunidade", "Oportunidade", "opportunity", "Opportunity"])),
    dataReuniao: s(pick(obj, ["dataReuniao", "DataReuniao", "data", "Data", "date", "Date"])),
    noShowCount: s(pick(obj, ["noShowCount", "NoShowCount", "noshowcount", "NoShow"])),
    monthKey:
      s(pick(obj, ["monthKey", "MonthKey", "MONTHKEY", "month key", "Month Key"])) || s(fallbackMonthKey),
    observacao: s(pick(obj, ["observacao", "Observacao", "OBSERVACAO", "obs", "Obs"])),
  };
}

// Quando NÃO tem header no Sheets, assumimos a ordem padrão do /api/log:
// [timestamp, tipo, status, meetingId, sdr, ae, oportunidade, dataReuniao, noShowCount, monthKey, observacao]
function canonicalizeFromArray(row, fallbackMonthKey) {
  const cells = (row || []).map((c) => s(c));
  const mkIdx = cells.findIndex((c) => isMonthKey(c));
  const monthKey = (mkIdx >= 0 ? cells[mkIdx] : cells[9]) || s(fallbackMonthKey);

  return {
    timestamp: cells[0] || "",
    tipo: cells[1] || "",
    status: cells[2] || "",
    meetingId: cells[3] || "",
    sdr: lower(cells[4] || ""),
    ae: cells[5] || "",
    oportunidade: cells[6] || "",
    dataReuniao: cells[7] || "",
    noShowCount: cells[8] || "",
    monthKey,
    observacao: cells[10] || "",
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "GET") {
      return res.status(405).send(JSON.stringify({ ok: false, error: "Method not allowed" }));
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const tab = process.env.GOOGLE_SHEET_TAB;

    const envDiag = {
      hasSheetId: !!spreadsheetId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey,
      hasTab: !!tab,
      privateKeyLen: privateKey ? String(privateKey).length : 0,
    };

    if (!spreadsheetId || !clientEmail || !privateKey || !tab) {
      return res.status(500).send(JSON.stringify({ ok: false, error: "Missing env vars", env: envDiag }));
    }

    privateKey = String(privateKey).replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const monthKey = s(req.query?.monthKey || req.query?.month || "");
    const limitRaw = s(req.query?.limit || "5000");
    let limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 5000;
    if (limit > 20000) limit = 20000;

    const range = `${tab}!A:Z`;

    let values = [];
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      values = resp?.data?.values || [];
    } catch (e) {
      return res
        .status(500)
        .send(JSON.stringify({ ok: false, error: "sheets_read_failed", detail: String(e?.message || e), env: envDiag }));
    }

    if (!Array.isArray(values) || values.length === 0) {
      return res.status(200).send(JSON.stringify({ ok: true, events: [] }));
    }

    const firstRow = values[0] || [];
    const hasHeader = looksLikeHeader(firstRow);

    const header = hasHeader ? firstRow : [];
    const rows = hasHeader ? values.slice(1) : values;

    const events = [];

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      let ev;
      if (hasHeader) {
        const obj = {};
        for (let i = 0; i < header.length; i++) {
          const k = s(header[i]);
          if (!k) continue;
          obj[k] = row[i] ?? "";
        }
        ev = canonicalizeFromObject(obj, monthKey);
      } else {
        ev = canonicalizeFromArray(row, monthKey);
      }

      if (monthKey && ev.monthKey && ev.monthKey !== monthKey) continue;
      if (!s(ev.tipo)) continue;

      events.push(ev);
    }

    const sliced = events.length > limit ? events.slice(events.length - limit) : events;

    return res.status(200).send(JSON.stringify({ ok: true, events: sliced, hasHeader }));
  } catch (e) {
    return res.status(500).send(JSON.stringify({ ok: false, error: "unhandled_exception", detail: String(e?.message || e) }));
  }
}