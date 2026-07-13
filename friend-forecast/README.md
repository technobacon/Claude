# Friend Forecast

> Working title for a private, mobile-first prediction market for real friend groups.

Friend Forecast turns the questions already living in group chats into small, playable markets:

- Will the flight leave on time?
- Will Alex arrive before 20:00?
- Will we stay under the trip budget?
- Will the restaurant actually have our table ready?
- Will this relationship survive the reunion episode?

Friends allocate virtual points to **YES** or **NO**. The visible market odds move with the points committed to each side. When the outcome is known, the winning side receives the full pool in proportion to each winner's contribution.

The product should feel like a private Polymarket crossed with a modern group-chat game—not like a sportsbook, finance terminal, or public social network.

## Product thesis

Prediction markets have become mainstream enough that users understand a moving YES/NO percentage, but the leading products are public, financially regulated, and optimized for global events. The opportunity is to take the satisfying market mechanic and apply it to the smaller, funnier, more personal future that exists inside close friend groups.

The defensible wedge is:

1. **Private by default** — every market belongs to a closed group.
2. **Link-first participation** — friends can open a market from WhatsApp, iMessage, Discord, Messenger, or Telegram without installing an app.
3. **Points only** — no deposits, cash-out, purchasable advantage, or real-world prizes in the initial product.
4. **Group-owned truth** — clear resolution rules, one optional dispute round, evidence, voting, and full refunds when the outcome cannot be agreed.
5. **Social entertainment first** — reactions, rivalries, recaps, receipts, and inside jokes matter more than forecasting sophistication.

## Recommended market mechanism

Version one uses a fully backed pari-mutuel pool:

```text
YES odds = YES points / total points
NO odds  = NO points / total points

winner payout = winner stake
              + (winner stake / total winning stake) × total losing stake
```

Example:

- YES pool: 300 points
- NO pool: 200 points
- Displayed odds: 60% YES / 40% NO
- Market resolves YES
- A user who contributed 100 of the 300 YES points receives 166.67 points before integer rounding

This keeps the system solvent and understandable. It creates the visual excitement of a moving market without requiring an order book, market maker, or house-funded liquidity.

The interface must call the percentage **market odds** or **pool split**, not a locked purchase price. Everyone on the winning side receives the same final return per point, regardless of entry time.

## Browser-first product shape

The first release is a responsive mobile web app and installable PWA:

- designed primarily for 360–430 px wide screens;
- complete participation through a shared URL;
- account creation deferred until a user wants to keep history or join the group permanently;
- optional add-to-home-screen experience;
- native iOS/Android considered only after the group loop and retention are proven.

## Planning documents

1. [`docs/01-product-vision.md`](docs/01-product-vision.md) — audience, jobs, principles, scope, and positioning.
2. [`docs/02-market-research.md`](docs/02-market-research.md) — demand evidence, competitor map, opportunity, risks, and monetization.
3. [`docs/03-market-mechanics.md`](docs/03-market-mechanics.md) — pool math, point economy, edge cases, and ledger rules.
4. [`docs/04-resolution-and-trust.md`](docs/04-resolution-and-trust.md) — question quality, resolution state machine, disputes, refunds, and governance.
5. [`docs/05-mobile-ux-and-brand.md`](docs/05-mobile-ux-and-brand.md) — core flows, interaction design, visual direction, copy, and engagement loops.
6. [`docs/06-mvp-architecture-roadmap.md`](docs/06-mvp-architecture-roadmap.md) — technical architecture, domain model, build order, and launch boundaries.
7. [`docs/07-validation-plan.md`](docs/07-validation-plan.md) — pilot structure, metrics, experiments, and go/no-go thresholds.
8. [`docs/08-development-plan.md`](docs/08-development-plan.md) — implementation phases, epics, acceptance gates, testing, rollout, and initial ticket backlog.

## Development

Requirements:

- Node.js 22 or later;
- npm;
- Supabase CLI when running the local database stack.

Start the web application:

```bash
cd friend-forecast
cp .env.example .env.local
npm install
npm run dev
```

Run the validated quality suite:

```bash
npm run check
```

The current foundation includes:

- a Next.js and TypeScript mobile-web application;
- an interactive local market demonstration;
- reusable pari-mutuel pool and settlement calculations;
- unit and component tests;
- a Playwright mobile smoke test;
- a Supabase schema baseline with private-group row-level security;
- GitHub Actions for build, test, migration, and browser checks.

The first identity slice also includes:

- passwordless Supabase email sign-in with cookie-backed SSR sessions;
- safe return-to-route handling after authentication;
- automatic profile creation and editable display names;
- an authenticated groups landing page and sign-out flow.

The group lifecycle slice includes:

- transactional private-group creation with owner membership;
- automatic first-season creation and opening point grant;
- member-scoped group and roster reads through Row Level Security;
- group roles, themes, market-creation policy, and audit history.

The invitation lifecycle includes:

- high-entropy share links with SHA-256 hashes stored at rest;
- safe unauthenticated group and optional market previews;
- expiration, maximum-use limits, revocation, and rotation;
- idempotent acceptance with membership and opening-grant creation;
- owner and moderator invitation controls.

The wallet and ledger slice includes:

- balance-free season wallet accounts backed by append-only integer entries;
- centralized, idempotent opening and cap-aware weekly grant issuance;
- zero-credit grant receipts so retries remain economically inert;
- member wallet summaries and activity history;
- owner and moderator reconciliation across group wallets.

For local authentication, add `http://localhost:3000/auth/callback` to the Supabase project's allowed redirect URLs. The checked-in database trigger creates a profile from the display name supplied during first sign-in.

## Initial product boundaries

The MVP intentionally excludes:

- real-money stakes or withdrawals;
- buying points;
- public discovery feeds;
- anonymous global markets;
- sports-book integrations;
- crypto or blockchain;
- trading positions after entry;
- automated market makers;
- multi-outcome markets;
- paid prizes;
- native mobile applications.

These exclusions keep the initial product focused on one question: **Will private groups repeatedly create, fund, resolve, and talk about their own markets?**

## Working success definition

A group has reached the core experience when it:

1. contains at least five participating members;
2. creates at least three markets;
3. funds both sides of at least two markets;
4. successfully resolves at least one market;
5. creates another market after seeing the first payout and recap.

The most important early metric is not individual daily activity. It is **weekly active groups with at least one meaningfully contested market**.

## Status

Foundation development and FF-004 through FF-007 are implemented: authentication, groups, invitations, seasons, grants, and the wallet read model. Structured market creation is the next milestone.
