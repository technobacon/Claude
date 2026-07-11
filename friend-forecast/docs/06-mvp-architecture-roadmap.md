# MVP architecture and build roadmap

## Technical objective

Build a mobile-first browser product that can safely support private groups, immutable point commitments, live odds, finite market resolution, and shareable result pages without introducing unnecessary infrastructure.

The architecture should optimize for:

- rapid product iteration;
- reliable point accounting;
- strong authorization boundaries between groups;
- mobile web performance;
- real-time market updates;
- auditability;
- a future native client;
- low operating complexity during validation.

## Recommended initial stack

### Application

- **Next.js with TypeScript**
- React Server Components where appropriate
- client components for live market interactions
- Tailwind CSS or a small token-based component system
- PWA manifest and service worker after the primary browser flow is stable

### Backend and data

Recommended speed-first option:

- **PostgreSQL through Supabase**
- Supabase Auth for magic-link or one-time-code login
- Supabase Realtime for market and resolution events
- Row Level Security for group-scoped access
- object storage for private resolution evidence
- server-side functions or Next.js server routes for all ledger mutations

Alternative control-first option:

- Next.js frontend;
- FastAPI service;
- PostgreSQL;
- Redis only when actually required;
- object storage;
- managed authentication provider.

For the first pilot, the Supabase path is recommended because the product does not require computationally complex backend logic, but it does require authentication, relational data, real-time subscriptions, private storage, and access control.

The market engine must still execute in trusted server code. Clients must never calculate or directly write balances, payouts, or market states.

## Architectural principles

### 1. Server-authoritative point accounting

The client submits an intent:

```text
commit 50 points to YES in market X
```

The server verifies:

- user membership;
- market state;
- deadline;
- current balance;
- stake cap;
- existing side;
- idempotency;
- group and season settings.

Only then does the server create ledger and position records in one transaction.

### 2. Immutable financial-style ledger

Even though points have no monetary value, the accounting should use financial-system discipline:

- append-only ledger;
- integer points;
- database transactions;
- explicit references;
- deterministic settlement;
- idempotent mutations;
- visible corrections rather than silent edits.

### 3. Group-scoped privacy

Every market, comment, position, evidence item, and balance belongs to a group. Access requires membership or a narrowly scoped invitation token.

Publicly shareable metadata must be deliberately generated. Private market data should never be exposed through guessable IDs or unrestricted object-storage URLs.

### 4. State-machine enforcement

Market transitions occur only through defined server functions. Arbitrary status updates from clients are prohibited.

### 5. Deep-link-first routing

Every invitation should open the relevant group or market directly. Authentication returns the user to the original route rather than a generic dashboard.

### 6. Portable API boundary

Even if the browser client and server initially share a Next.js codebase, define stable service interfaces so native clients can later call the same market, ledger, resolution, and group operations.

## Proposed domain model

### User

```text
id
handle
display_name
avatar_url
auth_provider
created_at
status
```

### Group

```text
id
name
slug_or_invite_code
owner_user_id
avatar_url
accent_theme
visibility = private
creation_policy
season_policy
created_at
archived_at
```

### GroupMembership

```text
id
group_id
user_id
role = owner | moderator | member
joined_at
invited_by
status
notification_preferences
```

### Season

```text
id
group_id
name
starts_at
ends_at
status
opening_grant
weekly_grant
wallet_cap
max_market_stake
minimum_position
```

### WalletLedgerEntry

```text
id
user_id
group_id
season_id
market_id nullable
type
amount integer
idempotency_key unique
settlement_batch_id nullable
metadata jsonb
created_at
created_by nullable
```

### Market

```text
id
group_id
season_id
creator_user_id
question
yes_condition
no_condition
cancel_condition
resolution_source_text
resolution_source_url nullable
trading_closes_at
resolution_eligible_at
timezone
mode = live | sealed
resolution_mode
status
created_at
first_stake_at nullable
resolved_at nullable
```

### Position

```text
id
market_id
user_id
side = yes | no
points integer
first_committed_at
last_committed_at
```

Unique constraint:

```text
market_id + user_id
```

A user has one aggregated position per market.

### PositionTransaction

```text
id
position_id
market_id
user_id
side
points_delta
odds_before
odds_after
undo_expires_at nullable
ledger_entry_id
created_at
reversed_at nullable
```

This preserves odds-at-entry history without treating the displayed odds as a locked price.

### MarketComment

```text
id
market_id
user_id
body
created_at
edited_at nullable
deleted_at nullable
moderation_state
```

### ResolutionProposal

```text
id
market_id
proposer_user_id
proposed_outcome = yes | no | cancel | not_ready
explanation
evidence_url nullable
proposed_at
challenge_expires_at
status
```

### Dispute

```text
id
market_id
proposal_id
disputer_user_id
reason
evidence_url nullable
created_at
```

Only one active dispute round is permitted per market.

### ResolutionVote

```text
id
market_id
user_id
outcome = yes | no | cancel | not_ready
created_at
```

Unique constraint:

```text
market_id + user_id
```

### MarketSettlement

```text
id
market_id
outcome
winning_pool
losing_pool
total_pool
rounding_method
settlement_batch_id
created_at
```

### Notification

```text
id
user_id
group_id
market_id nullable
type
payload
read_at nullable
created_at
```

### AuditEvent

```text
id
group_id
market_id nullable
actor_user_id nullable
event_type
previous_state jsonb
new_state jsonb
metadata jsonb
created_at
```

## Critical server operations

### `create_market`

- verify group membership and creation permission;
- validate timestamps and timezone;
- validate structured rules;
- identify participant-controlled outcome warning;
- create draft or open market;
- return invitation URL.

### `commit_position`

- lock relevant wallet and market rows;
- verify market is open;
- verify side consistency;
- verify deadline using server time;
- verify available balance and caps;
- create ledger entry and position transaction;
- update or insert aggregated position;
- return new odds and estimated return.

### `undo_position_transaction`

- verify undo window;
- reverse only the latest eligible transaction;
- create reversing ledger entry;
- never delete the original transaction;
- recalculate displayed pool.

### `close_market`

- execute from scheduled job and opportunistically on request;
- refund automatically if only one side is funded;
- otherwise lock positions and move to awaiting-event state.

### `propose_resolution`

- verify eligibility time;
- verify proposer permission;
- store evidence securely;
- calculate payout preview;
- open challenge period.

### `dispute_resolution`

- verify eligible user and active challenge window;
- create dispute;
- move market to group review;
- determine eligible voter snapshot.

### `submit_resolution_vote`

- verify voter snapshot membership;
- record one hidden vote;
- settle early only if the outcome is mathematically irreversible and product rules permit;
- otherwise resolve at vote deadline.

### `settle_market`

- lock market and position rows;
- guarantee idempotency;
- calculate integer payouts with largest remainder;
- insert payout ledger entries;
- create settlement record;
- transition market state;
- create notifications and result-card data.

### `refund_market`

- lock market;
- return exact committed points;
- create refund ledger entries;
- record reason;
- mark cancelled and refunded.

## Authentication and guest participation

### Recommended first version

Use a low-friction identity path:

1. Invitee opens a signed market link.
2. Invitee sees the market before authentication.
3. When committing points, invitee enters a display name and verifies email through a one-time code or magic link.
4. The invitation token binds the verified identity to the group.
5. Subsequent visits use a persistent session.

Phone authentication can improve group identity later but adds cost, country coverage issues, and SMS-delivery complexity.

Do not allow completely anonymous unverified stakes. Duplicate identities would undermine the point economy and voting.

## Invitation model

Invitation token fields:

```text
token_hash
group_id
market_id nullable
created_by
expires_at
maximum_uses nullable
revoked_at nullable
```

Requirements:

- store token hashes, not raw tokens;
- support revocation;
- redirect directly to the market;
- prevent access to unrelated group content until membership is accepted;
- allow the group owner to rotate the general invite link.

## Real-time behavior

Use real-time events for:

- new or increased positions;
- odds movement;
- market close;
- comments and reactions;
- resolution proposal;
- dispute state;
- settlement.

Do not rely exclusively on WebSocket delivery. On reconnect, the client must fetch authoritative current state.

## Scheduled jobs

Required jobs:

- close markets at trading deadline;
- move markets into resolution eligibility;
- expire challenge windows;
- conclude group votes;
- refund abandoned markets;
- issue weekly grants up to wallet caps;
- start and end seasons;
- generate weekly recaps.

Every job must be idempotent because managed schedulers can retry.

## Security requirements

- server-side authorization for every mutation;
- Row Level Security tested with negative cases;
- rate limits on invitations, comments, market creation, and evidence uploads;
- signed and expiring object-storage access;
- content-type and file-size validation;
- image metadata stripping;
- CSRF protections where applicable;
- secure session cookies or provider-recommended token handling;
- no client-readable service credentials;
- audit log for moderator and point actions;
- backup and restore testing before meaningful pilots;
- dependency and secret scanning in CI.

## Privacy requirements

- private by default;
- minimal personal information;
- no contact-book upload in MVP;
- no advertising identifiers;
- no sale of prediction or relationship data;
- group and account deletion flows;
- exportable personal data;
- configurable retention for uploaded evidence;
- clear explanation of who can see a market;
- GDPR-oriented consent and data-processing review before broader EU launch.

## Analytics event plan

Collect product analytics without exposing private question text to third-party analytics tools.

Recommended events:

```text
market_create_started
market_create_completed
market_link_shared
invite_opened
invite_join_completed
position_sheet_opened
position_committed
market_became_contested
market_closed
resolution_proposed
resolution_disputed
resolution_vote_submitted
market_settled
market_refunded
result_card_shared
next_market_created
pwa_installed
```

Event properties should use IDs, category labels, counts, timing, and market state—not personal market text or comments.

## API outline

```text
POST   /api/groups
POST   /api/groups/:groupId/invitations
GET    /api/groups/:groupId/home
GET    /api/groups/:groupId/league

POST   /api/markets
GET    /api/markets/:marketId
POST   /api/markets/:marketId/positions
POST   /api/markets/:marketId/positions/:transactionId/undo
POST   /api/markets/:marketId/comments
POST   /api/markets/:marketId/resolution-proposals
POST   /api/markets/:marketId/disputes
POST   /api/markets/:marketId/votes

GET    /api/users/me
GET    /api/users/me/wallets
GET    /api/users/me/markets
```

Administrative and scheduled actions should use protected internal routes or database functions, not public client endpoints.

## Build order

### Foundation

- repository and deployment setup;
- database schema and migrations;
- authentication;
- group creation and invitations;
- design tokens and mobile shell;
- analytics foundation.

### Core market loop

- market drafting;
- shared market route;
- point wallets and ledger;
- YES/NO position commitment;
- live pool calculation;
- market close;
- comments and lightweight reactions.

### Trust loop

- structured rules;
- creator proposal;
- challenge period;
- dispute and hidden vote;
- deterministic settlement;
- refunds;
- audit history.

### Retention layer

- league standings;
- result cards;
- notifications;
- weekly grants;
- seasons;
- group recap.

### Pilot hardening

- moderation controls;
- account and group deletion;
- evidence privacy;
- error recovery;
- rate limiting;
- observability;
- backup verification;
- accessibility review;
- security tests.

## MVP acceptance criteria

### Market creation

- creator can produce a structured market and shareable link;
- rules lock after first stake;
- all timestamps display with explicit timezone.

### Participation

- invited member can join and commit points on mobile web;
- duplicate requests cannot double-charge the wallet;
- position and balance remain correct after refresh and reconnect.

### Odds

- displayed percentage equals the authoritative pool split;
- both point-weighted and people-weighted views are available;
- one-sided markets do not display misleading tradable odds.

### Resolution

- creator can propose outcome with evidence;
- eligible member can dispute once;
- hidden vote respects voter snapshot, quorum, and threshold;
- market settles or refunds exactly once.

### Accounting

- total payout equals total pool;
- ledger reconciles to all displayed balances;
- integer rounding is deterministic;
- cancelled markets return exact stakes.

### Privacy

- non-members cannot access private market detail;
- invitation links expose only intended preview information;
- evidence is private and access-controlled.

## Explicitly deferred capabilities

- real-money payment infrastructure;
- purchasable points;
- order books;
- automated market maker;
- selling positions;
- multi-choice markets;
- public market discovery;
- algorithmic content feeds;
- contact syncing;
- third-party sports or flight APIs;
- native mobile clients;
- cash or physical prizes;
- AI-generated markets without user review.

## Key engineering risks

### Transaction races

Several users may commit simultaneously. Use database transactions, row locks or serializable functions, and idempotency keys.

### Scheduled-job drift

A market may remain visually open if a scheduler is delayed. Every position request must independently verify the server deadline, and every read can opportunistically advance expired state.

### Settlement duplication

Retries must not generate multiple payouts. A unique settlement record and settlement batch ID should enforce exactly-once economic effect.

### Unauthorized evidence access

Do not use permanent public storage links. Evidence should require authenticated signed access.

### Client-trusted odds

The client may preview the expected movement, but confirmed odds and returns must come from the server response.

## Technical decision recommendation

Start with a single Next.js TypeScript application backed by PostgreSQL/Supabase, but treat the ledger and market state machine as a small protected domain service.

The product is simple enough to avoid microservices and complex infrastructure. The accounting and authorization are important enough to require stronger discipline than a typical social prototype.