# Validation plan

## Objective

Validate whether intact friend groups repeatedly create and resolve private points-based markets after the novelty of the first market has passed.

The pilot should answer behavioral questions, not merely collect positive opinions about the concept.

## Core hypotheses

### H1 — Market creation is understandable

A group organizer can turn a real conversation into a sufficiently precise binary market without expert help.

### H2 — Points communicate conviction better than polls

Participants understand that allocating more points expresses stronger conviction and affects both the group odds and potential return.

### H3 — Link-first joining works

A recipient opening a link from an existing group chat can understand the market and take a position without installing an app.

### H4 — The pool is engaging and comprehensible

Users understand that the percentage is the split of committed points, not a fixed share price or objective probability.

### H5 — Groups tolerate resolution governance

Creator proposals, one dispute round, evidence, and group voting feel fair rather than bureaucratic.

### H6 — Results create the next market

Settlement and recap generate enough conversation that the group creates another market without direct founder prompting.

### H7 — The product has recurring contexts

Groups identify repeatable use cases such as travel, sport, television, gaming, plans, or workplace predictions.

## Validation stages

## Stage 0 — Rule and payout comprehension tests

Before building the complete product, test static or clickable market screens with 12–20 individuals.

Tasks:

1. Explain the market only through the interface.
2. Ask the participant what 60% YES means.
3. Ask what happens if they commit 50 points.
4. Ask whether the estimated payout can change.
5. Present a settlement example and ask them to calculate or explain the result.
6. Show a cancellation and ask whether any points were lost.

Pass conditions:

- at least 80% correctly explain that odds represent the point pool;
- at least 80% understand that estimated return can move before close;
- at least 90% understand that cancelled markets refund stakes;
- fewer than 20% describe points as purchasable or cash-equivalent.

If comprehension is weak, simplify the copy and visuals before implementing richer features.

## Stage 1 — Concierge group test

Recruit 5 groups of 5–12 people. Run markets manually through a lightweight prototype or controlled web experience.

Recommended group mix:

- one travel group;
- one sports or F1 group;
- one reality-TV or entertainment group;
- one coworker social group;
- one general friend group.

The test operator may manually assist with question clarity and settlement, but should record every intervention.

Each group receives:

- 1,000 starting points per member;
- 100-point maximum per market;
- three suggested starter templates;
- a four-week season;
- no financial rewards.

The operator should not create all markets. At least half must be initiated by group members.

## Stage 2 — Self-serve pilot

Recruit 15–30 additional groups through personal networks and referrals from successful pilot groups.

The product should support:

- self-serve group creation;
- link joining;
- market creation;
- point ledger;
- live odds;
- creator-proposed resolution;
- dispute and vote;
- settlement and refund;
- group standings;
- result recap.

Founder support may answer questions but should not manually resolve normal markets.

## Primary unit of analysis

The product's primary unit is the **group-week**, not the user-day.

A group-week is active when:

- at least one market receives positions from three or more members; and
- at least one market is contested on both sides.

A stronger group-week contains:

- two or more contested markets;
- participation from at least half of group members;
- one successful resolution or refund;
- at least one member-created follow-up market.

## Activation definition

A group is activated within its first seven days when it:

1. has at least five verified members;
2. creates at least three markets;
3. produces at least two contested markets;
4. resolves at least one market;
5. generates at least one new market after the first result.

The final condition is crucial because it separates novelty from a repeatable loop.

## North-star candidate

**Weekly active groups with at least one contested market created by a non-founder or non-staff member.**

This metric combines group activity, liquidity, and organic creation.

## Funnel metrics

### Invitation funnel

```text
market link generated
→ link opened
→ group context understood
→ identity verified
→ position sheet opened
→ position committed
→ group joined permanently
```

Track:

- unique invite opens;
- verified join conversion;
- time from open to first position;
- abandonment by step;
- percentage requiring support.

### Market funnel

```text
creation started
→ rules completed
→ market shared
→ first position
→ opposite side funded
→ trading closed
→ resolution proposed
→ settled or refunded
→ result shared
→ follow-up market created
```

### Resolution funnel

```text
eligible to resolve
→ proposal submitted
→ accepted without dispute
or disputed
→ quorum reached
→ outcome selected or refund
```

## Initial success thresholds

These are internal decision thresholds, not industry benchmarks.

### Group activation

- at least 40% of recruited groups meet the seven-day activation definition;
- at least 60% of groups that resolve one market create another market afterward.

### Invite conversion

- at least 40% of unique invited recipients who open a market join and commit a position;
- median first-position time below three minutes;
- fewer than 15% of first-position attempts require direct support.

### Market quality

- at least 65% of shared markets become contested;
- median number of participants per market at least four;
- at least 60% of active group members participate in one market during the first week.

### Retention

- at least 35% of activated groups remain active in week four;
- at least 25% of activated groups produce active group-weeks in three of the first four weeks;
- at least 30% of week-four markets are created without a product prompt.

### Resolution trust

- fewer than 15% of resolved markets are disputed;
- at least 80% of disputed-market participants rate the final process as fair or acceptable;
- fewer than 10% of markets expire because nobody resolves them;
- no material point-accounting discrepancies.

### Sharing loop

- at least 30% of result cards are shared back into a messaging channel;
- at least 20% of shared result cards lead to a follow-up market within 48 hours.

## Guardrail metrics

- dispute-related member removal;
- reports of harassment or humiliation;
- markets involving prohibited personal topics;
- users attempting to arrange real-money side bets;
- balance concentration by top member;
- unresolved-market rate;
- accidental duplicate commitments;
- invitation abuse;
- notification opt-out rate;
- percentage of markets cancelled for ambiguity.

## Qualitative research questions

Interview creators and participants separately.

### Creator interview

- What caused you to create the first market?
- How difficult was it to define YES and NO?
- Which rule field felt unnecessary?
- Did sharing the market feel natural in your existing chat?
- Were you comfortable proposing the resolution?
- What would make you create markets more often?
- Which type of market would recur every week?
- Would you pay to unlock features for the whole group? Which features?

### Participant interview

- What did the market percentage mean to you?
- How did you choose the number of points?
- Did the estimated return affect your decision?
- Did seeing other positions change your choice?
- Did you trust the creator to propose the result?
- Did the dispute process feel fair?
- Was the result more engaging than a normal poll?
- Would you create a market yourself?

### Group-level debrief

- Which market generated the most conversation?
- Which market felt pointless or confusing?
- Did anyone feel pressured by visible positions?
- Did the point economy become unbalanced?
- Did the product improve or disrupt the group chat?
- What category should the app suggest next?

## Experiments

### Experiment 1 — Live odds versus sealed positions

Compare:

- live odds and identities;
- live odds with hidden identities;
- sealed odds until close.

Measure:

- participation rate;
- time to position;
- side concentration;
- comments;
- reported social pressure;
- result engagement.

### Experiment 2 — Points versus simple confidence

Test whether the point slider adds value relative to:

- YES/NO only;
- YES/NO plus low, medium, high confidence;
- YES/NO plus points.

The point mechanism must justify its additional cognitive load.

### Experiment 3 — Creator templates

Compare open text with templates for:

- travel;
- punctuality;
- sport;
- television;
- plans;
- budget;
- weather.

Measure creation completion, ambiguity warnings, cancellation rate, and resolution disputes.

### Experiment 4 — Result-card design

Test:

- simple payout card;
- animated odds-history card;
- social-superlative card;
- standings-impact card.

Measure share rate and follow-up-market creation.

### Experiment 5 — Point replenishment

Compare:

- weekly grants;
- season-only grant;
- activity-based grants with no purchase.

Avoid reward structures that encourage spam market creation or meaningless positions.

### Experiment 6 — Group standings

Compare primary ranking by:

- total balance;
- net profit;
- return per point risked;
- hybrid score.

Collect fairness perception, not only engagement.

### Experiment 7 — Dispute timing

Test challenge windows of:

- two hours;
- twelve hours;
- twenty-four hours.

Measure missed challenges, settlement delay, and user satisfaction across different group-chat activity patterns.

## Market template library for pilot

### Travel

- Will the flight leave by the scheduled time plus 15 minutes?
- Will everyone reach the accommodation before a stated time?
- Will checked luggage arrive on the same flight?
- Will the trip remain below the agreed shared budget?

### Social plans

- Will at least six people attend?
- Will the group leave the first venue before midnight?
- Will the reservation seat the group within 15 minutes?
- Will a specific plan survive until the scheduled day?

### Sport and F1

- Will the driver finish in the points?
- Will there be a safety car?
- Will the team finish ahead of its rival?
- Will the match contain more than a defined number of goals?

### Entertainment

- Will the contestant be eliminated this episode?
- Will the episode reveal a named secret?
- Will a couple remain together at the reunion?
- Will the film's group rating exceed a stated score?

### Gaming

- Will the group win the next match?
- Will a player reach a rank by a deadline?
- Will the team complete the raid in fewer than a defined number of attempts?

## Data-quality plan

The pilot dashboard should distinguish:

- invited users from active group members;
- viewed markets from funded markets;
- funded markets from contested markets;
- closed markets from settled markets;
- creator-created markets from staff-suggested markets;
- system refunds from dispute refunds;
- unique groups from duplicate test groups.

Exclude internal testing, automated accounts, and founder-created demonstration markets from retention and organic-creation metrics.

## Decision framework

### Proceed to build retention features

Proceed when:

- multiple groups independently create follow-up markets;
- the market percentage and payout are understood;
- disputes are rare and recoverable;
- group-week retention reaches the internal threshold;
- result cards visibly trigger new activity.

### Iterate on mechanism

Reconsider the point pool when:

- users consistently misunderstand estimated returns;
- most users allocate the maximum every time;
- users describe the experience as a poll with unnecessary steps;
- one wealthy participant controls most markets;
- late participation feels unfair enough to reduce repeat use.

Possible mechanism adjustments:

- confidence tiers;
- smaller fixed position bundles;
- sealed markets;
- equal stake per market with points awarded by underdog difficulty;
- separate social and trader modes.

### Narrow the use case

Focus on one vertical when broad groups show weak recurrence but one segment performs strongly.

Examples:

- travel groups retain but general friend groups do not;
- F1 and sports groups produce weekly activity;
- reality-TV groups have high participation but seasonal usage;
- workplace groups value forecasting but want administrative controls.

### Stop or substantially reposition

Stop or reposition if, after multiple iterations:

- fewer than 20% of groups create a second market organically;
- most markets remain one-sided;
- users prefer simple polls;
- disputes damage relationships or trust;
- group activation requires persistent manual facilitation;
- retention disappears after the first settlement;
- users mainly request real-money functionality.

## Monetization validation

Do not ask for payment in the first behavioral pilot.

After a group has completed at least one successful season, test willingness to pay for:

- custom group themes;
- unlimited market history;
- multiple leagues;
- richer statistics;
- automated resolution integrations;
- longer or custom seasons;
- downloadable season recap;
- larger groups;
- commissioner controls.

Use a real checkout or refundable preorder rather than hypothetical willingness-to-pay questions.

Do not test:

- paid points;
- point boosts;
- paid odds visibility;
- monetary prizes;
- any feature that changes competitive fairness.

## Pilot operating cadence

### Weekly research review

Review:

- active group-weeks;
- contested-market percentage;
- creation source;
- invite conversion;
- unresolved and disputed markets;
- point concentration;
- notable interview feedback;
- safety issues;
- product interventions required.

### Market review sample

Each week, manually inspect a sample of market rules for:

- ambiguity;
- source quality;
- creator influence;
- sensitive topics;
- cancellation handling;
- dispute outcome;
- user confusion in comments.

Do not use private market text in external presentations without explicit group permission.

## Recommended first experiment

Build or prototype one complete loop:

```text
create market
→ share link
→ four friends take positions
→ odds move
→ market closes
→ creator proposes result
→ no dispute or one group vote
→ points settle
→ result card is shared
→ next market is created
```

Everything else is secondary until this loop repeats inside multiple real groups.