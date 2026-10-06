# ARCHITECTURE.md

Technical architecture for the game described in `DESIGN.md`. **`DESIGN.md` is the source of truth for gameplay.**
If something isn't in `DESIGN.md` or is listed under its Open Questions, **ask the designer instead of inventing it.**

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Shared types between sim, net and rendering |
| Engine | **Phaser 3** | Mature 2D browser engine, good for isometric sprites, small bundle |
| Build | **Vite** | Fast dev server; `vite build` outputs a static folder |
| Networking | **PeerJS** (WebRTC data channels) | Peer-to-peer, free public signaling, no server to deploy |
| Tests | **Vitest** | Headless tests for the simulation |
| Hosting | **itch.io** (HTML5 game, zip of `dist/`) | Static hosting only; nothing server-side |

Vite needs `base: './'` so asset paths work inside itch.io's iframe.

## 2. Guiding principles

1. **Deterministic lockstep simulation.** Only player **commands** go over the network. Every client runs the same
   simulation and ends up in the same state. This fits the game well: players only craft, place and upgrade,
   and everything else is automatic, so traffic stays tiny however many piles, carriers and catapults exist.
2. **The sim is pure.** `src/sim/` has **no Phaser, no DOM, no network, no `Math.random`, no `Date.now`**. It's
   plain TypeScript that can run in Node for tests.
3. **Rendering only reads.** Phaser code reads sim state and draws it, interpolating between ticks. It never mutates the sim.
4. **All numbers are data.** Every balance value (costs, times, HP, rates, upgrade effects, thresholds) lives in
   `src/data/*.json`. No gameplay number is hard-coded.
5. **One rule implementation.** Placement legality, territory and so on are sim functions. The UI calls the same
   functions for green/red previews, so the preview can never disagree with the sim.

## 3. Folder layout

```
/
├─ DESIGN.md, ARCHITECTURE.md, CLAUDE.md
├─ index.html, vite.config.ts, tsconfig.json, package.json
├─ src/
│  ├─ main.ts                    # boots Phaser
│  ├─ sim/                       # PURE deterministic game logic
│  │  ├─ types.ts                # GameState, entities, Command types
│  │  ├─ state.ts                # createInitialState(map, config, players, seed)
│  │  ├─ tick.ts                 # step(state, commands): advances one tick
│  │  ├─ commands.ts             # validate + apply player commands
│  │  ├─ hex.ts                  # axial coords, neighbours, distance, rings, radius
│  │  ├─ fixed.ts                # fixed-point helpers (see §5)
│  │  ├─ rng.ts                  # seeded PRNG (e.g. mulberry32)
│  │  ├─ pathfinding.ts          # A* on hexes, deterministic tie-breaking
│  │  ├─ hash.ts                 # state checksum for desync detection
│  │  └─ systems/
│  │     ├─ territory.ts         # outpost coverage, conflict zones, ownership, capture, neutral
│  │     ├─ placement.ts         # isLegalPlacement(state, player, item, hex[, hexB])
│  │     ├─ forest.ts            # woodchoppers, forest pools, depletion (gardener = woodchopper upgrade, M6)
│  │     ├─ carriers.ts          # A→B loop, capacity, speed, pathing
│  │     ├─ river.ts             # flow graph, floating piles, edge despawn
│  │     ├─ docks.ts             # catching (partial), dispense timer to adjacent factory
│  │     ├─ economy.ts           # factory intake, wood count, neutral factory stacks
│  │     ├─ crafting.ts          # queue (one slot per factory-mill), factory-mill craft-time reduction
│  │     ├─ upgrades.ts          # dev tree purchase + effect application
│  │     ├─ combat.ts            # catapult targeting/movement/firing, archers, damage, destruction
│  │     └─ victory.ts           # defeat (no outposts), surrender, victory
│  ├─ data/
│  │  ├─ config.json             # base stats + global numbers (DESIGN §8.1)
│  │  ├─ upgrades.json           # dev tree (DESIGN §10)
│  │  └─ maps/map02.json   (map01.json kept for older tests)
│  ├─ net/
│  │  ├─ transport.ts            # Transport interface
│  │  ├─ peerTransport.ts        # PeerJS implementation
│  │  ├─ localTransport.ts       # in-memory (single player, tests)
│  │  ├─ lobby.ts                # room code, join, slots, start
│  │  └─ lockstep.ts             # command scheduling, tick bundles, hash checks
│  ├─ bots/
│  │  └─ bot.ts                  # runs on host only, emits normal Commands
│  └─ game/                      # Phaser layer
│     ├─ scenes/                 # BootScene, LobbyScene, GameScene, UIScene
│     ├─ iso.ts                  # hex ↔ isometric screen projection, depth sorting
│     ├─ render/                 # terrain, rivers, structures, units, piles, stack icons, territory overlay
│     ├─ input/                  # camera pan/zoom, placement hand, carrier A→B drag
│     └─ ui/                     # wood counter, build dropdown, craft queue, workshop panel
├─ tools/
│  └─ validate-map.ts            # checks map rules from DESIGN §4.3
└─ tests/                        # vitest: sim systems + determinism
```

## 4. Map and hex grid

- **Axial hex coordinates** `(q, r)`. Screen position = standard hex-to-pixel, then an **isometric projection**
  (vertical squash) in `game/iso.ts`. The sim never knows about screen space.
- **Depth sorting** by screen y, so things further south draw on top.
- **Map file (`maps/*.json`):**
  - `hexes`: list of `{ q, r, terrain: "land" | "forest" | "river" | "rock", region: 0..3, woodPool? }`
  - `riverFlow`: for each river hex, its **downstream** river hex(es), or `"exit"` at the southern edge. This
    supports forks and merges. At a fork, which branch a pile takes must be deterministic, e.g. alternating per pile or a fixed rule in data.
- **`tools/validate-map.ts`** checks DESIGN §4.3:
  - about 300 hexes, 4 regions of about 75
  - about 20 forest hexes per region
  - about 5% rock
  - **every radius-3 area fully inside a region has at least 1 forest hex**
  - rivers flow north → south only, and every river path reaches an exit
- The first map is **proposed by the developer and approved by the designer** before gameplay work builds on it.
  The map editor is future work.

## 5. Determinism rules (important)

- **Fixed tick rate: 10 ticks/second.** All per-second values in the config are converted to per-tick values.
- **No floats in sim state.** Use integers with a fixed-point scale. For example:
  - wood and rates in **milli-wood**: 1 wood/s = 100 milli-wood per tick
  - movement progress in **milli-hex**: 1 hex/s = 100 milli-hex per tick
  - percentages in **basis points**
- **No `Math.exp`/`sin`/`pow` in the sim.** They can differ slightly between browsers. Curves are **tables in
  config** instead: the factory-mill river bonus by row (`config.factoryMill.riverBonusBpByRow`), with a linear
  integer reduction up to its cap (DESIGN §6.7).
- **Seeded RNG only** (`rng.ts`), stored in state. Seed chosen by the host at match start. Region assignment uses it.
- **Stable iteration order:** entities in arrays sorted by id. Never iterate over object keys or Sets in a
  gameplay-relevant way.
- **Deterministic A\*:** fixed neighbour order and tie-breaking.
- `hash.ts` computes a checksum of the state. A **determinism test** runs two sims with the same commands and checks their hashes match every tick.

## 6. Simulation model

- `GameState`:
  - `tick`, `rng`, `map`
  - `players[]`: wood count, upgrades, craft queue, item in hand, alive/surrendered
  - `entities[]`: structures, carriers, catapults, floating piles, with ids
  - `stacks`: per hex
- `step(state, commands)` runs the systems in a **fixed order**:
  1. apply commands
  2. crafting
  3. forest
  4. carriers
  5. river
  6. docks
  7. economy
  8. territory
  9. combat
  10. victory
- **Commands** (the only way players change anything):
  - `placeOutpost` (first outpost, in own region)
  - `craft(item)`
  - `place(itemFromHand, hex)`
  - `placeCarrier(hexA, hexB)`
  - `buyUpgrade(structureType, path)`
  - `surrender`
- The sim **validates every command** (affordability, legality). An invalid command is ignored the same way on every client.
- **Pooled crafting:** the time per item comes from `baseTime × (1 − millReduction) / numberOfOwnedFactories`, and cost from
  `baseCost × (1 − millReduction)`, taken at the moment of purchase. Check exact formulas against DESIGN §7.2 and §8.3.
- **Territory** is recomputed when outposts are added or destroyed. For each hex: the set of players covering it
  → owner / conflict / none. After each recompute, apply the neutral and capture rules (DESIGN §9).

## 7. Networking (lockstep over PeerJS)

- **Topology:** a star. The **host** (the player who created the room) is the relay and the clock.
- **Lobby:** the host opens a room, and the PeerJS id is derived from a short **room code**. Friends enter the code.
  The host sees 2–4 slots, and empty slots become bots. The host presses Start and sends `{ seed, players, mapId, configHash }`.
- **Each tick:**
  - Clients send their commands to the host, tagged with the tick they were issued on.
  - The host schedules each command for **`currentTick + inputDelay`** (default 3 ticks = 300 ms) and broadcasts a **tick
    bundle** `{ tick, commands[] }`, even when it's empty.
  - All clients, host included, only step the sim through ticks they have a bundle for. If a client falls behind, it catches up.
- **Hash checks:** every N ticks, clients send `hash(state)`. On a mismatch, the host shows a "desync" warning
  and logs both hashes plus the tick. This is a debugging aid for playtests.
- **Bots run on the host only** and submit ordinary commands through the same pipeline. The bot code itself
  doesn't need to be deterministic.
- **v1 disconnect behaviour (technical default, confirm with designer):**
  - A disconnected client's slot sends no more commands, but everything they own keeps running automatically.
  - If the host disconnects, the match ends.
- **`Transport` interface** (`send`, `onMessage`, `peers`) with `localTransport` for single-player and tests, so a
  dedicated server could later replace PeerJS without touching the sim.
- **NAT note:** some networks block direct WebRTC. Public STUN is used by default. A TURN server can be added in config if friends can't connect.

## 8. Rendering and input

- **Placeholder art first:** simple stylized shapes per structure and machine, tinted with player colors. The final
  stylized icons come later and must fit the same sprite keys.
- **Log stack icon:** a single sprite with 3 frames, picked by amount thresholds from config (DESIGN §6.3). The same
  component is used for forest, dock and neutral factory stacks, with a per-structure offset (dock: bottom right).
- **Crafting progress:** every factory owned by the player shows a grey icon of the current item, filled with color
  from the bottom by progress.
- **Placement hand:** after crafting, the item follows the mouse. Each frame the UI calls
  `isLegalPlacement` → green or red tint. A click sends the `place` command.
- **Carrier placement:** hover shows valid A hexes. Then drag or click to B, with a live check of the max A-to-B distance.
- **Territory overlay:** player-colored borders, and a distinct pattern for conflict zones.
- **Camera:** pan and zoom.
- **Interpolation:** units and piles are drawn between their last two tick positions for smooth motion at 10 Hz.

## 9. Testing

- **Vitest unit tests per system**, for example:
  - partial dock catch (25 capacity, 17 held, pile of 10 → 8 caught, 2 float on)
  - dock dispense 1 wood/s
  - carrier loop
  - pile despawn at the exit
  - territory, conflict and capture
  - defeat when there are no outposts
  - mill curve table
- **Determinism test:** two sims, same seed and commands, run 5,000+ ticks, hashes equal every tick.
- **Map validator** runs in CI or as `npm run validate-map`.

## 10. Build and deploy

- `npm run dev`: local development.
- A local multiplayer test works by opening 2 browser tabs.
- `npm run build`: produces `dist/`. Zip it and upload to itch.io as an HTML5 project ("This file will be played in the browser").

## 11. Milestones

Stop after each milestone for designer playtest and approval.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold | Vite + TS + Phaser + Vitest set up. Blank scene builds and runs from a zipped `dist/` (verify itch.io-style relative paths). `CLAUDE.md` written. |
| **M1** | Map | `map01.json` proposed to DESIGN §4.3 rules, `validate-map` passes, isometric hex rendering with terrain and river flow direction, camera pan and zoom. **Designer approves the map.** |
| **M2** | Economy loop (single player, `localTransport`) | Fixed tick sim. First outpost placed in the region, factory in hand, woodchopper → stack icon stages → carrier A→B → river float → dock (partial catch, capacity, dispense) → factory → wood count. Unit tests pass. |
| **M3** | Crafting and building | Build dropdown, craft confirm, queue, pooled productivity, progress icon on every factory, hand placement with green/red, all DESIGN §7.3 rules, mills with the curve table, bridges, gardener regrowth. |
| **M4** | Multiplayer | PeerJS lobby with room code, 2–4 players, random regions, lockstep bundles, hash check, determinism test. Playable over the internet with friends. |
| **M5** | Conflict | Conflict zones, catapult automatic behaviour, damage, HP, destruction, neutral structures, capture, defeat, surrender, victory. |
| **M6** | Dev tree and burning | Workshop panel, 2-path rules and pricing from `upgrades.json`, effects applied to existing and future items. Burning (DESIGN §9b) and the fire upgrades; timed hammer. |
| **M7** | Bots | Host-side bots that fill empty slots and play by the same rules. The bot strategy is designed with the designer first. |
| **M8** | Playtest build | itch.io upload, basic in-game feedback (desync warning, connection status), balance values easy to edit. |
