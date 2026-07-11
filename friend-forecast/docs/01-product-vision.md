# Product vision

_Last updated: 2026-07-11_

## One-line proposition

**Create a private YES/NO market for your group, put points behind your prediction, and settle who called it.**

## The user problem

Friend groups constantly make informal predictions:

- someone claims a flight will be delayed;
- someone says a friend will cancel;
- the group debates whether a plan will happen;
- people argue about a match, show, relationship, purchase, trip, or deadline;
- after the event, everyone remembers their own prediction selectively.

The group chat is good for making claims but poor at preserving conviction, comparing confidence, or settling the result. Existing prediction-market products are designed around public events, financial stakes, or serious forecasting. They do not feel like a lightweight social game for eight friends.

Friend Forecast creates a durable, playful record of who believed what, how strongly they believed it, and who was right.

## Product promise

The product should make five actions feel immediate:

1. **Ask:** turn a group debate into a precise binary question.
2. **Commit:** allocate a limited number of points to YES or NO.
3. **Watch:** see the group odds move as friends take positions.
4. **Settle:** resolve with a clear condition, evidence, and one optional dispute round.
5. **Relive:** receive a result card showing the market history, winners, biggest conviction, and best comments.

## Target user

### Primary segment

Existing friend groups of roughly **5–12 people** who already communicate through WhatsApp, iMessage, Messenger, Discord, Telegram, or a similar group channel.

Strong early audiences:

- university and former-university friend groups;
- sports and motorsport fans;
- travel groups;
- coworkers with an informal social chat;
- reality-TV and entertainment fandom groups;
- gaming groups;
- couples and double-date groups;
- families with a playful competitive dynamic.

### Early-adopter profile

The likely creator is the person who already:

- starts polls in the chat;
- remembers what everyone previously claimed;
- organizes fantasy leagues, quizzes, trips, or brackets;
- sends screenshots as evidence;
- enjoys playful competition but does not necessarily gamble.

### Deliberate non-targets for MVP

- professional traders;
- users seeking real-money betting;
- public political forecasting communities;
- enterprise forecasting teams;
- large anonymous communities;
- children-focused products.

## Jobs to be done

### Functional jobs

- Record a prediction in a form the group cannot reinterpret later.
- Express confidence using a limited point budget.
- See the group’s aggregate view at a glance.
- Resolve ambiguous real-life outcomes fairly.
- Track who performs well over time.

### Social jobs

- Create a reason to reopen the group chat.
- Generate friendly rivalry and banter.
- Give friends a low-effort activity between larger shared events.
- Produce “receipts” without requiring anyone to search old messages.
- Let quieter members participate without writing a long argument.

### Emotional jobs

- Feel clever for seeing something early.
- Experience suspense without risking money.
- Feel included in a recurring group ritual.
- Turn mundane events into small stories.

## Positioning

### Category

A **private social prediction game**.

### Not this

- not a sportsbook;
- not a cryptocurrency product;
- not a financial-trading simulator;
- not a polling app;
- not a public social feed;
- not a serious forecasting terminal.

### Positioning statement

For close friend groups that constantly debate what will happen next, Friend Forecast is a private prediction game that turns those claims into live YES/NO markets using virtual points. Unlike public prediction exchanges or simple polls, it records conviction, moves the group odds, pays out a shared pool, and gives the group a fair way to settle disputed outcomes.

## Why the concept can work

The mechanic combines three already-understood behaviors:

1. **Polls:** users understand selecting YES or NO.
2. **Fantasy leagues:** users understand season points, standings, and private groups.
3. **Prediction markets:** users increasingly understand a percentage as crowd-implied odds.

The novelty is not the individual mechanism. It is packaging those mechanisms around private, personal events with link-first participation and group-owned resolution.

## Product principles

### 1. The group is the product

Optimize for healthy recurring groups, not a global follower graph. A user with one lively group is more valuable than a user who follows hundreds of strangers.

### 2. A link must be enough

The recipient should be able to open a market, understand it, and place a position from the browser. Installation and full registration must not be prerequisites for the first satisfying action.

### 3. Stakes must mean something but never become money

Points are scarce enough that conviction matters. They cannot be bought, sold, transferred, redeemed, or exchanged for prizes in the MVP.

### 4. Rules before positions

The question, deadline, timezone, resolution source, YES condition, NO condition, and invalidation condition become immutable after the first stake.

### 5. Disputes are a feature, not an exception

Real-life questions are messy. The interface should make ambiguity visible and provide a calm, finite resolution process.

### 6. Make accuracy social, not moral

The product should celebrate bold calls and funny misses. It must avoid humiliating users, implying financial skill, or turning points into status beyond the group game.

### 7. No empty-state dead ends

A creator must be able to generate and share the first market before recruiting an entire network. Invitees should land directly in a live object, not an empty home feed.

### 8. Prefer finite experiences

Markets close. Seasons end. Recaps arrive. There should be no infinite public content feed or manipulative obligation to remain online.

## Core product loop

```text
A group debate occurs
        ↓
Someone creates a market in under 60 seconds
        ↓
A link is posted into the existing chat
        ↓
Friends allocate points and move the odds
        ↓
The event happens
        ↓
The creator proposes a result
        ↓
The group accepts or disputes once
        ↓
Points settle and a recap card is shared
        ↓
The result creates the next debate and market
```

## Minimum lovable experience

A useful MVP must do more than calculate payouts. The first complete version should include:

- fast market creation with smart templates;
- polished shared-link landing pages;
- animated odds movement;
- clear projected return before confirming a position;
- comments or lightweight reactions;
- creator-proposed resolution with evidence;
- one-tap dispute;
- deterministic settlement and refunds;
- group standings;
- a visually shareable result card.

## Product modes

### Live market — MVP

Positions and market odds are visible while betting remains open. This maximizes drama and makes the percentage movement the central experience.

### Sealed market — later candidate

Participants choose YES or NO without seeing the pool split. Positions and odds are revealed at the deadline. This reduces herding and creates a stronger reveal moment.

### Objective market — MVP template

Uses an external, named source such as an airline status page, official score, weather service, or published result.

### Social market — MVP template

Uses a group-observable outcome such as arrival time, attendance, completion, or a decision. These require especially clear conditions and a dispute path.

## Example market

**Question**  
Will W6 2212 record an actual gate-departure time no later than 18:15 CEST on 11 July 2026?

**Trading closes**  
17:45 CEST on 11 July 2026

**Resolution source**  
The flight-status page linked by the creator.

**YES**  
The source records gate departure at or before 18:15 CEST.

**NO**  
The source records gate departure after 18:15 CEST.

**Cancel and refund**  
The flight is cancelled, diverted before departure, the source does not publish a gate-departure time within 24 hours, or the source is unavailable and the group cannot agree on an equivalent source.

## Experience pillars

### Fast

A user should be able to create a well-defined market quickly without writing legalistic prose. Templates and plain-language prompts should generate the structure.

### Alive

The market card should visibly react when positions arrive: the odds bar shifts, projected return changes, avatars move to each side, and comments accumulate.

### Fair

Users should always understand:

- how the percentage is calculated;
- whether their return is estimated or final;
- when the market closes;
- who can resolve it;
- how to challenge it;
- when points will be refunded.

### Personal

The app should feel built around a specific group’s language and history. Group names, inside-joke categories, seasonal trophies, and recurring templates should make each league distinct.

## Strategic wedge

The initial wedge is not “better forecasting.” It is **a better social object for group chats**.

A market is more expressive than a poll because it captures confidence. It is more durable than a message because the rules and positions are preserved. It is more social than a spreadsheet because the result becomes an event.

## Long-term vision

If the group loop works, Friend Forecast could become the lightweight operating system for playful uncertainty among people who know each other:

- trip leagues;
- sports-season groups;
- watch-party markets;
- workplace social leagues;
- recurring family predictions;
- automated public-data resolution;
- native mobile clients;
- widgets and lock-screen updates;
- group-specific AI market drafting and ambiguity checks;
- richer market types after the binary mechanism is proven.

The long-term product should still preserve the original constraint: **the value comes from predicting with people you know, not from betting against strangers.**