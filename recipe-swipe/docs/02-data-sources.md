# 02 — Data Sources & the Adapter Framework

*Last updated: 2026-06-04*

This is the heart of the product's flexibility. **The more sources the better** —
more inventory, more variety, and resilience if one API changes terms or goes
down. Every source hides behind one interface so the rest of the app is identical
regardless of where a recipe came from.

---

## The `RecipeSource` adapter contract

Every source — current APIs and the future Option C ingestion — implements this
interface. Nothing else in the system talks to a vendor directly.

```ts
// Canonical Recipe defined in 03-data-model.md
interface RecipeSource {
  /** Stable id, e.g. "spoonacular", "edamam", "themealdb". */
  readonly id: string;

  /** Human label for attribution/UI, e.g. "Spoonacular". */
  readonly name: string;

  /** Which capabilities this source supports, so the aggregator can route. */
  readonly capabilities: SourceCapabilities;

  /** Search/browse a deck of recipes for the given filters. */
  search(query: RecipeQuery): Promise<RawResult[]>;

  /** Fetch full detail for one recipe (ingredients, steps, link, rating). */
  getById(sourceRecipeId: string): Promise<RawResult | null>;

  /** Normalize this source's raw payload into the canonical Recipe. */
  normalize(raw: RawResult): Recipe;

  /** Optional: report remaining quota / health for budget-aware routing. */
  health?(): Promise<SourceHealth>;
}

interface SourceCapabilities {
  filters: {
    diet?: boolean;          // vegetarian, vegan, …
    mealType?: boolean;      // breakfast/lunch/dinner
    cuisine?: boolean;
    intolerances?: boolean;  // allergens
    meatType?: boolean;      // via ingredient/cuisine query
    query?: boolean;         // free-text search
  };
  hasImages: boolean;
  hasRatings: boolean;
  hasReviewsText: boolean;   // usually false / restricted
  hasNutrition: boolean;
  cachingAllowed: 'yes' | 'limited' | 'no'; // from the license — see doc 05
  attributionRequired: boolean;
}

interface RecipeQuery {
  text?: string;
  diet?: string[];           // canonical vocab; adapter maps to vendor terms
  mealType?: string[];
  cuisine?: string[];
  intolerances?: string[];
  excludeIngredients?: string[];
  includeIngredients?: string[]; // basis for the pantry feature later
  limit: number;
  cursor?: string;
}
```

### Design rules
- **Canonical vocabulary in, vendor vocabulary inside.** The app speaks one
  filter vocabulary (e.g. `diet: ["vegetarian"]`); each adapter maps it to that
  vendor's parameter names/values.
- **Adapters are pure-ish and testable.** `normalize()` takes a raw payload and
  returns a canonical `Recipe` with no network/DOM access — unit-test it with
  saved fixtures, no live API needed. (Mirrors this repo's `session.js`
  pure-logic + tests convention.)
- **Graceful degradation.** If a source lacks a capability (e.g. no meal-type
  filter), the aggregator either filters post-hoc or skips that source for that
  query — it never crashes the feed.
- **Budget/health aware.** The aggregator can prefer free/cheaper sources and
  back off ones near quota using `health()`.

---

## Tier 1 — Build on these first (MVP)

| Source | Size | Strengths | Filters | Cost | Notes |
|---|---|---|---|---|---|
| **Spoonacular** | ~365k recipes | Best all-in-one; deep filters; meal planning | diet, meal type, cuisine, intolerances, include/exclude ingredients | Free tier → ~$10–$149+/mo | Largest "all-in-one". Strong fit for our roadmap incl. pantry (include-ingredients search) |
| **Edamam** | 2.3M+ recipes | Huge inventory; strong diet/allergen filters | diet, health labels, cuisine, meal type | Free tier → up to $999/mo | Great variety; watch per-call pricing model |
| **TheMealDB** | Small (community) | Free, simple, no-friction prototyping; international | category, area, ingredient | Free (attribution) | Perfect zero-cost source to prove the pipeline; small inventory |

**MVP source set: Spoonacular + Edamam + TheMealDB.** Start the very first
pipeline test against **TheMealDB** (free, instant), then add the licensed APIs.

## Tier 2 — Add for more inventory / nutrition depth

| Source | Strengths | Notes |
|---|---|---|
| **FatSecret Platform API** | 1.9M+ foods, 56+ countries, 24 languages; strong verified nutrition | Great for nutrition + i18n later |
| **Nutritionix** | Verified nutrition, large food DB | Nutrition-leaning; free tier for prototyping |
| **Chomp** | Food/product data, free tier | Supplementary |
| **Suggestic / LogMeal / ReciPal / Zestful** | Niche (meal planning, image recognition, nutrition labels, ingredient parsing) | Evaluate as needs arise |

## Not available / avoid

- **Tasty (BuzzFeed):** public API has been **retired** — don't design around it.
- **Direct scraping of premium publishers (NYT Cooking, Bon Appétit, etc.):**
  excluded by policy (ToS + photo/review copyright). See
  [`05-legal-compliance.md`](05-legal-compliance.md).

---

## Option C — the future "publisher bridge" (framework now, build later)

Option C lets us ingest recipes the way Google does: by reading the **schema.org
`Recipe` JSON-LD structured data** that publishers *intentionally* expose for
SEO, and/or via **opt-in partner feeds**. The vast majority of quality food blogs
publish this markup.

**Why it's powerful:** access to higher-quality, distinctive recipes beyond the
aggregators, while staying respectful — we read intended-public structured data,
respect `robots.txt`/ToS, rate-limit, and **deep-link out** for the full
experience (driving the publisher traffic).

**How it plugs in:** it's just another `RecipeSource`:

```ts
class StructuredDataSource implements RecipeSource {
  id = 'jsonld';
  // search(): query an index of partner/allowlisted recipe URLs
  // getById(): fetch the page, read the <script type="application/ld+json"> Recipe
  // normalize(): map schema.org Recipe → canonical Recipe
  capabilities = { /* hasImages, hasRatings from aggregateRating, etc. */ };
}
```

**Guardrails for Option C (enforced when we build it):**
- **Opt-in / allowlist publishers**, ideally with a partnership — don't crawl the
  open web indiscriminately.
- Read only the publisher's **own structured data**; never reproduce full
  headnotes/method — **link out** for those.
- Honor `robots.txt`, rate limits, and each site's ToS.
- Store `source_attributions` and always credit + link the publisher.

Because the interface is identical, adding Option C later requires **zero changes**
to the aggregator, API, or clients — only a new adapter + an ingestion index.

The schema.org `Recipe` → canonical `Recipe` field mapping lives in
[`03-data-model.md`](03-data-model.md#schemaorg-mapping).

---

## Aggregation behavior across sources

- **Routing:** for a given `RecipeQuery`, query the sources whose `capabilities`
  support the requested filters; prefer free/under-budget sources.
- **Merge & de-dupe:** combine results, collapse duplicates by fingerprint
  (title + key ingredients + original domain), keep the richest record.
- **Attribution preserved:** even when collapsing duplicates, keep the source +
  `sourceUrl` for the deep-link-out.
- **Resilience:** one source failing/over quota degrades variety, never breaks
  the feed.

---

### Sources
- [Recipe API: 11 Most Popular Recipe APIs (2026)](https://blog.suggestic.com/recipe-api-ultimate-list)
- [Edamam vs Spoonacular vs Nutritionix vs NutriGraph (2026)](https://blog.nutrigraphapi.com/best-food-apis-for-developers-in-2026-edamam-vs-spoonacular-vs-nutritionix-vs-nutrigraphapi/)
- [TheMealDB API docs](https://www.themealdb.com/api.php)
- [schema.org/Recipe](https://schema.org/Recipe) · [Google Recipe structured data](https://developers.google.com/search/docs/appearance/structured-data/recipe)
