# Retype — never lose anything you type

A Manifest V3 Chrome extension that silently records what you type into any
field on any website — **locally, on your machine, nothing uploaded** — and
gives it back after the disasters the web loves to throw at long-form typing:
session timeouts, crashes, accidental tab closes, "please log in again",
forms that wipe themselves.

It's a *typing time machine*: browse and search everything you've typed,
restore any of it back into the page (or your clipboard) with one click.

Plain JavaScript, **no build step, no runtime dependencies, no server**.
Sold as a one-time purchase: free covers your last 24 hours; Pro ($19 once)
unlocks the full archive, full-text search, export/import backup and
retention controls.

## Try it

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this `retype/` folder.
2. Type a couple of sentences into any form or comment box on any site.
3. Click the Retype toolbar icon: your text is there. Kill the tab, come
   back, click **Insert** — it's back in the field.

Simulate the Pro tier from the extension's service-worker console:

```js
chrome.storage.local.set({ 'retype:paid': true })
```

## Commands

```bash
npm test          # unit tests via Node's built-in runner (node --test) — no install needed
node --test tests/recorder.test.js   # run a single test file
npm run icons     # regenerate the toolbar PNG icons (pure-Node PNG encoder)
```

## Architecture

All decision-making is concentrated in **pure functions** so it can be tested
without a browser (same philosophy as `../tabstash/`):

- `src/core/recorder.js` — **pure logic, the heart of the product.** Field
  sensitivity rules (passwords/cards/SSNs are never recorded), snapshot →
  entry planning (continue vs. freeze vs. ignore — a cleared field can never
  erase saved text), the index of lightweight metas, retention pruning,
  free/paid gating, search, export/import + merge. Touches no `chrome.*`,
  no DOM. **The only file with meaningful test coverage and where most logic
  changes belong.**
- `src/core/storage.js` — thin `chrome.storage.local` wrapper. Entries are
  sharded one-per-key so a keystroke rewrites one entry, never the archive.
- `src/content.js` — runs in every page/frame. Deliberately dumb: debounces
  `input` events, describes the field, reports snapshots; finds fields again
  and re-inserts text on restore. Hard-skips password fields before ever
  reading their value. (Not an ES module — MV3 content scripts can't be.)
- `src/background.js` — the service worker. Routes messages, owns
  persistence and gating; delegates every decision to `core/recorder.js`.
- `src/popup/` — the rescue surface: recent entries for the current site,
  Insert/Copy, pause-per-site, search (Pro).
- `src/history/` — the full-page archive: search, per-site filter, view/copy/
  delete, export/import, retention settings, clear-all.
- `src/lib/payments.js` — the single seam to the payment provider (dev flag
  today, clearly marked `REPLACE FOR PRODUCTION` sections for ExtensionPay).

**Data flow:** content script → message → `background.js` →
`core/recorder.js` (pure decision) → `core/storage.js` (persist). The popup
and history page only ever talk to the background worker.

## Privacy invariants (do not break these)

1. Nothing ever leaves the machine. No server, no sync, no telemetry.
2. Password/hidden fields are never read; card/SSN/OTP-looking fields are
   never stored (`isSensitiveField`).
3. Clearing a field must never overwrite saved text (`planSnapshot`).
4. The user can pause any site, delete any entry, or wipe everything.

## Going to market

See `NEXT_STEPS.txt` for wiring ExtensionPay and publishing. The market
research behind this product lives in `../research/IDEA_RESEARCH.md`.
