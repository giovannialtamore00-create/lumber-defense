# Balance log

Balance pass driven by 4-player bot matches (`tools/battle-sim.ts`, `tools/battle-batch.ts`). Every match: playtest
mode on (50% costs and times, the same for all), 30:00 cap, winner by domination or by territory at the cap.
Strategies in `tools/battle-strategies/`. Raw output per batch in this folder (`batchN.txt`, `batchN.json`).

## Change list (old → new, why)

| # | When | Change | Old → new | Why |
|---|---|---|---|---|
| 1 | before batch 1 | Upgrade costs (all levels) | 40 / 80 / 160 → 52 / 104 / 208 (+30%) | Designer: upgrades overpowered |
| 2 | before batch 1 | Upgrade research times | 20 / 40 / 60 s → 34 / 68 / 102 s (+70%) | Designer: upgrades overpowered |
| 3 | after batch 1 | Outpost Archer damage L1 / L2 / L3 | 5 / 8 / 8 → 3 / 5 / 5 | Players with Archer won 42% (25% = random); archers dealt most damage, killed early pushes and catapults (80 HP) in ~16 s |
| 4 | after batch 1 | Gatehouse archer damage | 5 → 3 | Same as the Outpost Archer L1 it copies |

## Batch 1 (seeds 1–5, strategies Base / A / B / C, forest guards early for everyone)
- Wins: B 2, Base 2, A 1, C 0. Wins by start region: 0 → 3, 2 → 2. Turn order: no pattern. No dominations.
- Eliminations: C ×3 (minutes 15–25), A ×3 (as early as minute 5–10). Lost >30% of territory in the first 10
  minutes: Base 53% (seed 4), A 100% (seed 5).
- Usage vs winning: Outpost Archer 12 players / 42% wins; catapult upgrades 38%; woodchopper upgrades 31%; forest
  guard upgrades 31%; no catapults 0%.
- Curves: buildings rise fast to minute 10–15, then plateau (winners end at 30–96 buildings). Front-loaded, not the
  wanted slow-start escalation.
- Upgrades after change 1–2: not dominant (the upgrade-exploit strategy C never won).

## Loops and bugs found
| # | Found in | Problem | Status |
|---|---|---|---|
| 1 | batch 1 | Bot placed catapults inside enemy archer range: they died in seconds and were rebuilt (~160 in one match), a wood sink | Fixed in the bot: catapults go ≥ 4 hexes from enemy outposts; at most 2× the planned army in total |
| 2 | batch 1 | Strategy C (few woodchoppers) never reached the building count that triggers expansion, stayed on its starting radius-2 territory and was overrun | Fixed in the bot: every bot gets a second outpost by minute 6 |
| 3 | test match | Strategy A dies before it has catapults: its push outposts (and first outpost) fall to archers | Open: watch in batch 2 after change 3 |
