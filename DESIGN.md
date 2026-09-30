# DESIGN.md

Game design for a 2–4 player browser tower-defense / territory game built around wood that floats down rivers.

> **About numbers:** every number in this document is a starting value for playtesting and must live in
> editable config data, never hard-coded. Values marked *(placeholder)* were proposed during design and are
> expected to be rebalanced.

---

## 1. Purpose and platform

- Multiplayer, **2–4 players**.
- Runs in the browser and is published on **itch.io**.
- A **demo for playtesting with friends**, possibly the start of a bigger game.
- With fewer than 4 human players, **bots fill the empty slots**. Bots follow exactly the same rules as humans.
- There are **no AI enemies**. Players (and bots) only fight each other.

## 2. Genre and player relations

- A tower defense driven by **offensive structures and machines** that players build.
- Players can **cooperate or be antagonistic**. Cooperation is **informal**: there are no official teams or alliances.

## 3. Core rule: indirect control

- **Players never directly control anything after placing it.** All structures and machines act and move on their own logic.
- The player's actions are: **crafting** (from the menu), **placing** crafted items, and **upgrading** (dev tree).
- Once built and placed, things **cannot be picked up again**.

## 4. The map

### 4.1 View and grid
- **Isometric 2D.** All icons for structures and machines are **stylized**.
- The map is made of **hexagonal chunks**. **Only one structure or machine per chunk.**
- **North is uphill, south is downhill.** Rivers always flow **north → south**.
- Throughout the design, **"close to" means adjacent** (touching hexes).

### 4.2 Size and regions
- About **300 hexes** in total.
- Divided into **4 regions** of about **75 hexes** each, one per player.
- The map's starting layout is **fixed**: the same map every match.
- **Region layout (decided):** 2×2 quadrants (NW, NE, SW, SE). map01 is **18×16 = 288 hexes**, 4 regions of 9×8 = 72.
  The rivers are long enough that **every region has its own stretch of river**, so each player can drop wood in
  upstream and collect it downstream inside their own region.

### 4.3 Terrain
- **Forests** are the main landmark. Each forest hex holds a pool of **100 wood**.
- **Forest density:** about **20 forest hexes per 75-hex region**. Map rule: **every possible 7-hex-diameter
  (radius 3) area inside a region must contain at least one forest hex**, so wherever the player places their first
  outpost they start with forest.
- **Forest placement (decided):** forest **grows out from the water** and sits **mostly in the upper (northern) half
  of each region** (about 85%, placeholder). This is what makes downstreaming relevant: wood is cut up top, routed
  to the river and carried downstream to where there is space to build. The coverage rule above now applies **only
  to the upper half** of each region; an outpost placed low in a region may start without forest.
- **Rocks/obstacles:** about **5%** of hexes.
- **Rivers:** there can be **several rivers**. They span the map from north to south and can **fork and merge**.
- **Water ratio (decided):** about **15%** of hexes are river. map01 has 3 rivers, including **forks and merges**
  (decided); the central one runs along the west/east border and touches all four regions.
- **Float speed (decided):** river strength does **not** change how fast wood floats.
- **Waterfall and piles (decided):** nothing happens to a pile at the waterfall; it keeps floating.
- The river keeps flowing past the southern edge of the map, but **you can't see it there**.
- **Waterfall and river strength (decided):** on a 4-player map a **small waterfall runs across the horizontal middle
  of the map** and levels the river slope. River strength (water speed) is **weakest in the first row** of each half
  and **strongest in the last row** of each half (just above the waterfall, and at the southern edge). The waterfall
  and the strength gradient are both **shown on the map** and explained in the UI.

### 4.4 Map authoring
- Map layouts are proposed and then approved by the designer. **map01 approved** (18×16, 2026-09-29).
- A **map editor** is on the wishlist.

## 5. Match start

1. Each player is **randomly assigned one of the 4 regions**.
2. The player places their **first outpost anywhere inside their region**. This creates the starting territory
   (radius **2** = 19 hexes, 5 hexes across; designer decision, smaller than a normal outpost's radius 3).
   **Valid start (decided):** the starting territory must contain **a forest and a riverside**, otherwise the
   outpost can't be placed there.
   **Turns (decided):** players place their starting outposts **in turns**, one after another, and have to adapt
   to the placements of the other players. **Once everyone has placed, the game runs in real time.** Turn order and
   **Turn order and timer (decided):** the order is **random each game** (player 1, 2, 3, 4). **Player 1 has 30 s**
   to place; **each later player has 15 s** (placeholders). A player whose timer runs out is **removed from the game
   and a bot takes their place**.
   **Overlap (decided):** starting territories may cross region borders. Where they overlap another player's
   territory they form a **conflict zone**, under the normal rules (§9).
3. The player receives a **factory in hand** (already crafted) and places it **anywhere in their territory**.
4. The player has a **starting woodchopper**. It **appears automatically** on a forest hex in the starting territory
   as soon as the first outpost is placed in a valid location, on the **forest hex closest to the outpost** (ties
   broken by a fixed hex order) (decided).
5. The player starts with **50 wood**.

## 6. The wood economy

### 6.1 Ownership
- **Wood belongs to nobody until it reaches a factory.** This covers log stacks, wood being carried, floating wood and wood in docks.
- Any player can collect any unowned wood, as long as the pickup is inside their territory or a conflict zone.

### 6.2 Woodchopper
- Placed on a **forest hex**. **Max 1 woodchopper per forest hex.**
- Automatically cuts trees at **0.5 wood/second** (halved from 1, designer decision).
- It **wanders randomly within its hex** as an animation to show it's active. This has no gameplay effect.
- The cut wood forms **one log stack**, drawn **at the bottom of the same hex**. It doesn't take up another hex.
- When a forest hex's wood pool reaches 0, **the forest disappears from that hex.** The woodchopper stays there.
  Once woodchoppers level up into **gardeners** (§8.7), they regrow their forest while cutting it.

### 6.3 Log stack icon (used everywhere wood piles up: forest, dock, neutral factory)
One icon that grows in 3 stages with the amount of wood:

| Amount | Icon |
|---|---|
| 1–4 | Stage 1: a single log |
| 5–14 | Stage 2: two logs |
| 15+ | Stage 3: three logs in a pyramid (2 at the bottom, 1 on top), meaning "lots of wood ready" |

### 6.4 Carrier
- A basic wheeled unit.
- **Placement is a two-step route:**
  1. **Point A (pickup):** a hex with a wood pile, such as a forest stack or a dock. It shows green on valid spots.
  2. **Point B (drop-off):** drag or point to a **riverside** or a **factory**.
- **Loop:** go to A, pick up to capacity, go to B, drop, go back to A, repeat.
  - At A the carrier **takes whatever is there** (at least 1 wood, at most its capacity) and leaves (decided).
  - At a riverside, the load is dropped into the water and floats downstream.
  - At a factory, the wood becomes the player's.
- **Max A-to-B distance at level 1: 5 hexes.**
- **Horizontal only (decided):** carriers move **only east/west, within one row**. A and B must be in the same row.
  This is what makes the river the way to move wood north → south. Catapults are not affected.
- Carriers **pass through anything, including other carriers**, **except rocks and water** (decided).
- **Drop-off (decided):** the drop-off B is **the first hex encountered on the horizontal path towards a river**,
  i.e. the hex right before the water in the carrier's row. **Either river** on the row can be used (east or
  west of A, within the route distance); **the player chooses** which one as point B. (Changed from "closest river
  only".)
- **Bridges (decided):** if a bridge is on the row a carrier moves along, the carrier **drops its logs from the
  bridge into the river below**, instead of from the riverside hex.
- Base stats: **capacity 5**, **speed 1 hex/second**.
- Capacity upgrades make carriers bigger and slower: **each capacity level is −10% speed.** "Many small fast
  carriers" is meant to be a valid strategy.
- The carrier icon changes slightly and gets **bigger** with each capacity level.

### 6.5 River
- A dropped load floats downstream as **one pile that keeps its own wood value**. Piles **never merge** while floating.
- Float speed: **1 hex/second**.
- **Forks (decided):** at a fork a pile takes either branch with a **random 50/50 chance** (seeded, so every client
  sees the same result).
- A pile that no dock stops floats off the southern edge and **disappears**.

### 6.6 Dock
- Built only **on the side of a river** (left or right bank, adjacent to the river).
- A floating pile that reaches the dock **stops and is collected** into the dock's stack icon, drawn at the bottom
  of the dock icon, **slightly to the right**.
- **Capacity 20** (doubled from 10, designer decision). When the dock is partly full, it **takes as much as fits and the rest floats on**.
  - Example: capacity 25, holding 17, a pile of 10 passes → 8 are caught, 2 keep floating.
- **Any player's dock can catch any floating wood.**
- A dock adjacent to a factory **dispenses 1 wood/second** into it (upgradable). The dispense timer is there so the dock doesn't empty instantly, which would make its capacity pointless.
- A dock not adjacent to a factory needs a **carrier** (A = dock, B = factory).

### 6.7 Factory
> **Decided: factory and mill (watermill) become one unified structure**, which **must be built on the riverside**.
> Its efficacy (its contribution to **crafting productivity**) is **stronger lower down the river**, based on the
> river strength at its spot (§4.3). It replaces both the old factory and the old mill (§8.3).
>
> **Decided: productivity.** Pooled productivity is no longer additive (it was "2 factories = half the craft time",
> §7.2). Instead, **each factory-mill after the first reduces production time**, together with river strength,
> along the formula below.
>
> **Decided: river strength.** River speed improves factory-mill performance. The **first river row counts 0%**,
> and the bonus grows **exponentially** down each half: **little in the middle rows, most at the bottom** (not a
> flat +3% per row). The whole boost (river and number of factory-mills) is **nerfed from the start**.
> **Max boost (decided): 90%**, reached with **5 factory-mills all at the strongest river row**. Wood cost keeps
> overproduction in check.
>
> **Decided: formula** *(placeholder numbers)*:
> - raw = **6%** × (factory-mills − 1) + Σ over every watermill of its **river bonus** by row (strongest row of that
>   river): row 1–8 of a half = **0 / 0.4 / 0.9 / 1.8 / 3.0 / 4.9 / 7.8 / 12%** (each row worth ×1.5 the one above).
> - Craft-time reduction is **linear** in raw, reaching **90%** at the max setup (5 × row 8: raw 84%), then capped:
>   reduction = 90% × min(1, raw / 84%). Craft time = base time × (1 − reduction). (−90% = 10× faster.)
> - Beyond the max setup (more factory-mills, double mills), the reduction stays at 90%; extra factory-mills still
>   add queue slots (§7.2).
> Exact numbers: still open (Open Question 6).
> **Every factory-mill's spot matters, including the first one.**
>
> **Decided: double mills.** A factory-mill that touches **two distinct rivers** gets **two watermills**, one drawn
> on each river's side, and gets the river-strength boost **from both**. Touching several water hexes of the **same**
> river (including both branches of a fork) still counts as **one** watermill, using that river's **strongest row**.
>
> **Decided: cost.** Factory-mills and river strength **do not reduce cost**, only production time. Cost is reduced
> only by an **upgrade on the factory**.

- When wood reaches one of your factories, it **becomes yours**. It disappears from the map and is added to your wood count.
- **All your factories feed one shared wood count.**
- **The only automatic wood transfer between adjacent structures is dock → factory.** No other structures pass wood along.
- **Neutral factory** (see §9): it keeps working, but wood it receives isn't added to anyone's count. It piles
  up as a stack outside the factory, where any carrier can pick it up.

## 7. Crafting and building

### 7.1 Build menu (top right)
- Your **wood count**, shown large with a wood icon.
- A **dropdown** of all unlocked structures and machines, each with **icon, name, short description and price**.

### 7.2 Crafting flow
1. Click an item. It must be unlocked and affordable (a "legal purchase").
2. A **Craft/Build** button appears. Press it to confirm, and the cost is paid.
3. Items can be **queued**. **Decided: the number of factory-mills limits the queue.** A single factory-mill can
   only craft one item; more factory-mills allow more items in production, on top of making crafting faster.
   Items are still **crafted one at a time globally** (the others wait in the queue).
   Confirmed details: an item's craft time is fixed when it **starts** crafting (so new factory-mills speed up
   waiting items); crafting **pauses** while you have no factory-mill; crafted items are placed from the hand
   **oldest first**.
4. **Production is abstract and pooled.** Your factory-mills together set one craft speed (formula in §6.7).
   Where the item is "built" doesn't matter.
5. **Every factory you own shows the grey icon** of the item currently being crafted, filling with color from the
   bottom as the timer finishes.
6. When done, the item is **in your hand** (on the mouse). You deploy it "from the sky" onto the map.

### 7.3 Placement
- Legal area: **your territory or a conflict zone** (areas revealed by your outposts). This applies to every structure and machine.
- While you hover, the item shows **green on a legal hex** and **red on an illegal one**.
- Illegal hexes: **water, trees (forest), rocks, other structures**, plus each item's own rules:
  - Woodchopper: forest hex only, max 1 per forest hex.
  - Dock: adjacent to a river.
  - Factory-mill: adjacent to a river (riverside).
  - Carrier: route rules in §6.4.

### 7.4 Unlocks
- **For playtesting, everything is unlocked at the start.** Cost is the only limit.
- **Future items** were to be unlocked through the factory's New Technologies path, which is now replaced by
  **Efficiency** (§10.3). How future items unlock is an open question (§14).

## 8. Structures and machines

### 8.1 Base stats *(placeholder costs, times and HP)*
Craft times are base times, before the factory-mill reduction (§6.7).

| Item | Cost | Craft time | HP | Other stats |
|---|---|---|---|---|
| Outpost | 50 | 30 s | 150 | Territory radius 3 |
| Factory-mill | 60 | 45 s | 200 | Riverside; reduces craft time (§6.7); one queue slot (§7.2) |
| Dock | 20 | 20 s | 80 | Capacity 20, dispenses 1 wood/s to an adjacent factory |
| Carrier | 10 | 10 s | 30 | Capacity 5, speed 1 hex/s, max A-to-B distance 5 hexes |
| Woodchopper | 15 | 15 s | 40 | 0.5 wood/s |
| Bridge | 30 | 20 s | 120 | Lets wheeled units cross a river |
| Workshop | 50 | 30 s | 120 | Where upgrades (the dev tree) are bought |
| Catapult | 60 | 40 s | 80 | Range 4 hexes, 10 dmg/hit, 0.5 hits/s, speed 0.5 hex/s |

Fixed values: starting wood **50**, forest **100 wood per hex**.

### 8.2 Outpost
- Gives control of territory within a **3-hex radius** (37 hexes).
- Where territories of different players overlap, there's a **conflict zone** (§9).

### 8.3 Mill
- *Replaced (decided):* the mill is now part of the **factory-mill** (§6.7), which has its own formula.

### 8.4 Bridge
- Connects the two banks of a river so **wheeled units** can cross.
- **Carriers and catapults are the only wheeled units** for now. They travel on **land and bridges** and can't cross water any other way.
- **Placement (decided):** on **any water hex**. If it connects two lands, the bridge is **finished and working**.
  If the water is wider, it stays a **half bridge** and doesn't allow movement until more bridge pieces complete
  the crossing: a **straight run of bridge pieces, in any direction, with land at both ends** works (decided).

### 8.5 Workshop
- Where the **dev tree** is bought (§10).

### 8.6 Catapult (offensive machine)
- Wheeled, so it moves on land and bridges.
- Stats: **range, damage per hit, hit rate (hits per second), HP**.
- **Fully automatic behaviour:**
  1. It turns toward the **closest structure belonging to another player**.
  2. It moves to the **furthest distance from which the target is still in range**.
  3. If the target **isn't in a conflict zone**, it stays **idle** once it reaches that distance.
- **No ammo resource.** An upgrade can change the projectile type (for example fireballs), still at no cost per shot.

### 8.7 Gardener / forest guard
- *Changed (decided):* the gardener is **not a separate item** any more. It is an **evolution of the woodchopper**:
  on level-up (dev tree, §10), **existing woodchoppers become gardeners**, which **cut and regrow at the same time**,
  keeping the forest evergreen. Which upgrade path/level and the numbers: Open Question 12.

## 9. Territory, conflict and capture

- **Conflict zone:** hexes covered by outposts of more than one player. **Both players can build there**, but
  structures there can be **attacked, destroyed or captured**.
- **Legal attack targets exist only inside conflict zones.** Offensive machines can't attack into another player's
  territory, even when it's in range.
- **Why:** to push into a neighbour you first have to place an outpost that creates a conflict zone. That shows
  your intent and gives them time to prepare.
- **Pushing deeper:** placing another outpost inside a conflict zone extends the conflict zone further into the enemy's territory.
- **Outpost destroyed:**
  - Its owner loses that territory, **unless those hexes are still covered by another of their outposts**. Those
    hexes are then kept, but probably still sit in a conflict zone and stay exposed to attack.
  - Structures in hexes that are actually lost become **neutral but keep working**. A neutral factory piles incoming wood as a stack outside it.
  - If a new outpost's area covers neutral or lost structures, they **pass to that outpost's owner** (capture).

## 10. Dev tree (bought at the Workshop)

### 10.1 Rules
- **Each structure type has 2 upgrade paths.**
- Picking a path **unlocks its further levels** (a single line: L1 → L2 → L3).
- **The other path can still be bought, at a higher price.**
- **An upgrade applies to all existing items of that type and to all future ones.**
- There are **no base-HP paths**. HP comes from the factory's Improved Frames.

### 10.2 Pricing *(placeholder)*
| | L1 | L2 | L3 |
|---|---|---|---|
| First path picked | 40 wood, 20 s | 80 wood, 40 s | 160 wood, 60 s |
| Second path | ×2 cost | ×2 | ×2 |

### 10.3 Paths *(placeholder values; ★ = proposed idea, subject to designer judgment)*

**Outpost**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Reach | Radius 3 → 4 | → 5 | → 6 |
| Archer | Archer on top: range 2, 5 dmg, 1 hit/s | Range 3, 8 dmg | ★ Fire arrows: damage over time |

**Factory**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Efficiency | All crafting costs −10% | −20% | −30% |
| Improved Frames | All your structures +15% HP | +30% | +50% |

**Dock**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Capacity | 20 → 40 | → 70 | → 100 |
| Dispense | 1 → 2 wood/s | → 3 wood/s | ★ Chute: feeds a factory up to 2 hexes away |

**Carrier**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Capacity | 5 → 10, −10% speed | → 15, −20% | → 20, −30% |
| Mobility | +20% speed, max A-to-B 5 → 6 | +40%, → 7 | +60%, → 8 |

**Woodchopper**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Output | 1 → 1.5 wood/s | → 2 | → 3 |
| ★ Log Slide | Forest hexes adjacent to a river drop logs straight into it at 0.5 wood/s | 1 wood/s | Also from 1 hex away |

**Mill** — *dropped (decided): the mill is now part of the factory-mill, and its old paths (Power, Toll) are
irrelevant.*

**Bridge**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| ★ Drawbridge | Enemy wheeled units can't cross | ★ Grate: floating piles stop at the bridge, and your carriers can use it as pickup point A | Gatehouse archer (same stats as outpost archer L1) |
| ★ Causeway | Your wheeled units crossing get +50% speed for 10 s | Spans 2 river hexes | Spans 3 river hexes |

**Workshop**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Discount | All upgrades −10% cost | −20% | −30% |
| Fast Research | Upgrade time −20% | −35% | −50% |

**Catapult**
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Range | 4 → 5 hexes | → 6 | → 7 |
| Firepower | 10 → 15 dmg | Fireball: 20 dmg plus burning damage over time | ★ Firestorm: fireballs also burn forest hexes in conflict zones |

**Gardener** — *the gardener is now an evolution of the woodchopper (§8.7). How these paths fit into the woodchopper's
tree is Open Question 12.*
| Path | L1 | L2 | L3 |
|---|---|---|---|
| Growth | Regrowth 0.5 → 1 wood/s | → 1.5 | → 2 |
| ★ Afforest | Plants forest on 1 adjacent empty hex | 2 hexes | ★ Can plant in conflict zones (forest blocks enemy building) |

## 11. Winning and losing

- **Victory:** by domination, or when the other players surrender.
- **Defeat:** a player with **no outposts** controls no territory and no structures, and is **out of the game**.
- **A player with no factories is still alive.** They can't develop, but their offensive machines keep working, and they
  can come back by **capturing** an enemy or neutral factory with an outpost.
- **Pacing:** development should **snowball**, so the leader's advantage grows and the endgame speeds up.

## 12. UI

- Top right: wood count (large, with icon) and the build dropdown (§7.1).
- Everything else about the UI is **to be discussed later**.

## 13. Future items (noted, not designed)

- **Dam:** its own structure.
- **Repair squads**
- **Salvage squads:** they recover wood from destroyed structures.
- **Excavators:** terraforming that changes water terrain and river flow.
- **Map editor**
- Structures unlocked in some future way (the New Technologies path was replaced by Efficiency).

## 14. Open questions

1. ~~**Starting woodchopper**~~: decided, it appears automatically once the first outpost is placed, on the forest
   hex closest to the outpost (ties broken by a fixed hex order) (§5).
2. ~~**Water ratio**~~: decided, about 15% (§4.3).
3. ~~**Region layout**~~: decided, 2×2 quadrants, every region gets river (§4.2).
4. **Moving units and hexes:** ~~carriers~~: decided, they pass through everything except rocks and water (§6.4).
   Still open for M5: do catapults block hexes or pass through units?
5. **Bot strategy:** bots use the same rules as humans, but how they decide what to do is not designed yet.
6. **Factory-mill (unified structure):**
   - Its cost, craft time and HP: using the old factory's placeholders (60 / 45 s / 200) for now.
   - ~~Productivity, river strength, curve, max boost, first spot~~: decided, formula in §6.7.
   - ~~Queue~~: decided, one slot per factory-mill, items crafted one at a time globally (§7.2).
   - ~~Cost~~: decided, factory-mills only reduce time; cost is reduced by the factory's **Efficiency** path, which
     replaces New Technologies (§10.3, placeholder numbers −10% / −20% / −30%).
   - "Riverside" means adjacent to a river hex? ~~Two rivers~~: decided, two distinct rivers = two watermills, both
     boosts count. ~~Same river, several rows~~: decided, the **strongest row** counts.
   - ~~Old mill upgrade paths (Power, Toll)~~: decided, dropped; they are irrelevant now.
   - ~~Start without riverside~~: decided, a first outpost is only valid if its territory has a forest and a
     riverside (§5).
   - Does a dock adjacent to it still dispense into it (§6.6), and do its upgrade paths (§10.3 Factory and Mill) merge?
7. **River strength and floating wood:** ~~float speed~~: decided, water speed does **not** change how fast piles
   float (1 hex/s everywhere). ~~Waterfall~~: decided, piles just keep floating.
8. **Horizontal carriers:** ~~passing through~~: decided, carriers **can pass through forests and structures**.
   ~~Bridges~~: decided, a carrier on a row with a bridge drops its logs from the bridge (§6.4).
   ~~Drop-off~~: decided, the first hex before a river on the carrier's row, either direction, player's choice (§6.4).
9. **Future unlocks:** New Technologies was replaced by Efficiency, so how future structures (§13) get unlocked is open.
10. **Starting turns (§5):** ~~real time~~: decided, the game runs in real time only after everyone has placed.
    ~~Order and timer~~: decided, random order each game; 30 s for player 1, 15 s for each later player.
    ~~Timeout~~: decided, a player whose timer runs out is **removed from the game and a bot takes their place** (§5).
11. ~~**Starting territory crossing into a neighbour's region**~~: decided, allowed; overlaps are conflict zones (§5).
12. **Gardener as a woodchopper evolution (§8.7):** which upgrade turns woodchoppers into gardeners (a new
    woodchopper path, or replacing Output / Log Slide)? Regrowth rate vs cutting rate: regrowth 0.5 wood/s while
    cutting 1 wood/s still depletes the forest; should regrowth match cutting so it's truly evergreen? Do the old
    Gardener paths (Growth, Afforest) become its later levels? Needed for M6.
13. ~~**Bridges (§8.4)**~~: decided, measured in **any direction**, and bridge pieces **join**: a straight run of
    bridge pieces with land at both ends is a working bridge.
