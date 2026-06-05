# 07 — Handoff & Next Steps

*Last updated: 2026-06-05*

This is the "where we are / where to pick up" doc. Read this first when
resuming.

---

## TL;DR — where we are

- The product concept (Tinder-for-recipes, licensed sources, deep-link-out) is
  validated and documented (docs 00–06).
- There are **two code artifacts**:
  1. **`/` (Next.js + TS app)** — the real architecture: source-agnostic
     `RecipeSource` adapter layer, TheMealDB adapter, aggregator, API routes,
     swipe UI. Unit-tested (`npm test`, 17 passing). This is the foundation the
     product is built on.
  2. **`standalone/index.html`** — a **single-file, client-only build** used for
     fast, zero-setup testing on a real iPhone. No server, no accounts: it calls
     TheMealDB directly and stores likes in `localStorage`. **This is what we've
     actively been iterating on with the user.**
- The standalone is currently **ahead of the Next app on UX** (see
  [Divergence](#divergence--important)).

## How to test RIGHT NOW (phone, zero setup)

The standalone runs straight from the public repo via a static file CDN — no
hosting. Open this on the phone (pinned to a known-good commit):

```
https://raw.githack.com/technobacon/Claude/5585f830cd00be0561822aedec39a535186ee9dc/recipe-swipe/standalone/index.html
```

Backup CDN (identical):
```
https://cdn.statically.io/gh/technobacon/Claude/5585f830cd00be0561822aedec39a535186ee9dc/recipe-swipe/standalone/index.html
```

**To mint a fresh link after new changes:** push to the branch, grab the new
commit SHA (`git rev-parse HEAD`), and swap it into the URL:
`https://raw.githack.com/technobacon/Claude/<SHA>/recipe-swipe/standalone/index.html`

> Why a CDN link and not Vercel: see [Hosting](#hosting-gotchas-vercel). The repo
> is **public**, so githack/statically can serve the file directly.

## Branch & quick start for the Next app

- **Branch:** `claude/recipe-swipe-platform-NMQfc`
- **Repo default branch:** `claude/claude-md-docs-CPXPR` (unusual — matters for Vercel)

```bash
cd recipe-swipe
npm install
npm test          # 17 unit tests, no extra deps (Node 22 type-stripping)
npm run dev       # http://localhost:3000
```

---

## Feature status

| Feature | Next app (`/`) | Standalone (live) |
|---|---|---|
| Swipe deck (drag/flick + buttons) | ✅ | ✅ |
| Undo last swipe | ✅ | ✅ |
| Tap-for-detail sheet + deep-link-out | ✅ | ✅ (+ back-arrow button) |
| Saved list | ✅ (in-memory) | ✅ (localStorage, persists) |
| Filters | chips (diet/meal/meat) | **dropdowns**: Type / Cuisine / Difficulty |
| True random deck | partial | ✅ `random.php` across whole DB |
| Cuisine spacing (no repeats within 3) | ✅ `spaceByKey` (tested) | ✅ |
| Difficulty (derived, technique-based) | ❌ not yet | ✅ |
| PWA / Add to Home Screen | ✅ | ✅ (meta only; icons relative) |
| Multi-source (Spoonacular/Edamam) | adapter seam ready, not wired | ❌ (TheMealDB only) |

## Key decisions made this session

1. **Source strategy: Option B** (licensed APIs) + **deep-link-out** to the
   publisher. Never mirror photos/headnotes/reviews. (docs 00, 05)
2. **Source-agnostic core** via the `RecipeSource` adapter; Option C (publisher
   structured-data) is a future adapter, no rearchitecture. (docs 01, 02)
3. **Standalone client-only build** introduced purely to get past Vercel/phone
   friction so the user could actually feel the product.
4. **Filters → dropdowns** (single-select Type/Cuisine/Difficulty); removed
   Breakfast/Dessert categories.
5. **Difficulty is a derived, technique-weighted heuristic** (no API provides
   it). Driven by cooking-technique keywords + real step count + long-time
   signal; toss/no-cook ⇒ easy. Good enough now; gets real with Spoonacular.
6. **Randomization** must use `random.php` (whole-DB) — alphabetical letter
   batches were the cause of the "not random" feel.

## Known issues / gotchas

### Hosting gotchas (Vercel)
- The repo is a **monorepo** (`recipe-swipe/` lives next to the old `tabstash/`).
  Vercel needs **Root Directory = `recipe-swipe`**, which is buried in Settings
  and painful on mobile. A last Vercel deploy succeeded but 404'd because Root
  Directory wasn't set.
- Repo **default branch** is `claude/claude-md-docs-CPXPR`, but our work is on
  `claude/recipe-swipe-platform-NMQfc` — so Vercel built the wrong branch.
- **Recommendation when resuming hosting:** create a **dedicated repo with the
  app at its root** (no subfolder, no tabstash). Then any host is "Import →
  Deploy" with zero config. Or set Vercel's Production Branch + Root Directory
  once on a computer (not the phone).

### App-level
- **Saved list in the Next app resets on redeploy** (in-memory store). Standalone
  persists via localStorage. Durable accounts = Phase 3 (needs a DB).
- **Difficulty is heuristic** — occasionally wrong on run-on-paragraph recipes or
  unusual technique words. Real fix = Spoonacular time/steps/equipment.
- **TheMealDB can only filter one dimension server-side.** Type + Cuisine
  together is filtered client-side, so some combos return few/no cards
  (e.g. Seafood + Polish). Spoonacular filters multiple natively.

---

## Next steps (prioritized)

1. **Spoonacular integration** — the big unlock. Brings, in one move:
   **Time filter** ("under 30 min" — the single most-wanted filter), allergen/
   intolerance filters, real diets (gluten-free, keto, …), nutrition, and a
   **proper difficulty** (readyInMinutes + structured steps + equipment).
   Needs a free API key from the user → set `SPOONACULAR_API_KEY` (the Next app's
   `src/server/instance.ts` already has the placeholder). Build a
   `SpoonacularSource implements RecipeSource`.
2. **Reconcile standalone ↔ Next app** (see below). Decide whether to port the
   standalone's UX (dropdowns, difficulty, random.php, sheet back-button) into
   the React app, or keep standalone as the phone surface until Spoonacular.
3. **"# of ingredients" filter** (e.g. "5 or fewer") — cheap TheMealDB win.
4. **Persistence** — wire a DB (e.g. Vercel Postgres) so saved lists survive
   (pulls Phase 3 forward). Schema already in docs/03.
5. **Pantry feature** (Phase 4) — the differentiator: "swipe only what I can
   mostly make right now." Needs ingredient-name matching (already parsed).
6. **Sort out hosting** properly (dedicated repo recommended) so the *full*
   multi-source app is testable on the phone, not just the standalone.

## Divergence — important

The **standalone is ahead of the Next app** on UX: dropdown filters, derived
difficulty, `random.php` randomization, cuisine spacing in the deck, and the
detail-sheet back button. The Next app has the tested `spaceByKey` but not the
rest.

**When resuming, pick one:**
- **(a)** Treat the standalone as the source of truth for UX, and port these
  into the React components + adapters (recommended once Spoonacular lands, so
  you build the real multi-source app properly), **or**
- **(b)** Keep the standalone as the disposable phone-test harness and rebuild
  these behaviors directly in the Next app.

Either way, keep the **pure logic** (difficulty scorer, spacing, normalization,
filter vocab) in the tested core so both surfaces share it.

## File map

```
recipe-swipe/
├── README.md
├── docs/00–07            # plan, viability, architecture, data, roadmap, legal,
│                         #   iphone testing, THIS handoff
├── src/core/             # canonical model, vocab, aggregator (+spaceByKey), adapters
├── src/server/           # service + in-memory store + Next wiring
├── app/                  # Next.js App Router UI + /api routes
├── standalone/index.html # client-only single-file build (the live phone demo)
├── scripts/make-icons.mjs
└── tests/                # node:test, 17 passing
```
