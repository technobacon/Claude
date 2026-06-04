# 05 — Legal & Compliance

*Last updated: 2026-06-04*

> Not legal advice. This is an engineering/product compliance guide that encodes
> a deliberately conservative posture. Have a lawyer review before launch,
> especially the per-source license terms.

---

## The two rules that keep us safe

1. **Source only via licensed APIs (Option B).** Display content within each
   API's license. Do **not** scrape premium publishers' pages.
2. **Deep-link out for the full experience.** We are a *discovery funnel*. The
   full method, headnotes, photos-in-context, and reviews live on the
   publisher's page, which we send the user (and the traffic) to.

These two rules are why this product is a partner, not a parasite — and they also
enable the future affiliate/partner business model.

---

## What is and isn't protected (why the rules exist)

| Element | Status | What we do |
|---|---|---|
| Ingredient list + bare steps | Generally **not** copyrightable (idea/expression doctrine) | OK to display (via licensed API) |
| Photographs | **Copyrighted** | Show only images each API licenses; else none + link out |
| Headnotes / creative narrative | **Copyrighted** | Never reproduce; `instructionsSummary` is a brief preview only |
| Written reviews | **Copyrighted** | Use numeric ratings only; no copied review prose |
| Whole-page content via scraping | Site **ToS usually prohibits**; possible breach-of-contract / CFAA exposure | No scraping of premium sites in v1 |

Recipes ≠ free-for-all: even when the *recipe* isn't copyrightable, the
*photos, prose, and reviews* are, and the *site's ToS* may still bind you.

---

## Per-source license checklist (fill during Phase 0)

For **every** source adapter, record and encode these into the adapter's
`capabilities` and the recipe's `cachingAllowed`/`attribution`:

| Question | Spoonacular | Edamam | TheMealDB | (others) |
|---|---|---|---|---|
| May we display their images? | ☐ | ☐ | ☐ | |
| May we cache normalized data, and for how long? | ☐ | ☐ | ☐ | |
| Required attribution text/logo? | ☐ | ☐ | ☐ | |
| Must we link back to the source? | ☐ | ☐ | ☐ | |
| Any restriction on commercial use? | ☐ | ☐ | ☐ | |
| Rate limits / quota? | ☐ | ☐ | ☐ | |

> The code already carries `cachingAllowed` and `attribution` on every `Recipe`
> ([`03-data-model.md`](03-data-model.md)) so these answers are enforced
> automatically once recorded.

---

## Attribution

- Every recipe stores and displays its `attribution` (publisher name + link).
- Honor any `requiredText` mandated by a source's license.
- **TheMealDB** specifically is free **with attribution** — credit it.
- Even when we collapse duplicate recipes across sources, `source_attributions`
  preserves provenance.

---

## Option C guardrails (when we build the publisher bridge)

The structured-data/partner source is held to a higher bar:

- **Opt-in / allowlist** publishers — ideally an actual partnership. No
  indiscriminate open-web crawling.
- Read only the publisher's **own `schema.org` structured data** (the markup they
  publish for SEO). Don't reconstruct full prose/method — **link out**.
- Honor **`robots.txt`**, rate limits, and each site's **ToS**.
- Provide a clear way for a publisher to **opt out / be removed**.
- Always attribute + link.

---

## Caching & data retention

- Cache normalized recipes only as far as each source's license permits
  (`cachingAllowed`). Default to conservative TTLs; refresh periodically.
- If a source disallows caching, fetch live and don't persist its payload.

---

## User data / privacy (grows with the product)

- Anonymous swiping minimizes data collected up front.
- On accounts: store only what's needed (email, swipes, saved list, later
  pantry). Plan a privacy policy before public launch (this repo already has a
  privacy-policy precedent in `tabstash/`).
- Pantry data is personal; treat it as private and deletable.

---

## Pre-launch legal gate

Before public launch:
- [ ] Per-source license checklist complete and encoded.
- [ ] Lawyer review of sourcing, attribution, caching, and ToS posture.
- [ ] Privacy policy + terms published.
- [ ] Confirm no premium-publisher scraping anywhere in the pipeline.

---

### Sources
- [Are Recipes & Cookbooks Protected by Copyright — Copyright Alliance](https://copyrightalliance.org/are-recipes-cookbooks-protected-by-copyright/)
- [Copyright Protection in Recipes — Copyrightlaws.com](https://www.copyrightlaws.com/copyright-protection-recipes/)
- [TheMealDB API (free, with attribution)](https://www.themealdb.com/api.php)
- [Google Recipe structured data docs](https://developers.google.com/search/docs/appearance/structured-data/recipe)
