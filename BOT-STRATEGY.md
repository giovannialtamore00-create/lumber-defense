# BOT-STRATEGY.md

Findings for designing bot strategy and behaviour (M7). They come from scripted solo matches on the real sim
(`npm run econ-sim`, strategy files in `tools/econ-strategies/`), from playtests and from designer notes. Bots
follow exactly the same rules as humans (DESIGN §1), so everything here is about **choices**, never about cheating.

> These are observations, not rules. Gameplay rules live in DESIGN.md; if the two disagree, DESIGN.md wins. The
> bot strategy itself is designed with the designer first (ARCHITECTURE §11, M7).

## How the numbers were measured
- Solo matches, 60–90 minutes of game time, map01, seeds 5 / 11 / 23; the other three slots idle (no opponents),
  so **expansion looks stronger than it will be against real players**.
- "Wood collected" = wood that reached a factory-mill (the only wood that becomes yours, DESIGN §6.1).
- "Passive minute" = a minute in which less wood reached factory-mills than passive income gives. A good player
  should have **none**.

## The economy in one paragraph
Wood is cut by woodchoppers into a log stack on their forest hex, carried by a carrier along its row, and becomes
yours only inside a factory-mill. Forests are finite (map01 holds 80 forest hexes × 150 wood = 12,000 wood) and only
grow back through forest guards. So the economy is a race: **turn forest into buildings faster than it runs out,
and replant before it does.** Territory (outposts) is what gives access to forest.

## What works (do this)
1. **The core loop:** woodchopper on a forest hex → **one carrier** on the same row → straight into a **factory-mill**
   on that row (within the carrier's route distance). This is the only loss-free way to move wood.
2. **Place the factory-mill first, then the woodchoppers on its row.** Score a factory-mill spot by river strength
   (craft speed) plus forest hexes on its own row within route distance.
3. **Expand early and keep expanding.** Outposts are the strongest lever: one opens about 37 hexes and the forests in
   them. Trigger a new outpost when the uncut forest in your territory drops low (≈400 wood) or every ~6 buildings.
   Pick the spot whose new territory holds the most uncut forest (plus riverside land for mills and docks).
4. **Forest guards are the economic engine.** They are the only way the wood supply grows. With 1–2 guards per
   outpost, wood collected was **2–3× higher** over an hour and forest was never exhausted. Place a guard where the
   most spent forest hexes are within its range.
5. **One carrier per woodchopper.** A woodchopper cuts 0.25 wood/s (15/min); one carrier moves that easily. A second
   carrier is wasted wood.
6. **Docks only next to a factory-mill.** A dock catches half a passing pile, and only a dock touching a
   factory-mill turns it into your wood (it dispenses into it). A dock anywhere else only fills up.
7. **Use the hammer to undo mistakes.** If a dock (or anything) turns out useless — e.g. a dock not touching a
   factory-mill — dismantle it: half its cost comes back as a log stack a carrier can collect. (Obvious to a human,
   it wasn't to the first scripted player, which built 12 docks for one factory-mill.)
8. **Expansion pace matters more than anything else early.** In the first 5–10 minutes most wood is passive income;
   the first outposts and woodchoppers decide the next 30 minutes.

## What doesn't work (avoid)
- **Dropping wood into the river** and hoping a dock catches it: most of it floats off the map. Only worth it when
  a dock **touching a factory-mill** is downstream on the same river.
- **Not expanding:** the starting territory's forest (radius 2) is cut out in 10–20 minutes, then the player lives on
  passive income (1 wood / 5 s) and stalls at 10–15 buildings.
- **Woodchopper Output upgrades without replanting:** they cut the same finite forest faster, so they cost wood and
  bring the end of the forest closer. Only buy them together with forest guards.
- **Many woodchoppers in one territory:** they exhaust it and stand idle; idle woodchoppers move only to an
  **adjacent** free forest hex in your territory (DESIGN §6.2).
- **Too many factory-mills without forest on their rows:** they still speed up crafting (DESIGN §6.7) but bring in
  no wood.

## Benchmarks (current balance: 150 wood per forest hex, costs 95% of the first placeholders)
Best strategies (expand + 1–2 guards per outpost, hammer useless docks), 60 minutes, seeds 5 / 11 / 23:

| Measure | Value |
|---|---|
| 10 buildings | ~5–8 min |
| 25 buildings | ~13–16 min |
| Buildings at 60 min | ~165–185 (the map fills up; no opponents) |
| Wood collected in 60 min | ~18,000–25,000 (300–410 a minute) |
| Passive minutes | **0** in every run |

Bad play at the same balance (seed 5): a greedy dock-spammer that never expands, a woodchopper-heavy build without
enough factory-mills, and river-only routes all fall back to passive income from minute ~12, for 15–49 of the 60
minutes. The balance was chosen so that only bad play ends up there (DESIGN §8.1).

Before the rebalance (100 wood per hex, full costs): an expanding player without guards cut the whole map's forest
(~8,000 wood) by minute 30; with guards, even the best play had one passive minute in the opening on one seed.
Playtest mode roughly halves the time to the first 10 and 25 buildings.

## Simulator lessons (mistakes the scripted player made, and the fixes)
- Crafting things with nowhere good to put them (docks with no free hex next to a factory-mill) sends them to the
  warehouse: wood poured into the warehouse forever. **Only craft what you can place usefully right now.**
- Woodchoppers on rows without a factory-mill can only feed the river. **Put a factory-mill on the woodchopper's row**
  (within carrier range) before adding more woodchoppers there.
- The first outpost isn't in the hand: place it during your starting turn, or a bot takes the slot.

## Combat and catapults (designer notes)
- A catapult only targets other players' items in a **conflict zone inside its owner's territory**, re-picks the
  closest legal target every second, and only drives inside its owner's territory (DESIGN §8.6).
- **Catapults can stall:** when the closest legal target is far away or out of reach (water, rocks), the catapult
  wanders or waits. A good player (and bot) fixes this by **extending sight with a new outpost** next to the front,
  or by **dismantling and re-placing** the catapult closer (DESIGN §14.5).
- Outposts that create conflict zones are the declaration of war; a bot should expect retaliation there and keep
  catapults (and Archer upgrades) near its own conflict zones.

## Fire (M6)
- Every fire burns an item down in about 20 s unless the item dies first; at maximum strength it spreads to one
  random neighbour, so **don't pack valuable buildings tightly near a front** where Fireballs or Fire arrows land.
- Firestorm can burn the forests in conflict zones: forests near the front are at risk, which hurts the economy
  more than losing a building.
- The hammer on a burning item gives no wood; it only prevents the fire from spreading further from it.

## Open questions for bot design (ask the designer)
- How aggressive should bots be (when to place the first conflict-zone outpost, when to build catapults)?
- Should bots trade, pause, or surrender?
- Difficulty levels (e.g. an "easy" bot that makes some of the mistakes above on purpose)?
