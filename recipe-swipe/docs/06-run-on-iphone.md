# 06 — Run & Test on your iPhone

*Last updated: 2026-06-04*

The plan until we move to native app formatting: run Forkful as a **deployed web
app** and add it to your iPhone home screen as a **PWA** — it launches
full-screen, no browser chrome, and feels like an app.

> **Why not just run it from the dev sandbox?** That container is ephemeral and
> its outbound network is locked down (it can't even reach TheMealDB), so your
> phone can't reach it either. We need a real host. Vercel is free, made by the
> Next.js team, and its servers *can* reach the recipe APIs.

---

## Step 1 — Deploy to Vercel (one-time, ~5 min)

The code is already pushed to GitHub on branch `claude/recipe-swipe-platform-NMQfc`.

1. Go to **https://vercel.com** and sign up / log in with your GitHub account.
2. **Add New… → Project** → import the `technobacon/Claude` repository.
3. **IMPORTANT — set the Root Directory to `recipe-swipe`** (this repo also
   contains the unrelated `tabstash/` project; Vercel must build the
   `recipe-swipe` folder). Click *Edit* next to Root Directory and pick
   `recipe-swipe`.
4. Framework preset will auto-detect **Next.js**. Leave build settings default.
5. Under **Branch**, choose `claude/recipe-swipe-platform-NMQfc` (or merge it to
   `main` first and deploy that).
6. Click **Deploy**. After ~1–2 min you get a URL like
   `https://forkful-xxxx.vercel.app`.

Every future push to that branch auto-deploys, so testing new changes = I push,
you refresh your phone.

> No environment variables are needed yet — TheMealDB requires no key. When we
> add Spoonacular/Edamam, you'll paste their API keys into Vercel → Project →
> Settings → Environment Variables (`SPOONACULAR_API_KEY`, `EDAMAM_APP_ID`,
> `EDAMAM_APP_KEY`). The code already reads them.

## Step 2 — Add to your iPhone home screen

1. Open the Vercel URL in **Safari** on your iPhone.
2. Tap the **Share** button (square with an up-arrow).
3. Tap **Add to Home Screen** → **Add**.
4. Launch it from the new **Forkful** icon — it opens full-screen, no address
   bar. Swipe away.

The app already ships the manifest, icons, theme color, and notch-safe layout
needed for this (see `app/manifest.ts`, `app/layout.tsx`, `scripts/make-icons.mjs`).

---

## Alternative — quick LAN test from your own computer

If you'd rather test from your own machine before deploying (phone + computer on
the same Wi-Fi):

```bash
cd recipe-swipe
npm install
npm run dev -- -H 0.0.0.0     # bind to your network interface
```

Find your computer's LAN IP (e.g. `192.168.1.20`) and open
`http://192.168.1.20:3000` in Safari on your phone. This needs your computer's
network to allow `themealdb.com` outbound (most home networks do). For a public
URL without deploying, a tunnel like `npx localtunnel --port 3000` or
`ngrok http 3000` also works, but Vercel is simpler and persistent.

---

## What "fully test on iPhone" covers right now

- ✅ Swipe gestures (drag left/right) + tap the ✕ / ♥ buttons
- ✅ Filter chips (vegetarian, breakfast, chicken, …)
- ✅ Saved tab; tapping a saved recipe **opens the original publisher's site**
- ✅ Full-screen home-screen launch (PWA)
- ⏳ Saved list currently lives in server memory and resets on redeploy —
  durable cross-device accounts arrive in **Phase 3** (see
  [`04-roadmap.md`](04-roadmap.md)).
