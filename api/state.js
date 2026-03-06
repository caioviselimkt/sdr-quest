from pathlib import Path

code = r"""// api/state.js (CommonJS) - versão ULTRA COMPAT (sem optional chaining / nullish)
// Serve para evitar crash por Node antigo (ex.: engines node 12/14).
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  function j(status, obj) {
    res.statusCode = status;
    res.end(JSON.stringify(obj));
  }

  function s(v) {
    return String(v === undefined || v === null ? "" : v).trim();
  }

  try {
    if (req.method !== "GET") return j(405, { ok: false, error: "Method not allowed" });

    var envDiag = {
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasTab: !!process.env.GOOGLE_SHEET_TAB,
      privateKeyLen: process.env.GOOGLE_PRIVATE_KEY ? String(process.env.GOOGLE_PRIVATE_KEY).length : 0,
    };

    var spreadsheetId = process.env.GOOGLE_SHEET_ID;
    var clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    var privateKey = process.env.GOOGLE_PRIVATE_KEY;
    var tab = process.env.GOOGLE_SHEET_TAB;

    if (!spreadsheetId || !clientEmail || !privateKey || !tab) {
      return j(500, { ok: false, error: "Missing env vars", env: envDiag });
    }

    privateKey = String(privateKey).replace(/\\n/g, "\n");

    var googleapis;
    try {
      googleapis = require("googleapis");
    } catch (e) {
      return j(500, { ok: false, error: "googleapis_not_available", detail: String(e && e.message ? e.message : e), env: envDiag });
    }

    var google = googleapis.google;

    var auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    var sheets = google.sheets({ version: "v4", auth: auth });

    var monthKey = s((req.query && (req.query.monthKey || req.query.month)) || "");
    var limitRaw = s((req.query && req.query.limit) || "5000");
    var limit = parseInt(limitRaw, 10);
    if (!isFinite(limit) || limit <= 0) limit = 5000;
    if (limit > 20000) limit = 20000;

    var range = tab + "!A:Z";
    var values = [];
    try {
      var resp = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: range });
      values = (resp && resp.data && resp.data.values) ? resp.data.values : [];
    } catch (e) {
      return j(500, { ok: false, error: "sheets_read_failed", detail: String(e && e.message ? e.message : e), env: envDiag });
    }

    if (!values || !values.length) return j(200, { ok: true, events: [] });

    // Detecta se a primeira linha parece header
    var first = values[0] || [];
    var lower = function (x) { return s(x).toLowerCase(); };
    var hasHeader = false;
    (first || []).forEach(function (c) {
      var t = lower(c);
      if (t === "tipo" || t === "meetingid" || t === "monthkey" || t === "sdr") hasHeader = true;
    });

    var header = hasHeader ? first : [];
    var rows = hasHeader ? values.slice(1) : values;

    function isMonthKey(v) { return /^\d{4}-\d{2}$/.test(s(v)); }

    // Ordem padrão (sem header): [timestamp, tipo, status, meetingId, sdr, ae, oportunidade, dataReuniao, noShowCount, monthKey, observacao]
    function fromArray(row) {
      var cells = (row || []).map(function (c) { return s(c); });
      var mk = "";
      for (var i = 0; i < cells.length; i++) {
        if (isMonthKey(cells[i])) { mk = cells[i]; break; }
      }
      return {
        timestamp: cells[0] || "",
        tipo: cells[1] || "",
        status: cells[2] || "",
        meetingId: cells[3] || "",
        sdr: (cells[4] || "").toLowerCase(),
        ae: cells[5] || "",
        oportunidade: cells[6] || "",
        dataReuniao: cells[7] || "",
        noShowCount: cells[8] || "",
        monthKey: mk || cells[9] || monthKey || "",
        observacao: cells[10] || "",
      };
    }

    function fromObject(obj) {
      var o = obj || {};
      function pick(keys) {
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (o[k] !== undefined && o[k] !== null && s(o[k]) !== "") return o[k];
        }
        return "";
      }
      return {
        timestamp: s(pick(["timestamp", "Timestamp", "time", "Time"])),
        tipo: s(pick(["tipo", "Tipo", "TIPO"])),
        status: s(pick(["status", "Status", "STATUS"])),
        meetingId: s(pick(["meetingId", "meetingID", "MeetingId", "MeetingID", "MEETINGID"])),
        sdr: s(pick(["sdr", "SDR", "Sdr"])).toLowerCase(),
        ae: s(pick(["ae", "AE", "Ae"])),
        oportunidade: s(pick(["oportunidade", "Oportunidade", "opportunity", "Opportunity"])),
        dataReuniao: s(pick(["dataReuniao", "DataReuniao", "data", "Data", "date", "Date"])),
        noShowCount: s(pick(["noShowCount", "NoShowCount", "noshowcount", "NoShow"])),
        monthKey: s(pick(["monthKey", "MonthKey", "MONTHKEY", "month key", "Month Key"])) || monthKey || "",
        observacao: s(pick(["observacao", "Observacao", "OBSERVACAO", "obs", "Obs"])),
      };
    }

    var events = [];

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) continue;

      var ev;
      if (hasHeader) {
        var obj = {};
        for (var c = 0; c < header.length; c++) {
          var k = s(header[c]);
          if (!k) continue;
          obj[k] = (row[c] === undefined ? "" : row[c]);
        }
        ev = fromObject(obj);
      } else {
        ev = fromArray(row);
      }

      if (monthKey && ev.monthKey && ev.monthKey !== monthKey) continue;
      if (!s(ev.tipo)) continue;

      events.push(ev);
    }

    if (events.length > limit) events = events.slice(events.length - limit);

    return j(200, { ok: true, events: events, hasHeader: hasHeader });
  } catch (e) {
    return j(500, { ok: false, error: "unhandled_exception", detail: String(e && e.message ? e.message : e) });
  }
};
"""
out = Path("/mnt/data/api_state_ULTRA_COMPAT.js")
out.write_text(code, encoding="utf-8")
out
