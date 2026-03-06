import { google } from "googleapis";

// =====================
// Helpers
// =====================
function s(v) {
  return String(v === undefined || v === null ? "" : v).trim();
}
function norm(v) {
  return s(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}
function normKey(v) {
  // normaliza header: remove espaços/pontuação
  return norm(v).replace(/[^a-z0-9]/g, "");
}
function isMonthKey(v) {
  return /^\d{4}-\d{1,2}$/.test(s(v));
}
function toMonthKey(v) {
  const raw = s(v);
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
  const m2 = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[2]}-${String(m2[1]).padStart(2, "0")}`;
  return raw;
}
function isLikelyMeetingId(v) {
  const str = s(v);
  return /^\d{10,}$/.test(str); // Date.now() 13 dígitos ou similar
}
function isDateLike(v) {
  const str = s(v);
  return (
    /^\d{4}-\d{2}-\d{2}/.test(str) ||
    /^\d{2}\/\d{2}\/\d{4}/.test(str) ||
    /^\d{2}-\d{2}-\d{4}/.test(str)
  );
}

function looksLikeHeader(row) {
  const keys = (row || []).map((c) => normKey(c));
  return (
    keys.includes("tipo") ||
    keys.includes("meetingid") ||
    keys.includes("monthkey") ||
    keys.includes("sdr") ||
    keys.includes("oportunidade") ||
    keys.includes("opportunity")
  );
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && s(obj[k]) !== "") return obj[k];
  }
  return "";
}

function normSdr(v) {
  const t = norm(v);
  if (t.includes("juan")) return "juan";
  if (t.includes("heloisa")) return "heloisa";
  return t;
}

function canonicalizeFromObject(obj, fallbackMonthKey) {
  // aceita chaves em vários formatos (incluindo normalizadas)
  const monthKey =
    toMonthKey(
      pick(obj, [
        "monthKey",
        "MonthKey",
        "MONTHKEY",
        "month key",
        "Month Key",
        "monthkey",
        "mes",
        "mês",
        "month",
      ])
    ) || toMonthKey(fallbackMonthKey);

  return {
    timestamp: s(pick(obj, ["timestamp", "Timestamp", "time", "Time", "data", "Data"])),
    tipo: s(pick(obj, ["tipo", "Tipo", "TIPO"])),
    status: s(pick(obj, ["status", "Status", "STATUS"])),
    meetingId: s(
      pick(obj, ["meetingId", "meetingID", "MeetingId", "MeetingID", "MEETINGID", "meeting id", "Meeting ID", "meetingid"])
    ),
    sdr: normSdr(pick(obj, ["sdr", "SDR", "Sdr", "responsavel", "responsável"])),
    ae: s(pick(obj, ["ae", "AE", "Ae"])),
    oportunidade: s(pick(obj, ["oportunidade", "Oportunidade", "opportunity", "Opportunity", "lead", "Lead", "name", "Name"])),
    dataReuniao: s(pick(obj, ["dataReuniao", "DataReuniao", "data reuniao", "data reunião", "date", "Date"])),
    noShowCount: s(pick(obj, ["noShowCount", "NoShowCount", "noshowcount", "noshow", "NoShow", "no-shows", "noshows"])),
    monthKey,
    observacao: s(pick(obj, ["observacao", "Observacao", "OBSERVACAO", "obs", "Obs", "observação"])),
  };
}

function canonicalizeFromArray(row, fallbackMonthKey) {
  const cells = (row || []).map((c) => s(c));
  const n = cells.map((c) => norm(c));

  const knownTypes = new Set(["reuniao", "reunião", "no-show", "noshow", "no show", "penalty", "penalidade"]);
  let tipoIdx = n.findIndex((c) => knownTypes.has(c));
  if (tipoIdx === -1) tipoIdx = n.findIndex((c) => c.startsWith("reun"));

  const mkIdx = cells.findIndex((c) => isMonthKey(c) || /^\d{1,2}\/\d{4}$/.test(s(c)));
  const monthKey = mkIdx >= 0 ? toMonthKey(cells[mkIdx]) : toMonthKey(fallbackMonthKey);

  const sdrIdx = n.findIndex((c) => c.includes("juan") || c.includes("heloisa"));

  // meetingId: pega o maior "digits-only" (>=10)
  const idCandidates = cells
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => isLikelyMeetingId(c))
    .sort((a, b) => b.c.length - a.c.length);
  const meetingId = idCandidates.length ? idCandidates[0].c : "";

  // noShowCount: inteiro pequeno 1..20
  const countCandidates = cells
    .map((c, i) => ({ c, i, n: Number(c) }))
    .filter(({ c, n }) => c !== "" && Number.isFinite(n) && n >= 1 && n <= 20);
  const noShowCount = countCandidates.length ? String(countCandidates[0].n) : "";

  // data reunião
  const dateIdx = cells.findIndex((c) => isDateLike(c));
  const dataReuniao = dateIdx >= 0 ? cells[dateIdx] : "";

  // status
  const stIdx = n.findIndex((c) => c.includes("[deletado]") || c.includes("deletado"));
  const status = stIdx >= 0 ? cells[stIdx] : "";

  const used = new Set([tipoIdx, mkIdx, sdrIdx, dateIdx, stIdx]);
  idCandidates.forEach(({ i }) => used.add(i));
  countCandidates.forEach(({ i }) => used.add(i));

  const remaining = cells
    .map((c, i) => ({ c, i, nn: n[i] }))
    .filter(({ c, i, nn }) => c && !used.has(i) && !knownTypes.has(nn) && !isLikelyMeetingId(c) && !isMonthKey(c));

  // oportunidade: normalmente a mais longa
  remaining.sort((a, b) => b.c.length - a.c.length);
  const oportunidade = remaining[0]?.c || "";

  // ae: a menor (depois da oportunidade)
  const remaining2 = remaining.slice(1).sort((a, b) => a.c.length - b.c.length);
  const ae = remaining2[0]?.c || "";
  const observacao = remaining2[1]?.c || "";

  return {
    timestamp: "",
    tipo: tipoIdx >= 0 ? cells[tipoIdx] : "",
    status,
    meetingId,
    sdr: sdrIdx >= 0 ? normSdr(cells[sdrIdx]) : "",
    ae,
    oportunidade,
    dataReuniao,
    noShowCount,
    monthKey,
    observacao,
  };
}

function getEnv() {
  // fallback: aceita nomes diferentes (caso /api/log esteja usando outro padrão)
  const spreadsheetId =
    process.env.GOOGLE_SHEET_ID ||
    process.env.SHEET_ID ||
    process.env.SPREADSHEET_ID ||
    process.env.GSHEET_ID;

  const clientEmail =
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GSERVICE_CLIENT_EMAIL ||
    process.env.SHEET_CLIENT_EMAIL;

  let privateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GSERVICE_PRIVATE_KEY ||
    process.env.SHEET_PRIVATE_KEY;

  const tab =
    process.env.GOOGLE_SHEET_TAB ||
    process.env.SHEET_TAB ||
    process.env.GOOGLE_TAB ||
    process.env.SHEET_NAME;

  return { spreadsheetId, clientEmail, privateKey, tab };
}

// =====================
// Handler
// =====================
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "GET") {
      return res.status(405).send(JSON.stringify({ ok: false, error: "Method not allowed" }));
    }

    const { spreadsheetId, clientEmail, privateKey: pkRaw, tab } = getEnv();

    const envDiag = {
      hasSheetId: !!spreadsheetId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!pkRaw,
      hasTab: !!tab,
      privateKeyLen: pkRaw ? String(pkRaw).length : 0,
    };

    if (!spreadsheetId || !clientEmail || !pkRaw || !tab) {
      return res.status(500).send(JSON.stringify({ ok: false, error: "Missing env vars", env: envDiag }));
    }

    const privateKey = String(pkRaw).replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const monthKeyParam = toMonthKey(s(req.query?.monthKey || req.query?.month || ""));
    const debug = s(req.query?.debug || "") === "1";

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
      return res.status(200).send(JSON.stringify({ ok: true, events: [], diag: debug ? { ...envDiag, rows: 0 } : undefined }));
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
          const rawKey = s(header[i]);
          if (!rawKey) continue;
          const nk = normKey(rawKey);
          obj[rawKey] = row[i] ?? "";
          if (nk) obj[nk] = row[i] ?? ""; // também guarda versão normalizada (ex.: "Meeting ID" -> "meetingid")
        }
        ev = canonicalizeFromObject(obj, monthKeyParam);
      } else {
        ev = canonicalizeFromArray(row, monthKeyParam);
      }

      // filtro por mês se o evento tiver monthKey e foi pedido monthKeyParam
      const evMK = toMonthKey(ev.monthKey);
      if (monthKeyParam && evMK && evMK !== monthKeyParam) continue;

      if (!norm(ev.tipo)) continue;
      if (evMK) ev.monthKey = evMK;

      events.push(ev);
    }

    const sliced = events.length > limit ? events.slice(events.length - limit) : events;

    const payload = { ok: true, events: sliced, hasHeader };

    if (debug) {
      payload.diag = {
        ...envDiag,
        rows: rows.length,
        returned: sliced.length,
        monthKeyParam,
        sampleFirstRow: firstRow?.slice?.(0, 12) || firstRow,
        sampleLastEvent: sliced.length ? sliced[sliced.length - 1] : null,
      };
    }

    return res.status(200).send(JSON.stringify(payload));
  } catch (e) {
    return res.status(500).send(JSON.stringify({ ok: false, error: "unhandled_exception", detail: String(e?.message || e) }));
  }
}
