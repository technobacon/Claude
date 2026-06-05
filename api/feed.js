// Forkful serverless backend (Vercel "Other" project — zero deps, zero build).
// Holds the Spoonacular key in an env var and returns recipes. Lives at the
// repo ROOT so Vercel deploys it with no root-directory setting.
//
//   Env var required: SPOONACULAR_API_KEY
//   GET /api/feed?diet=&cuisine=&mealType=&maxTime=&difficulty=&limit=

const HARD_TECH = [
  "braise", "sear", "caramel", "deglaze", "reduce by", "reduce until", "fold in",
  "knead", "proof", "prove ", "temper", "emulsif", "blanch", "poach", "confit",
  "sous vide", "ferment", "marinat", "flambe", "julienne", "debone", "fillet",
  "baste", "sauté", "saute", "sweat", "purée", "puree", "strain", "sieve",
  "whisk until", "beat until", "simmer for", "render", "truss", "glaze", "caramelis",
];

function computeDifficulty(ingredientCount, instructions, minutes, stepsOverride) {
  const text = (instructions || "").toLowerCase();
  let steps = stepsOverride || 0;
  if (!steps) {
    const lines = (instructions || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    steps = lines.length;
    if (steps <= 1) steps = Math.max(1, text.split(/[.!?]\s+/).filter((s) => s.trim()).length);
  }
  let hard = 0;
  for (const t of HARD_TECH) if (text.includes(t)) hard++;
  let level = "medium", score;
  if (minutes) {
    score = minutes / 12 + steps * 0.4 + hard * 1.5;
    if (score <= 4) level = "easy"; else if (score >= 8.5) level = "hard";
  } else {
    const longTime = /overnight|\bhours?\b|\b[2-9]\d\s*min/.test(text) ? 1 : 0;
    const easyLean = hard === 0 && /\b(toss|assemble|no.?cook|combine|spread|layer|stir together|drizzle)\b/.test(text) ? 1 : 0;
    score = ingredientCount * 0.3 + steps * 0.6 + hard * 2.2 + longTime * 1.5 - easyLean * 2;
    if (score <= 4.5) level = "easy"; else if (score >= 10) level = "hard";
  }
  return { level, steps };
}

const stripHtml = (s) => (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const slug = (s) => (s || "recipe").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const csv = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

function normalize(r) {
  if (!r || !r.title) return null;
  const seen = new Set(); const ingredients = [];
  for (const i of r.extendedIngredients || []) {
    const raw = (i.original || i.name || "").trim();
    if (raw && !seen.has(raw.toLowerCase())) { seen.add(raw.toLowerCase()); ingredients.push({ raw, name: (i.nameClean || i.name || "").toLowerCase() }); }
  }
  const sourceUrl = r.sourceUrl || r.spoonacularSourceUrl || ("https://spoonacular.com/recipes/" + slug(r.title) + "-" + r.id);
  let publisher = r.sourceName || "Spoonacular";
  if (!r.sourceName && r.sourceUrl) { try { publisher = new URL(r.sourceUrl).hostname.replace(/^www\./, ""); } catch (e) {} }
  const stepObjs = (r.analyzedInstructions && r.analyzedInstructions[0] && r.analyzedInstructions[0].steps) || [];
  const instrText = stripHtml(r.instructions) || stepObjs.map((s) => s.step).join(". ");
  const minutes = r.readyInMinutes || null;
  const dif = computeDifficulty(ingredients.length, instrText, minutes, stepObjs.length);
  return {
    id: "spoonacular:" + r.id,
    source: "spoonacular",
    title: r.title,
    image: r.image ? { url: r.image } : null,
    ingredients,
    tags: {
      cuisine: (r.cuisines || []).map((c) => c.toLowerCase()),
      mealType: (r.dishTypes || []).map((c) => c.toLowerCase()),
      diet: (r.diets || []).map((c) => c.toLowerCase()),
      mainIngredients: [],
    },
    sourceUrl, publisher,
    totalTimeMinutes: minutes || undefined,
    instructionsSummary: stepObjs.length ? stepObjs.length + " steps — full method on source" : "",
    difficulty: dif.level,
  };
}

function dedupe(list) {
  const seen = new Set(); const out = [];
  for (const r of list) {
    let domain = ""; try { domain = new URL(r.sourceUrl).hostname.replace(/^www\./, ""); } catch (e) {}
    const key = r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + domain;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function spaceByCuisine(list, gap) {
  const remaining = list.slice(), out = [], recent = [];
  const key = (r) => (r.tags.cuisine[0] || "unknown");
  while (remaining.length) {
    let idx = remaining.findIndex((r) => !recent.includes(key(r)));
    if (idx === -1) idx = 0;
    const picked = remaining.splice(idx, 1)[0];
    out.push(picked); recent.push(key(picked));
    if (recent.length > gap) recent.shift();
  }
  return out;
}

async function spoonComplexSearch(base, key) {
  const res = await fetch("https://api.spoonacular.com/recipes/complexSearch?" + base + "&apiKey=" + encodeURIComponent(key));
  if (!res.ok) return { error: res.status, results: [] };
  const data = await res.json();
  return { results: data.results || [] };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  const key = process.env.SPOONACULAR_API_KEY;
  if (!key) { res.statusCode = 200; res.end(JSON.stringify({ deck: [], source: { id: "none", name: "None" }, error: "SPOONACULAR_API_KEY not set" })); return; }

  const params = new URL(req.url, "http://localhost").searchParams;
  const diet = csv(params.get("diet"));
  const cuisine = csv(params.get("cuisine"));
  const mealType = csv(params.get("mealType"));
  const difficulty = csv(params.get("difficulty"));
  const maxTime = params.get("maxTime");
  const limit = Math.min(Math.max(parseInt(params.get("limit"), 10) || 12, 1), 20);

  const base = new URLSearchParams();
  base.set("addRecipeInformation", "true");
  base.set("fillIngredients", "true");
  base.set("instructionsRequired", "true");
  base.set("number", String(limit));
  if (diet.length) base.set("diet", diet.join(","));
  if (cuisine.length) base.set("cuisine", cuisine.join(","));
  if (maxTime) base.set("maxReadyTime", maxTime);
  const narrow = diet.length || cuisine.length || mealType.length || maxTime;
  const variants = mealType.length ? mealType : [null];

  try {
    const calls = variants.map((t) => {
      const p = new URLSearchParams(base);
      if (t) p.set("type", t);
      p.set("offset", String(Math.floor(Math.random() * (narrow ? 20 : 100))));
      return spoonComplexSearch(p.toString(), key);
    });
    const datas = await Promise.all(calls);
    let raw = datas.flatMap((d) => d.results || []);
    if (!raw.length) {
      const p = new URLSearchParams(base); p.set("offset", "0");
      if (variants[0]) p.set("type", variants[0]);
      const d = await spoonComplexSearch(p.toString(), key);
      raw = d.results || [];
    }
    let deck = dedupe(raw.map(normalize).filter(Boolean));
    if (difficulty.length) deck = deck.filter((r) => difficulty.includes(r.difficulty));
    deck = spaceByCuisine(shuffle(deck), 3);
    res.statusCode = 200;
    res.end(JSON.stringify({ deck, source: { id: "spoonacular", name: "Spoonacular" } }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ deck: [], source: { id: "spoonacular", name: "Spoonacular" }, error: "fetch failed" }));
  }
};
