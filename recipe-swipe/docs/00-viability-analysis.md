# 00 — Viability Analysis

*Last updated: 2026-06-04*

## Verdict: GO (with a clear sourcing constraint)

The concept is **validated by the market** and technically straightforward. The
make-or-break variable is **how recipes are sourced**. We mitigate that risk by
using licensed APIs and deep-linking to publishers. With that decision made, the
remaining risk is ordinary execution/competition risk, which is manageable given
a clear product wedge (the pantry feature).

---

## 1. Market demand — validated

"Tinder for recipes" is a real, populated category. Demand is proven; the space
is busy but not locked up.

| Product | Model | Notes |
|---|---|---|
| **SomeYum** | Pure swipe discovery | Claims 52k+ daily swipers, no-signup, AI calibrates in ~10 swipes |
| **Yummly** | "Yum" save button + personalization | 2M+ recipes; swipe-adjacent, not a true deck |
| **The Dinners App** | Group voting / match-when-all-agree | Proves appetite for household/couples mode |
| **Mealime / BigOven** | Structured meal planning | No real swipe discovery |
| **Tasty (BuzzFeed)** | Video recipes | No swipe mechanic; public API retired |

**Implication:** Don't compete on "another swipe app." Compete on a wedge:

1. **Pantry-aware discovery** ("what can I cook *right now*") — underserved, and
   converts discovery into action + reduces food waste. **This is our moat.**
2. **Household / couples mode** — swipe together, match on dinner.
3. **Curated-quality sourcing** — "trusted sites, not SEO content farms" — a
   positioning play enabled by the Option C publisher bridge.

## 2. Technical viability — high

- Swipe UX is a solved, well-trodden pattern.
- Recipe data (title, image, ingredients, instructions, ratings, diet/meal-type
  filters) is available as clean JSON from multiple licensed APIs with free
  tiers for prototyping. See [`02-data-sources.md`](02-data-sources.md).
- No ML required for v1 — simple tag/filter-based ranking is enough. Personalized
  ranking can come later.

## 3. Legal viability — the critical section

This is where similar products get into trouble. Our position:

| Element | Copyright status | Our approach |
|---|---|---|
| Ingredient list + bare steps | Generally **not** copyrightable (idea/expression) | Safe to display via licensed API |
| Photos | **Copyrighted** | Use only API-provided images per each API's license; otherwise link out |
| Headnotes / creative writing | **Copyrighted** | Don't reproduce; link out for full content |
| Written reviews | **Copyrighted** | Use API-provided ratings; don't scrape review prose |
| Site content via scraping | ToS usually **prohibits** scraping | We do **not** scrape premium publishers |

**Two rules keep us safe:**
1. **Source via licensed APIs (Option B)**, honoring each API's display/caching
   license.
2. **Deep-link out** to the publisher for the full recipe experience. We are a
   discovery funnel, not a content mirror.

Full detail and the per-source licensing checklist live in
[`05-legal-compliance.md`](05-legal-compliance.md).

## 4. Business model (later, but shapes architecture now)

- **Affiliate / referral**: driving qualified traffic to publishers and grocery
  partners (ingredient → cart) is a natural, non-parasitic revenue path.
- **Premium tier**: pantry features, unlimited saved lists, advanced filters,
  household mode.
- The **deep-link-out + partner** posture is a prerequisite for all of this,
  which is why we bake it in from day one.

## 5. Cost model

- API calls scale with usage and cost money beyond free tiers. **Aggressive
  caching** of normalized recipes in our own DB is the primary cost control —
  fetch once, serve many, refresh periodically. See
  [`01-architecture.md`](01-architecture.md#caching).

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Copying protected photos/reviews | High (legal) | Licensed APIs + link-out only |
| Scraping ToS violations | High (legal) | No scraping of premium sites in v1 |
| API costs scale with users | Medium | Cache normalized recipes; periodic refresh |
| Crowded category | Medium | Pantry/household wedge |
| Limited written reviews via API | Medium | Use ratings; set UX expectations |
| Single-source dependency / outage | Medium | Multi-source adapter layer (built in) |
| Cold-start personalization | Low | Tag/filter ranking first, ML later |

## 7. Go/no-go gate before any code

Complete **Phase 0** ([`04-roadmap.md`](04-roadmap.md)) first:
sign up for the free tiers, fetch sample recipes from each source, confirm the
fields and filters we need exist, and read each license. If those hold (they
should), proceed to Phase 1.

---

### Sources
- [Recipe API: 11 Most Popular Recipe APIs (2026)](https://blog.suggestic.com/recipe-api-ultimate-list)
- [Edamam vs Spoonacular vs Nutritionix (2026)](https://blog.nutrigraphapi.com/best-food-apis-for-developers-in-2026-edamam-vs-spoonacular-vs-nutritionix-vs-nutrigraphapi/)
- [Are Recipes & Cookbooks Protected by Copyright — Copyright Alliance](https://copyrightalliance.org/are-recipes-cookbooks-protected-by-copyright/)
- [Copyright Protection in Recipes — Copyrightlaws.com](https://www.copyrightlaws.com/copyright-protection-recipes/)
- [Best Food Swipe Apps 2026 — SomeYum](https://visieasy.com/blog/best-food-swipe-apps-2026)
- [Google Recipe structured data docs](https://developers.google.com/search/docs/appearance/structured-data/recipe)
