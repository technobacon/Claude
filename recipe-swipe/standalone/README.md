# Forkful — standalone (client-only) build

`index.html` is a **single, self-contained** version of the swipe app used for
**zero-setup testing on a real phone**. No server, no build, no accounts.

- Talks to **TheMealDB** directly from the browser (CORS-enabled); switches to
  **Spoonacular** with a personal key (⚙ Settings) or a deployed backend
  (`?api=<url>` / same-origin `/api/meta`).
- Saves swipes + the saved list in **`localStorage`** (persists on the device).
- Mirrors the main app's UX: swipe/flick + buttons, undo, tap-for-detail sheet
  with a back button + deep-link-out, multi-select filter sheets, true random
  deck, cuisine spacing, derived difficulty.
- **Modern UI (June 2026 redesign):** full-bleed photo cards with a gradient
  scrim, Fraunces display type, glass chips, segmented tabs, SVG icon controls,
  drag-handle bottom sheets, and `prefers-reduced-motion` support.

## How to open it on a phone

The repo is public, so a static-file CDN can serve it directly — no hosting.
Replace `<SHA>` with a commit on the branch:

```
https://raw.githack.com/technobacon/Claude/<SHA>/recipe-swipe/standalone/index.html
```

(Use `git rev-parse HEAD` to get the latest SHA after pushing.)

## Why this exists

It's a fast, disposable test harness so the product can be *felt* on a phone
without fighting deploy/hosting setup. The real architecture lives in the
Next.js app (`../`). See [`../docs/07-handoff-and-next-steps.md`](../docs/07-handoff-and-next-steps.md)
for how the two relate and what to do next.

> Note: with no key and no backend this build falls back to **TheMealDB** (the
> source needing no API key). The full multi-source architecture lives in the
> Next.js version.
