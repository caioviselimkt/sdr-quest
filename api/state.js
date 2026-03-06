from pathlib import Path

code = r"""// api/state.js (CommonJS) - versão "SAFE" com diagnóstico em JSON
// Objetivo: evitar crash silencioso no Vercel e garantir que o front consiga sincronizar.

function safeStr(v) {
  return String(v ?? "").trim();
}
function lower(v) {
  return safeStr(v).toLowerCase();
}
function isMonthKey(v) {
  return /^\d{4}-\d{2}$/.test(safeStr(v));
}
function isLikelyMeetingId(v) {
  const s = safeStr(v);
  return /^\d{10,}$/.test(s); // Date.now() 13 dígitos ou similar
}
function looksLikeHeader(row) {
  const r = (row || []).map((c) => lower(c));
  return r.includes("tipo") || r.includes("meetingid") || r.includes("monthkey") || r.includes("sdr");
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && safeStr(obj[k]) !== "") return obj[k];
  }
  return "";
}

function canonicalizeFromObject(obj, fallbackMonthKey) {
  return {
    timestamp: safeStr(pick(obj, ["timestamp", "Timestamp", "time", "Time"])),
    tipo: safeStr(pick(obj, ["tipo", "Tipo", "TIPO"])),
    status: safeStr(pick(obj, ["status", "Status", "STATUS"])),
    meetingId: safeStr(pick(obj, ["meetingId", "meetingID", "MeetingId", "MeetingID", "MEETINGID"])),
    sdr: lower(pick(obj, ["sdr", "SDR", "Sdr"])),
    ae: safeStr(pick(obj, ["ae", "AE", "Ae"])),
    oportunidade: safeStr(pick(obj, ["oportunidade", "Oportunidade", "opportunity", "Opportunity"])),
    dataReuniao: safeStr(pick(obj, ["dataReuniao", "DataReuniao", "data", "Data", "date", "Date"])),
    noShowCount: safeStr(pick(obj, ["noShowCount", "NoShowCount", "noshowcount", "NoShow"])),
    monthKey: safeStr(pick(obj, ["monthKey", "MonthKey", "MONTHKEY", "month key", "Month Key"])) || safeStr(fallbackMonthKey),
    observacao: safeStr(pick(obj, ["observacao", "Observacao", "OBSERVACAO", "obs", "Obs"])),
  };
}

// Quando NÃO tem header no Sheets, assumimos a ordem padrão do /api/log:
// [timestamp, tipo, status, meetingId, sdr, ae, oportunidade, dataReuniao, noShowCount, monthKey, observacao]
function canonicalizeFromArray(row, fallbackMonthKey) {
  const cells = (row || []).map((c) => safeStr(c));

  // tenta achar monthKey e tipo na linha
  const mkIdx = cells.findIndex((c) => isMonthKey(c));
  const tipoIdx = cells.findIndex((c) => {
    const t = lower(c);
    return t === "reuniao" || t === "reunião" || t === "no-show" || t === "noshow" || t === "penalty";
  });
  const idIdx = cells.findIndex((c) => isLikelyMeetingId(c));
  const sdrIdx = cells.findIndex((c) => {
    const s = lower(c);
    return s === "juan" || s === "heloisa" || s === "heloísa";
  });

  // fallback por posição padrão
  const byPos = (i) => (cells[i] !== undefined ? cells[i] : "");

  const monthKey = (mkIdx >= 0 ? cells[mkIdx] : byPos(9)) || safeStr(fallbackMonthKey);
  const tipo = tipoIdx >= 0 ? cells[tipoIdx] : byPos(1);
  const meetingId = idIdx >= 0 ? cells[idIdx] : byPos(3);
  const sdr = sdrIdx >= 0 ? lower(cells[sdrIdx]) : lower(byPos(4));

  return {
    timestamp: byPos(0),
    tipo,
    status: byPos(2),
    meetingId,
    sdr,
    ae: byPos(5),
    oportunidade: byPos(6),
    dataReuniao: byPos(7),
    noShowCount: byPos(8),
    monthKey,
    observacao: byPos(10),
  };
}

module.exports = async function handler(req, res) {
  // Sempre responder JSON (evita a tela branca do Vercel)
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "GET") {
      return res.status(405).end(JSON.stringify({ ok: false, error: "Method not allowed" }));
    }

    // Diagnóstico leve (sem vazar segredo)
    const envDiag = {
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasTab: !!process.env.GOOGLE_SHEET_TAB,
      privateKeyLen: process.env.GOOGLE_PRIVATE_KEY ? String(process.env.GOOGLE_PRIVATE_KEY).length : 0,
    };

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const tab = process.env.GOOGLE_SHEET_TAB;

    if (!spreadsheetId || !clientEmail || !privateKey || !tab) {
      return res
        .status(500)
        .end(JSON.stringify({ ok: false, error: "Missing env vars", env: envDiag }));
    }

    privateKey = String(privateKey).replace(/\\n/g, "\n");

    let google;
    try {
      ({ google } = require("googleapis"));
    } catch (e) {
      return res
        .status(500)
        .end(JSON.stringify({ ok: false, error: "googleapis_not_available", detail: String(e?.message || e), env: envDiag }));
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const monthKey = safeStr(req.query.monthKey || req.query.month || "");
    const limitRaw = safeStr(req.query.limit || "5000");
    const limit = Math.max(1, Math.min(20000, parseInt(limitRaw, 10) || 5000));

    const range = `${tab}!A:Z`;

    let values = [];
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      values = (resp && resp.data && resp.data.values) || [];
    } catch (e) {
      return res
        .status(500)
        .end(JSON.stringify({ ok: false, error: "sheets_read_failed", detail: String(e?.message || e), env: envDiag }));
    }

    if (!Array.isArray(values) || values.length === 0) {
      return res.status(200).end(JSON.stringify({ ok: true, events: [] }));
    }

    const firstRow = values[0] || [];
    const hasHeader = looksLikeHeader(firstRow);

    let header = hasHeader ? firstRow : [];
    let rows = hasHeader ? values.slice(1) : values;

    const events = [];

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      let ev;
      if (hasHeader) {
        const obj = {};
        for (let i = 0; i < header.length; i++) {
          const k = safeStr(header[i]);
          if (!k) continue;
          obj[k] = row[i] ?? "";
        }
        ev = canonicalizeFromObject(obj, monthKey);
      } else {
        ev = canonicalizeFromArray(row, monthKey);
      }

      // filtra mês se aplicável
      if (monthKey && ev.monthKey && ev.monthKey !== monthKey) continue;

      if (!safeStr(ev.tipo)) continue; // precisa ter tipo

      events.push(ev);
    }

    const sliced = events.length > limit ? events.slice(events.length - limit) : events;

    return res.status(200).end(JSON.stringify({ ok: true, events: sliced, hasHeader }));
  } catch (e) {
    // Último fallback - nunca crashar sem resposta
    return res
      .status(500)
      .end(JSON.stringify({ ok: false, error: "unhandled_exception", detail: String(e?.message || e) }));
  }
};
"""
out = Path("/mnt/data/api_state_SAFE.js")
out.write_text(code, encoding="utf-8")
str(out)
