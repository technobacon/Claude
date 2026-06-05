# 08 — Deploy with a shared key (no per-user keys)

*Last updated: 2026-06-05*

Goal: **users don't bring their own Spoonacular key.** You deploy the app's
server **once** with *your* key in a server env var; everyone uses the app and
the key never reaches a browser.

## How it works

```
  Phone (standalone client)                Your deployed server (Next.js)
  - swipe UI + filters          ──GET /api/feed?…──▶  - holds SPOONACULAR_API_KEY (env)
  - swipes/saves in localStorage ◀──JSON recipes────  - calls Spoonacular, normalizes
                                                       - STATELESS (serverless-safe)
```

- The **server is a stateless recipe proxy** — perfect for serverless (Vercel).
- All **personal state lives in the browser** (localStorage), so nothing depends
  on server memory.
- The client **auto-detects** the backend: `?api=<url>` or a same-origin
  `/api/meta`. No backend? It falls back to direct mode (free TheMealDB, or a
  personal key via ⚙). CORS is enabled on `/api/feed` and `/api/meta`.

## Deploy steps (do this once, easiest on a computer)

1. **vercel.com → Add New → Project → import `technobacon/Claude`.**
2. **Root Directory → `recipe-swipe`** (this repo is a monorepo).
3. **Environment Variables** → add:
   - Name: `SPOONACULAR_API_KEY`  Value: *your key*
4. **Deploy.** You'll get a URL like `https://forkful-xxxx.vercel.app`.
5. **Verify:** open `https://forkful-xxxx.vercel.app/api/meta` — it should say
   `"source":"spoonacular"`. (If it says `themealdb`, the env var didn't take —
   re-check the name and redeploy.)

## Point users at it

Share the client with the backend attached:

```
https://raw.githack.com/technobacon/Claude/<SHA>/recipe-swipe/standalone/index.html?api=https://forkful-xxxx.vercel.app
```

Anyone who opens that gets Spoonacular recipes with **no key of their own**.
(The plain link with no `?api=` still works in direct/free mode.)

> Later, for a single clean URL, we can serve the client *from* the app
> (`public/play.html` + redirect) so the link is just `https://forkful-xxxx.vercel.app`.

## Things to know

- **Quota is now shared.** Spoonacular's free tier (~150 points/day) is consumed
  by *all* users against your one key. Fine for testing/small use. Before real
  traffic: add **server-side caching** of normalized recipes (docs/01 "caching"
  + the DB schema in docs/03) to cut calls dramatically, and/or a paid tier.
- **No secrets in the client.** The key is only ever in the server env var.
- **Saved list & swipes** are per-device (localStorage). Cross-device sync needs
  accounts + a DB (Phase 3).

## Easiest-deploy alternative

If the monorepo Root Directory step is annoying, I can create a **dedicated repo
with the app at its root** so Vercel is literally Import → add env var → Deploy
(no Root Directory to set). Ask and I'll set it up.
