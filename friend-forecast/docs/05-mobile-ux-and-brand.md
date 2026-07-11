# Mobile UX and brand direction

## Experience objective

Friend Forecast should feel like a polished social game that happens to use market mechanics.

The emotional sequence is:

```text
curiosity → conviction → suspense → reveal → receipts → rematch
```

The interface should be modern and energetic without resembling a casino, crypto exchange, or professional trading terminal.

## Platform strategy

### First platform

Responsive mobile web application with PWA support.

Primary design target:

- mobile portrait;
- 360–430 px viewport width;
- thumb-reachable primary actions;
- shared links opened inside messaging-app browsers;
- acceptable desktop layout for creation, moderation, and history.

### Browser-first principles

- A recipient can view a market without an account.
- A recipient can choose a side and allocate points before completing lightweight identity setup.
- Returning users remain signed in on the same device.
- Account conversion occurs after value is demonstrated.
- Every market and result has a stable deep link.
- No app-install interstitial blocks the market.
- “Add to Home Screen” appears only after repeated use, not on first open.

### Native later

Native iOS and Android become reasonable only when there is evidence that users need:

- reliable push notifications;
- widgets or lock-screen information;
- deeper contact sharing;
- haptics and richer animation;
- faster repeat access;
- store-based discovery.

The web product should use a portable API and domain model so native clients can be added without rewriting the core market engine.

## Navigation

Recommended bottom navigation for signed-in users:

1. **Home** — active markets across the current group.
2. **Create** — prominent central action.
3. **League** — standings, season progress, and recent results.
4. **Groups** — group switcher and invitations.
5. **Profile** — personal history and settings.

For the earliest MVP, Home, Create, League, and Profile are sufficient. Group switching can live in the header until multiple-group usage is proven.

## Core screen set

### 1. Shared market landing

Purpose: convert an invited friend from link click to first position.

Above the fold:

- group name and compact avatar stack;
- binary question;
- market status and close countdown;
- animated YES/NO odds bar if contested;
- number of participants;
- two large YES and NO actions;
- current estimated return for a sample or selected stake.

Secondary content:

- exact resolution rules;
- market creator;
- comments and reactions;
- position history if the group uses public positions;
- invite or join-group context.

The page must explain points in one sentence:

> Put limited group points behind your prediction. Winners split the full pool; points cannot be bought or cashed out.

### 2. Position sheet

Opened after tapping YES or NO.

Components:

- selected side;
- available balance;
- slider plus direct numeric entry;
- quick chips: 10, 25, 50, MAX;
- projected return if the market closed now;
- preview of the odds after the commitment;
- stake-cap explanation;
- confirmation button;
- clear warning that projected return can change until close.

Example:

```text
YES is currently 42%

Commit 50 points
Estimated return if YES wins: 119 points
New market odds after your position: 48% YES
```

### 3. Market detail

Sections:

- question and state;
- animated odds history;
- point split and people split;
- the user's position and projected return;
- rules and source;
- participants by side;
- comments;
- creator and timeline;
- share action.

Show both capital-weighted and person-weighted sentiment:

```text
Market odds: 60% YES
People: 3 YES · 4 NO
```

This creates interesting social tension and prevents the percentage from being mistaken for a headcount poll.

### 4. Create market

The creation flow should fit into four short steps rather than one intimidating form.

#### Step 1 — Ask

- question;
- template category;
- optional AI or deterministic clarity suggestion.

#### Step 2 — Define

- YES means;
- NO means;
- cancel/refund if;
- source or observation method.

#### Step 3 — Time

- trading deadline;
- resolution eligibility;
- timezone;
- reminder timing.

#### Step 4 — Review and share

- full market preview;
- ambiguity warnings;
- dispute setting;
- creator participation warning;
- create and copy link.

Creation should use plain-language prompts such as:

> What exact result counts as YES?

rather than legalistic labels.

### 5. Resolution proposal

- original question and rules;
- YES, NO, CANCEL, or NOT READY selection;
- evidence link or image;
- explanation;
- payout preview;
- submit proposal.

### 6. Challenge screen

- proposed result;
- evidence;
- remaining challenge time;
- “Accept result” and “Dispute” actions;
- explanation of the single dispute round;
- projected final points.

### 7. Group vote

- hidden ballot;
- YES, NO, CANCEL, NOT READY;
- evidence thread;
- quorum progress without revealing vote distribution;
- exact close time;
- no ability to change vote after submission unless the product explicitly permits it for all users.

### 8. Result reveal

This is the main shareable payoff.

Sequence:

1. Question appears.
2. Odds line rewinds from opening to closing percentage.
3. Final outcome stamps YES or NO.
4. Winner avatars move forward.
5. Point payouts count up.
6. Superlatives appear.
7. A compact share card is generated.

Possible superlatives:

- First believer
- Biggest conviction
- Best underdog call
- Lone wolf
- Crowd favorite
- Most expensive miss
- Perfect timing

Avoid “loser” labels or humiliating copy.

### 9. League screen

- current season title and end date;
- standings by net profit;
- movement since previous week;
- current balance;
- active-market exposure;
- recent champions;
- group statistics;
- “create the next market” prompt.

### 10. Personal profile

- groups;
- current season record;
- biggest correct position;
- boldest underdog call;
- markets created;
- resolution participation;
- history of result cards;
- optional calibration later.

## Interaction design

### Odds movement

The odds bar is the signature interaction.

Requirements:

- animate smoothly from prior to new percentage;
- show the point change that caused the movement;
- avoid frantic price-ticker behavior;
- preserve accessibility with numeric text;
- allow reduced-motion mode;
- show an opening state before the market is contested.

Suggested event treatment:

> Nora added 40 to NO · YES moved 57% → 51%

### Haptics and sound

Browser MVP:

- subtle optional sound on position confirmation and result reveal;
- no autoplay sound;
- user-controlled mute setting;
- vibration only where supported and permitted.

Native later:

- light haptic on slider increments;
- stronger confirmation haptic;
- distinctive result reveal pattern.

### Countdown behavior

Use human-friendly time until the final hour, then exact minutes and seconds.

Examples:

- Closes tomorrow at 18:00
- Closes in 3h 24m
- Closes in 04:18

Always include the timezone in the detailed rules.

### Optimistic UI

Do not visually finalize a position until the server confirms the ledger transaction. A short animated pending state is safer than displaying a balance that may later roll back.

## Onboarding

### Creator-first onboarding

The first-time creator should be asked to make a market before building a profile.

Suggested flow:

1. Choose a market template.
2. Draft the question.
3. Create a temporary identity.
4. Receive a share link.
5. Invite the group.
6. Complete account setup after the first friend joins.

### Invitee onboarding

The invitee should land directly on the market.

Suggested flow:

1. Read the question.
2. Choose YES or NO.
3. Select points.
4. Enter a display name or verify identity.
5. Confirm.
6. See the market move.
7. Join the group to retain history.

No tutorial carousel before the first position.

## Group identity

Each group can have:

- name;
- emoji or simple generated mark;
- optional image;
- season name;
- house rules;
- accent theme;
- recurring categories;
- trophy history.

Examples:

- Terminally Delayed
- Sunday Strategists
- Paddock Prophets
- The Group Chat Was Right
- Budapest Bureau of Bad Calls

## Engagement loops

### Immediate loop

- position notification;
- odds movement;
- reaction and comment;
- another member responds.

### Resolution loop

- event occurs;
- proposal notification;
- accept or dispute;
- result reveal;
- payout and recap.

### Weekly loop

- weekly point grant;
- open-market digest;
- strongest odds movement;
- standings movement;
- suggested market prompt.

### Seasonal loop

- season ending countdown;
- championship market or final round;
- season recap;
- awards;
- reset and new theme.

## Notification strategy

Notifications should be sparse and event-driven.

Recommended events:

- invited to a group;
- a market becomes contested;
- a market closes soon when the user has not participated;
- the user's projected return changes materially;
- a result is proposed;
- a market is disputed and requires a vote;
- a market settles;
- weekly group recap.

Avoid notifying users after every small point commitment in an active group. The group chat already provides social distribution; the app should not become noisy.

Users should control notifications per group and per market.

## Viral distribution

The growth object is a market link, not a generic app invitation.

A shared preview should include:

- question;
- group name;
- close time;
- current market odds when visibility permits;
- participant count;
- a direct call to take a side.

Example preview copy:

> 7 friends have taken a position. Market closes in 42 minutes. Are you YES or NO?

Result cards should be attractive enough to repost into the original group chat. Public social sharing should be optional because many market subjects are private.

## Brand personality

The brand should be:

- confident;
- playful;
- clever;
- socially aware;
- transparent;
- slightly competitive;
- never financially predatory.

Avoid:

- macho sportsbook language;
- casino neon overload;
- meme slang that ages quickly;
- corporate forecasting language;
- faux urgency;
- shame-based loss messages.

## Working naming directions

### Keep as working title

**Friend Forecast**

Advantages:

- explains the private social premise;
- broad enough for non-sports questions;
- friendly rather than gambling-coded.

Weakness:

- descriptive and potentially difficult to own as a brand.

### Alternative territories

| Name | Strength | Risk |
|---|---|---|
| Call It | Short, social, action-oriented | Generic and difficult to search |
| CrowdCall | Communicates group judgment | Sounds more public than private |
| Odds On Us | Memorable and relational | Strong gambling association |
| I Told You | Captures the receipt moment | Slightly confrontational |
| Forecast Club | Group-oriented and clear | More serious tone |
| Next Call | Modern and broad | Less obviously social |
| Side | Simple YES/NO metaphor | Extremely generic |
| Called It | Strong result language | Common phrase and likely crowded |
| Hunch | Friendly and lightweight | Does not explain group markets |
| Future Receipts | Distinctive concept | Long and informal |

No name should be finalized without trademark, domain, app-store, and social-handle checks.

## Visual direction

### Concept

**Friendly market energy.** Use clean surfaces, expressive typography, clear probability shapes, and small moments of motion.

### Suggested visual system

- dark and light themes from launch;
- rounded cards with restrained depth;
- strong numeric typography for percentages and points;
- wide odds bars rather than candlestick charts;
- avatar clusters as a primary data element;
- subtle grain or gradient for warmth;
- crisp iconography;
- result stamps and collectible recap cards.

### Initial palette direction

The final palette requires accessibility testing. A starting direction:

- deep ink background: `#11131A`;
- warm off-white: `#F6F4EF`;
- electric mint for positive emphasis: `#43E6B1`;
- vivid coral for opposing emphasis: `#FF6B6B`;
- violet accent for group identity: `#7C6CFF`;
- muted slate for secondary text: `#8E94A3`.

YES and NO must not rely on green and red alone. Use labels, icons, side position, and patterns for accessibility.

### Typography

Use a contemporary sans-serif with:

- tabular numerals;
- clear percentage glyphs;
- strong mobile readability;
- at least three useful weights;
- good extended Latin support.

The odds percentage should be one of the most visually dominant elements on a market card.

## Market card concept

```text
┌──────────────────────────────────┐
│ Terminally Delayed          2h 14m│
│                                  │
│ Will the flight leave by 18:15?  │
│                                  │
│ YES 60%  ████████████░░  40% NO │
│                                  │
│ 300 pts · 3 people   200 pts · 4 │
│                                  │
│ Your position: YES · 100          │
│ Est. return: 167                  │
│                                  │
│ [ Add to YES ]       [ Share ]    │
└──────────────────────────────────┘
```

## Copy system

### Creation

- Turn this into a market
- What exactly counts as YES?
- When should positions close?
- How will the group verify the result?
- What should trigger a full refund?

### Open market

- Take a side
- Put points behind it
- Waiting for the other side
- Market is now contested
- Estimated return if the market closed now

### Close

- Positions are locked
- The event is still in progress
- Ready to resolve

### Resolution

- Propose the result
- Evidence attached
- Challenge window open
- The group is reviewing this call
- No consensus — all positions refunded

### Result

- Called it
- The market resolved YES
- You gained 67 points
- First on YES at 32%
- Share the receipt

## Ethical engagement rules

- No fake scarcity.
- No purchasable points.
- No loss-chasing prompts.
- No “win it back” language.
- No public shaming.
- No default sharing outside the group.
- No streak penalty that removes earned value.
- No notification pressure framed as letting friends down.
- Clear disclosure that odds represent the group's point pool, not objective truth.
- Clear distinction between estimated and final returns.

## Accessibility requirements

- minimum WCAG AA contrast for primary text and controls;
- keyboard navigation on desktop;
- screen-reader labels for odds, pool values, and countdowns;
- reduced-motion support;
- no information encoded by color alone;
- minimum 44 × 44 px touch targets;
- clear focus states;
- plain-language explanations of market mechanics;
- timezone and absolute date available alongside relative countdowns.

## Design benchmark

The product should aim for the invitation simplicity of Partiful, the close-friends intimacy of Locket, and the odds clarity of Polymarket—while retaining an identity centered on private group play rather than events, photos, or financial trading.