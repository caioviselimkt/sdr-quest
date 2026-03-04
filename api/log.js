const { google } = require("googleapis");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      tipo,
      status,
      meetingId,
      sdr,
      ae,
      oportunidade,
      dataReuniao,
      noShowCount,
      monthKey,
      observacao,
    } = body || {};

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_TAB || "Logs";

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets"]
    );

    const sheets = google.sheets({ version: "v4", auth });

    const timestamp = new Date().toISOString();

    const values = [[
      timestamp,
      tipo || "",
      status || "",
      meetingId || "",
      sdr || "",
      ae || "",
      oportunidade || "",
      dataReuniao || "",
      (noShowCount ?? ""),
      monthKey || "",
      observacao || ""
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error", details: String(err) });
  }
};