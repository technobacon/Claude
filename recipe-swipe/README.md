# Forkful 🍴 — *(working codename, easy to rename)*

**Tinder-style recipe discovery.** Swipe through beautiful recipes pulled from
multiple licensed recipe APIs. Swipe right to save, left to skip. Tap a saved
recipe to **cook it on the original publisher's website** — we send them the
traffic, we never steal their content.

> **Status:** Planning / documentation phase. No application code yet.
> This directory currently contains the spec the build will follow.

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

## TL;DR recommendation

Build the MVP on **Spoonacular + Edamam + TheMealDB** behind a source-adapter
layer. Deep-link saved recipes to the publisher. Architect for the Option C
(structured-data / opt-in publisher) bridge from day one. Make the **pantry
feature** the differentiator. See [`docs/04-roadmap.md`](docs/04-roadmap.md).
