# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What's here

Two sibling Manifest V3 Chrome extensions sharing one architecture (plain
JavaScript, **no build step, no runtime dependencies**, one-time purchase via
the ExtensionPay seam), plus the market research that produced the second:

- `tabstash/` — **TabStash**: saves open tabs as named "workspaces" and
  restores them (preserving tab groups + pinned tabs). Free for 3 workspaces;
  paid unlocks unlimited + JSON export/import.
- `retype/` — **Retype**: records everything typed into web forms locally and
  restores it after timeouts/crashes (a "typing time machine"). Free covers
  the last 24 h; paid ($19 once) unlocks the full archive, search,
  export/import and retention controls. See `retype/README.md`, especially
  the **privacy invariants** — never break those.
- `research/IDEA_RESEARCH.md` — the market research behind Retype.

## Commands

Run from `tabstash/` or `retype/` (identical scripts):

```bash
npm test          # unit tests via Node's built-in runner (node --test) — no install needed
node --test tests/session.test.js    # single file (tabstash: session, retype: recorder)
npm run icons     # regenerate the toolbar PNG icons (pure-Node PNG encoder, no image libs)
```

Load in Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked"
→ select the extension's folder. Simulate the paid tier from the service-worker
console: `chrome.storage.local.set({ 'tabstash:paid': true })` (or
`'retype:paid'` for Retype).

## Architecture — the important part

Both extensions follow the same pattern; TabStash's layers are listed below,
and Retype mirrors them (`core/recorder.js` instead of `core/session.js`,
plus a `src/content.js` page recorder and a `src/history/` archive page —
see `retype/README.md`). All decision-making is concentrated in **pure
functions** so it can be tested without a browser. The layers:

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
Store; `retype/NEXT_STEPS.txt` layers Retype-specific launch notes on top of
it. Keep both in sync when payment or publishing details change.
