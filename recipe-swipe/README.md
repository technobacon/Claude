# Forkful 🍴 — *(working codename, easy to rename)*

**Tinder-style recipe discovery.** Swipe through beautiful recipes pulled from
multiple licensed recipe APIs. Swipe right to save, left to skip. Tap a saved
recipe to **cook it on the original publisher's website** — we send them the
traffic, we never steal their content.

> **Status:** Phase 1 MVP scaffold — **runs today.** Next.js + TypeScript app
> with the source-agnostic core, a TheMealDB adapter, the swipe UI, saved list,
> and deep-link-out. Unit-tested (`npm test`, zero deps). Spoonacular/Edamam
> adapters slot in next; see [`docs/04-roadmap.md`](docs/04-roadmap.md).

---

## The one-paragraph pitch

Choosing what to cook is a daily chore and recipe search is exhausting. Forkful
turns it into a 10-second, low-effort, *fun* swipe session. We aggregate recipes
from several **licensed recipe APIs** (Spoonacular, Edamam, TheMealDB, and more),
normalize them into one clean format, and present them as a swipeable deck. Right
= saved to your list; left = skipped. The long-term moat is a **pantry feature**:
swipe only recipes you can actually make with what's at home.

## Guiding principles

1. **Legally clean sourcing.** We use licensed/aggregator APIs (Option B). We do
   **not** scrape premium publishers' photos, headnotes, or reviews.
2. **Be a partner, not a parasite.** Saved recipes deep-link out to the original
   site. We drive publishers traffic; that's also our future business model.
3. **Source-agnostic core.** Every API sits behind a `RecipeSource` adapter and
   produces one normalized `Recipe` shape. Adding a source (or the future Option
   C structured-data ingestion) never touches the app logic.
4. **Web first, mobile-ready.** One backend serves the website now and a React
   Native app later.

## Documentation map

Read in order, or jump to what you need:

| Doc | What's in it |
|---|---|
| [`docs/00-viability-analysis.md`](docs/00-viability-analysis.md) | Market, competitors, legal viability, risks, go/no-go |
| [`docs/01-architecture.md`](docs/01-architecture.md) | System design, components, the `RecipeSource` adapter framework |
| [`docs/02-data-sources.md`](docs/02-data-sources.md) | Every recipe API, the adapter contract, the Option C bridge |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Normalized `Recipe` model + database schema |
| [`docs/04-roadmap.md`](docs/04-roadmap.md) | Phased build plan, milestones, definitions of done |
| [`docs/05-legal-compliance.md`](docs/05-legal-compliance.md) | Link-out policy, licensing checklist, attribution rules |
| [`docs/06-run-on-iphone.md`](docs/06-run-on-iphone.md) | Deploy to Vercel + add to iPhone home screen as a PWA |

## Run it

```bash
cd recipe-swipe
npm install        # Next.js + React (test suite itself needs no deps)
npm test           # 16 unit tests via Node's native TS type-stripping
npm run dev        # http://localhost:3000 — swipe!
```

> **Network note:** the app fetches live recipes from `themealdb.com`. Your
> environment's outbound network policy must allow that host (and later
> `api.spoonacular.com`, `api.edamam.com`). If a source is blocked/unreachable,
> the feed **degrades gracefully** to an empty deck rather than erroring.

## Code structure (maps to the docs)

```
recipe-swipe/
├── src/core/                 # framework-agnostic, the durable heart
│   ├── model.ts              # canonical Recipe + validation  (docs/03)
│   ├── vocab.ts              # filter vocabularies + mapping   (docs/03)
│   ├── aggregator.ts         # dedupe / exclude / filter / rank — PURE (docs/01)
│   └── sources/
│       ├── types.ts          # the RecipeSource adapter contract (docs/02)
│       ├── themealdb.ts      # first adapter (free source)       (docs/02)
│       └── registry.ts       # fan-out across all sources
├── src/server/               # service + in-memory store (→ Postgres in Phase 3)
├── app/                      # Next.js App Router: UI + /api routes
│   ├── api/{feed,swipe,list} # the Phase 1 API surface           (docs/01)
│   └── components/ForkfulApp.tsx  # swipe deck, filters, saved list
└── tests/                    # node:test + fixtures (no deps)
```

Adding a source (Spoonacular, Edamam, or the future Option C bridge) = one new
file implementing `RecipeSource` + one line in `src/server/instance.ts`. Nothing
else changes.

## TL;DR recommendation

Build the MVP on **Spoonacular + Edamam + TheMealDB** behind a source-adapter
layer. Deep-link saved recipes to the publisher. Architect for the Option C
(structured-data / opt-in publisher) bridge from day one. Make the **pantry
feature** the differentiator. See [`docs/04-roadmap.md`](docs/04-roadmap.md).
