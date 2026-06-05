# 04 — Roadmap

*Last updated: 2026-06-05*

Phased so each step ships something usable and de-risks the next. Phase 0 is a
hard gate before writing app code.

> **Progress (2026-06-05):** Phase 1 MVP is built (Next.js app + tested core +
> TheMealDB adapter) and a client-only `standalone/` build is being tested on a
> real iPhone. Phase 2 filters are partly done (dropdowns: Type/Cuisine/
> Difficulty) and we've added true randomization, cuisine spacing, and a derived
> difficulty metric — all currently in the standalone, partly in the core.
> **Next big unlock: Spoonacular (Phase 1 continuation).** Full status &
> where-to-pick-up: [`07-handoff-and-next-steps.md`](07-handoff-and-next-steps.md).

---

## Phase 0 — Validate the data sources ⛳ (½–1 day, do FIRST)

**Goal:** prove the data we need actually exists, cleanly, and is licensable.

- [ ] Get API keys / free-tier access: **TheMealDB** (instant), **Spoonacular**,
      **Edamam**.
- [ ] Fetch ~20 recipes from each; confirm presence of: title, image,
      ingredients, instructions (or link), rating, and the filters we need
      (vegetarian, breakfast/lunch/dinner, meat type).
- [ ] **Read each API's license**: image display rules, caching allowed?,
      required attribution. Record in [`05-legal-compliance.md`](05-legal-compliance.md).
- [ ] Save real responses as **fixtures** for adapter unit tests.

**Definition of done:** a short findings note + fixtures committed; all required
fields/filters confirmed available from ≥2 sources.

---

## Phase 1 — MVP swipe web app

**Goal:** swipe a deck of real recipes, save right-swipes, view the list, link out.

- [ ] Project scaffold (Next.js + TS web, Node/TS backend, Postgres).
- [ ] Canonical `Recipe` type + filter vocab module ([`03-data-model.md`](03-data-model.md)).
- [ ] `RecipeSource` interface + **TheMealDB adapter** first (free), then
      **Spoonacular** + **Edamam** adapters. Unit tests via fixtures.
- [ ] Recipe Aggregation Service: query → normalize → de-dupe → cache → rank
      (v1 = filter + freshness + light shuffle) → exclude already-swiped.
- [ ] Backend routes: `GET /feed`, `POST /swipe`, `GET /list`,
      `DELETE /list/:id`, `GET /recipe/:id`.
- [ ] DB: `recipes`, `users` (anonymous allowed), `swipes`, `saved_list`,
      `source_attributions`.
- [ ] Web UI: swipe deck (photo, title, key ingredients, rating), right=save /
      left=skip, **"My List"** screen, recipe detail with **"Cook on
      [publisher] →"** deep-link.
- [ ] Persist swipes so cards don't repeat.

**Definition of done:** a user can open the site, swipe a real multi-source deck,
see saved recipes, and tap through to the original publisher.

---

## Phase 2 — Filters

**Goal:** the brief's filtering — vegetarian, meal type, meat type, cuisine.

- [ ] Filter UI (chips/toggles) → `RecipeQuery`.
- [ ] Adapters map canonical filters → each vendor's params; post-filter where a
      source lacks native support.
- [ ] Persist user's default filters.

**Definition of done:** selecting "vegetarian + dinner" (etc.) reliably reshapes
the deck across all sources.

---

## Phase 3 — Accounts & polish

**Goal:** durable, cross-device experience.

- [ ] Auth (email + OAuth); migrate anonymous swipes/list on sign-up.
- [ ] Cross-device sync of list + filters.
- [ ] Richer recipe detail, empty/loading/error states, basic analytics
      (swipe-through rate, saves).
- [ ] Caching/TTL hardening; per-source budget-aware routing via `health()`.

**Definition of done:** accounts work, data syncs, app feels production-ish.

---

## Phase 4 — Pantry (the differentiator) 🥕

**Goal:** "swipe only what I can mostly make right now."

- [ ] `pantry_items` CRUD + UI.
- [ ] Ingredient name parsing/normalization for matching.
- [ ] Pantry-aware ranking: boost/filter recipes by % of ingredients on hand
      (uses `includeIngredients` in `RecipeQuery`).
- [ ] "You have X of Y ingredients" on each card.

**Definition of done:** pantry meaningfully changes the deck toward makeable
recipes. **This is the moat — give it real polish.**

---

## Phase 5 — Option C publisher bridge

**Goal:** higher-quality, distinctive recipes via structured data / partners.

- [ ] `StructuredDataSource` adapter (schema.org `Recipe` JSON-LD → canonical).
- [ ] Opt-in/allowlist publisher index; `robots.txt`/ToS/rate-limit guardrails.
- [ ] Reads structured data only; **links out** for full method; full attribution.

**Definition of done:** partner recipes appear in the deck through the *same*
pipeline, with zero changes to aggregator/API/clients.

---

## Phase 6 — Mobile app

**Goal:** native iOS/Android.

- [ ] React Native / Expo client reusing the backend + canonical model.
- [ ] Native swipe gestures; share/notifications.

**Definition of done:** mobile app reaches Phase 1–4 parity on the shared backend.

---

## Later / opportunistic

- Household / couples "swipe together, match on dinner" mode.
- Affiliate / grocery (ingredients → cart) and premium tier.
- Personalized ML ranking from swipe history.
- More Tier-2 sources (FatSecret, Nutritionix, …) and i18n.
