import { google } from "googleapis";

const norm = (v) => (v ?? "").toString().trim().toLowerCase();
const padRow = (row, len) => {
  const r = Array.isArray(row) ? [...row] : [];
  while (r.length < len) r.push("");
  return r;
};

// Colunas fixas (A..K)
const COL = {
  timestamp: 0,   // A
  tipo: 1,        // B
  status: 2,      // C
  meetingId: 3,   // D
  sdr: 4,         // E
  ae: 5,          // F
  oportunidade: 6,// G
  dataReuniao: 7, // H
  noShowCount: 8, // I
  monthKey: 9,    // J
  observacao: 10  // K
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed. Use POST /api/log" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const {
      tipo = "",
      status = "",
      meetingId = "",
      sdr = "",
      ae = "",
      oportunidade = "",
      dataReuniao = "",
      noShowCount = "",
      monthKey = "",
      observacao = ""
    } = body || {};

    // chave do upsert: monthKey + oportunidade
    if (!monthKey || !oportunidade) {
      return res.status(400).json({
        ok: false,
        error: "monthKey e oportunidade são obrigatórios para upsert",
      });
    }

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

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    // Pega as linhas existentes (A..K)
    const getResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:K5000`,
    });

    const rows = getResp.data.values || [];
    const now = new Date().toISOString();

    // procura linha existente (ignora cabeçalho)
    let foundIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const r = padRow(rows[i], 11);
      if (norm(r[COL.monthKey]) === norm(monthKey) && norm(r[COL.oportunidade]) === norm(oportunidade)) {
        foundIndex = i;
        break;
      }
    }

    // monta linha “nova”
    const buildNewRow = () => ([
      now,                 // Timestamp
      tipo || "",          // Tipo
      status || "",        // Status
      meetingId || "",     // MeetingId
      sdr || "",           // SDR
      ae || "",            // AE
      oportunidade || "",  // Oportunidade
      dataReuniao || "",   // DataReuniao
      (noShowCount ?? ""), // NoShowCount
      monthKey || "",      // MonthKey
      observacao || ""     // Observacao
    ]);

    // Atualiza linha existente (merge)
    const mergeRow = (existing) => {
      const r = padRow(existing, 11);

      // mantém Timestamp original; se vazio, seta agora
      if (!r[COL.timestamp]) r[COL.timestamp] = now;

      // sempre mantém a chave
      r[COL.oportunidade] = r[COL.oportunidade] || oportunidade;
      r[COL.monthKey] = r[COL.monthKey] || monthKey;

      // Tipo: salva última ação (ajuda a entender o que aconteceu)
      if (tipo) r[COL.tipo] = tipo;

      // ✅ Regras de status:
      // - Se for deletado: grava [deletado]
      // - Se for reunião criada: limpa status (reativa)
      if (status === "[deletado]") {
        r[COL.status] = "[deletado]";
      } else if (tipo === "reuniao") {
        r[COL.status] = "";
      }

      // Atualiza dados quando vierem
      if (meetingId) r[COL.meetingId] = meetingId;
      if (sdr) r[COL.sdr] = sdr;
      if (ae) r[COL.ae] = ae;
      if (dataReuniao) r[COL.dataReuniao] = dataReuniao;

      // NoShowCount: atualiza quando vier (1/2/3)
      if (noShowCount !== "" && noShowCount !== null && noShowCount !== undefined) {
        r[COL.noShowCount] = String(noShowCount);
      }

      // Observação: salva a última
      if (observacao) r[COL.observacao] = observacao;

      return r;
    };

    if (foundIndex === -1) {
      // não existe -> cria (append)
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [buildNewRow()] },
      });

      return res.status(200).json({ ok: true, action: "created" });
    }

    // existe -> update na mesma linha
    const rowNumber = foundIndex + 1; // 1-indexed
    const merged = mergeRow(rows[foundIndex]);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowNumber}:K${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [merged] },
    });

    return res.status(200).json({ ok: true, action: "updated", row: rowNumber });
  } catch (err) {
    console.error("API /api/log error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal error",
      details: String(err?.message || err),
    });
  }
}