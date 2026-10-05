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
| 7 | after batch 5 | Outpost HP | 150 → 100 (later 125, 175, now **150**: see round 3) | Designer: outposts too hard to bring down; no eliminations from war |
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

## Batch 6 (seeds 26–30, after change 7; A now attacks first: catapults from minute 7, push from 8)
- Wins: B 3, Base 2, A 0, C 0. No dominations.
- A deals the most damage of anyone (8,500–13,800) but takes no ground: catapults shoot the closest enemy item
  (mostly carriers and woodchoppers), and A spends on its army instead of expanding (territory flat at 32 in 3/5).
- Outpost kills up with the lower HP (up to 9 per player); eliminations still hit the weak map regions.
- **The map is full by minute 10:** almost every player's territory stops changing after that; afterwards ground
  only changes hands by conquest, which is rare. Playtest mode (half costs and times) compresses the build-up, which
  also defeats the slow-start criterion. Next: test without playtest mode; designer to decide on catapult target
  priority (outposts before the closest item).

## Round 3: smart bots, defensive archers, Conquest (designer decisions)
Designer changes: archers shoot only catapults (defensive); per-player stance Conquest (catapults shoot only outposts,
so the rest is captured) / Destruction (closest target). Goal: matches 15–30 min, at most 10% unfinished at 30:00,
economy-first snowball strategies, attack only when it pays.

Bots (tools/battle-sim.ts): attack the enemy they out-produce (income over 2 minutes ≥ leadRatio × theirs), or
out-number (army ≥ 1.5× + 2), or the last enemy from minute 15; Conquest while attacking, Destruction when invaded;
defensive army of 3 when enemy catapults are near; Archer L1 under threat; army first, then creep outposts toward
the target one at a time; buy **Reach** when outposts are just out of range; dismantle own buildings to make room.
Strategies (tools/battle-strategies/round3.json): S Snowball (attack from 11, lead 1.2), P Patient (13, lead 1.5,
2 guards/outpost), O Opportunist (10, lead 1.0), B isolationist (no focus). No bot attacks before minute 10.

| Step | Change / bot fix | Result (finished by domination) |
|---|---|---|
| r3 m1 | (start) | O won on territory; S and B wiped out before minute 10 by O's minute-7 rush |
| 8 | Archer range 1/2/2 → 3/4/4, Gatehouse 1 → 3 (archers can't hit buildings any more) | P won on territory, snowballed late (17 outposts) |
| 9 | Catapult cost 57 → 85 | first domination (O, 15.1 min) but two players dead before minute 10 |
| 10 | Catapult craft time 40 → 70 s | rush slowed; early deaths remain in the weak map regions |
| bot | defend when catapults near; no attacks before minute 10 | 4/4 dominations, 14.5–23.9 min |
| 11 | Outpost HP 100 → 125 | 10 seeds: 2/10 — two survivors sit on 50–70 idle catapults |
| bot | attack on army lead / in the final duel | 3/10 |
| bot | make room at the front; creep; **buy Reach** | 8/10, but most at 13–14 min |
| 12 | Outpost HP 125 → 175 | 10/10 in playtest mode, 12.9–20.4 min |
| — | **switch to normal mode** (real matches; playtest compresses everything) | 7/10, 21.8–26 min, nobody lost >30% in 10 min |
| 13 | Outpost HP 175 → 150 | 9/10 (21.4–27.2); on 10 fresh seeds 8/10 (14.7–27.4) |
| 14 | Outpost HP 150 → 140 (reverted) | 17/20, wins less even |
| 15 | Catapult cost 85 → 70 (reverted) | 13/20, S won 13 — cheap catapults feed the strongest snowballer |

**Current state (outpost HP 150, catapult 85 wood / 70 s), normal mode, 20 seeds:** 17/20 finished by domination
(85%; target 90%), lengths 14.7–27.4 min (2 just under 15), nobody loses >30% of territory in the first 10
minutes. Wins: S 9, P 6, O 5, B 0 — economy-first snowball strategies win, the passive one never does.
Usage vs winning (20 seeds): catapult upgrades 48%, catapults 42%, Archer 34%, woodchopper upgrades 33%, forest
guard upgrades 31% (25% = random).

**Tournament** (groups of 4, best of 3, top 2 to the final): champion **S**; group B a three-way tie (P2, O2, X);
7/9 finished, 17–29.5 min. See tournament1.txt.

**Unfinished matches:** near-finishes (loser down to ~20 hexes at 30:00) and poor stalemates (two equal survivors
with 1–2 catapults and no wood after a long war).

**Early rush finding (needs a design decision):** a catapult rush before minute 10 (O at minute 7) beat every
economy-first opponent and decided matches by minute 15. In the simulations bots don't attack before minute 10.
Options: (a) the first outpost has a basic archer; (b) catapults need a workshop; (c) a protection period.

## Round 3, continued
| Step | Change / bot fix | Result |
|---|---|---|
| bot | never dismantle factory-mills to make room | 18/20 (14.7–27.1) |
| 16 | Catapult craft time 70 → 55 s (crafting is one item at a time: late armies were too small to finish duels) | 40 seeds: 33/40, all 15.0–29.9 |
| — | craft 45 s (reverted) | 31/40 |
| — | Archer L2/L3 range 4 → 3 (reverted: no effect) | 33/40 |
| — | P expands every 6 buildings (reverted) | 31/40 |
| — | Outpost craft time 30 → 20 s (reverted: more outposts to grind through) | 23/40 |
| 19 | **Outpost craft time 30 → 40 s** (fewer outposts, faster eliminations) | 40 seeds: **36/40**, 16.1–30; fresh 20 seeds 17/20 |
| — | Fire burn rate 10 → 5 %/s; Firepower 20/25/25 → 17/20/20 (both reverted: tested on unrotated seats, see below) | no effect |

**Seat rotation (tools/battle-batch.ts --rotate):** without it, the same seeds give each seat the same start region,
so tests of one strategy against a variant measured map position, not the strategy. Earlier "catapult upgrades
win 50%" comparisons were confounded this way. With rotation (24 seeds): Range-only 7, Patient 8, Firepower-only 6,
no catapult upgrades 3 — catapult upgrades help, but don't decide matches.

**Final state, rotated seats, 24 seeds (normal mode):** 21/24 finished by domination (88%), lengths 16.1–29.2 min
(none under 15), nobody lost >30% of territory in the first 10 minutes. Wins: P 12, S 10, O 2, B 0.
**Start region decides everything:** wins region 0 (NW) 14, region 1 (NE) 10; regions 2 and 3 were eliminated in
24/24 matches each. The map is now the dominant factor (designer will rework the map).

**Designer change after round 3:** catapult cost and craft time **+50%**: 85 wood / 55 s → **128 wood / 83 s** (catapults are
unique in what they do, so they can be expensive). Not yet simulated.

**Current numbers:** outpost 48 wood / 40 s / 150 HP; catapult 128 wood / 83 s / 80 HP / 15 dmg; archers shoot
catapults only, range 3 / 4 / 4, damage 3 / 5 / 5; Firepower 20 / 25 / 25; upgrades 52 / 104 / 208 wood, 34 / 68 /
102 s.

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
