/**
 * Derived difficulty — no recipe API ships a reliable difficulty field, so we
 * compute it. Driven mostly by *cooking technique* (a 12-ingredient toss salad
 * is easy; a 6-ingredient braise is not). When we actually know the cook time
 * (Spoonacular's readyInMinutes), time leads. Pure + tested; shared by adapters.
 */

export type Difficulty = "easy" | "medium" | "hard";

// Technique words that signal real complexity.
const HARD_TECH = [
  "braise", "sear", "caramel", "deglaze", "reduce by", "reduce until", "fold in",
  "knead", "proof", "prove ", "temper", "emulsif", "blanch", "poach", "confit",
  "sous vide", "ferment", "marinat", "flambe", "julienne", "debone", "fillet",
  "baste", "sauté", "saute", "sweat", "purée", "puree", "strain", "sieve",
  "whisk until", "beat until", "simmer for", "render", "truss", "glaze", "caramelis",
];

export interface DifficultyResult {
  level: Difficulty;
  steps: number;
  score: number;
}

/**
 * @param ingredientCount number of ingredients
 * @param instructions    full instruction text (plain)
 * @param minutes         total cook time if known (Spoonacular) — leads when present
 * @param stepsOverride   explicit step count if known (Spoonacular analyzedInstructions)
 */
export function computeDifficulty(
  ingredientCount: number,
  instructions: string,
  minutes?: number | null,
  stepsOverride?: number,
): DifficultyResult {
  const text = (instructions || "").toLowerCase();
  let steps = stepsOverride || 0;
  if (!steps) {
    const lines = (instructions || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    steps = lines.length;
    if (steps <= 1) steps = Math.max(1, text.split(/[.!?]\s+/).filter((s) => s.trim()).length);
  }
  let hard = 0;
  for (const t of HARD_TECH) if (text.includes(t)) hard++;

  let level: Difficulty = "medium";
  let score: number;
  if (minutes) {
    // Time-first when we actually know it.
    score = minutes / 12 + steps * 0.4 + hard * 1.5;
    if (score <= 4) level = "easy";
    else if (score >= 8.5) level = "hard";
  } else {
    // Technique-first heuristic for sources without a time field.
    const longTime = /overnight|\bhours?\b|\b[2-9]\d\s*min/.test(text) ? 1 : 0;
    const easyLean = hard === 0 &&
      /\b(toss|assemble|no.?cook|combine|spread|layer|stir together|drizzle)\b/.test(text) ? 1 : 0;
    score = ingredientCount * 0.3 + steps * 0.6 + hard * 2.2 + longTime * 1.5 - easyLean * 2;
    if (score <= 4.5) level = "easy";
    else if (score >= 10) level = "hard";
  }
  return { level, steps, score };
}
