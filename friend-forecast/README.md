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

The market creation slice includes:

- a guided mobile creation wizard with reusable templates and placeholder detection;
- draft and publish flows guarded by idempotent mutation receipts;
- optimistic rule revisions with immutable rule snapshots at the first stake.

The position commitment slice includes:

- server-authoritative YES/NO point commitments with idempotent commit receipts;
- season minimum, per-market cap, side consistency, and wallet balance enforced in one transaction;
- aggregated per-member positions with a short, exactly-once undo window;
- live pool splits, backer counts, and projected returns on the market page;
- first-stake rule locking wired into the commitment transaction.

The live market and deadline slice includes:

- an advisory countdown backed by server-time deadline enforcement;
- realtime pool refreshes with authoritative re-reads after reconnect;
- opportunistic closing whenever a due market or its group dashboard is read;
- contested markets locking into a closed pool awaiting resolution;
- exact one-time refunds for one-sided and unfunded markets at close.

The resolution proposal and dispute slice includes:

- YES/NO/CANCEL/NOT-READY proposals with explanations and evidence links;
- creator-first proposing with a 24-hour grace before any eligible member may propose;
- immutable proposal records opening a 12-hour challenge window;
- one visible dispute per market that freezes a one-person-one-vote voter
  snapshot of members who joined before the trading deadline;
- settlement payout previews that reuse the pari-mutuel pool math.

Evidence attaches as an explanation plus source link during the pilot;
private file uploads arrive with the storage-hardening pass.

The result reveal and league slice includes:

- ledger-backed result reveals with winner payouts, losses, and friendly
  superlatives (first believer, biggest conviction — no loser labels);
- a league screen ranking members by net market profit, then balance, so
  sitting on grants never wins;
- a deliberately redacted shareable result card carrying only the question,
  final split, outcome, and pool size;
- a create-the-next-market prompt on every settled result.

The settlement and refund slice includes:

- a settlement engine executing uncontested proposals past their challenge
  window, vote-decided outcomes, and seven-day expiry refunds;
- largest-remainder integer payouts computed in exact integer arithmetic,
  always summing to the pool with deterministic tie-breaking;
- one immutable settlement record per market, enforced by primary key;
- refunds as ledger credits that reuse the close-refund idempotency keys, so
  no path can double-credit a stake;
- a market result card with pool totals and the member's own net outcome.

The hidden voting slice includes:

- one hidden vote per snapshot member, invisible to others until finalization;
- quorum of half the eligible voters (minimum three) and a two-thirds decision
  threshold, with automatic cancellation when consensus fails;
- early finalization the moment every eligible voter has voted;
- NOT-READY outcomes that reopen the waiting state and permit a fresh dispute;
- decided YES/NO/CANCEL outcomes recorded on the dispute for the settlement
  engine to execute.

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

Foundation development and FF-004 through FF-014 are implemented: authentication, groups, invitations, seasons, grants, the wallet read model, structured market creation, server-authoritative position commitment with undo, the live market page with deadline closing and one-sided refunds, the resolution proposal and dispute workflow with frozen voter snapshots, hidden group voting with deterministic finalization, the settlement and refund engines, and the result reveal with league standings and redacted share cards. The complete market lifecycle — from shared invitation through exact payout to the next-market prompt — runs without manual intervention. Comments, reactions, and notifications (FF-015) are the next milestone.
