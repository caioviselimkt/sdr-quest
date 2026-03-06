import { google } from "googleapis";

/**
 * api/state.js (ESM) - AUTOTAB
 * - Se a aba configurada (GOOGLE_SHEET_TAB) não tiver linhas, procura automaticamente outra aba com eventos.
 * - Retorna eventos canônicos para o front (tipo/status/meetingId/sdr/monthKey etc).
 * - ?debug=1 adiciona diagnóstico (não expõe segredo).
 */

function s(v) {
  return String(v === undefined || v === null ? "" : v).trim();
}
function lower(v) {
  return s(v).toLowerCase();
}
function normKey(v) {
  // normaliza header: remove espaços e caracteres especiais simples
  return lower(v).replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "");
}
function stripAccents(v) {
  return s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function normSdr(v) {
  const x = stripAccents(v).toLowerCase().trim();
  if (x === "heloisa" || x === "heloísa") return "heloisa";
  if (x === "juan") return "juan";
  return x;
}
function normMonthKey(v) {
  const x = s(v);
  // aceita 2026-3 e converte pra 2026-03
  const m = x.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const mm = String(m[2]).padStart(2, "0");
    return `${m[1]}-${mm}`;
  }
  return x;
}
function isMonthKey(v) {
  return /^\d{4}-\d{2}$/.test(normMonthKey(v));
}
function quoteSheetTitle(title) {
  // sempre quote para evitar problema com espaços
  const t = String(title || "").replace(/'/g, "''");
  return `'${t}'`;
}

function looksLikeHeader(row) {
  const r = (row || []).map((c) => normKey(c));
  return (
    r.includes("tipo") ||
    r.includes("meetingid") ||
    r.includes("meetingld") || // L no lugar do I
    r.includes("monthkey") ||
    r.includes("sdr")
  );
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && s(obj[k]) !== "") return obj[k];
  }
  return "";
}

function canonicalizeFromObject(obj, fallbackMonthKey) {
  // Suporta variações de header (MeetingId vs Meetingld, MonthKey etc)
  return {
    timestamp: s(pick(obj, ["timestamp", "Timestamp", "TIME", "Time"])),
    tipo: s(pick(obj, ["tipo", "Tipo", "TIPO"])),
    status: s(pick(obj, ["status", "Status", "STATUS"])),
    meetingId: s(
      pick(obj, [
        "meetingId",
        "meetingID",
        "MeetingId",
        "MeetingID",
        "MEETINGID",
        "Meetingld", // (L)
        "meetingld",
        "MeetingID ",
      ])
    ),
    sdr: normSdr(pick(obj, ["sdr", "SDR", "Sdr"])),
    ae: s(pick(obj, ["ae", "AE", "Ae"])),
    oportunidade: s(pick(obj, ["oportunidade", "Oportunidade", "opportunity", "Opportunity"])),
    dataReuniao: s(pick(obj, ["dataReuniao", "DataReuniao", "data", "Data", "date", "Date"])),
    noShowCount: s(pick(obj, ["noShowCount", "NoShowCount", "noshowcount", "NoShow"])),
    monthKey: normMonthKey(
      s(pick(obj, ["monthKey", "MonthKey", "MONTHKEY", "month key", "Month Key"])) || s(fallbackMonthKey)
    ),
    observacao: s(pick(obj, ["observacao", "Observacao", "OBSERVACAO", "obs", "Obs"])),
  };
}

// Quando NÃO tem header: ordem padrão do /api/log
// [Timestamp, Tipo, Status, MeetingId, SDR, AE, Oportunidade, DataReuniao, NoShowCount, MonthKey, Observacao]
function canonicalizeFromArray(row, fallbackMonthKey) {
  const cells = (row || []).map((c) => s(c));
  const mkIdx = cells.findIndex((c) => isMonthKey(c));
  const monthKey = normMonthKey((mkIdx >= 0 ? cells[mkIdx] : cells[9]) || s(fallbackMonthKey));

  return {
    timestamp: cells[0] || "",
    tipo: cells[1] || "",
    status: cells[2] || "",
    meetingId: cells[3] || "",
    sdr: normSdr(cells[4] || ""),
    ae: cells[5] || "",
    oportunidade: cells[6] || "",
    dataReuniao: cells[7] || "",
    noShowCount: cells[8] || "",
    monthKey,
    observacao: cells[10] || "",
  };
}

async function readTabValues(sheets, spreadsheetId, tabTitle) {
  const range = `${quoteSheetTitle(tabTitle)}!A:Z`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp?.data?.values || [];
  return values;
}

async function findBestTab(sheets, spreadsheetId, preferredTab) {
  // 1) tenta aba preferida primeiro
  const results = [];
  const tryTitles = [];

  if (preferredTab) tryTitles.push(preferredTab);

  // 2) lista abas do spreadsheet para fallback
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title,hidden))",
  });

  const allTitles =
    meta?.data?.sheets
      ?.map((sh) => sh?.properties)
      ?.filter((p) => p && !p.hidden)
      ?.map((p) => String(p.title || ""))
      ?.filter(Boolean) || [];

  for (const t of allTitles) {
    if (!tryTitles.includes(t)) tryTitles.push(t);
  }

  // Limite de varredura para não estourar tempo em planilhas enormes
  const SCAN_LIMIT = 25;

  for (let i = 0; i < tryTitles.length && i < SCAN_LIMIT; i++) {
    const title = tryTitles[i];
    try {
      const values = await readTabValues(sheets, spreadsheetId, title);
      if (!Array.isArray(values) || values.length === 0) {
        results.push({ title, rows: 0, hasHeader: false });
        continue;
      }
      const first = values[0] || [];
      const hasHeader = looksLikeHeader(first);
      const rows = hasHeader ? values.length - 1 : values.length;

      results.push({ title, rows, hasHeader });

      // se já tiver linhas, ótimo — mas ainda vamos escolher o "melhor"
    } catch {
      results.push({ title, rows: -1, hasHeader: false, error: true });
    }
  }

  // escolhe o tab com maior rows (>=1)
  const candidates = results.filter((r) => r.rows > 0);
  if (candidates.length === 0) {
    return { chosen: preferredTab || (tryTitles[0] || ""), scan: results, values: [] };
  }

  candidates.sort((a, b) => b.rows - a.rows);
  const chosen = candidates[0].title;

  // lê novamente o escolhido (garante values)
  const values = await readTabValues(sheets, spreadsheetId, chosen);

  return { chosen, scan: results, values };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const debug = s(req.query?.debug || "") === "1";

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

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(500).send(JSON.stringify({ ok: false, error: "Missing env vars", env: envDiag }));
    }

    privateKey = String(privateKey).replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const monthKeyParam = normMonthKey(s(req.query?.monthKey || req.query?.month || ""));
    const limitRaw = s(req.query?.limit || "5000");
    let limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 5000;
    if (limit > 20000) limit = 20000;

    // ======== AUTO TAB ========
    let values = [];
    let chosenTab = tab || "";

    try {
      if (tab) {
        values = await readTabValues(sheets, spreadsheetId, tab);
      }
      const first = values?.[0] || [];
      const hasHeader = looksLikeHeader(first);
      const rowsCount = hasHeader ? Math.max(0, values.length - 1) : values.length;

      if (!tab || rowsCount === 0) {
        const found = await findBestTab(sheets, spreadsheetId, tab || "");
        chosenTab = found.chosen || tab || chosenTab;
        values = found.values || [];
        const first2 = values?.[0] || [];
        const hasHeader2 = looksLikeHeader(first2);
        const rowsCount2 = hasHeader2 ? Math.max(0, values.length - 1) : values.length;

        // Se mesmo assim vazio, retorna diag completo (quando debug=1)
        if ((!Array.isArray(values) || values.length <= 1) && debug) {
          return res.status(200).send(
            JSON.stringify({
              ok: true,
              events: [],
              hasHeader: hasHeader2,
              chosenTab,
              diag: { ...envDiag, monthKeyParam, rows: rowsCount2, returned: 0, scan: found.scan },
            })
          );
        }

        // se não for debug, segue normalmente com values (mesmo que vazio)
        if (debug) {
          // anexa scan no final
          req.__scan = found.scan;
        }
      }
    } catch (e) {
      return res
        .status(500)
        .send(JSON.stringify({ ok: false, error: "tab_discovery_failed", detail: String(e?.message || e), env: envDiag }));
    }

    if (!Array.isArray(values) || values.length === 0) {
      return res.status(200).send(JSON.stringify({ ok: true, events: [], hasHeader: false, chosenTab, diag: debug ? { ...envDiag, monthKeyParam, rows: 0 } : undefined }));
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
          const kRaw = s(header[i]);
          if (!kRaw) continue;
          // cria duas chaves: a original e a normalizada (facilita pick)
          obj[kRaw] = row[i] ?? "";
          obj[normKey(kRaw)] = row[i] ?? "";
        }

        // pick vai achar tanto "Meetingld" quanto "meetingld" etc.
        ev = canonicalizeFromObject(obj, monthKeyParam);
      } else {
        ev = canonicalizeFromArray(row, monthKeyParam);
      }

      // filtra mês se possível
      if (monthKeyParam && ev.monthKey && normMonthKey(ev.monthKey) !== monthKeyParam) continue;

      if (!s(ev.tipo)) continue;

      events.push(ev);
    }

    const sliced = events.length > limit ? events.slice(events.length - limit) : events;

    const payload = {
      ok: true,
      events: sliced,
      hasHeader,
      chosenTab,
    };

    if (debug) {
      payload.diag = {
        ...envDiag,
        monthKeyParam,
        rows: rows.length,
        returned: sliced.length,
        sampleFirstRow: firstRow,
        sampleLastEvent: sliced.length ? sliced[sliced.length - 1] : null,
        scan: req.__scan || undefined,
      };
    }

    return res.status(200).send(JSON.stringify(payload));
  } catch (e) {
    return res.status(500).send(JSON.stringify({ ok: false, error: "unhandled_exception", detail: String(e?.message || e) }));
  }
}
