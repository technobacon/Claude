# 01 — Architecture

*Last updated: 2026-06-04*

## Goals

- **Source-agnostic core.** The app never knows or cares which API a recipe came
  from. Adding/removing a source is a config + one-adapter change.
- **One backend, two clients.** The website (now) and the React Native app
  (later) talk to the same API.
- **Cost-controlled.** Cache normalized recipes so we don't re-pay per API call.
- **Forward-compatible with Option C.** The future "read publishers' structured
  data / opt-in partners" ingestion plugs into the same adapter interface.

## High-level diagram

```
        ┌──────────────────────────────────────────────────────────┐
        │                         CLIENTS                           │
        │   Web (Next.js)  ───────────────────  Mobile (RN, later)  │
        └───────────────┬──────────────────────────┬───────────────┘
                        │  HTTPS / JSON (one API)    │
                        ▼                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │                    BACKEND (BFF / API)                    │
        │                                                          │
        │   Routes:  /feed   /swipe   /list   /recipe/:id  /auth    │
        │                                                          │
        │   ┌────────────────────────────────────────────────┐     │
        │   │           Recipe Aggregation Service             │     │
        │   │   - picks sources, merges, de-dupes, ranks        │     │
        │   │   - normalizes → canonical Recipe                 │     │
        │   │   - reads/writes cache                            │     │
        │   └───────────────┬──────────────────────────────────┘     │
        │                   │ RecipeSource interface (the seam)       │
        │   ┌───────┬───────┼───────────┬─────────────┬───────────┐  │
        │   ▼       ▼       ▼           ▼             ▼           ▼  │
        │ Spoon-  Edamam  TheMealDB  FatSecret   (more APIs)  JSON-LD│
        │ acular  adapter  adapter    adapter      adapters   (C, L8R)│
        └──────┬─────────────────────────────────────────────┬──────┘
               │ external HTTPS                                │
               ▼                                               ▼
        Recipe APIs (Spoonacular, Edamam, …)         Publisher pages
                                                     (deep-link target)
               ┌──────────────────────────────────────────┐
               │  DATA STORE (Postgres)                     │
               │  users · recipes(cache) · swipes · lists   │
               │  pantry(items)  ·  source_attributions     │
               └──────────────────────────────────────────┘
```

## Components

### Clients
- **Web (Next.js + React):** the swipe deck, the saved list, recipe detail,
  filters. The swipe interaction is a standard draggable-card component.
- **Mobile (React Native / Expo, later):** reuses the same backend and the same
  normalized model. Business logic lives server-side to keep clients thin.

### Backend (BFF — Backend for Frontend)
Thin Node service. Responsibilities:
- Expose a small, stable API to clients (below).
- Orchestrate the **Recipe Aggregation Service**.
- Own auth, swipes, saved lists, and (later) pantry.
- Never leak a vendor's response shape to the client.

### Recipe Aggregation Service
The brain. Given a feed request (with optional filters):
1. Selects which sources to query (config + availability + budget).
2. Queries cache first; calls source adapters on miss.
3. Normalizes every result to the canonical `Recipe` ([`03-data-model.md`](03-data-model.md)).
4. **De-duplicates** across sources (same recipe from two APIs) — see below.
5. Ranks/orders the deck (v1: filter + freshness + light shuffle; later:
   personalization, then pantry-match).
6. Excludes recipes the user already swiped.

### `RecipeSource` adapter (the key seam)
Every source implements one interface so the rest of the system is identical
regardless of provider. See [`02-data-sources.md`](02-data-sources.md) for the
full contract and per-source notes. This is also where **Option C** lands later
— a structured-data/publisher-feed source is just another adapter.

## Backend API (v1 surface)

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/feed?filters=…&cursor=…` | Return a deck of normalized recipes, excluding already-swiped |
| `POST` | `/swipe` | Record `{recipeId, direction}` (right = save, left = skip) |
| `GET`  | `/list` | The user's saved (right-swiped) recipes |
| `DELETE` | `/list/:recipeId` | Remove a saved recipe |
| `GET`  | `/recipe/:id` | Full recipe detail incl. **publisher deep-link** |
| `POST` | `/auth/*` | Login / session (anonymous allowed for swiping; account to persist) |
| *(Phase 4)* `GET/POST` | `/pantry` | Manage pantry items; feed becomes pantry-aware |

Anonymous-first: users can swipe without an account (low friction, SomeYum-style);
an account is prompted to **save** across devices.

## Caching

The primary cost and latency control.

- **Recipe cache (Postgres `recipes`):** every normalized recipe is stored with
  its source, source ID, fetched timestamp, and full canonical payload. Serve
  from cache; refresh on a TTL (e.g. periodic re-fetch for ratings/availability).
- **Feed/deck assembly** reads mostly from cache; live API calls top up the pool
  when it runs low for a given filter set.
- **Respect API license terms** on how long/whether content may be cached — this
  varies per provider and is tracked in [`05-legal-compliance.md`](05-legal-compliance.md).

## De-duplication

Same dish can arrive from multiple sources. Strategy:
- Generate a **fingerprint** (normalized title + key ingredients hash + source
  domain of the original link).
- Prefer the record with the richest data / best image / a working deep-link.
- Keep a `source_attributions` record so we can credit/track origin even when a
  duplicate is collapsed.

## Deep-link-out (non-negotiable product behavior)

Every saved recipe stores `sourceUrl` (the original publisher page). The recipe
detail "Cook this" / tapping a saved recipe **opens the publisher's page**. We
display only what each API licenses us to show (image, ingredients summary,
rating); the full method/headnotes live on the source. This is both the legal
posture and the future partner/affiliate business model.

## Tech stack (proposed, not locked)

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js + React | SSR/SEO, fast to build, swipe components available |
| Backend | Node (TypeScript) | Matches team JS comfort; shared types with web |
| DB | Postgres | Relational fit for users/swipes/lists; JSONB for cached payloads |
| Cache | Postgres (v1), Redis (later) | Keep infra simple early |
| Mobile | React Native / Expo (later) | Reuse logic, one backend |
| Hosting | Vercel (web) + managed Postgres | Low ops overhead |

> TypeScript is recommended so the canonical `Recipe` type is shared between
> backend and web, and adapters are type-checked against the interface.

See [`04-roadmap.md`](04-roadmap.md) for the order we build these in.
