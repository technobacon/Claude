# Spireling

A pocket **deck-building roguelike** — climb 8 floors, build a deck out of
combat rewards, and beat the boss (The Colossus). Plain JavaScript, **no build
dependencies**, designed to be played in mobile Safari.

It follows the same shape as the rest of this repo: **all rules live in pure,
tested functions** (`src/core/`), and a thin DOM layer (`src/ui/`) just renders
state and routes taps. The whole game is deterministic given a seed.

## Play it

The game is a single self-contained file: `dist/index.html` (no external
requests — it runs from any static host or even `file://`). On your phone, open
the deployed link and **Add to Home Screen** for a fullscreen, app-like feel.
Progress auto-saves to `localStorage`, so you can close and resume.

## Commands

```bash
npm test                 # unit tests for the pure core (node --test, no install)
node --test tests/combat.test.js   # a single suite
node tests/smoke-ui.mjs  # headless DOM smoke test of the UI layer
npm run build            # inline src/ → dist/index.html (self-contained)
```

For local play during development you can serve the folder and open
`index.html` (which loads the ES modules directly):

```bash
python3 -m http.server -d spireling 8080   # then open http://localhost:8080
```

## Architecture

- `src/core/rng.js` — seeded, serializable PRNG (mulberry32). Makes runs
  reproducible and the logic testable without flakiness.
- `src/core/cards.js` — the card catalog as **declarative data**. A card's
  `effects` are a small instruction list the combat engine interprets.
- `src/core/enemies.js` — enemy catalog + their deterministic move AI and the
  encounter groups for each node tier.
- `src/core/combat.js` — **the combat engine.** Pure, immutable transitions
  (`startCombat`, `playCard`, `endTurn`); damage/block/status math; powers.
  This is where most logic and test coverage lives.
- `src/core/run.js` — the meta-game: the linear map of nodes, the persistent
  deck/HP, rewards, rest, and win/lose.
- `src/ui/app.js` + `src/ui/styles.css` — thin, mobile-first presentation.
  Owns no rules; renders `run` state and calls into the core.
- `build.mjs` — dependency-free inliner → `dist/index.html`.

**Data flow:** tap → `app.js` → `combat.js` / `run.js` (pure transform) →
re-render. Keep logic in the core and add tests there.

## Content

Cards span attacks, skills, and powers (Strike, Bash, Cleave, Heavy Blade,
Body Slam, Demon Form, Reaper, …) with Strength / Vulnerable / Weak and
end/start-of-turn powers. Enemies include a Cultist, Jaw Worm, slimes, a
Gremlin Nob elite, and the Colossus boss, each with telegraphed intents.
