export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.status(200).send(
    JSON.stringify({
      ok: true,
      route: "/api/state",
      now: Date.now(),
      query: req.query || {},
      env: {
        hasSheetId: !!process.env.GOOGLE_SHEET_ID,
        hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
        hasTab: !!process.env.GOOGLE_SHEET_TAB,
      },
    })
  );
}