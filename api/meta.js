// Reports which source is live so the client renders the right filters and
// knows it can run keyless. No secrets exposed.
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  const has = !!process.env.SPOONACULAR_API_KEY;
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, source: has ? "spoonacular" : "none", sourceName: has ? "Spoonacular" : "None" }));
};
