# Market research

_Research date: 2026-07-11_

## Executive conclusion

There is meaningful evidence that prediction mechanics are becoming mainstream and that users value lightweight, private social products. There is not yet strong public evidence for a large standalone category specifically combining private friend groups with user-created, points-only markets.

That is both the opportunity and the risk.

The strongest interpretation of the available evidence is:

- **Demand for prediction-market interaction is real and growing.** Polymarket, Kalshi, Manifold, Metaculus, and new entrants have trained users to understand binary questions, moving probabilities, positions, and resolution.
- **Demand for private, low-friction social utilities is also real.** Products such as Partiful and Locket have grown by focusing on existing relationships rather than public creator feeds.
- **The competitive white space is narrow but identifiable.** Most prediction products are public, serious, financial, or global. Most private social products do not make conviction and forecasting the core interaction.
- **The main threat is not a current direct competitor.** It is a large platform—especially Meta—combining a points-based prediction product with an existing social graph.
- **The best initial strategy is not broad consumer acquisition.** It is proving repeated use inside intact groups of 5–12 people.

Friend Forecast should therefore be treated as a **behavioral wedge to validate**, not as a market whose size can be responsibly inferred from prediction-market trading volume.

## Category definition

Friend Forecast sits at the intersection of four markets:

1. **Prediction markets and forecasting platforms**
2. **Fantasy and social competition products**
3. **Private or close-friends social apps**
4. **Group-chat utilities distributed through shared links**

The product is not a direct substitute for any one category. Its proposed job is to turn everyday group uncertainty into a repeatable private game.

## Demand signals

### 1. Prediction markets have entered mainstream product strategy

Reuters reported on 23 June 2026 that Meta had directed a small team to create a standalone smartphone prediction-market app, internally called **Arena**. The report said the initial product would probably use video-game-like points rather than real money. Meta's interest is a particularly relevant signal because it validates both the mobile format and the points-based approach, while also becoming a serious competitive warning.

The same Reuters report cited Bernstein's estimate that prediction markets could reach $1 trillion in annual trading volume by the end of the decade. That forecast concerns real-money public markets and should not be used as Friend Forecast's TAM, but it demonstrates investor and platform attention.

Source: [Reuters — Meta directed to create prediction markets app](https://www.reuters.com/business/mark-zuckerberg-directed-meta-create-prediction-markets-app-nyt-reports-2026-06-23/)

Associated Press reported in July 2026 that the combined prediction-market category had grown to more than $26 billion in activity while Polymarket prepared a regulated return to the US market. Again, financial volume is not consumer-app revenue, but it shows that event-based markets have become a recognizable interaction rather than a niche academic mechanism.

Source: [Associated Press — Polymarket's return and prediction-market growth](https://apnews.com/article/774de0d21eba8bf380a68a3ca01f6aaa)

### 2. Points-only prediction products already attract users

Manifold describes itself as a social prediction market where users can create a play-money market on any question. Users start with 1,000 units of its non-cash currency, Mana, and trade shares based on their forecasts. This proves that user-created prediction questions and a non-redeemable currency can form a complete product.

Source: [Manifold — About](https://manifold.markets/about)

Metaculus reports more than 4 million predictions and more than 24,000 questions. It also offers private forecasting spaces for organizations. Metaculus validates sustained interest in forecasting, scoring, tournaments, and private instances, although its tone and audience are much more analytical than the proposed product.

Source: [Metaculus — About](https://www.metaculus.com/about/)

### 3. Private social products can scale without public feeds

The Verge reported in July 2026 that Partiful had monthly active users “in the millions and growing very quickly.” Partiful's differentiated behavior is relevant: a shared event page is both a utility and a social object, invitees can see and interact with one another, and participation can begin through a link rather than requiring a traditional social-network setup.

Source: [The Verge — Partiful and social event planning](https://www.theverge.com/report/960635/partiful-app-event-planning-data-palantir)

Business Insider reported in 2025 that Locket had 9 million daily active users and more than 90 million downloads. Locket's core growth lesson is simplicity: a small, private interaction among real friends can compete with large entertainment feeds when the product remains focused.

Source: [Business Insider — Locket's private social growth](https://www.businessinsider.com/locket-widget-app-photo-dump-feature-instagram-gen-alpha-teens-2025-10)

These examples do not prove users want private prediction markets, but they reduce the risk that a closed social graph is inherently too small to support a consumer product.

### 4. Entertainment expands the prediction audience

Recent prediction-market growth has not been limited to politics or economics. In July 2026, reporting on Kalshi's Love Island markets indicated that reality-TV markets disproportionately attracted women and materially increased female weekly active users. This suggests that the core behavior can broaden when questions relate to culturally familiar, conversational topics rather than finance.

Sources:

- [Business Insider — Kalshi's Love Island audience strategy](https://www.businessinsider.com/kalshi-love-island-usa-betting-ads-tiktok-2026-7)
- [Barron's — Love Island and prediction-market participation](https://www.barrons.com/articles/love-island-kalshi-prediction-markets-7e74ff1c)

Friend Forecast extends the same principle further: the most engaging market may be meaningful only to eight people.

## Competitor map

| Product | Currency | Market scope | Creation | Social graph | Resolution | Main gap relative to Friend Forecast |
|---|---|---|---|---|---|---|
| Polymarket | Real money | Public global events | Curated/platform | Public | Oracle and dispute process | Regulatory complexity, public orientation, high conceptual weight |
| Kalshi | Real money | Public event contracts | Platform | Public | Platform/regulatory process | Financial product, limited relevance to personal group events |
| Manifold | Play money | Broad public questions | User-created | Public/community | Creator and moderation mechanisms | Community-first and trader-oriented rather than private-group-first |
| Metaculus | Points/scoring | Serious global questions | Platform/community | Public or organizational | Formal question resolution | Analytical tone, not casual social entertainment |
| Meta Arena | Reportedly points first | Likely public/trending | Unknown | Meta-scale potential | Unknown | Most serious future threat; likely broad rather than intimate |
| Poll apps | None | Any question | User-created | Private/shareable | No settlement | Measure opinion but not conviction; no pool or payoff |
| Fantasy leagues | Virtual scoring | Sports seasons | Platform-defined | Private leagues | Automated sports data | Strong group competition but little user-created subject matter |
| Group chats | None | Anything | Informal | Private | Informal argument | High frequency but no structured commitment, odds, ledger, or settlement |

## Detailed competitive interpretation

### Polymarket

Polymarket provides the strongest visual and conceptual reference, but its mechanism should not be copied for the MVP. Its displayed price is based on an order book's bid–ask midpoint, and complementary YES and NO orders are matched to create positions. That requires liquidity and creates execution concepts that are inappropriate for an eight-person group.

Polymarket also demonstrates the importance of explicit resolution rules. Its rules identify a source, end date, and edge-case handling; a proposed outcome can be disputed before final settlement.

Sources:

- [Polymarket — How prices are calculated](https://help.polymarket.com/en/articles/13364488-how-are-prices-calculated)
- [Polymarket — Resolution documentation](https://docs.polymarket.com/concepts/resolution)

**Lesson to borrow:** a live YES/NO percentage, positions, an explicit close time, evidence, and a finite challenge process.

**Lesson not to borrow yet:** order books, real-money language, sellable positions, market-maker incentives, and public discovery.

### Manifold

Manifold is the closest functional competitor because it combines play money with user-created markets. Its advantage is breadth and an existing forecasting community. Its weakness relative to the proposed wedge is that creating a Manifold market still places the interaction inside a prediction community rather than making it feel native to a private friend group.

**Differentiation required:** Friend Forecast must not become “Manifold with private links.” It needs group seasons, social recaps, friend identity, comments, lightweight resolution governance, group templates, and a design optimized for a market launched from a chat.

### Metaculus

Metaculus proves that prediction histories, calibration, leaderboards, and tournaments can support long-term engagement. Its private spaces also show organizational demand. However, Metaculus focuses on accuracy and globally important questions.

**Lesson to borrow later:** meaningful forecaster profiles and calibration history.

**Lesson not to overemphasize initially:** technical forecasting terminology, numeric-probability entry, and complex scoring.

### Meta Arena

Meta's reported Arena project is strategically important because it may launch with points, mobile-first design, trending question generation, and distribution through Meta's enormous network.

Friend Forecast cannot compete on global content, user acquisition, or automated trend discovery. Its potential defense is specificity:

- a market belongs to a known group;
- the group creates the question;
- the subject may be personal and non-public;
- settlement is governed by the group;
- the result becomes part of the group's shared history.

The product should move quickly enough to test this private-group behavior before Meta or another major platform makes prediction a generic social feature.

## White-space hypothesis

The proposed white space is:

> A browser-first, private prediction game for existing groups, where members create markets about their own lives and interests, allocate non-purchasable points, and resolve outcomes through lightweight group governance.

This white space has six dimensions:

1. **Private rather than public**
2. **Personal rather than news-driven**
3. **Group-owned rather than platform-curated**
4. **Points-only rather than cash-based**
5. **Socially expressive rather than analytically serious**
6. **Link-first rather than install-first**

A competitor matching only one or two dimensions is not necessarily a direct substitute. A large platform matching all six would be.

## Market sizing approach

A top-down market-size estimate would be misleading because no clean category corresponds to the product. Prediction-market volume measures money traded, private-social app usage measures broad attention, and fantasy-sports revenue includes regulated and paid products.

The more useful early model is **active groups**, not individual users.

### Illustrative operating scenarios

These are planning scenarios, not forecasts.

| Scenario | Weekly active groups | Average active members | Active users | Paid-host conversion | Annual host price | Illustrative annual revenue |
|---|---:|---:|---:|---:|---:|---:|
| Focused niche | 10,000 | 7 | 70,000 | 5% | €36 | €18,000 |
| Strong niche | 100,000 | 7 | 700,000 | 7.5% | €40 | €300,000 |
| Breakout social utility | 1,000,000 | 8 | 8,000,000 | 10% | €48 | €4,800,000 |

The first scenario demonstrates an important issue: group-host subscriptions alone may monetize weakly at modest scale. Monetization should be delayed until retention is proven, then tested through premium group features rather than points or wagering.

Potential paid features:

- longer market and season history;
- custom group themes and trophies;
- advanced recaps and statistics;
- multiple simultaneous leagues;
- larger group sizes;
- automated data-source resolution;
- exportable yearbooks or season summaries;
- workplace or community administration.

## Primary risks

### 1. Group activation risk

A group product can fail even when individual users like the idea. One enthusiastic creator may invite seven people, but only two participate. The shared link must provide immediate context and require minimal setup.

Mitigation:

- guest participation before account creation;
- creator templates;
- suggested first markets;
- one-tap position placement;
- reminders sent through the group's existing chat, not a new communication channel;
- a strong first result recap.

### 2. Liquidity risk

A market with points only on one side is not meaningfully contested and cannot produce a gain for winners.

Mitigation:

- refund single-sided markets at close;
- clearly label “waiting for the other side”;
- show participant count as well as point-weighted odds;
- cap individual position size;
- recommend questions likely to divide the group;
- notify the group when odds become highly one-sided.

### 3. Resolution conflict

Personal questions are more ambiguous than public election or sports results. A single bad settlement can damage trust across the entire group.

Mitigation:

- structured rule fields;
- pre-stake ambiguity checker;
- immutable rules after the first position;
- evidence attachment;
- one optional challenge round;
- hidden group vote or named referee;
- refund when no supermajority is reached.

### 4. Wealth concentration

If winners permanently accumulate more points, one user can dominate later odds and discourage weaker players.

Mitigation:

- per-market stake cap;
- seasonal resets;
- recurring equal point grants;
- maximum carryover;
- standings that emphasize ROI and successful calls rather than raw wealth.

### 5. Gambling perception and regulation

Even without money, the visual language of odds, positions, and payouts can create gambling associations. Laws vary by jurisdiction, and adding purchasable points, cash prizes, tradable items, or redemption would materially increase legal risk.

Initial product posture:

- no deposits;
- no purchasing points;
- no cash-out or transfers;
- no prizes with monetary value;
- no third-party market in accounts or points;
- age and jurisdiction review before public launch;
- avoid casino imagery and “bet now” language;
- obtain legal review before monetization or prizes.

This document is product research, not legal advice.

### 6. Platform-copy risk

Meta's reported Arena project demonstrates that points-based prediction is attractive to large platforms.

Mitigation:

- specialize in private groups and personal markets;
- develop strong resolution and group-history features;
- make the product work across messaging platforms;
- build identity around recurring leagues rather than public content;
- move toward paid group utility rather than ad-supported reach.

### 7. Novelty decay

The market animation may be fun initially but fail to become a habit.

Mitigation:

- recurring group seasons;
- weekly market prompts;
- result recaps that create conversation;
- group-specific history and rivalries;
- categories tied to naturally recurring events: sport, travel, television, work, and plans.

## Monetization recommendation

Do not monetize the point economy.

The cleanest model is **host-funded premium groups** after product-market evidence:

- free core game;
- one premium payer can unlock features for the entire group;
- monthly and annual plans;
- no competitive advantage from payment;
- no ads in private group content;
- no sale of personal prediction data.

A plausible initial test range is €2.99–€4.99 monthly or €29–€49 annually for a group host. Price testing should occur only after the free product demonstrates repeat group activity.

## Go-to-market wedge

Start with use cases where predictions occur naturally and outcomes resolve quickly:

1. **Trips and travel** — delays, arrival times, budgets, weather, who forgets something.
2. **Sports and motorsport watch groups** — winners, incidents, positions, team performance.
3. **Reality television** — eliminations, couples, reveals, episode events.
4. **Friend-group logistics** — attendance, punctuality, plan completion, restaurant outcomes.
5. **Gaming groups** — match outcomes, completion times, rank progression, release events.

Avoid politics and long-duration macro questions in the first pilot. They are already served by public platforms and resolve too slowly for rapid behavioral testing.

## Research verdict

### Evidence supporting continued development

- Prediction markets are receiving large-platform investment.
- A points-only model is established and comprehensible.
- Private social products can reach meaningful scale.
- Entertainment and conversational topics broaden participation.
- No dominant product is clearly optimized for private personal markets with group resolution.

### Evidence still missing

- Whether normal friend groups want more than polls.
- Whether users understand pari-mutuel returns without confusion.
- Whether personal-market disputes remain playful.
- Whether groups create new markets without founder prompting.
- Whether a browser-first participant later creates an account.
- Whether the concept retains beyond novelty.

### Recommendation

Proceed to a focused prototype and group pilot. Do not build native apps, public discovery, automated trading, or monetization until repeated group behavior is observed.