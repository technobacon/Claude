# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What's here

`tabstash/` — **TabStash**, a Manifest V3 Chrome extension that saves open tabs
as named "workspaces" and restores them (preserving tab groups + pinned tabs).
Plain JavaScript, **no build step, no runtime dependencies**. Sold as a one-time
purchase (free for 3 workspaces; paid unlocks unlimited + JSON export/import).

## Commands

Run from `tabstash/`:

```bash
npm test          # unit tests via Node's built-in runner (node --test) — no install needed
node --test tests/session.test.js   # run a single test file
npm run icons     # regenerate the toolbar PNG icons (pure-Node PNG encoder, no image libs)
```

Load in Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked"
→ select the `tabstash/` folder. Simulate the paid tier from the service-worker
console: `chrome.storage.local.set({ 'tabstash:paid': true })`.

## Architecture — the important part

All decision-making is concentrated in **pure functions** so it can be tested
without a browser. The layers:

- `src/core/session.js` — **pure logic, the heart of the product.** Capturing
  browser state into a serializable workspace, validation, the restore *plan*,
  free/paid gating (`canSave`, `FREE_WORKSPACE_LIMIT`), and export/import +
  merge. Touches no `chrome.*`, no DOM. **This is the only file with meaningful
  test coverage and where most logic changes belong.**
- `src/core/storage.js` — thin `chrome.storage.local` wrapper; intentionally dumb.
- `src/background.js` — the **only** file that calls `chrome.tabs` / `tabGroups`
  / `windows`. It reads raw browser state, delegates all shaping/validation to
  `core/session.js`, and routes popup messages.
- `src/popup/` — toolbar UI. **Never calls `chrome.tabs` directly** — it sends
  messages to the background worker and renders the response.
- `src/lib/payments.js` — the single seam to the payment provider. Ships in dev
  mode reading a local `tabstash:paid` flag; has clearly marked `REPLACE FOR
  PRODUCTION` sections for wiring ExtensionPay. Rest of the code only calls
  `isPaid()` / `openPurchaseFlow()`, so swapping providers touches one file.

**Data flow:** popup → message → `background.js` → `core/session.js` (pure
transform) → `core/storage.js` (persist). Follow this direction for new
features; keep logic in `session.js` and add tests there.

## Conventions

- ES modules everywhere (`"type": "module"`). The MV3 service worker and the
  popup script both load as modules; keep imports relative.
- Tests use only `node:test` + `node:assert` — do not add test dependencies.
- Inject `now`/`rand` into functions that need time or randomness (see `makeId`,
  `captureToWorkspace`, `mergeLibraries`) so tests stay deterministic.
- Icons must be PNG (Chrome rejects SVG for the toolbar); regenerate via
  `npm run icons` rather than hand-editing binaries.

## Going to market

`tabstash/NEXT_STEPS.txt` is the ordered, beginner-facing checklist for
connecting payments (ExtensionPay + Stripe) and publishing to the Chrome Web
Store. Keep it in sync when payment or publishing details change.
