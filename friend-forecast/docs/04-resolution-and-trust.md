# Resolution, disputes, and trust

## Why resolution is a core product surface

The market formula is simple. Trust is not.

Public prediction exchanges rely on formal market rules, external sources, moderators, or oracle systems. Friend Forecast applies markets to personal events where the relevant evidence may be a screenshot, a shared observation, or the group's judgment. Resolution must therefore be designed as a visible workflow rather than treated as an administrator action.

A group that disagrees with one payout may stop using the product. The system should prefer a transparent refund over a forced answer that the group does not accept.

## Market rule contract

A market requires the following fields before it can accept points:

1. **Binary question**
2. **Trading deadline**
3. **Earliest resolution time or event end time**
4. **Timezone**
5. **YES condition**
6. **NO condition**
7. **Resolution source or observation method**
8. **Cancellation conditions**
9. **Dispute mode**
10. **Resolver or referee configuration when applicable**

After the first point commitment, these fields become immutable.

The title is a summary. The structured rules control settlement.

## Question-quality rules

A good market question should be:

- binary;
- objectively observable or governed by a defined group process;
- bounded by a date or event;
- independent of the desired outcome;
- understandable without private context unavailable to participants;
- specific about timezones and measurements;
- explicit about invalid or cancelled cases.

### Weak question

> Will the flight leave on time?

Problems:

- Which flight?
- What date?
- Does “leave” mean gate departure, pushback, or takeoff?
- What does “on time” mean?
- Which source controls?
- What happens if the flight is cancelled?

### Strong question

> Will flight W6 2212 record an actual gate-departure time no later than 18:15 CEST on 11 July 2026?

Rules:

- YES if the named source shows gate departure at or before 18:15 CEST.
- NO if the source shows gate departure after 18:15 CEST.
- Cancel if the flight is cancelled, the source does not publish the required value within 24 hours, or the source is unavailable and no equivalent source is accepted by the group.

## Market drafting assistant

A structured assistant can make creation fast without taking control away from the creator.

The assistant should:

- detect vague time words such as “soon,” “late,” “on time,” or “this weekend”;
- ask for a timezone;
- identify terms that can be measured in multiple ways;
- ask what happens if the event is cancelled or data is unavailable;
- warn when the creator or participant can directly control the outcome;
- propose a clearer binary rewrite;
- suggest a resolution source;
- generate YES, NO, and cancellation conditions;
- never silently modify the market after confirmation.

The first version can implement this through templates and deterministic validation rather than an LLM.

## Resolution modes

### Mode A: Creator proposal with one dispute — recommended default

1. Creator proposes YES, NO, or CANCEL.
2. Creator may attach evidence and an explanation.
3. A challenge window opens.
4. If nobody disputes, the proposal becomes final.
5. If one or more members dispute, the proposal stops and the market enters group review.
6. The group votes privately.
7. A supermajority selects YES, NO, or CANCEL.
8. If no outcome reaches the threshold, the market cancels and refunds.

This matches the user's desired “disputed once” behavior while avoiding endless appeals.

### Mode B: Named referee

At creation, the creator selects a group member who is not the market creator as referee.

- Creator proposes a result.
- Referee confirms or replaces it.
- Optional dispute can still trigger group review.

Useful for recurring leagues with a trusted commissioner.

### Mode C: Group vote only

After the event, eligible members vote YES, NO, or CANCEL. No creator proposal is privileged.

Useful for subjective social markets but slower for obvious outcomes.

### Mode D: Automatic source — later

A trusted integration supplies a result, such as a sports score or flight status. Users may still dispute if the source mapping or market rules were wrong.

## Recommended default timings

For an informal private group:

```text
Creator proposal period after eligible resolution: 48 hours
Undisputed challenge window:                       12 hours
Group-review voting window after dispute:          24 hours
```

These should be configurable within bounded options. The app should use local time and display the exact timezone.

A group should be able to settle immediately when all participants explicitly accept the proposal before the challenge period ends.

## Who may dispute

Recommended MVP rule:

- any group member who joined before the trading deadline may dispute;
- the user does not need to have staked points;
- one dispute is sufficient to trigger review;
- the identity of the disputing user is visible to the group;
- the user should provide an optional explanation or evidence;
- a dispute cannot be withdrawn once group voting has started.

Making the identity visible discourages casual or malicious disputes in a real friend group.

## Eligible voters after a dispute

Recommended rule:

- all group members who joined before the trading deadline may vote;
- the creator may vote, but their vote has the same weight as anyone else's;
- each person has one vote regardless of stake or point balance;
- voting is hidden until the voting window closes;
- abstention is allowed;
- users who joined after the deadline cannot vote on the disputed market.

Using one-person-one-vote prevents the wealthiest market participant from controlling truth.

## Voting threshold

Use a two-part threshold:

1. **Quorum:** at least half of eligible voters, with a minimum of three votes.
2. **Decision:** at least two-thirds of non-abstaining votes for YES, NO, or CANCEL.

If no option reaches two-thirds by the deadline, cancel and refund.

Example with eight eligible members:

- quorum requires at least four votes;
- five votes are cast: 3 YES, 1 NO, 1 CANCEL;
- YES has 60%, below two-thirds;
- market cancels and refunds.

This deliberately favors consensus over forced settlement.

## Dispute toggle

The creator may disable disputes only under strict conditions:

- the market uses an objective named source;
- the creator cannot directly control the outcome;
- the creator either cannot stake or a named independent referee must confirm resolution;
- the group settings permit non-disputable markets.

Simpler recommendation for the first public pilot: **always enable disputes**. The toggle can be introduced only after the resolution process is tested.

## Creator participation

The creator may participate when disputes are enabled because they do not have unilateral final authority.

The app should add safeguards when the creator influences the outcome:

- show a “creator can influence this result” warning;
- require group voting for final resolution;
- prevent dispute disabling;
- optionally block the creator from staking;
- allow group admins to void the market for manipulation.

Examples:

- “Will I attend dinner?” — creator directly controls outcome.
- “Will my train arrive before 18:00?” — creator does not ordinarily control outcome.
- “Will I finish this task by Friday?” — creator strongly influences outcome.

## Market state machine

Recommended states:

```text
draft
open_uncontested
open_contested
closed_uncontested
closed_awaiting_event
awaiting_resolution
resolution_proposed
under_dispute
voting
settled_yes
settled_no
cancelled_refunded
expired_refunded
```

### Valid transitions

```text
draft → open_uncontested
open_uncontested → open_contested
open_uncontested → cancelled_refunded at deadline if one-sided
open_contested → closed_awaiting_event at trading deadline
closed_awaiting_event → awaiting_resolution at eligible resolution time
awaiting_resolution → resolution_proposed
resolution_proposed → settled_yes / settled_no / cancelled_refunded if accepted
resolution_proposed → under_dispute
under_dispute → voting
voting → settled_yes / settled_no / cancelled_refunded
awaiting_resolution → expired_refunded if nobody resolves within the maximum period
```

Every transition must be audit logged with actor, timestamp, prior state, new state, and relevant evidence.

## Evidence

A resolution proposal can contain:

- a source URL;
- an uploaded screenshot;
- a short explanation;
- a structured external value such as timestamp or score;
- optional comments from other members.

Privacy requirements:

- evidence inherits the group's visibility;
- do not make uploaded personal evidence public through predictable URLs;
- strip unnecessary image metadata;
- set retention rules for sensitive attachments;
- warn users not to upload private information about non-members.

## Creator inactivity

The group should not lose points because the creator disappears.

Recommended fallback:

1. When the market becomes eligible, creator receives a reminder.
2. After 24 hours, all eligible members may submit a proposed result.
3. The first proposal starts the normal challenge period.
4. Conflicting proposals automatically trigger group review.
5. If no proposal appears within seven days, cancel and refund.

These values should be configurable for long-duration markets.

## Incorrect or premature resolution

The system must prevent settlement before the event is eligible under the rules.

Controls:

- earliest resolution timestamp;
- creator warning if the source is not final;
- challenge window;
- group ability to choose “too early / event incomplete,” which returns the market to awaiting resolution rather than cancelling immediately.

A disputed proposal may result in:

- YES;
- NO;
- CANCEL;
- NOT READY.

If NOT READY wins the group vote, the market returns to `closed_awaiting_event` and may be proposed again later. This is not counted as the market's one substantive dispute because no outcome has yet been selected.

## Full refund conditions

A market should refund when:

- only one side is funded at close;
- the event is invalid under the prewritten rules;
- neither YES nor NO applies;
- required evidence never becomes available;
- the group cannot reach the decision threshold;
- manipulation or collusion invalidates the market;
- a technical error materially affected positions or odds;
- the market duplicates another market and the group chooses to void it;
- the event is cancelled and the rules specify cancellation.

Refund means returning each user's original committed points exactly. No user receives profit.

## Rule changes

Before the first stake:

- creator may edit any field;
- invited users should see that the market remains a draft.

After the first stake:

- no substantive rule edits;
- typographical corrections are also risky because they can change interpretation;
- creator may add a non-binding clarification only if it does not alter meaning;
- all clarifications are time-stamped and visible;
- any member may dispute a clarification immediately;
- if a clarification materially changes the market, cancel and refund.

## Market comments and social pressure

Comments are valuable, but they can create pressure or reveal information unevenly.

MVP approach:

- allow comments and reactions after taking a position or choosing to watch;
- show a visible timestamp;
- never allow deletion without leaving a “comment removed” marker after the market closes;
- preserve comments used as resolution evidence;
- allow group admins to remove abuse;
- offer a sealed mode later for groups that want independent forecasts.

## Trust and safety boundaries

Disallow or strongly restrict markets involving:

- self-harm, death, serious injury, or illness;
- criminal activity;
- intimate or sexual behavior without consent;
- minors' personal behavior;
- harassment, humiliation, or protected characteristics;
- doxxing or private identifying information;
- manipulation of a member's employment, relationship, housing, or safety;
- outcomes participants are encouraged to cause harm to influence;
- real-money side agreements organized through the app.

The exact policy requires legal and safety review before public launch.

## Group governance

Recommended group roles:

### Owner

- controls group settings;
- appoints moderators;
- starts and ends seasons;
- removes members;
- cannot rewrite settled markets or balances directly.

### Moderator

- hides abusive content;
- voids markets for policy violations with a visible reason;
- cannot take points for themselves;
- cannot privately alter odds or settlement.

### Member

- creates markets if group settings allow;
- takes positions;
- comments;
- disputes;
- votes.

All administrative point corrections must generate visible ledger entries and appear in a group audit history.

## Resolution UX requirements

The resolution screen should answer, in order:

1. What exactly was the rule?
2. What result is being proposed?
3. What evidence supports it?
4. How long remains to dispute?
5. What happens if nobody disputes?
6. Who is eligible to vote if disputed?
7. How will points be paid or refunded?

Avoid hiding resolution rules in a secondary modal. Trust-critical information belongs on the primary screen.

## Recommended MVP policy

Use creator proposal plus one group dispute round for every market.

- Creator proposes YES, NO, or CANCEL.
- A 12-hour challenge period opens.
- No dispute means automatic settlement.
- One dispute triggers a 24-hour hidden vote.
- Two-thirds of votes and minimum quorum are required.
- No consensus means full refund.
- No second appeal.
- Every action remains visible in the market history.

This is simple enough for a friend group, strong enough to protect trust, and directly aligned with the intended product identity.