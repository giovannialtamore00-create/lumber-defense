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
- **Forests** are the main landmark. Each forest hex holds a pool of **150 wood** (raised from 100 after the economy simulations, see §8.1).
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
   and a bot takes their place**. They can **step back in later**, taking over their slot at whatever progress the
   bot has reached (decided). If they have no outpost yet at that point, they place their first outpost then,
   outside the turn order.
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
- Automatically cuts trees at **0.25 wood/second** (halved twice from 1, designer decision after playtest).
- It **wanders randomly within its hex** as an animation to show it's active. This has no gameplay effect.
- The cut wood forms **one log stack**, drawn **at the bottom of the same hex**. It doesn't take up another hex.
- When a forest hex's wood pool reaches 0, **the forest disappears from that hex.** The log stack stays there.
- **Relocation (decided):** the woodchopper then **moves automatically to an adjacent forest hex**: a free one (no
  structure) inside the owner's territory, choosing the one with the most wood left. If none is free it **stays
  idle** and moves as soon as one becomes free.
- Spent forests can be regrown by a **forest guard** (§8.7).

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
  - **Empty A (decided):** if A has no wood, the carrier goes to the **nearest hex on its row with wood** (inside the
    owner's territory, not past rock or water), takes it, still drops at B, then returns to A and repeats.
    It can't collect wood stuck behind a dam (that wood is still floating).
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
- Base stats: **capacity 5**, **speed 0.5 hex/second** (halved from 1 in playtest 3).
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
- **50% catch (decided, revised in playtest 2):** a dock catches **max(1, half of the pile rounded down to whole
  wood)**, and never more than fits. So 1 → 1, 2 → 1, 3 → 1, 5 → 2, 10 → 5. The rest keeps floating.
  - Example: capacity 25, holding 17, a pile of 10 passes → 8 are caught, 2 keep floating.
- **Any player's dock can catch any floating wood.**
- A dock adjacent to a factory **dispenses 1 wood/second** into it (upgradable). The dispense timer is there so the dock doesn't empty instantly, which would make its capacity pointless.
- A dock not adjacent to a factory needs a **carrier** (A = dock, B = factory).

### 6.6b Passive income (decided)
- Every player always gets **1 wood every 5 s** (0.2 wood/s), straight into their wood count, once the game is
  running (not during the starting turns). Bots too.

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

### 7.3a Stone (decided, playtest 2)
- **Stone** is a second resource, counted and shown next to wood. What it's used for comes later.

### 7.3b Warehouse (decided, fixes a playtest bug)
- A crafted item goes to your hand. If it **can't be placed anywhere** at that moment (e.g. a factory-mill with no
  free riverside in your territory), it goes to the **warehouse** instead.
- While holding an item you can **put it in the warehouse** (like a bin), and later **click it in the warehouse**
  to pick it up and place it.
- The warehouse panel is **always visible**, even when empty (decided, playtest 2).

### 7.3c Hammer (decided)
- A tool that **destroys one of your own structures** (any except outposts) **or units** (carriers, forest guards;
  decided) and leaves **50% of its wood cost** as a pile on that hex, for carriers to collect. On a water hex
  (bridge, dam) that wood becomes a **floating pile**.
- **How to use it (decided):** either click the **hammer icon** in an item's hover pop-up (§12), or pick up the
  **hammer** tool and hover the map: your dismantlable items are highlighted. Either way a confirmation asks
  **"Are you sure you want to dismantle?"** before anything is destroyed.
- **Dismantling takes time (decided, M6):** as long as crafting that item would take right now. The item keeps
  working until it's gone. Dismantling a **burning** item leaves **no wood** (it burns). Surrender and defeat still
  dismantle at once.

### 7.3d Trading (decided)
- A **Trade** panel: pick another player, type an amount (up to your wood), press **Send**. The wood moves
  instantly from your count to theirs.

### 7.4 Unlocks
- **For playtesting, everything is unlocked at the start.** Cost is the only limit.
- **Future items** were to be unlocked through the factory's New Technologies path, which is now replaced by
  **Efficiency** (§10.3). How future items unlock is an open question (§14).

### 7.5 Playtest mode (decided, playtest 3)
- A **Playtest mode** switch at the top of the screen, for the whole match: any player can turn it on or off at
  any time.
- While it's on, **crafting costs and upgrade costs are 50%**, and **crafting times and research times are 50%**
  (placeholders, in `config.json`). An item already crafting or researching keeps the time it started with.

## 8. Structures and machines

> **Terms:** **structure** and **building** mean the same thing and are used interchangeably: anything that stands
> on a hex and occupies it (outpost, factory-mill, dock, woodchopper, bridge, dam, workshop, excavator). **Units**
> move and don't occupy a hex (carrier, catapult, forest guard, stone cutter).

### 8.1 Base stats *(placeholder costs, times and HP)*
Craft times are base times, before the factory-mill reduction (§6.7).

| Item | Cost | Craft time | HP | Other stats |
|---|---|---|---|---|
| Outpost | 48 | 30 s | 150 | Territory radius 3 |
| Factory-mill | 57 | 45 s | 200 | Riverside; reduces craft time (§6.7); one queue slot (§7.2) |
| Dock | 19 | 20 s | 80 | Capacity 20, dispenses 1 wood/s to an adjacent factory |
| Carrier | 10 | 10 s | 30 | Capacity 5, speed 0.5 hex/s, max A-to-B distance 5 hexes |
| Woodchopper | 14 | 15 s | 40 | 0.25 wood/s |
| Bridge | 29 | 20 s | 120 | Lets wheeled units cross a river |
| Dam | 29 | 20 s | 240 | Stops floating wood (§8.4b); HP doubled in playtest 2 |
| Forest guard | 24 | 20 s | 40 | Moving unit; regrows spent forests around it (§8.7) |
| Stone cutter | 48 | 30 s | 40 | Moving unit on a rock; breaks it for 1 stone (§8.4d) |
| Excavator | 38 | 30 s | 100 | Digs an empty land hex in 3 min, then is used up (§8.4c) |
| Workshop | 48 | 30 s | 120 | Where upgrades (the dev tree) are bought |
| Catapult | 57 | 40 s | 80 | Range 4 hexes, 10 dmg/hit, 0.5 hits/s, speed 0.5 hex/s |

Fixed values: starting wood **50**, forest **150 wood per hex**.

**Economy rebalance (decided, after simulations):** costs are **95%** of the previous placeholders (rounded) and forests
hold **150 wood** (was 100); woodchopping stays at 0.25 wood/s. Target: a player who plays well (expands, carries
wood straight into factory-mills, replants with forest guards, wastes nothing) **never falls back to living on
passive income**: in every minute more wood reaches their factory-mills than passive income gives. This is the
highest price level that met the target on all tested seeds; findings and method in BOT-STRATEGY.md and
`npm run econ-sim`.

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

### 8.4b Dam (decided, was a future item)
- Placed on **any river hex inside your territory** (or a conflict zone).
- **On a fork** (the first hex of a branch right below a fork): that branch is shut, and piles take the **other
  branch**. It takes no damage there.
- **Anywhere else:** it stops floating wood. **Wood piles up behind it** (on the hex upstream). **Docks** next to
  that hex can catch it (they get a new try every second); **carriers cannot**. River pressure wears it down:
  **HP loss = river strength × time × (1 − relief)** (placeholder: 1 HP per second per strength), until it breaks
  and the wood floats on. **HP: 240** (doubled in playtest 2).
- **Pressure relief (decided, playtest 2):** if the water held back by the dam can flow away through **dug hexes**
  (§8.4c), the dam takes less pressure. From the hex just above the dam, follow the water through dug hexes:
  - If it **joins another river** or **reaches the southern edge**: relief **100%** (pressure 0, the dam holds forever).
  - Otherwise it ends in a dead end: **N** = number of dug hexes the water can spread into, and
    **relief = 1 − 0.9^N** (1 hex = 10%, 2 = 19%, … never 100% on its own).
  - Wood that floats into a dead-end dug channel **gets stuck** there (docks next to it can still catch it).
- A dam on the first hex of a branch right below a natural fork is the same rule: the water goes down the other
  branch, which reaches the edge, so relief is 100%.
- Only wood stops: the water itself, river strength and factory-mill bonuses below the dam are unchanged.
- Carriers can't cross a dam.

### 8.4c Excavator (decided, playtest 2)
- Placed on **empty land you control** (no forest, rock, structure or water). It **digs for 3 minutes**, then it is
  **used up** and the hex is **dug** for good.
- A dug hex **fills with water as soon as water can flow into it**: water flows only **down** (to the two hexes
  below, south-west and south-east), never sideways or up. So a dug hex fills when the hex above it (north-west or
  north-east) is water. Filled dug hexes are water for everything (wood floats in them, docks catch from them,
  bridges and dams can go on them, carriers can't cross them).
- A river that touches a filled dug hex below it **forks** into it (wood takes either way 50/50, like a fork).
- Water in dug hexes has **flow strength 0 in the first dug hex**, and **+1 for each dug hex further along**. This
  strength counts for dam pressure and for factory-mill watermills (a watermill on dug water belongs to the river
  it branches from; strength 0 gives no bonus).
- A dug hex that isn't filled yet is a **dry ditch**: nothing can be built on it (carriers can still drive over it).

### 8.4d Stone cutter (decided, playtest 2)
- A **moving unit** placed **on a rock** in your territory. It slowly breaks the rock: **5 minutes of game time per
  rock for one cutter**. **Several cutters on the same rock add up** (2 cutters: 2.5 min).
- When the rock is gone, its owner gets **1 stone**, **all cutters on it are used up**, and the hex becomes land.
- With several players' cutters on one rock, the stone goes to the owner of the cutter that has been on it
  longest, i.e. the one placed first (interpretation, to confirm).

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
- **Decided (M5):**
  - **A moving unit**, like carriers and forest guards: it doesn't occupy a hex, and it passes through units,
    forests and structures, but not rocks or water (it crosses water on bridges). Placed on land in your territory.
  - **Legal targets:** **other players'** items, **structures and units alike**, standing on a hex that is a
    **conflict zone inside your own territory** (covered by your outposts and by another player's). Neutral items
    and your own are never targets. Anything outside your outposts' sight can't be targeted.
  - **Movement:** it only moves **inside your own territory** (conflict zones included). It picks the closest legal
    target, drives to a hex from which the target is in range, stops and fires. If no hex in range can be reached,
    it gets as close as it can.
  - **Thinking:** every **1 s** it looks again and switches to the **closest legal target**. A target that leaves
    the legal zone (e.g. a carrier driving out) is dropped then. If the next closest target is far away, the
    catapult heads there and turns back as soon as a closer one is legal again; this can stall it. It's the owner's
    job to fix that, by extending their sight with a new outpost or by dismantling the catapult and placing a new one.
  - **Out of territory:** a catapult is **not tied to any hex** and keeps its owner. If the ground under it stops
    being yours (your outpost was destroyed), it **drives back to the closest hex of your territory** (conflict zone
    or not) and doesn't fire on the way. If rocks or water block every path it **waits, facing where it wants to
    go**, and can still be attacked. It drives back as soon as a path opens; if a new outpost reclaims the ground
    under it, it behaves normally again.
  - **Shots fly in an arc** (about 1 s, placeholder) and land **where the target was when the shot was fired**.
    Moving targets can **dodge** them. On landing: a very small impact effect and a **red damage number** that rises
    above the target and fades.

### 8.7 Forest guard (decided; replaces the gardener)
- A **moving unit**, crafted and placed like a carrier (it doesn't occupy a hex). Placed on a land hex in your
  territory; it **patrols that hex and the hexes around it (range 1)**. Placeholders: 24 wood, 20 s, 40 HP.
- On a hex that **used to be forest** and is now empty, it **plants a baby forest**.
- A baby forest grows only while it has growth time. Each visit, where the guard **attends it for 5 s**, gives it
  **10 s of growth**. It needs **60 s** of growth in total, so **6 visits**, then it's a full forest again (a full wood pool).
- The guard walks **1 hex per 2.5 s** and always goes to the baby forest (or empty ex-forest hex) that needs it
  most. So one baby forest regrows in exactly **60 s**; two take **90 s** (he goes back and forth); in general
  **max(60 s, 45 s × number of baby forests)** (a little more when two of them aren't next to each other).
- A baby forest **blocks building like a forest**, and woodchoppers can't cut it until it's full grown.
- The gardener (as a woodchopper evolution) is dropped. The old Gardener upgrade paths may become forest guard
  upgrades in M6.

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
- **Ownership rule (decided, M5):** what counts is only **who covers the hex right now**, not the order of events:
  - An item **keeps its owner** as long as one of the owner's outposts covers its hex (even if other players
    cover it too).
  - If the owner no longer covers it: covered by **exactly one** other player → it **passes to that player**;
    covered by **nobody**, or by **two or more** other players → it becomes **neutral**.
  - A neutral item covered by exactly one player passes to them; covered by several, it stays neutral.
  - Units count by a fixed hex: a **carrier** by its pickup hex A, a **forest guard** by its home hex, a **stone
    cutter** by its rock. **Catapults are the exception** (they keep their owner, §8.6).
  - **Capture is only ever through this rule:** an enemy item whose owner still covers its hex can't be captured.
- **Destroyed by an attack (decided, M5):**
  - A unit is simply gone (wood a carrier was carrying drops on its hex).
  - A **structure leaves debris** on its hex (on water a bridge or dam leaves none; the hex is water again).
    Debris **blocks building like a forest**; units can move over it. To clear it, place a **woodchopper** on the
    debris: it clears it in **30 s** (placeholder) and leaves **25% of the destroyed structure's wood cost** as a
    log stack there (burnt debris gives none, §9b), then carries on like a woodchopper whose forest ran out (§6.2). Debris can also be **burned** (§9b).
- **Health bars (decided, M5):** an item shows its health bar for a short while when it **takes damage, heals, or
  gets an HP upgrade**, and while you **hover** it. The hover pop-up shows HP too. Otherwise no bars, to avoid clutter.

### 9b. Burning (decided, M6)
Everything is made of wood, so a fire feeds itself until the item is gone.
- **What burns:** structures, units, forests and debris, whoever owns them (including your own).
- **Fire strength** depends on how much of the item's max HP fire has already destroyed, in steps of 10%: under
  20% → strength 10% (also the strength right after catching fire), 20% → 20%, … up to **50% = maximum**.
- **Burn rate** is proportional to strength: at maximum, **10% of max HP per second**, so strength 10% = 2%/s,
  20% = 4%/s, 30% = 6%/s, 40% = 8%/s. The rate is recalculated at each 10% step. A fire nobody adds to reaches
  maximum in about 15 s and destroys the item about 5 s later, whatever its HP.
- **Fire hits add up:** a hit from a fire weapon on a burning item counts as fire damage, so it raises the strength
  faster. A hit on an item that isn't burning sets it on fire.
- **Spreading:** when a fire reaches maximum it spreads to **one random adjacent hex with something on it** that
  isn't burning yet, then again **every 20 s** while the item still stands (placeholder). On that hex it catches
  **one item**: the structure first, else a unit, else the forest, else debris.
- **A burning unit** carries its fire with it.
- **Forests** burn their wood (max HP = a full wood pool, 150); when the wood is gone the hex is a cut forest.
- **Debris** burns too (max HP = its wood value) and is gone when it has burned; the hex is cleared.
- **Burnt out:** a structure destroyed while burning leaves **burnt debris**: it blocks building like debris, can't
  catch fire again, and gives **no wood** when a woodchopper clears it. Units burn away with whatever they carried.
- **No way to put a fire out** for now. The hammer can still take a burning item apart, but its wood burns.
- **Fire weapons:** Fire arrows (Archer L3), Fireball (Catapult Firepower L2: 20 damage, sets the target on fire),
  Firestorm (Firepower L3: Fireball, and the forest on the hex where it lands catches fire if that hex is a conflict
  zone inside the shooter's territory).
- Numbers live in `config.json` under `fire`.

## 10. Dev tree (bought at the Workshop)

### 10.1 Rules
- **Each structure type has 2 upgrade paths.**
- Picking a path **unlocks its further levels** (a single line: L1 → L2 → L3).
- **The other path can still be bought, at a higher price.**
- **An upgrade applies to all existing items of that type and to all future ones.**
- There are **no base-HP paths**. HP comes from the factory's Improved Frames.
- **Research (decided):** upgrades are bought at a **workshop** (you need at least one). You pay, then it researches
  for the listed time, **one upgrade at a time per player**, with a progress bar; the effect starts when it's done.
- **Workshops pool like factory-mills (decided, playtest 2):** research can be **queued**, one queue slot per
  workshop you own, still researching one at a time. Each extra workshop **cuts research time by 6%** (placeholder),
  on top of Fast Research. Every workshop shows the **research progress icon**, like factory-mills do for crafting.
- **Combat paths (decided):** paths whose effect needs combat (Outpost Archer, Factory Improved Frames, Catapult
  Range/Firepower, Bridge Drawbridge) are **shown but locked until M5**. **M5:** they open, except the levels that
  need **burning** (Fire arrows, Fireball, Firestorm), which open in **M6** with burning (§9b).
- **Archers** (Outpost Archer, Gatehouse archer) follow the catapult's target rules (§8.6): other players' items on
  a conflict zone inside the owner's territory, closest first, re-checked every 1 s.
- **HP upgrades (decided):** when max HP goes up, the extra is **added as healing**, so the damage taken stays the
  same (30/50 → max 80 gives 60/80).
- **Workshop menu (decided):** a **Workshop** tab next to **Build**, available once you own a workshop: a dropdown
  per structure type with **both paths side by side**, each with its **name, short description and cost** per level.

### 10.2 Pricing *(placeholder)*
| | L1 | L2 | L3 |
|---|---|---|---|
| First path picked | 40 wood, 20 s | 80 wood, 40 s | 160 wood, 60 s |
| Second path | ×2 cost | ×2 | ×2 |

### 10.3 Paths (decided; all values placeholders, to be balanced later)
🔒 = needs combat, shown but locked until M5. ★ ideas are accepted as listed. Numbers live in `src/data/upgrades.json`.

| Structure | Path | L1 | L2 | L3 |
|---|---|---|---|---|
| **Outpost** | Reach | radius +1 (every outpost, the first one too) | +2 | +3 |
| | Archer 🔒 | archer: range 2, 5 dmg, 1 hit/s | range 3, 8 dmg | Fire arrows: burning damage |
| **Factory-mill** | Efficiency | crafting cost −10% | −20% | −30% |
| | Improved Frames 🔒 | all your structures +15% HP | +30% | +50% |
| **Dock** | Capacity | 20 → 40 | → 70 | → 100 |
| | Dispense | 1 → 2 wood/s | → 3 wood/s | Chute: feeds a factory-mill up to 2 hexes away |
| **Carrier** | Capacity | 5 → 10, −10% speed | → 15, −20% | → 20, −30% |
| | Mobility | +20% speed, route 5 → 6 | +40%, → 7 | +60%, → 8 |
| **Woodchopper** | Output | 0.25 → 0.375 wood/s | → 0.5 | → 0.75 |
| | Log Slide | on a riverside forest, slides wood from its stack into the river at 0.125 wood/s | 0.25 wood/s | also when the river is 2 hexes away |
| **Bridge** | Drawbridge | other players' wheeled units can't cross | Grate: piles stop at the bridge as wood your carriers can pick up there | 🔒 gatehouse archer (like Outpost Archer L1) |
| | Causeway | your wheeled units +50% speed for 10 s after crossing | spans 2 water hexes along its row | spans 3 |
| **Workshop** | Discount | upgrades −10% cost | −20% | −30% |
| | Fast Research | research time −20% | −35% | −50% |
| **Catapult** | Range 🔒 | 4 → 5 | → 6 | → 7 |
| | Firepower 🔒 | 10 → 15 dmg | Fireball: 20 + burning | Firestorm: burns forests in conflict zones |
| **Forest guard** | Growth | growth per visit 10 → 12.5 s | → 15 s | → 20 s |
| | Afforest | also turns 1 empty land hex in its area into forest | 2 hexes | 🔒 also in conflict zones |
| **Dam** | *(no paths for now)* | | | |

Interpretations used to build the ★ ideas (decided by Claude, easy to change):
- **Log Slide** moves wood the woodchopper already cut (its stack) into the river; it doesn't make extra wood.
- **Grate:** a pile that reaches a grated bridge stops and becomes a wood stack on the bridge, which only the bridge
  owner's carriers can pick up.
- **Causeway span** counts along the bridge's row (east–west), the way carriers move.
- **Afforest** counts per forest guard: each can turn that many empty land hexes into forest (they regrow normally).
- The hover pop-up shows path levels, e.g. "Woodchopper · Output 2".

## 11. Winning and losing

- **Victory:** by domination, or when the other players surrender.
- **Domination (decided):** once **every other player's outposts are destroyed**, the last player with outposts wins.
- **Surrender (decided):** a **Surrender** button with a **white flag icon and text**, with a confirmation. On
  surrendering, **all the player's outposts and all military items (catapults) are dismantled**, and **everything
  else they own becomes neutral** (§9).
  - Dismantled here works like the hammer (§7.3c): half the cost is left as wood on the hex (confirmed).
- **Defeat (decided, M5):** when a player loses their last outpost, their **catapults are dismantled** the same way,
  and everything else follows the ownership rule (§9).
- **End of match (decided, M5):** a **victory / defeat banner**, the match stops, and a **Back to lobby** button. A
  defeated player keeps watching until the match ends. The end screen shows **statistics per player**: wood
  chopped, wood collected, damage dealt, units crafted, structures crafted, territory owned, outposts destroyed.
- **Match record (decided, M5):** the match is recorded **in memory only** while the session runs, for analysis;
  the end screen has a **Download match log** (JSON) button. Nothing is kept after the tab closes.
- **Neutral items keep working (decided):** a neutral dock keeps catching wood, a neutral carrier keeps moving wood,
  a neutral woodchopper keeps cutting, and so on. A neutral factory-mill piles the wood it receives outside (§6.7).
  **HP stays the same** when an item turns neutral.
- **Defeat:** a player with **no outposts** controls no territory and no structures, and is **out of the game**.
- **A player with no factories is still alive.** They can't develop, but their offensive machines keep working, and they
  can come back by **capturing** an enemy or neutral factory with an outpost.
- **Pacing:** development should **snowball**, so the leader's advantage grows and the endgame speeds up.

## 12. UI

- Top right: wood count (large, with icon) and the build dropdown (§7.1), with the **Workshop** tab next to it.
- **Playtest 2 (decided):** the Build, Hammer, Workshop, Warehouse and Trade buttons are **twice as big**; the
  warehouse panel is always visible. Art: the **dock** pokes out of its hex into the water, the **bridge** is curved
  so it meets the land on both sides, and the **workshop** has a small **tower** so it's easy to tell apart from
  factory-mills.
- **Hover pop-up (decided):** hovering a structure or unit on the map **outlines it in its owner's colour** and shows a
  small pop-up with its **name, level and a very short description of what it does** (e.g. "Woodchopper lv2 · cuts
  0.5 wood/s"). For your own dismantlable items it also shows a **hammer icon** (§7.3c).
  When a unit stands on a structure, the pop-up is about the structure (carriers often wait on one); a unit gets the
  pop-up wherever it stands on a hex without a structure.
- Everything else about the UI is **to be discussed later**.

## 13. Future items (noted, not designed)

- ~~**Dam**~~: designed now (§8.4b).
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
   ~~Catapults~~: decided, they **pass through units** (like carriers), not through rocks or water.
5. **Bot strategy:** bots use the same rules as humans, but how they decide what to do is not designed yet.
   Until then (decided for M4), bot slots stay **idle**: they skip their starting turn and do nothing.
   **Context for bot strategy (designer note, M5):** catapults can stall when the closest legal target is far away
   or blocked (§8.6). A good player (and bot) handles that by **extending sight with a new outpost** or by
   **dismantling and relocating** the catapult.
   **Disconnects (decided):** a player who disconnects mid-match sends no more commands, but everything they own
   keeps working. If the host disconnects, the match ends.
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
12. ~~**Gardener**~~: decided, replaced by the **forest guard** unit (§8.7). Its upgrade paths: M6.
13. ~~**Bridges (§8.4)**~~: decided, measured in **any direction**, and bridge pieces **join**: a straight run of
    bridge pieces with land at both ends is a working bridge.
