# Monetizable-in-30-Days Idea Research

*Researched 2026-07-08. Goal: one idea a solo dev can fully vibecode and start
charging for within one month. Constraints applied: very specific niche, a
distinctive twist, and maximal reuse of the stack already proven in this repo
(TabStash: MV3 Chrome extension, plain JS, no backend, ExtensionPay one-time
purchase).*

---

## The recommendation

### **CEAC Lifeline** — a "flight recorder" Chrome extension for the US visa DS-160 form

A Manifest V3 extension that runs only on `ceac.state.gov` and silently
snapshots every field you fill in the DS-160 (and DS-260) as you type, storing
it **locally on your machine**. When the infamous 20-minute session timeout,
a crash, or CEAC's frequent "application cannot be retrieved" corruption wipes
your work, one click replays everything you had typed — into the same
application **or into a brand-new application ID**. A saved profile can also be
replayed to fill a spouse's or child's form (which is ~80% identical answers).

### The twist

**It is not an autofiller — it's a black box recorder.** Every existing
competitor makes you enter your data into *their* system first (a law-firm
case-management SaaS or a cloud service), then pushes it to CEAC. CEAC
Lifeline requires **zero setup and zero trust**: you just fill the form the
way you already were, and it captures as you go. Nothing is uploaded anywhere
— a decisive selling point for a form containing passport numbers, employment
history, travel history, and (since 2025–26) your social media handles. Cloud
competitors *cannot* copy this positioning without abandoning their
architecture.

Secondary twist, inherited from TabStash: **one-time purchase, no
subscription** — natural for a task people do once or a few times, and for
agencies tired of per-seat SaaS.

---

## Why this pain is real (evidence)

- The CEAC session times out after **~20 minutes**, has no autosave, and
  loses everything typed since the last manual save. This is documented by
  the State Department's own help pages and is a top complaint across visa
  subreddits; community reports say timeouts intensified after Sept 2023.
  ([DS160.io timeout guide](https://www.ds160.io/blog/ds160-session-timeout-recovery-prevention-guide),
  [github.com/vipulnaik/us-visa-process-issues#6](https://github.com/vipulnaik/us-visa-process-issues/issues/6))
- Recovery via Application ID frequently fails ("No Data Found"), forcing a
  full restart on a fresh application ID — exactly the scenario where only a
  local recording can save you.
- **Market size: ~11.1 million people fill a DS-160/DS-156 every year**
  (State Dept estimate, [Wikipedia](https://en.wikipedia.org/wiki/Form_DS-160)).
  Even 0.01% conversion at $19 is ~$21k/yr.
- **Tailwinds:** expanded social-media vetting rolled out June 2025 → March
  2026 makes the form longer; interview-waiver rollbacks (Oct 2025) and the
  new $250 Visa Integrity Fee raise the stakes per application — people are
  spending *more* time in this form than ever.
  ([davidsonmorris.com/ds160](https://www.davidsonmorris.com/ds160/))

## Competition map (all gaps confirmed 2026-07-08)

| Competitor | Model | Gap it leaves |
|---|---|---|
| [DS160.io](https://www.ds160.io/) | Cloud service, pay **per form**, auto-submits for you; "hundreds of forms/week", 4.9★ on Reddit | You upload all your data to a third party; per-form fees; doesn't rescue work typed directly into CEAC |
| Prima.Law, LollyLaw, CampLegal, INSZoom extensions | DS-160 autofill bundled inside **full law-firm case-management SaaS** ($50–100+/user/mo) | Useless to individual applicants and small visa agencies; CampLegal's plugin has **349 users** |
| Generic form savers (Typio Reboot, Form History Control, Form Saver ~3k users, 3.7★) | Free/OSS, generic | Break on CEAC's ASP.NET postbacks/dynamic dropdowns; no multi-page replay; no new-application clone; nobody monetizes or markets them |
| [Lazarus: Form Recovery](https://alternativeto.net/software/lazarus-form-recovery/) | The legendary solution — **discontinued** | Demand persists (community patches on GitHub); no polished successor |

**No standalone, consumer-priced, DS-160-specific save/recover tool exists.**
The demand side is proven by DS160.io's volume; the privacy-first local wedge
and the one-time price point are unoccupied.

## Why *you* can ship this in 30 days

- Same skeleton as TabStash: MV3 service worker + content script + popup,
  plain JS, no build step, `chrome.storage.local`, ExtensionPay one-time
  unlock. `src/lib/payments.js` and `NEXT_STEPS.txt` transfer almost verbatim.
- The core is again **pure, testable logic**: snapshot diffing, field
  serialization, replay planning — a `core/recorder.js` mirroring
  `core/session.js`, tested with `node:test` against saved DOM fixtures of
  CEAC pages.
- Being **DS-160-specific is what makes it buildable**: you hand-tune for one
  known form (postback timing, dependent dropdowns like country→state,
  "does not apply" checkboxes) instead of solving generic-form-replay, which
  is why the free generic tools fail here.

## 4-week plan

1. **Week 1 — recorder.** Content script on `ceac.state.gov`: capture
   input/select/radio/checkbox changes per page + application ID, persist
   locally. Read-only "transcript" view in the popup (this alone beats a
   timeout: retype from your transcript).
2. **Week 2 — replay.** Replay engine for same-page restore, then multi-page
   walk with postback waits. Handle the top 5 gnarly widgets. DOM fixtures +
   pure-logic tests.
3. **Week 3 — money + polish.** ExtensionPay one-time unlock. Free tier:
   recording + transcript view + restore of the **current page**. Paid ($19):
   full multi-page replay, clone-to-new-application, family clone, encrypted
   JSON export. Store listing screenshots showing the disaster → rescue.
4. **Week 4 — distribution.** Chrome Web Store keywords ("DS-160", "CEAC",
   "visa form"); a landing page with one SEO page per disaster query
   ("DS-160 session timed out", "DS-160 no data found", "retrieve DS-160
   application") — DS160.io ranks with exactly these, proving the intent
   traffic; helpful (non-spammy) answers in r/USvisa, r/h1b, r/f1visa,
   VisaJourney, Trackitt threads, which appear **daily**; direct outreach to
   visa consultancies in India/Philippines/LatAm with a $99 agency tier.

## Funnel note (the honest hard part)

The highest-intent customer — someone who *just* lost 2 hours — can't recover
data the extension never recorded. The fix is in the product: they install
after disaster #1, refill under protection, and convert either immediately
("never again" insurance + family clone) or at the next timeout, which for a
multi-page DS-160 is near-certain. Price it as an impulse purchase ($19)
against 2–3 hours of loss and a $185–$435 application at stake.

## Risks

- **CEAC redesign**: no evidence of an imminent platform replacement (checked
  July 2026); recent changes are policy-level and make the form longer, not
  different. Still the #1 structural risk — keep the recorder schema
  form-agnostic so DS-260/other CEAC forms are cheap follow-ons.
- **ToS optics**: the tool only re-enters the user's own data on their own
  machine — materially safer than DS160.io's auto-submission, and law-firm
  autofill extensions (LollyLaw, Prima.Law) operate openly in the Web Store.
  Never auto-submit; always leave the final "Sign and Submit" to the human.
- **Replay brittleness**: mitigate with per-page (not only full-form) replay,
  and the always-works transcript view as the safety net.

---

## The generic pick (same pain, whole-internet audience)

### **Retype** — a time machine for everything you type in the browser

*Requested as a broader alternative to the DS-160-specific recommendation.
Same validated pain, same architecture, aperture widened from "visa
applicants" to "anyone who has ever lost a long piece of typing to a timeout,
crash, accidental tab close, or a 'session expired' login wall."*

A content script records text as you type into any input, textarea, or
rich-text editor on any site, keeps a **searchable, local-only history**, and
restores it after disaster — the resurrection of the legendary, dead
[Lazarus: Form Recovery](https://alternativeto.net/software/lazarus-form-recovery/),
rebuilt for MV3 and actually maintained and marketed.

**The twist:** it's not a form saver, it's a *typing time machine*. Existing
free tools (Typio Reboot, Form History Control, Form Saver — 3k users, 3.7★)
frame themselves as per-form recovery and die on rich-text editors and shadow
DOM. Retype frames the product around the **searchable archive**: "everything
you typed this month, on any site, findable in two keystrokes" — with
disaster recovery as the acquisition hook. Second twist carried over:
**local-only and one-time purchase** ($19) in a category where the only
monetized neighbor ([Clipboard History Pro](https://clipboardextension.com/))
charges a subscription and pushes cloud sync. Passwords and card fields are
never recorded; per-site pause and a default blocklist ship in v1.

**Demand evidence:**
- Lazarus demand persists years after abandonment — community-patched forks
  on GitHub, active "alternatives" threads on
  [AlternativeTo](https://alternativeto.net/software/lazarus-form-recovery/)
  and Chromium extension groups.
- The free successors execute poorly (3.7★, ~3k users) and monetize nothing —
  the category has never had a polished, marketed, paid player.
- Platform autosave is Swiss cheese: Blackboard autosaves essay boxes every
  10s, but Canvas discussions, Workday/Taleo job applications, government
  portals, CMS admin panels, forum/Reddit comment boxes, and support-ticket
  forms routinely eat work — each one is an SEO landing page
  ("Workday application erased", "lost Canvas discussion post", "Reddit
  comment disappeared", "DS-160 timed out" — the niche pick becomes just one
  beachhead page of many).
- Adjacent proof of payment: clipboard-history extensions sustain paid tiers
  for locally stored text tooling.

**Freemium funnel:** free = recording always on + restore your **most recent
loss** on the current site (the hook must work at the disaster moment or
word-of-mouth dies). Pro $19 one-time = unlimited searchable history, restore
anything ever, rich-text/Markdown export, per-site retention rules, encrypted
local backup file.

**4-week shape:** week 1 recorder (inputs/textareas/contentEditable via
MutationObserver + shadow-DOM piercing — reuse patterns from the free OSS
tools' public repos); week 2 history UI + search (popup + full-page view,
same plain-JS stack as TabStash); week 3 ExtensionPay gate + privacy
hardening + store listing; week 4 launch: scenario SEO pages, Product Hunt
(generic tools do far better there than niche ones), r/chrome, r/productivity,
"I lost my essay" reply-guy distribution on Reddit/X where these laments are
posted daily.

**Trade-off vs the niche pick, honestly:** broader appeal and better
Product-Hunt/word-of-mouth dynamics, but a weaker wedge — "install before
disaster #2" requires the free tier to shine, and generic DOM recording is
technically harder than hand-tuning one known form (rich-text editors are the
boss fight; ship with a "plain-text rescue" fallback that always works).
Ceiling is higher; month-one revenue is likely lower than the DS-160 wedge.
The two compose: Retype is the platform, CEAC Lifeline is its first vertical
landing page.

---

## Runners-up (researched, viable, but weaker fits)

1. **Vinted seller automation** (relist/CRM for EU resellers). Real demand,
   subscription incumbents (~€16.50/mo Grow Bot, Dotb) ripe for a one-time
   undercut — but [30+ tools already compete](https://www.redrip.app/en/blog/vinted-bot-best-tools-2026/),
   bot-style automation courts account bans, and constant DOM churn makes
   one-time pricing a maintenance trap.
2. **Crosslisting for resellers** (eBay/Poshmark/Depop). Proven $15–60/mo
   spend ([Vendoo pricing](https://crosslist.com/blog/vendoo-pricing)), but a
   6-marketplace matrix is months of work and permanent breakage risk — the
   opposite of ship-in-30-days.
3. **Grade-transfer for teachers** (LMS → SIS, à la GradeTransferer). Tight
   niche, real time savings, but teachers skew to free tools and the space is
   being flooded by free AI extensions (Brisk).

## Method / sources

Niches screened: Chrome-extension indie benchmarks
([ExtensionPay revenue case studies](https://extensionpay.com/articles/browser-extensions-make-money),
[Chrome Goldmine benchmarks](https://chromegoldmine.com/blog/chrome-extension-monetization/chrome-extension-revenue-benchmarks/)),
micro-SaaS niche lists ([Superframeworks](https://superframeworks.com/articles/untapped-underserved-micro-saas-niches),
[Dodo Payments](https://dodopayments.com/blogs/micro-saas-ideas-2026)),
resellers, bookkeepers, teachers, real-estate transaction coordinators,
Vinted sellers, immigration/visa workflows, and the abandoned form-recovery
category. Benchmarks say indie extensions with a working paywall in a defined
niche reach **$100–500/mo within months and $1k–3k/mo within a year** — with
~11M annual DS-160 fillers and zero direct competition, this idea's ceiling
is comfortably above that band.
