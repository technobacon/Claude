# Market mechanics and point economy

## Recommended mechanism

Friend Forecast version one should use a **pari-mutuel binary pool**.

Users allocate integer points to YES or NO. The visible odds reflect the proportion of the total pool on each side. When the market resolves, the losing pool is distributed among the winning positions in proportion to each winner's stake.

This gives the product moving odds and meaningful conviction while guaranteeing that every valid payout is fully backed by points already committed.

## Core formulas

Let:

- `Y` = total points allocated to YES;
- `N` = total points allocated to NO;
- `T = Y + N` = total market pool;
- `s_i` = an individual user's winning stake;
- `W` = total points on the winning side;
- `L` = total points on the losing side.

Displayed market odds:

```text
YES percentage = Y / T
NO percentage  = N / T
```

Final payout for a winning position:

```text
payout_i = s_i + (s_i / W) × L
```

Equivalent form:

```text
payout_i = s_i × (T / W)
```

Final profit:

```text
profit_i = payout_i - s_i
```

Current estimated return multiplier for a side:

```text
YES estimated multiplier = T / Y
NO estimated multiplier  = T / N
```

The multiplier is provisional until the market closes because new positions change both the pool split and the eventual payout.

## Worked example

Seven participants take positions:

- Three users allocate 100 points each to YES.
- Four users allocate 50 points each to NO.

Totals:

```text
Y = 300
N = 200
T = 500
YES odds = 60%
NO odds = 40%
```

If YES resolves:

```text
YES multiplier = 500 / 300 = 1.666666...
```

Each 100-point YES position receives approximately 166.67 points, consisting of the original 100-point stake plus 66.67 points of profit.

The three winners collectively receive the full 500-point pool. No points need to be created for the settlement.

## Language rules

The product should not imply that a user buys a fixed-price share.

Use:

- market odds;
- pool split;
- position;
- committed points;
- estimated return;
- final return;
- resolves YES or NO.

Avoid in MVP:

- purchase price;
- cash value;
- investment;
- guaranteed odds;
- sell;
- liquidity provider;
- return on investment without clarifying that points have no monetary value.

Recommended confirmation copy:

> Commit 80 points to YES? If the market closed now, the estimated return would be 136 points. The return can change until the market closes.

## Market activation rules

A market becomes **contested** only when both YES and NO contain at least one valid position.

Before both sides are funded:

- show participant avatars and the funded side;
- display “Waiting for the other side” rather than 100% odds;
- do not display an attractive multiplier that implies free profit;
- remind invited users that the market will refund if it remains one-sided.

If a market closes with positions on only one side, cancel it automatically and refund every stake. This prevents meaningless wins and point farming.

## Position rules

### MVP recommendation

- A user may take only one side per market.
- A user may add points to the same side before the deadline.
- A user may not switch sides after the short undo window.
- A user receives a 30-second undo window after a new commitment.
- Once the undo period expires, the ledger transaction is final unless the market is cancelled.
- The creator is subject to the same stake limits as everyone else.

This design keeps the odds history meaningful and avoids users repeatedly moving points between sides to manipulate reactions.

### Later option: adjustable positions

Allowing withdrawals or side switching could increase activity, but it also enables signaling games and creates more complex audit requirements. It should be tested only after users understand the simpler mechanism.

## Stake limits

A limited point budget is essential. Without stake caps, the richest participant can dominate the displayed percentage and make other members feel irrelevant.

Recommended initial settings:

```text
Starting seasonal balance:      1,000 points
Weekly equal grant:               200 points
Maximum stake per market:         100 points
Maximum balance after grants:   2,000 points
Suggested season length:           4 weeks
Minimum position:                  10 points
Position increments:               5 points
```

These values should be feature-configurable. The product should collect distribution data before selecting permanent defaults.

### Why use seasonal grants

The economy is zero-sum within each settled market, but repeated winners accumulate more influence over time. Equal recurring grants and seasonal resets preserve accessibility without erasing the status created by successful predictions.

### Why cap the wallet

A balance cap prevents inactive users from accumulating months of grants and later overwhelming a group market. Grants should fill a wallet only up to the cap rather than creating unlimited inflation.

## Point ledger

Balances must never be stored as a single mutable number without a supporting ledger.

Every point change should be an immutable transaction with:

- transaction ID;
- user ID;
- group ID;
- market ID when applicable;
- transaction type;
- signed point amount;
- timestamp;
- idempotency key;
- settlement batch ID when applicable;
- explanatory metadata.

Suggested transaction types:

```text
season_opening_grant
weekly_grant
position_commit
position_undo
market_payout
market_refund
manual_admin_correction
season_carryover
```

A user's displayed balance is the sum of ledger transactions for the relevant group and season.

This structure makes disputes, retries, audit, and later analytics substantially safer.

## Escrow model

When a user commits points:

1. The system checks the available balance and stake cap.
2. A negative `position_commit` ledger entry removes the points from the available wallet.
3. The position record is created or increased.
4. The points remain locked until settlement, cancellation, or a valid undo.
5. Settlement adds the final payout as a new positive ledger entry.

The original stake is therefore not separately returned before the profit. It is included in the payout calculation.

## Integer payout and rounding

Points should remain integers. Floating-point balances create confusing fractions and accounting errors.

Recommended settlement method:

1. Calculate each exact payout using rational or high-precision decimal arithmetic.
2. Assign each winner the floor of the exact payout.
3. Calculate the remaining undistributed points.
4. Rank winners by the largest fractional remainder.
5. Allocate one additional point to each winner in that order until the pool is fully distributed.
6. Use a deterministic secondary tie-breaker such as earliest committed position, then user ID.

This is the largest-remainder method. It guarantees that total payouts exactly equal the full market pool.

Example:

```text
Exact payouts: 166.666, 166.666, 166.666
Initial integer payouts: 166, 166, 166
Remainder points: 2
Final payouts: 167, 167, 166
```

The settlement result should explain that integer rounding was applied.

## Point-economy fairness

### Raw balance is not the only leaderboard

A leaderboard based only on total balance rewards long tenure and early luck. The group profile should eventually separate:

- current point balance;
- season net profit;
- lifetime net profit;
- total points risked;
- profitable market rate;
- largest correct conviction;
- underdog wins;
- market creation count;
- resolved-market participation.

### Recommended primary season ranking

Use **season net profit** as the main MVP leaderboard because it is easy to understand.

Use **return per point risked** as a secondary statistic, with a minimum participation threshold to prevent a user who made one small winning position from ranking first.

### Accuracy scoring later

A Brier score requires a personal probability forecast. A pool stake is not the same thing as an explicit probability. Do not calculate formal calibration from the pool percentage and attribute it to each participant.

If calibration becomes important, add an optional private confidence input—for example 55%, 70%, or 90%—that is analytically separate from the points committed.

## Herding and timing

In a live market, later users can copy the apparent consensus. This is part of the entertainment but weakens independent information aggregation.

Two modes can eventually serve different group preferences:

### Live mode

- odds visible immediately;
- positions visible by avatar;
- strongest social drama;
- more herding;
- recommended default for MVP.

### Sealed mode

- each user commits without seeing the current split;
- market reveals all positions at the deadline;
- stronger independence and surprise;
- less continuous odds movement;
- useful as a later experiment.

A third possibility is to show the percentage but hide identities until close. This preserves the moving odds while reducing interpersonal pressure.

## Late-entry behavior

The pari-mutuel mechanism does not reward earlier entry directly. A user who enters moments before close receives the same return per winning point as an early user on the same side.

This is acceptable for MVP because simplicity is more important than trading sophistication. The product can still recognize early conviction socially:

- “First on YES” badge;
- odds-at-entry shown on the result card;
- “called it at 28%” receipt;
- early-bird profile statistic.

These awards should not change settlement payouts.

## Market creation costs

Do not charge points to create a market in the initial pilot. Creation is the scarce behavior the product needs to encourage.

Possible later anti-spam controls:

- daily creation limit;
- minimum account age;
- group role permissions;
- refundable creator bond returned after valid resolution;
- group vote to hide low-quality markets.

A creator bond should be considered only if unresolved or deliberately ambiguous markets become common.

## Cancellations and refunds

A cancelled market returns exactly the number of points each participant committed. It produces no profit and should not count as a win or loss.

Cancellation reasons should be recorded:

- one-sided at close;
- creator cancellation before first stake;
- event invalid under predefined rules;
- source unavailable;
- no group resolution after dispute;
- moderator cancellation;
- technical duplicate;
- market created in error.

After the first valid stake, the creator should not be able to cancel unilaterally except through the defined resolution process.

## Point transfers

Do not support peer-to-peer point transfers in MVP.

Transfers create opportunities for:

- collusion;
- social pressure;
- secondary markets;
- account selling;
- obscured economy analytics;
- stronger gambling-like perception.

Group gifts can later be implemented as non-balance cosmetics or system-generated awards rather than transferable betting capital.

## Multi-group balances

Each group should have its own point economy and season. A user's balance in one group should not move into another.

Reasons:

- prevents a successful user in a large group from dominating a new group;
- makes season settings configurable by group;
- keeps social competition local;
- reduces transfer and collusion concerns;
- allows different themes and reset schedules.

The global user profile may aggregate achievements, but points remain group-specific.

## Abuse cases and controls

### Creator knows the outcome

Example: a user creates a market about whether they will attend, then controls the decision.

Controls:

- warn when the creator appears able to influence the outcome;
- require disputes to be enabled;
- optionally prevent the creator from taking a position;
- allow the group to flag the market as “participant-controlled.”

### Participant influences the outcome

Example: betting that a friend will be late could motivate someone to delay that friend.

Controls:

- community rules against manipulation;
- report/void function;
- exclude high-risk topics;
- creator prompt asking whether participants can materially control the result.

### Coordinated point transfer through markets

Two users could construct an obvious market and intentionally lose to move points.

Controls:

- no cross-group point value;
- stake caps;
- anomaly detection for repeated two-person transfers;
- group-visible transaction history;
- admin cancellation for collusion.

### Multiple accounts

Controls:

- invite membership tied to verified email or phone after guest conversion;
- one active membership per identity per group;
- device and behavioral risk signals;
- group owner removal controls;
- no valuable cash-equivalent reward that makes account farming worthwhile.

## Mechanism decision

Use the pari-mutuel pool for the first complete product.

Do not implement an order book or automated market maker until all of the following are true:

- users repeatedly ask to lock an entry price;
- groups have enough activity to understand trading;
- the team can explain buy and sell flows in one screen;
- point inflation and market-maker losses are modeled;
- the added complexity demonstrably improves retention.

The MVP's advantage should be social clarity, not financial realism.