# 03 — Data Model

*Last updated: 2026-06-04*

The canonical `Recipe` is the contract between **every source adapter** and the
**rest of the app**. Adapters normalize *into* it; the aggregator, API, DB cache,
and clients all speak *only* it.

---

## Canonical `Recipe`

```ts
interface Recipe {
  id: string;                 // our stable id (hash of source + sourceRecipeId)
  source: string;             // adapter id, e.g. "spoonacular"
  sourceRecipeId: string;     // id within that source
  sourceUrl: string;          // ORIGINAL publisher page — the deep-link-out target
  publisher?: string;         // e.g. "Serious Eats" (for attribution)

  title: string;
  image?: ImageRef;           // license-checked image we're allowed to show
  description?: string;       // short, only if license permits (no full headnotes)

  ingredients: Ingredient[];
  instructionsSummary?: string; // brief / step count — FULL steps live on sourceUrl
  servings?: number;
  totalTimeMinutes?: number;

  tags: RecipeTags;           // normalized, filterable
  rating?: Rating;            // numeric only; no copied review prose
  nutrition?: Nutrition;      // optional, if source provides

  attribution: Attribution;   // required: who to credit + link
  fetchedAt: string;          // ISO timestamp, for cache TTL
  cachingAllowed: 'yes' | 'limited' | 'no'; // carried from source license
}

interface ImageRef { url: string; width?: number; height?: number; }

interface Ingredient {
  raw: string;                // "2 cups flour"
  name?: string;              // "flour"  (parsed if available — key for pantry)
  quantity?: number;
  unit?: string;
}

interface RecipeTags {
  diet: string[];             // canonical: "vegetarian","vegan","gluten-free",…
  mealType: string[];         // "breakfast","lunch","dinner","snack","dessert"
  cuisine: string[];          // "italian","thai",…
  intolerances: string[];     // allergens present/free-of
  mainIngredients: string[];  // incl. meat type: "chicken","beef","tofu",…
}

interface Rating { value: number; scale: number; count?: number; } // e.g. 4.6/5 (212)

interface Nutrition {        // all optional
  calories?: number; protein?: number; carbs?: number; fat?: number;
}

interface Attribution {
  source: string;             // adapter id
  publisher?: string;         // display name
  url: string;                // link target (== sourceUrl)
  requiredText?: string;      // any mandated attribution string from the license
}
```

### Why these shapes
- **`sourceUrl` + `attribution` are first-class and required** — the deep-link-out
  and credit are core product/legal behavior, not afterthoughts.
- **`instructionsSummary`, not full instructions** — we summarize/preview; the
  full method lives on the publisher page. Keeps us legally clean.
- **`Ingredient.name` (parsed)** — the seed for the **pantry feature**: matching
  "what you have" against recipe ingredients needs structured names, not just raw
  strings.
- **`cachingAllowed`** travels with each recipe so the cache layer obeys
  per-source license terms automatically.
- **`tags` are canonical** — adapters map vendor vocab → these, so filtering is
  uniform across sources.

---

## Canonical filter vocabularies

Keep these in one shared module; adapters map vendor terms to/from them.

- **diet:** `vegetarian, vegan, pescatarian, gluten-free, dairy-free, keto,
  paleo, low-carb, whole30`
- **mealType:** `breakfast, brunch, lunch, dinner, snack, dessert, appetizer,
  side, drink`
- **intolerances:** `dairy, egg, gluten, peanut, tree-nut, soy, shellfish, fish,
  wheat, sesame`
- **mainIngredients (incl. meat type):** `chicken, beef, pork, lamb, turkey,
  fish, shellfish, tofu, beans, eggs, …`

> The user-facing filters from the brief (vegetarian, breakfast/lunch/dinner,
> specific meat types) map directly onto `diet`, `mealType`, and
> `mainIngredients`.

---

## Database schema (Postgres)

```sql
-- Cached, normalized recipes (cost + latency control)
recipes (
  id              text primary key,        -- our canonical id
  source          text not null,
  source_recipe_id text not null,
  source_url      text not null,
  publisher       text,
  title           text not null,
  payload         jsonb not null,          -- full canonical Recipe
  tags            jsonb not null,          -- denormalized for fast filtering
  rating_value    real,
  caching_allowed text not null,           -- 'yes'|'limited'|'no'
  fetched_at      timestamptz not null,
  unique (source, source_recipe_id)
);
create index on recipes using gin (tags);

users (
  id            uuid primary key,
  email         text unique,               -- null allowed: anonymous users
  created_at    timestamptz not null default now()
);

-- Every swipe; right = saved, left = skipped. Drives "don't repeat" + the list.
swipes (
  user_id     uuid references users(id),
  recipe_id   text references recipes(id),
  direction   text not null check (direction in ('right','left')),
  created_at  timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- Optional explicit saved list (right swipes are the source of truth, but this
-- allows manual removes / ordering).
saved_list (
  user_id     uuid references users(id),
  recipe_id   text references recipes(id),
  added_at    timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- Phase 4 — pantry
pantry_items (
  user_id     uuid references users(id),
  name        text not null,               -- canonical ingredient name
  quantity    real,
  unit        text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, name)
);

-- Attribution / provenance, kept even when duplicates are collapsed
source_attributions (
  recipe_id   text references recipes(id),
  source      text not null,
  source_url  text not null,
  publisher   text,
  primary key (recipe_id, source)
);
```

---

## schema.org mapping (for Option C, later)

When the structured-data adapter is built, map [`schema.org/Recipe`](https://schema.org/Recipe)
JSON-LD → canonical `Recipe`:

| schema.org field | Canonical field |
|---|---|
| `name` | `title` |
| `image` | `image.url` |
| `recipeIngredient[]` | `ingredients[].raw` (+ parse → `name/quantity/unit`) |
| `recipeInstructions` | `instructionsSummary` (preview only; link out for full) |
| `recipeYield` | `servings` |
| `totalTime` (ISO 8601 duration) | `totalTimeMinutes` |
| `recipeCuisine` | `tags.cuisine` |
| `recipeCategory` | `tags.mealType` |
| `keywords` / `suitableForDiet` | `tags.diet`, `tags.intolerances` |
| `aggregateRating` | `rating` (value/scale/count) |
| `nutrition` | `nutrition` |
| page URL | `sourceUrl`, `attribution.url` |
| `author` / site name | `publisher` |
