import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST /api/log",
      });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

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
      return res.status(500).json({
        ok: false,
        error: "Missing env vars",
        missing: {
          GOOGLE_SHEET_ID: !spreadsheetId,
          GOOGLE_CLIENT_EMAIL: !clientEmail,
          GOOGLE_PRIVATE_KEY: !privateKey,
        },
      });
    }

    // ✅ FORÇA autenticação correta com Service Account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const authClient = await auth.getClient(); // <- aqui ele pega token automaticamente
    const sheets = google.sheets({ version: "v4", auth: authClient });

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
    console.error("API /api/log error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal error",
      details: String(err?.message || err),
    });
  }
}