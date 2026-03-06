const { google } = require("googleapis");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const tab = process.env.GOOGLE_SHEET_TAB;

    if (!spreadsheetId || !clientEmail || !privateKey || !tab) {
      return res.status(500).json({
        error:
          "Missing env vars. Required: GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_TAB",
      });
    }

    privateKey = privateKey.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const monthKey = String(req.query.monthKey || "").trim();
    const limitRaw = String(req.query.limit || "5000");
    const limit = Math.max(1, Math.min(20000, parseInt(limitRaw, 10) || 5000));

    const range = `${tab}!A:Z`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const values = (resp && resp.data && resp.data.values) || [];
    if (!Array.isArray(values) || values.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ events: [] });
    }

    const looksLikeHeader = (row) => {
      const r = (row || []).map((c) => String(c || "").toLowerCase().trim());
      return r.includes("tipo") || r.includes("meetingid") || r.includes("monthkey");
    };

    const DEFAULT_HEADER = [
      "timestamp",
      "tipo",
      "status",
      "meetingId",
      "sdr",
      "ae",
      "oportunidade",
      "dataReuniao",
      "noShowCount",
      "monthKey",
      "observacao",
    ];

    let header = values[0] || [];
    let rows = values.slice(1);

    if (!looksLikeHeader(header)) {
      header = DEFAULT_HEADER;
      rows = values;
    }

    const events = [];
    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const obj = {};
      for (let i = 0; i < header.length; i++) {
        const key = String(header[i] || "").trim();
        if (!key) continue;
        obj[key] = row[i] ?? "";
      }

      const tipo = obj.tipo ?? obj.Tipo ?? obj.TIPO ?? "";
      const mk =
        obj.monthKey ??
        obj.MonthKey ??
        obj.MONTHKEY ??
        obj["month key"] ??
        obj["Month Key"] ??
        "";

      if (monthKey) {
        const mkNorm = String(mk || "").trim();
        if (mkNorm !== monthKey) continue;
      }

      if (!String(tipo || "").trim()) continue;

      events.push(obj);
    }

    const sliced = events.length > limit ? events.slice(events.length - limit) : events;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ events: sliced });
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "Failed to read sheet" });
  }
};