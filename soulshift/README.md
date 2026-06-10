# SOULSHIFT

*A 2D pixel roguelite dungeon crawler where you have no body of your own.*

**The twist:** you are a revenant soul. Every enemy you kill leaves a corpse,
and possessing a corpse makes that enemy's stat block — HP, attack, speed,
special ability — *your* character. But borrowed flesh rots: every action
spends one point of decay, and when the body sloughs apart your bare soul
spills out, flickering and fading, hunting for the next skin. The bestiary
**is** the class system, and your health bar is the food chain.

Descend 8 floors. Kill the Warden of the deep door — or weaken it and seize it
alive — and walk out wearing the dungeon's own face.

## Play it

It's a static page — no build, no dependencies. ES modules need a server, so:

```bash
cd soulshift
python3 -m http.server 8000     # or: npx serve
# open http://localhost:8000
```

| Keys | |
|---|---|
| Arrows / WASD / hjkl (+ QEZC, yubn, numpad for diagonals) | move / bump-attack |
| `G` or `Enter` | possess corpse · use shrine · descend stairs |
| `Space` or `F` | body ability |
| `.` / numpad 5 | wait |
| `M` mute · `?` help | |

## Design at a glance

- **Possession economy.** Fresh kills wake at 70% HP with full decay. Bodies
  you abandon *remember their wounds and rot* — re-wearing your cast-offs is
  never free healing. Zombies eat corpses, and corpses crumble on their own,
  so the larder is always shrinking.
- **The soul state.** Ejection grants a few turns of *flicker* (untouchable),
  then the soul fades 1 HP per turn. Its chilling touch slows pursuers, and
  any enemy under 30% HP can be seized alive. Souls can even take the stairs.
- **Balance by construction.** What you fight is exactly what you become; the
  player's edge is structural (+1 attack in any body, player-only crits,
  first strike) rather than stat inflation. The numbers are enforced by
  tests, not vibes — see `tests/balance.test.js` for the trade-matrix
  contracts, essence-economy solvency check, fuzz bot, and a calibrated
  greedy speedrun bot.
- **Roguelite meta.** Essence banks on death (60%) or victory (100% + bonus)
  and buys permanent soul perks and new starting bodies. Saved in
  `localStorage`.

## Architecture

Same philosophy as the rest of this repo: all decisions live in **pure
functions** with no DOM and no globals, so the whole game is testable in Node.

```
src/core/   rng, grid (FOV/pathfinding), dungeon gen, bestiary,
            turn engine (game.js), meta-progression — zero browser APIs
src/ui/     canvas renderer, pixel sprites (art as code), WebAudio synth
            sfx, input + screens (main.js) — zero game rules
tests/      65 tests via node:test — engine, generation, balance, art data
```

```bash
npm test    # node's built-in runner; no install needed
```

## Shipping checklist

- **Itch.io / web:** zip the `soulshift/` folder (everything is relative
  paths) and upload as an HTML5 game; set the viewport to ~1180×760.
- **Domain hosting:** any static host (GitHub Pages, Netlify, Vercel) — point
  it at this directory, done.
- **Tuning knobs** are concentrated and documented: body stats and spawn
  tables in `src/core/bodies.js`, possession/grace/decay constants at the top
  of `src/core/game.js`, shrine costs in `shrineCost()`, perk numbers in
  `src/core/meta.js`. The balance tests will tell you if a tweak breaks the
  game's contracts.
