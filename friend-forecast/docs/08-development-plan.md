# Development plan

## Purpose

This document converts the Friend Forecast product, market, mechanics, trust, UX, architecture, and validation plans into an executable software-delivery sequence.

The target is a private, mobile-first browser MVP that lets a small friend group:

1. join through a shared link;
2. create a binary market with explicit resolution rules;
3. commit virtual points to YES or NO;
4. watch the pool split move in real time;
5. close the market automatically at a deadline;
6. propose, challenge, vote on, and finalize a resolution;
7. settle or refund the market exactly once;
8. see balances, standings, results, and group activity;
9. return to create another market.

The plan assumes one full-time product-minded developer using AI-assisted development, with occasional design, legal/privacy, and security review. A two-person engineering team can parallelize frontend and backend work, but should preserve the same dependency order and quality gates.

## Delivery principles

### Ship the smallest complete loop

A partial market-creation experience is not useful. The first meaningful release must support the entire lifecycle from invitation through settlement.

### Protect accounting before polishing growth

Point balances, position commitments, refunds, and settlement must be server-authoritative, transactional, idempotent, and tested before social or visual enhancements are added.

### Build mobile web as the primary client

Every important flow must work at 360–430 px widths and through a shared browser link. Desktop support should remain usable, but desktop-specific layouts are not a priority.

### Keep private data private by construction

Private group data, prediction text, comments, positions, evidence, and membership must be protected by server authorization and database policies. Public sharing must use deliberately generated, redacted result artifacts.

### Prefer boring infrastructure

Use one application, one relational database, managed authentication, managed object storage, and a small number of scheduled jobs. Do not introduce microservices, Redis, queues, native apps, or complex event infrastructure without measured need.

### Measure groups, not only users

The key unit is the active group. Product analytics should answer whether groups create, contest, resolve, discuss, and repeat markets.

## Recommended implementation stack

### Application

- Next.js with TypeScript and the App Router;
- React Server Components for read-heavy screens;
- client components for stake interaction, live pool updates, voting, comments, and optimistic UI;
- Tailwind CSS with a small semantic design-token layer;
- Zod for request and form validation;
- React Hook Form where forms are sufficiently complex;
- PWA manifest after the core browser flow is stable.

### Platform

- Supabase PostgreSQL;
- Supabase Auth using email one-time codes or magic links;
- Supabase Realtime for group and market updates;
- Supabase Storage for private resolution evidence;
- Row Level Security as a second authorization boundary;
- Next.js server actions or route handlers for all state-changing operations;
- Vercel for initial deployment unless another host is already preferred;
- managed scheduler or Vercel Cron for deadline processing.

### Quality and operations

- Vitest for unit tests;
- Testing Library for component behavior;
- Playwright for critical mobile-browser flows;
- database integration tests against a disposable PostgreSQL/Supabase environment;
- ESLint, TypeScript strict mode, and Prettier;
- GitHub Actions for lint, type-check, tests, migration checks, and production build;
- Sentry or equivalent for application errors;
- privacy-conscious product analytics, initially PostHog or a small first-party event table.

The exact service provider is replaceable. The important constraints are relational transactions, server-authoritative mutations, private storage, authentication, and real-time updates.

## Repository structure

Recommended structure inside `friend-forecast/` when implementation starts:

```text
friend-forecast/
  README.md
  docs/
  app/
    (auth)/
    invite/[token]/
    groups/[groupId]/
    markets/[marketId]/
    api/
  components/
    ui/
    market/
    group/
    resolution/
  lib/
    auth/
    db/
    domain/
      market/
      ledger/
      settlement/
      resolution/
    analytics/
    notifications/
    validation/
  supabase/
    migrations/
    seed.sql
    tests/
  public/
  tests/
    e2e/
    fixtures/
  scripts/
  package.json
  env.example
```

Keep market, ledger, settlement, and resolution logic in domain modules rather than embedding rules directly in UI components or route handlers.

## Environment model

### Local

- local Next.js development server;
- local Supabase stack or isolated development project;
- seeded test group, users, markets, positions, and resolution cases;
- email delivery redirected to a local inbox or test provider;
- synthetic evidence files only.

### Preview

Every pull request should receive a preview deployment against a non-production database or an isolated schema. Preview data must never contain production group information.

### Staging

Staging should mirror production configuration and be used for:

- migration validation;
- invitation and authentication testing;
- scheduled-job testing;
- mobile-browser acceptance testing;
- pilot rehearsal;
- backup and restore drills.

### Production

Production must use:

- separate credentials and database;
- protected service-role keys;
- restricted storage policies;
- monitored scheduled jobs;
- database backups;
- error monitoring;
- rate limits;
- explicit environment validation at startup.

## Branch and pull-request strategy

- `main` must remain deployable;
- use short-lived branches named `agent/<feature>` or `feature/<feature>`;
- prefer one product slice per pull request;
- database migrations and application changes that depend on them should ship together;
- every PR must identify affected market states and accounting behavior;
- accounting or authorization PRs require tests before merge;
- avoid long-lived frontend and backend branches that drift from each other.

Suggested PR template sections:

```text
What changed
Why
User impact
Market-state impact
Ledger/accounting impact
Security/privacy impact
Validation performed
Screenshots or recordings
Rollback considerations
```

## Delivery timeline

The base plan is approximately ten focused development weeks, followed by a two-week private pilot. Calendar duration may be longer for a part-time solo build.

| Phase | Indicative duration | Output | Exit gate |
|---|---:|---|---|
| 0. Product and technical setup | 3–5 days | runnable shell, environments, schema baseline, CI | preview deploy and migration pipeline work |
| 1. Identity, groups, and invitations | 1 week | authenticated private groups and deep links | invited user can join the intended group safely |
| 2. Core market and point loop | 2 weeks | market creation, wallet, positions, live odds, close | contested market can be created and funded correctly |
| 3. Resolution and settlement | 1.5–2 weeks | proposal, dispute, vote, payout, refund | all lifecycle paths settle exactly once |
| 4. Social and retention layer | 1–1.5 weeks | comments, results, standings, notifications | group can understand and discuss outcomes |
| 5. Hardening and instrumentation | 1 week | security, privacy, accessibility, observability | release candidate passes acceptance suite |
| 6. Private alpha | 2 weeks | 3–5 real groups using the product | evidence supports iteration or broader pilot |

Duration is less important than preserving the exit gates. Do not start a public growth push while settlement, privacy, or group activation remain unreliable.

# Phase 0 — Product and technical setup

## Objectives

- establish a deployable repository;
- define development conventions;
- create the first database migrations;
- validate the mobile visual foundation;
- ensure every later feature can be tested and observed.

## Work items

### Project initialization

- create the Next.js TypeScript application;
- enable strict TypeScript settings;
- configure ESLint and formatting;
- add environment schema validation;
- add local, preview, staging, and production configuration guidance;
- configure path aliases and domain-module boundaries;
- create a minimal error boundary and not-found experience.

### Design foundation

- implement semantic color, spacing, typography, radius, shadow, and motion tokens;
- create mobile page shell, top bar, bottom navigation, modal sheet, toast, button, field, segmented control, avatar, chip, and skeleton components;
- implement YES, NO, neutral, warning, disputed, and resolved states with accessible contrast;
- create a basic Storybook or internal component playground only if it speeds development.

### Database baseline

Create migrations for:

- profiles;
- groups;
- group memberships;
- seasons;
- wallets or ledger entries;
- markets;
- positions;
- position transactions;
- invitation tokens;
- audit events.

Resolution, comments, notifications, and settlement tables may be included now or added in later migrations, but the market status enum and lifecycle model should be defined early.

### CI and deployment

- run lint;
- run type-check;
- run unit tests;
- validate migrations against a clean database;
- produce a production build;
- deploy a preview environment;
- prevent accidental exposure of service-role credentials.

### Seed data

Create deterministic seed scenarios:

- empty new group;
- group with eight members;
- open market with no stakes;
- one-sided market;
- contested 60/40 market;
- market past its close deadline;
- disputed resolution;
- settled and refunded markets.

## Exit criteria

- a contributor can run the app from documented commands;
- database creation from zero succeeds;
- preview deployment works;
- mobile shell renders at 360, 390, and 430 px;
- CI blocks broken types, tests, migrations, and builds;
- no private service credential reaches the browser bundle.

# Phase 1 — Identity, groups, and invitations

## User outcome

A friend can open a link from a messaging app, understand the invitation, verify identity, and land inside the correct private group without navigating through a generic onboarding funnel.

## Epic 1.1 — Authentication

Implement:

- email one-time-code or magic-link authentication;
- persistent sessions;
- display-name and optional avatar setup;
- return-to-intended-route behavior;
- sign-out;
- account recovery path;
- duplicate-profile prevention.

Acceptance criteria:

- an unauthenticated invitation visitor returns to the same market or group after verification;
- authentication errors do not consume or invalidate the invitation;
- an authenticated user cannot impersonate another group member;
- private routes reject expired or invalid sessions.

## Epic 1.2 — Group lifecycle

Implement:

- create group;
- group name, visual theme, and optional image;
- owner, moderator, and member roles;
- member list;
- leave group;
- owner transfer or safe group archival;
- creation-policy setting for owner-only versus all-members.

Acceptance criteria:

- every group query is membership scoped;
- a member cannot read another private group by changing an ID;
- role-restricted operations are enforced on the server;
- the owner cannot accidentally leave a group without transferring ownership or archiving it.

## Epic 1.3 — Invitation links

Implement:

- signed, high-entropy invitation token;
- token hashing at rest;
- group-level and market-level invitations;
- expiration, maximum uses, revocation, and rotation;
- safe preview information for non-members;
- deep links into the intended market.

Acceptance criteria:

- invite token values are never stored in plaintext;
- revoked and expired invitations fail safely;
- accepting an invitation is idempotent;
- a market invitation does not expose other group content before membership is accepted;
- opening from WhatsApp, iMessage, Messenger, Telegram, and Discord preserves the intended route.

## Exit criteria

- a new group can be created;
- seven friends can join through one group invitation;
- a non-member cannot access private group or market data;
- invitation and login conversion events are recorded without storing personal question text.

# Phase 2 — Core market and point loop

## User outcome

A group member can create a clear binary question, friends can allocate points to either side, and the market odds update while the system preserves exact balances.

## Epic 2.1 — Seasons and wallets

Implement:

- default group season;
- opening grant;
- weekly grant configuration;
- wallet cap;
- maximum stake per market;
- current balance derived from an append-only ledger;
- wallet activity screen;
- reconciliation query or administrative check.

Ledger entry types should include at minimum:

```text
season_grant
weekly_grant
position_commit
position_reversal
settlement_payout
market_refund
admin_adjustment
```

Acceptance criteria:

- balances are derived or reconciled from ledger entries;
- point amounts are integers;
- every mutation has an idempotency key;
- no client can directly write a wallet balance;
- concurrent commitment attempts cannot overspend the wallet.

## Epic 2.2 — Market creation

Implement a structured mobile creation flow for:

- binary question;
- YES condition;
- NO condition;
- cancellation condition;
- source or evidence expectation;
- betting deadline;
- earliest resolution time;
- time zone;
- creator participation and dispute settings;
- preview before publishing.

Product behavior:

- save as draft before first stake;
- lock outcome rules after first stake;
- permit only narrow non-economic typo corrections after first stake, or require cancellation and recreation;
- flag ambiguous wording and participant-controlled outcomes;
- provide reusable templates such as flight, arrival time, trip budget, sports result, television outcome, and group challenge.

Acceptance criteria:

- deadline is validated using server time;
- time zone is displayed explicitly;
- YES, NO, and cancellation cases are mutually understandable;
- first stake creates an immutable rules snapshot;
- creator receives a directly shareable link.

## Epic 2.3 — Position commitment

Implement:

- YES/NO selection;
- point amount slider and numeric input;
- maximum and balance indicators;
- estimated current return;
- confirmation sheet;
- server-authoritative commitment;
- short undo window for the latest transaction;
- additional commitment to the same side;
- prohibition on switching sides in MVP.

Server transaction requirements:

1. authenticate the user;
2. verify group membership;
3. lock or serialize wallet and market state;
4. verify market is open and deadline has not passed;
5. verify balance, minimum, and cap;
6. verify existing side consistency;
7. create ledger entry;
8. create position transaction;
9. update aggregated position;
10. write audit event;
11. return authoritative balance, pools, odds, and estimated payout.

Acceptance criteria:

- repeated network submission does not double-charge;
- two simultaneous requests cannot overspend;
- refresh and reconnect show the same state;
- undo creates reversing records rather than deleting history;
- the odds shown after confirmation come from the server.

## Epic 2.4 — Live market page

Implement:

- question and locked rules;
- market-state banner;
- point-weighted YES/NO pool split;
- people-weighted participant split;
- pool amounts;
- participant avatars or initials;
- user position and projected return;
- countdown to close;
- share action;
- real-time updates;
- authoritative refresh after reconnect.

One-sided market behavior:

- show allocation rather than misleading market odds;
- explain that an opposing position is required;
- automatically refund at close if only one side is funded.

## Epic 2.5 — Market closing

Implement:

- scheduled close;
- opportunistic close whenever an expired market is read or mutated;
- rejection of late stakes based on server time;
- automatic refund of one-sided or empty markets;
- transition into awaiting-event or resolution-eligible states;
- close notification.

## Exit criteria

A seeded eight-person group can:

- create a market;
- stake 300 points on YES and 200 on NO;
- see an authoritative 60/40 split;
- maintain exact balances under retries and concurrent submissions;
- close at the deadline;
- refund correctly when only one side is funded.

# Phase 3 — Resolution, dispute, settlement, and refunds

## User outcome

The group can determine the outcome using the rules created before betting, challenge a questionable proposal once, and receive an exact payout or refund.

## Epic 3.1 — Resolution proposal

Implement:

- eligibility rules for who can propose;
- YES, NO, CANCEL, or NOT READY proposal;
- explanation text;
- optional private evidence upload;
- payout preview;
- challenge deadline;
- immutable proposal record;
- group notification.

Acceptance criteria:

- proposal cannot occur before eligibility time unless an explicit early-resolution rule permits it;
- uploaded evidence is private and access-controlled;
- proposer cannot edit a submitted proposal silently;
- payout preview matches deterministic settlement logic.

## Epic 3.2 — Challenge period

Implement:

- configurable dispute-enabled market setting;
- visible challenge deadline;
- one dispute per market;
- dispute reason and optional evidence;
- eligible disputer validation;
- transition to group review;
- voter snapshot creation.

If disputes are disabled, enforce the documented creator-participation restriction.

Acceptance criteria:

- late disputes are rejected;
- only eligible group members can dispute;
- exactly one active dispute path exists;
- the voter set cannot be manipulated after the dispute begins.

## Epic 3.3 — Hidden group vote

Implement:

- eligible voter list;
- hidden individual votes;
- YES, NO, CANCEL, or NOT READY choices;
- quorum and supermajority rules;
- vote deadline;
- result only after finalization;
- automatic refund when no valid consensus exists.

Acceptance criteria:

- one vote per eligible member;
- open positions do not grant additional voting weight;
- creator and large bettors do not control the result economically;
- hidden votes cannot be read by other members before finalization;
- finalization is deterministic under every quorum and threshold combination.

## Epic 3.4 — Settlement engine

Implement settlement as a protected domain operation.

For a winning market:

```text
base payout = winning stake
profit share = winning stake / winning pool × losing pool
final payout = base payout + allocated profit share
```

Use largest-remainder integer allocation:

1. calculate exact rational payouts;
2. floor each payout to an integer;
3. calculate undistributed remainder;
4. rank fractional remainders deterministically;
5. distribute one point at a time until the total payout equals the total pool;
6. use stable tie-breaking based on position creation time and ID.

Settlement transaction requirements:

- lock market and position rows;
- require a unique settlement record;
- reject already settled or refunded markets;
- create one payout ledger entry per winner;
- create market settlement summary;
- write audit events;
- create result notifications;
- commit once.

Acceptance criteria:

- winner payouts sum exactly to the total pool;
- losing positions receive zero settlement payout;
- settlement retries have no additional economic effect;
- the same inputs always produce the same integer allocation;
- ledger and displayed wallets reconcile.

## Epic 3.5 — Refund engine

Refund reasons include:

- creator cancellation before meaningful participation;
- one-sided market at close;
- ambiguous or invalid resolution;
- no group consensus;
- event cancelled under predefined rules;
- administrative safety action.

Acceptance criteria:

- every committed point is returned exactly once;
- refunds are ledger entries, not deleted stakes;
- the cancellation reason remains visible;
- refund and settlement are mutually exclusive at database level.

## Epic 3.6 — Market lifecycle tests

Build a state-transition test matrix covering:

- draft to open;
- open to closed;
- closed to awaiting event;
- awaiting event to resolution eligible;
- proposal to uncontested settlement;
- proposal to dispute;
- dispute to YES settlement;
- dispute to NO settlement;
- dispute to cancellation/refund;
- one-sided close to refund;
- creator cancellation;
- repeated scheduler and request retries;
- invalid transitions from every terminal state.

## Exit criteria

- every defined lifecycle path passes integration tests;
- no market can settle twice;
- no market can both settle and refund;
- evidence access is private;
- the group can resolve, dispute, vote, and receive exact balances on mobile web.

# Phase 4 — Social, results, standings, and retention

## User outcome

Resolution feels like a social payoff rather than an accounting operation, and the group has reasons to create another market.

## Epic 4.1 — Comments and reactions

Implement:

- comments on active and resolved markets;
- lightweight reactions;
- edit window;
- soft deletion;
- basic report or moderator removal;
- rate limiting;
- notification preferences.

Do not build threaded conversations, rich media comments, or public social feeds in MVP.

## Epic 4.2 — Result reveal

Implement a clear settlement reveal:

- winning outcome;
- final pool split;
- winning and losing positions;
- individual profit or loss;
- evidence and resolution explanation;
- dispute outcome where relevant;
- largest winner;
- strongest contrarian or highest conviction call;
- next-market creation action.

Animation should be brief and respect reduced-motion settings.

## Epic 4.3 — Shareable result card

Generate a deliberately redacted card containing only information approved for external sharing:

- group display name only when allowed;
- market question or a shortened user-approved variant;
- final YES/NO result;
- final odds;
- humorous outcome text;
- no email addresses, private comments, evidence, full membership list, or raw balances.

Allow the creator or group owner to disable external result sharing.

## Epic 4.4 — Group league

Implement initial standings based on:

- current seasonal point balance;
- net profit;
- return on points staked;
- resolved markets participated in;
- win rate shown only with a minimum sample;
- optional fun labels that do not affect economics.

Avoid rewarding pure inactivity or creating permanent wealth dominance. Seasonal reset and wallet caps should remain central.

## Epic 4.5 — Notifications

Start with in-app and email notifications for:

- invitation accepted;
- market opened;
- market nearing close;
- market closed;
- resolution proposed;
- dispute opened;
- vote required;
- market settled or refunded;
- weekly grant;
- weekly group recap.

Push notifications should wait until the PWA is stable and notification value has been demonstrated.

## Epic 4.6 — Recap and repeat loop

Implement a lightweight weekly recap:

- markets created;
- most surprising market movement;
- biggest correct conviction;
- closest market;
- disputed and refunded count;
- current standings;
- prompt to create the next market.

## Exit criteria

- settled market produces a comprehensible and engaging result;
- members can discuss the market without leaving the app;
- group standings reconcile to wallets and settlements;
- result sharing never exposes private evidence or identity data;
- at least one clear path invites the group to create another market.

# Phase 5 — Hardening, accessibility, and release readiness

## Security work

- review every server mutation for authentication, authorization, state, deadline, balance, and idempotency checks;
- test Row Level Security with unauthorized users and unrelated groups;
- rate-limit authentication, invitations, market creation, comments, evidence upload, disputes, and voting;
- validate upload MIME type, file size, and extension;
- strip image metadata;
- use expiring signed storage URLs;
- add secret scanning and dependency alerts;
- ensure service-role keys are server-only;
- add audit visibility for moderator and point adjustments;
- conduct a focused threat-model review.

## Privacy work

- document categories of stored personal data;
- avoid sending market text and comments to third-party analytics;
- provide account deletion;
- provide group deletion or archival;
- provide personal-data export;
- define evidence retention and deletion;
- provide clear in-product audience labels;
- draft privacy notice and terms suitable for a closed points-only pilot;
- perform GDPR-oriented review before inviting broader EU usage.

## Accessibility work

- keyboard navigation for all controls;
- visible focus states;
- semantic headings and landmarks;
- screen-reader labels for odds and position controls;
- non-color indicators for YES and NO;
- WCAG-compliant contrast;
- reduced-motion behavior;
- minimum touch targets;
- form errors associated with fields;
- testing with browser zoom and larger text.

## Reliability work

- idempotent scheduler actions;
- graceful reconnect after real-time interruption;
- database backup verification;
- restore rehearsal;
- structured logging with market and request IDs, excluding private text;
- error monitoring and alert thresholds;
- health and readiness endpoint;
- rollback procedure for application deployments;
- forward-fix plan for migrations.

## Performance targets

On a representative mid-range mobile device and normal mobile connection:

- invitation preview usable quickly without loading the entire group;
- primary market content prioritized above comments and secondary analytics;
- minimal client JavaScript on read-only screens;
- image uploads compressed where appropriate;
- no blocking third-party scripts;
- real-time updates degrade gracefully to polling or refresh.

Set formal Core Web Vitals targets once the first deployed screens can be measured.

## Release-candidate acceptance suite

The release candidate must pass the following end-to-end tests in mobile viewports:

1. new owner creates group;
2. invited friend opens link and authenticates;
3. friend joins correct group;
4. creator publishes structured market;
5. eight members allocate positions;
6. odds update under concurrent activity;
7. market rejects late stake;
8. one-sided market refunds;
9. uncontested proposal settles;
10. disputed proposal enters hidden vote;
11. vote settles YES, NO, or CANCEL according to rules;
12. payout totals equal pool total;
13. repeated settlement request changes nothing;
14. unrelated user cannot access market or evidence;
15. deleted or revoked invitation cannot be reused;
16. result card contains no prohibited private data;
17. account and group deletion behave as documented.

# Phase 6 — Private alpha

## Alpha scope

Recruit 3–5 real friend groups with approximately 5–12 members each. Prefer groups that already coordinate through WhatsApp, Messenger, Discord, Telegram, or iMessage and frequently make informal predictions.

The alpha should remain:

- invitation only;
- points only;
- no paid features;
- no public discovery;
- no prizes;
- manually supported;
- instrumented for group-level behavior.

## Alpha rollout

### Wave 1 — Internal group

- one group controlled by the product team;
- create at least ten markets across several categories;
- force every lifecycle path, including dispute and refund;
- inspect ledger reconciliation daily;
- observe every session directly where practical.

### Wave 2 — Two friendly groups

- groups receive onboarding support;
- creators receive market-writing examples;
- track invitation completion and first contested market;
- collect interviews after first settlement.

### Wave 3 — Additional independent groups

- onboarding should occur without a live walkthrough;
- support remains available but does not drive participation;
- test whether group activity continues for two weeks.

## Alpha monitoring dashboard

Track:

- groups created;
- invited members per group;
- invitation open-to-join conversion;
- time to five joined members;
- time to first market;
- time to first contested market;
- percentage of markets with both sides funded;
- average distinct bettors per market;
- average pool size;
- markets closed, settled, disputed, and refunded;
- settlement completion time;
- weekly active groups;
- groups creating a second market after first settlement;
- points reconciliation exceptions;
- authorization and storage errors;
- user-reported confusion or conflict.

## Alpha decision gates

Proceed to a broader pilot only if:

- no unresolved ledger or settlement integrity defects exist;
- no cross-group privacy incident occurs;
- most activated groups create multiple markets;
- both sides receive meaningful participation in a substantial share of markets;
- resolution usually completes without founder intervention;
- at least some groups create another market after experiencing settlement;
- users understand that displayed odds are the pool split, not a locked purchase price;
- disputes do not regularly damage group trust.

Do not optimize acquisition before the repeat group loop is demonstrated.

# Cross-cutting engineering workstreams

## Domain-model ownership

Treat these as protected domain areas with explicit interfaces:

### Market service

Owns:

- creation;
- rule locking;
- deadlines;
- state transitions;
- market reads;
- close behavior.

### Ledger service

Owns:

- grants;
- commitments;
- reversals;
- payouts;
- refunds;
- administrative corrections;
- reconciliation.

### Settlement service

Owns:

- winner determination input;
- exact rational payout calculation;
- largest-remainder integer allocation;
- settlement idempotency;
- terminal state transition.

### Resolution service

Owns:

- proposals;
- evidence;
- challenge windows;
- voter snapshots;
- hidden votes;
- quorum and thresholds;
- final outcome selection.

### Group authorization service

Owns:

- membership;
- roles;
- invitation acceptance;
- resource access;
- moderation permissions.

UI code should not duplicate these rules.

## Data-migration discipline

- all schema changes use versioned migrations;
- migrations are tested from an empty database and from a recent staging snapshot;
- destructive changes require a two-step expand-and-contract approach;
- enums or state values should be changed carefully to avoid deployment-order problems;
- ledger history should never be rewritten by ordinary migrations;
- migration rollback is not assumed to be safe after user data is written; prefer forward fixes;
- seed data must be deterministic and contain no production information.

## Feature flags

Use simple group-level or environment-level feature flags for:

- comments;
- disputes;
- group voting;
- external result sharing;
- weekly recaps;
- PWA installation prompts;
- experimental market templates.

Do not build a complex feature-flag platform. A small database table or typed environment configuration is enough.

## Analytics implementation

Analytics should be introduced with the relevant feature rather than added at the end.

Rules:

- use stable IDs and categorical metadata;
- never send full private question text, comment content, evidence URLs, email addresses, or invitation tokens to third parties;
- distinguish group, market, user, and session scopes;
- record server-confirmed economic events from the server;
- maintain event naming and property definitions in code;
- test that critical events emit once under retries.

## Notification architecture

Create notifications from confirmed domain events, not UI actions.

For example:

```text
market_created
position_committed
market_closed
resolution_proposed
resolution_disputed
vote_required
market_settled
market_refunded
```

A notification dispatcher can initially process these synchronously or through a simple outbox table. Introduce a queue only if delivery reliability or volume requires it.

## Observability

Every important server operation should log:

- request or correlation ID;
- authenticated user ID;
- group ID;
- market ID where relevant;
- operation name;
- previous and next market state;
- idempotency key;
- success or typed failure;
- duration.

Do not log private question text, comments, raw invitation tokens, authentication codes, or evidence contents.

# Test strategy

## Unit tests

Prioritize deterministic logic:

- pool split calculation;
- estimated return;
- stake caps;
- market deadline validation;
- state transitions;
- quorum and supermajority rules;
- largest-remainder payout;
- tie-breaking;
- recap statistics;
- redaction for result cards.

## Property-based tests

Use generated inputs for accounting invariants:

- payouts always equal total pool;
- no payout is negative;
- each winning payout is at least the winning stake when a losing pool exists;
- refunds always equal original commitments;
- repeated settlement is economically idempotent;
- rounding allocation is deterministic;
- wallet balance equals ledger sum.

## Database integration tests

Test:

- simultaneous commitments;
- wallet overspend prevention;
- idempotency uniqueness;
- settlement uniqueness;
- settlement versus refund exclusivity;
- Row Level Security;
- invitation acceptance;
- voter snapshots;
- scheduled state advancement.

## Component tests

Cover:

- market creation validation;
- position confirmation;
- odds and one-sided state;
- countdown states;
- proposal and dispute forms;
- hidden-vote interaction;
- result reveal;
- reduced-motion mode;
- inaccessible or expired invitations.

## End-to-end tests

Run critical flows in Chromium mobile emulation on every merge. Run a broader browser matrix on release candidates, including Safari/WebKit behavior because invitation links and PWA behavior are mobile priorities.

## Manual exploratory testing

Before each pilot wave, test:

- poor network and reconnect;
- duplicate taps;
- backgrounding the browser during a deadline;
- time-zone changes;
- expired magic links;
- revoked invitations;
- image upload interruption;
- simultaneous dispute or vote actions;
- browser back navigation;
- account with membership in several groups;
- very long but valid market text;
- large text and screen-reader behavior.

# Definition of done

A feature is complete only when:

- user-facing acceptance criteria pass;
- server authorization is implemented;
- domain-state and ledger effects are documented;
- input validation and typed errors exist;
- unit or integration tests cover critical logic;
- analytics events are included where relevant;
- loading, empty, success, and failure states exist;
- mobile layout has been tested at target widths;
- accessibility basics are satisfied;
- sensitive data is not exposed in logs or analytics;
- migration and rollback or forward-fix considerations are documented;
- relevant product documentation is updated.

# Initial backlog

These are the recommended first implementation tickets in dependency order.

## FF-001 — Initialize application and CI

Deliver:

- Next.js TypeScript app;
- lint, formatting, strict type-check;
- Vitest and Playwright setup;
- GitHub Actions;
- preview deployment;
- environment validation.

## FF-002 — Implement design tokens and mobile shell

Deliver:

- typography and color tokens;
- app shell;
- buttons, fields, sheets, alerts, tabs, chips, avatars, skeletons;
- accessible YES/NO visual system.

## FF-003 — Establish Supabase schema and migration workflow

Deliver:

- local Supabase configuration;
- profiles, groups, memberships, invitations, seasons, ledger, markets, positions, and audit tables;
- migration validation in CI;
- deterministic seed data.

## FF-004 — Add authentication and profile creation

Deliver:

- email code or magic link;
- session handling;
- display name;
- intended-route restoration;
- logout and failure states.

## FF-005 — Add group creation and membership authorization

Deliver:

- group creation;
- roles;
- member list;
- server authorization helpers;
- initial Row Level Security tests.

## FF-006 — Add invitation-token lifecycle

Deliver:

- create, hash, accept, expire, revoke, and rotate invitations;
- market deep-link behavior;
- preview and join screens.

## FF-007 — Implement seasons, ledger, grants, and wallet read model

Deliver:

- opening grant;
- ledger service;
- wallet balance and activity;
- reconciliation tests;
- idempotency pattern.

## FF-008 — Implement structured market creation

Deliver:

- creation wizard;
- rules and dates;
- preview;
- draft and publish;
- first-stake rule locking.

## FF-009 — Implement position commitment transaction

Deliver:

- stake UI;
- server transaction;
- caps and balance checks;
- aggregated position;
- undo;
- concurrency and duplicate-request tests.

## FF-010 — Implement live market page and deadline closing

Deliver:

- odds and people split;
- real-time updates;
- countdown;
- server-authoritative reconnect;
- scheduled and opportunistic close;
- one-sided refund.

## FF-011 — Implement proposal and dispute workflow

Deliver:

- resolution proposal;
- evidence upload;
- challenge window;
- single dispute;
- voter snapshot.

## FF-012 — Implement hidden voting and outcome finalization

Deliver:

- vote UI and storage;
- quorum and threshold calculation;
- vote deadline;
- final outcome selection.

## FF-013 — Implement settlement and refund engines

Deliver:

- largest-remainder payout;
- payout ledger records;
- settlement uniqueness;
- exact refunds;
- invariant and concurrency tests.

## FF-014 — Implement result reveal and group standings

Deliver:

- result page;
- profit and loss;
- league standings;
- next-market prompt;
- redacted share card.

## FF-015 — Add comments, reactions, and notifications

Deliver:

- comments and moderation basics;
- in-app notifications;
- transactional email for important deadlines;
- rate limiting.

## FF-016 — Add analytics and alpha dashboard

Deliver:

- event taxonomy;
- server-confirmed economic events;
- group funnel and retention dashboard;
- privacy checks.

## FF-017 — Complete release hardening

Deliver:

- security review;
- RLS negative tests;
- backup and restore rehearsal;
- accessibility review;
- account and group deletion;
- pilot runbook.

# Resourcing scenarios

## Solo full-time developer

Expected path:

- 8–10 development weeks;
- 2 weeks of private alpha;
- use managed infrastructure aggressively;
- keep visual design systematic and restrained;
- defer nonessential integrations.

The main schedule risk is context switching between product, design, frontend, database, security, and pilot support.

## Two engineers

Recommended split:

### Engineer A — Product client

- mobile shell;
- authentication and invitation UX;
- market creation;
- market page;
- resolution and voting UI;
- results and standings;
- accessibility and performance.

### Engineer B — Domain and platform

- schema and migrations;
- group authorization;
- ledger;
- commitment transaction;
- market state machine;
- scheduled jobs;
- settlement and refunds;
- storage, observability, and CI.

Both engineers should jointly review domain contracts and end-to-end acceptance tests.

## Additional specialist support

Useful targeted reviews:

- product designer: mobile flow and visual-system review before Phase 2;
- security engineer: authorization, RLS, invitation tokens, storage, and settlement review before alpha;
- privacy/legal adviser: points-only positioning, terms, privacy, evidence retention, and EU pilot review;
- user researcher: alpha interviews and behavioral synthesis.

# Major delivery risks

## Overbuilding a market exchange

Risk:

The product drifts toward order books, locked entry prices, selling positions, or automated market makers.

Mitigation:

Keep the pari-mutuel pool and current estimated return. Treat trading as a separate future product decision requiring proven demand.

## Weak group activation

Risk:

A creator makes a market but cannot get enough friends to join and fund both sides.

Mitigation:

Deep links, no-install preview, fast authentication, templates, creator prompts, and visible one-sided-market nudges. Measure time to five members and first contested market.

## Accounting defects

Risk:

Retries, concurrency, or rounding produce incorrect balances.

Mitigation:

Append-only integer ledger, database transactions, idempotency keys, settlement uniqueness, property-based tests, and daily reconciliation during alpha.

## Ambiguous resolution causes conflict

Risk:

Personal markets produce social disputes rather than fun.

Mitigation:

Structured rules, source prompts, immutable criteria, one finite dispute round, group vote, cancellation fallback, and clear participant-controlled-outcome warnings.

## Privacy leak through links or analytics

Risk:

Private questions, members, or evidence are exposed outside the group.

Mitigation:

Membership-scoped authorization, token hashing, redacted previews, private signed storage, third-party analytics restrictions, and cross-group negative tests.

## Notification fatigue

Risk:

Too many market updates cause users to mute or abandon the product.

Mitigation:

Start with only high-value lifecycle notifications, add preferences early, batch recaps, and measure notification-driven return rather than raw delivery.

## Native-app distraction

Risk:

Development shifts to iOS and Android before the group loop is validated.

Mitigation:

Treat the web application as the product. Add PWA capabilities after core stability, and consider native clients only after repeat group activity is proven.

# Launch boundary

The MVP is ready for private alpha when it supports the following complete path with no manual database intervention:

```text
shared invitation
→ verified identity
→ private group membership
→ structured market creation
→ points committed to both sides
→ live pool movement
→ deadline close
→ resolution proposal
→ optional dispute and group vote
→ exact settlement or refund
→ result reveal
→ next market creation
```

The MVP is not ready for wider distribution if any of these remain true:

- wallet balances cannot be independently reconciled;
- settlement or refund can execute more than once;
- unauthorized users can infer private group information;
- invitation links regularly lose their destination;
- users misunderstand the odds as a locked price;
- resolution frequently requires founder intervention;
- mobile flows require desktop use;
- groups do not create another market after a result.

## Immediate next action

Start with `FF-001` through `FF-003` in one foundation milestone. Do not begin the visual market experience before the migration workflow, authorization model, ledger schema, and mobile design tokens are established.