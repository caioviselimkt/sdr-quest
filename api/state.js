import { google } from "googleapis";

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function authClient() {
  const clientEmail = getEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = getEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function normalizeCompany(s = "") {
  return String(s).trim().replace(/\s+/g, " ");
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed. Use GET" });
    }

    const monthKey = String(req.query.month || "").trim();
    if (!monthKey) {
      return res.status(400).json({ ok: false, error: "Missing ?month=YYYY-MM" });
    }

    const sheetId = getEnv("GOOGLE_SHEET_ID");
    const tab = getEnv("GOOGLE_SHEET_TAB"); // sua aba de eventos

    const auth = authClient();
    const sheets = google.sheets({ version: "v4", auth });

    // Lê tudo da aba (assumindo 1ª linha = cabeçalho)
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A:Z`,
    });

    const values = r.data.values || [];
    if (values.length < 2) {
      return res.status(200).json({
        ok: true,
        monthKey,
        juanScore: 0,
        heloisaScore: 0,
        meetingsList: [],
        leads: [],
      });
    }

    const header = values[0].map((h) => String(h || "").trim());
    const rows = values.slice(1);

    const col = (name) => header.indexOf(name);

    // Esperado no Sheets (seu /api/log deve escrever isso):
    // monthKey, meetingId, tipo, status, sdr, ae, oportunidade, dataReuniao, noShowCount
    const iMonth = col("monthKey");
    const iTipo = col("tipo");
    const iStatus = col("status");
    const iSdr = col("sdr");
    const iAe = col("ae");
    const iOpp = col("oportunidade");
    const iDate = col("dataReuniao");
    const iNoShow = col("noShowCount");
    const iMeetingId = col("meetingId");

    const meetingsMap = new Map(); // key = meetingId (mês:empresa)
    const leadsMap = new Map();    // key = meetingId (mês:empresa)

    for (const row of rows) {
      const rowMonth = String(row[iMonth] || "").trim();
      if (rowMonth !== monthKey) continue;

      const tipo = String(row[iTipo] || "").trim();
      const status = String(row[iStatus] || "").trim();
      const sdr = String(row[iSdr] || "").trim();
      const ae = String(row[iAe] || "").trim();
      const oportunidade = normalizeCompany(row[iOpp] || "");
      const dataReuniao = String(row[iDate] || "").trim();
      const noShowCount = safeNum(row[iNoShow] || 0);
      const meetingId = String(row[iMeetingId] || "").trim();

      if (!meetingId || !oportunidade) continue;

      // Reuniões ativas = tipo=reuniao e não deletado
      if (tipo === "reuniao") {
        if (status === "[deletado]") {
          meetingsMap.delete(meetingId);
        } else {
          meetingsMap.set(meetingId, {
            id: meetingId, // id estável pra UI
            meetingId,
            sdr,
            ae,
            opportunity: oportunidade,
            date: dataReuniao,
          });
        }
      }

      // No-shows (mostra no radar) = noShowCount > 0
      if (noShowCount > 0) {
        leadsMap.set(meetingId, {
          id: meetingId,
          name: oportunidade,
          sdr: sdr || "juan",
          noShows: noShowCount,
        });
      }
    }

    const meetingsList = Array.from(meetingsMap.values());
    const leads = Array.from(leadsMap.values());

    // Scores a partir das reuniões ativas
    const juanScore = meetingsList.filter((m) => m.sdr === "juan").length;
    const heloisaScore = meetingsList.filter((m) => m.sdr === "heloisa").length;

    return res.status(200).json({
      ok: true,
      monthKey,
      juanScore,
      heloisaScore,
      meetingsList,
      leads,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal error", details: String(e?.message || e) });
  }
}