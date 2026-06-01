# TabStash

Save your open tabs as named **workspaces** and restore them in one click —
**tab groups and pinned tabs included**. 100% local, no account, no tracking,
works offline.

> Free for 3 workspaces. A one-time **$3** purchase unlocks unlimited
> workspaces plus JSON **export / import** (portable backup).

## Why it exists

Free incumbents (OneTab, Session Buddy) dump everything into one long list,
**lose your tab groups**, and several monetize by harvesting browsing data.
TabStash keeps named workspaces, preserves groups + pinned state, stores
everything locally, and is sold once — no subscription, no servers.

## How it's built

Plain JavaScript, Manifest V3, **no build step and no runtime dependencies**.
The architecture deliberately concentrates all decision-making in pure,
unit-tested functions:

```
tabstash/
├── manifest.json            MV3 manifest (load THIS folder as "unpacked")
├── src/
│   ├── background.js         service worker — the only file that calls chrome.*
│   ├── core/
│   │   ├── session.js        PURE logic: capture, validate, restore-plan,
│   │   │                     gating, export/import, merge  ← unit-tested
│   │   └── storage.js        thin chrome.storage.local wrapper
│   ├── popup/                toolbar UI (html / css / js)
│   └── lib/payments.js       single seam to the payment provider
├── icons/                    generated PNGs + the generator script
└── tests/session.test.js     node --test unit tests
```

**Data flow:** the popup never touches `chrome.tabs` — it sends messages to
`background.js`, which reads the browser, hands the raw data to `core/session.js`
to turn into a serializable workspace (or a restore plan), and persists via
`core/storage.js`. Because the rules live in pure functions, they're tested
without a browser.

## Develop

```bash
npm test          # run the unit tests (Node's built-in runner, no install)
npm run icons     # regenerate the PNG icons
```

### Load it in Chrome

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this `tabstash/` folder
4. Pin the TabStash icon and open some tabs to try it

### Simulate the paid tier while developing

Open the service worker console (from `chrome://extensions` → TabStash →
"service worker") and run:

```js
chrome.storage.local.set({ 'tabstash:paid': true })   // unlock Pro
chrome.storage.local.set({ 'tabstash:paid': false })  // back to free
```

## Going to market

Payments and Web Store publishing are wired but not yet connected to a real
account. See **NEXT_STEPS.txt** for the exact, ordered checklist.
