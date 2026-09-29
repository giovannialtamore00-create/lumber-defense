# CLAUDE.md

Browser tower-defense / territory game (2–4 players, wood floating down rivers), published on itch.io.

## Read first
- **[DESIGN.md](DESIGN.md)** — gameplay. **The source of truth.** Read it fully before any gameplay work.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — tech plan: stack, folder layout, determinism, networking, milestones.

## Rules
1. **Only implement what DESIGN.md says.** If something is missing, ambiguous, or listed under DESIGN.md §14
   "Open questions", **ask the designer. Never invent gameplay.**
2. **Every gameplay number lives in `src/data/*.json`.** Costs, times, HP, rates, thresholds, upgrade effects,
   map-rule targets — never hard-coded in `.ts` files.
3. **`src/sim/` is pure and deterministic** (ARCHITECTURE.md §2, §5):
   - no Phaser, DOM, network, `Math.random`, `Date.now`
   - no floats in state: integers in fixed-point units (milli-wood, milli-hex, basis points), 10 ticks/s
   - no `Math.exp`/`sin`/`pow` — precompute tables into JSON (e.g. `millCurve.json`)
   - seeded RNG from `rng.ts`, stored in state
   - stable iteration: arrays sorted by id, fixed hex neighbour order; never iterate object keys or Sets for gameplay
4. **Rendering only reads the sim.** The UI uses the same sim functions (e.g. `isLegalPlacement`) for previews.
5. **Work milestone by milestone** (ARCHITECTURE.md §11). At the end of each milestone: stop, explain how to run
   and test it, and **wait for designer approval** before starting the next.
6. Maps are proposed with a rendered screenshot and `validate-map` output, and approved before gameplay builds on them.

## Commands
- `npm run dev` — dev server (open 2 tabs for local multiplayer later)
- `npm test` — Vitest (sim unit tests, determinism)
- `npm run typecheck`
- `npm run validate-map` — checks map rules from DESIGN §4.3
- `npm run build` then `npm run zip` — `dist/` → `build.zip` for itch.io (HTML5, "played in the browser").
  Vite uses `base: './'` so paths work in itch.io's iframe.

## Stack
TypeScript (strict), Phaser 3, Vite, Vitest, PeerJS. Node scripts run with `tsx`.
