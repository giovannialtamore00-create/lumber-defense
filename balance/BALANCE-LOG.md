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
| 5 | after batch 2 | Outpost Archer range L1 / L2 / L3, Gatehouse | 2 / 3 / 3, 2 → 1 / 2 / 2, 1 | Archers were still the deciding factor: an outpost pushed into enemy land plus Archer destroyed enemy buildings with no catapult (Base killed 7 outposts that way); every winner had Archer, the only strategy without it (C) won 0/10 |
| 6 | after batch 4 | Catapult damage (base / Firepower L1 / Fireball / Firestorm) | 10 / 15 / 20 / 20 → 15 / 20 / 25 / 25 | Wars stalled: armies of 5–8 catapults dealt up to 15,000 damage but brought down 0–8 outposts per match; no player was ever eliminated after minute 10 and no match was decided before 30:00 |

## Batch 1 (seeds 1–5, strategies Base / A / B / C, forest guards early for everyone)
- Wins: B 2, Base 2, A 1, C 0. Wins by start region: 0 → 3, 2 → 2. Turn order: no pattern. No dominations.
- Eliminations: C ×3 (minutes 15–25), A ×3 (as early as minute 5–10). Lost >30% of territory in the first 10
  minutes: Base 53% (seed 4), A 100% (seed 5).
- Usage vs winning: Outpost Archer 12 players / 42% wins; catapult upgrades 38%; woodchopper upgrades 31%; forest
  guard upgrades 31%; no catapults 0%.
- Curves: buildings rise fast to minute 10–15, then plateau (winners end at 30–96 buildings). Front-loaded, not the
  wanted slow-start escalation.
- Upgrades after change 1–2: not dominant (the upgrade-exploit strategy C never won).

## Batch 2 (seeds 6–10, after changes 3–4)
- Wins: B 4, Base 1. A eliminated within 10 minutes in 3/5, dealing no damage. Seeds 6 and 10 gave identical starts
  (same match twice), so the batch is really 4 matches.
- Cause found: outposts with Archer act as siege weapons (see change 5).

## Batch 3 (seeds 11–15, after change 5)
- Wins: Base 2, A 1, B 1, C 1 — even. Archer users win 31% (≈ the 25% of a random pick).
- **Start region: the two west regions (0 NW, 2 SW) won 14 of the first 15 matches.** Region 3 (SE) was eliminated
  10/15 times, region 1 (NE) 5/15. Region 3 has 14 riverside land hexes (others 24–25) and 5 on strong river rows
  (others 10–14): fewer good factory-mill spots. See proposed map fix below.
- Curves: wood cut keeps rising (guards keep forests alive), but wood spent drops after minute 10 and bots bank
  ~2,700 wood with nothing to spend it on; buildings flat at ~28 from minute 15. (Bot change: surplus → catapults,
  everyone pushes later in the game.)

## Batch 4 (seeds 16–20, bots spend surplus)
- Wins: Base 2, B 2, C 1. Armies of 5–8 catapults by minute 20 and up to 15,000 damage per player, but only 0–8
  outposts destroyed per match: catapults shoot the closest enemy item (carriers, woodchoppers) first. No
  dominations. (Change 6.)

## Batch 5 (seeds 21–25, after change 6)
- Wins: B 3, Base 1, C 1. Still no dominations; all matches judged at 30:00. West regions won 5/5.
- Since change 5 (15 matches): B 6, Base 5, C 3, **A 1** — early aggression is the weakest strategy.

## Proposed (needs designer approval)
- **map01 region 3 (SE):** give it about as much riverside land and strong-river riverside as the others (e.g.
  route a river branch through it, or move rocks/forest off its riverbanks). Region 1 (NE) loses too; it may be
  squeezed between a strong NW neighbour and a weak SE one — re-check after fixing region 3.

## Loops and bugs found
| # | Found in | Problem | Status |
|---|---|---|---|
| 1 | batch 1 | Bot placed catapults inside enemy archer range: they died in seconds and were rebuilt (~160 in one match), a wood sink | Fixed in the bot: catapults go ≥ 4 hexes from enemy outposts; at most 2× the planned army in total |
| 2 | batch 1 | Strategy C (few woodchoppers) never reached the building count that triggers expansion, stayed on its starting radius-2 territory and was overrun | Fixed in the bot: every bot gets a second outpost by minute 6 |
| 3 | test match | Strategy A dies before it has catapults: its push outposts (and first outpost) fall to archers | Cause was archer reach (change 5); A still the weakest strategy |
| 4 | batch 3 | Bots banked thousands of wood with nothing to spend it on once their territory was full | Fixed in the bot: one extra catapult per 100 banked wood; all strategies push toward enemies later in the game |
| 5 | batch 2 | Seeds 6 and 10 give the same regions and turn order (the same match) | Noted; use more seeds |
