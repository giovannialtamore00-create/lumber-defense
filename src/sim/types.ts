// GameState, entities and commands (ARCHITECTURE.md §6). Everything here is plain data with integer numbers.
import type config from '../data/config.json';
import type upgrades from '../data/upgrades.json';
import type { Rng } from './rng';

export type Config = typeof config;
export type UpgradesData = typeof upgrades;

/**
 * The factory is the unified factory-mill (DESIGN §6.7): built on the riverside. The catapult is placed and stands
 * idle until its behaviour arrives in M5.
 */
export type StructureKind = 'outpost' | 'factory' | 'dock' | 'woodchopper' | 'bridge' | 'dam' | 'workshop' | 'catapult' | 'excavator';
/** Moving units (don't occupy a hex): the carrier and the forest guard (DESIGN §6.4, §8.7). */
export type ItemKind = StructureKind | 'carrier' | 'forestGuard' | 'stoneCutter';

/** An item in the craft queue. `totalTicks` is fixed when the item starts crafting (0 = still waiting). */
export interface CraftJob {
  item: ItemKind;
  totalTicks: number;
  doneTicks: number;
}

export interface Player {
  id: number;
  region: number;
  /** Wood count, milli-wood. */
  wood: number;
  /** Stone count, whole stones (DESIGN §7.3a). */
  stone: number;
  /** Crafted items waiting to be placed, oldest first. */
  hand: ItemKind[];
  /** Crafted items put aside: unplaceable when crafted, or binned from the hand (DESIGN §7.3b). */
  warehouse: ItemKind[];
  /** Paid items being crafted, one at a time, oldest first (DESIGN §7.2). */
  queue: CraftJob[];
  /** True once the first outpost is placed. */
  started: boolean;
  /** Controlled by a bot: an empty slot, or a player who ran out of time on their starting turn (DESIGN §5). */
  bot: boolean;
  /** Dev tree (DESIGN §10): one entry per type in upgrades.json order. */
  upgrades: UpgradeProgress[];
  /** Upgrades bought and waiting at the workshop, researched one at a time, first in line first (DESIGN §8.5). */
  research: Research[];
}

export interface UpgradeProgress {
  /** Level bought on each of the type's two paths (0–3). */
  levels: [number, number];
  /** The path picked first (cheaper), or -1 before any. */
  first: number;
}

export interface Research {
  /** Index of the type in upgrades.json. */
  type: number;
  path: number;
  level: number;
  /** Fixed when it starts researching (0 = still waiting). */
  totalTicks: number;
  doneTicks: number;
}

/** Match start (DESIGN §5): players place their first outposts in turns, then the game runs in real time. */
export interface StartTurns {
  /** Player ids in turn order (random each game). */
  order: number[];
  /** Index into `order` of the player whose turn it is. */
  current: number;
  /** Ticks left on the current player's timer. */
  ticksLeft: number;
  /** True once a human has had their turn: the first human gets the longer timer, the rest the shorter one. */
  firstUsed: boolean;
}

export interface Structure {
  id: number;
  type: 'structure';
  kind: StructureKind;
  owner: number;
  q: number;
  r: number;
  hp: number;
  /** Outposts only: territory radius in hexes (the first outpost's is smaller, DESIGN §5). */
  radius?: number;
  /** Woodchoppers with Log Slide: wood (milli) slid towards the river so far (DESIGN §10.3). */
  slideAcc?: number;
  /** Excavators: ticks dug so far (DESIGN §8.4c). */
  workTicks?: number;
  /** Dams: river pressure damage not yet taken off HP, in milli-HP (DESIGN §8.4b). */
  damageAcc?: number;
}

/** A carrier loops A → B along one row (DESIGN §6.4). Positions are milli-hex along the row's q axis. */
export interface Carrier {
  id: number;
  type: 'carrier';
  owner: number;
  r: number;
  aQ: number;
  bQ: number;
  /** Where it's heading to pick up: A, or the nearest wood on its row when A is empty (DESIGN §6.4). */
  pickupQ: number;
  /** River drop-off: q of the river hex the load is dropped into. Factory drop-off: null. */
  riverQ: number | null;
  posQ: number;
  phase: 'toA' | 'toB';
  /** Carried wood, milli-wood. */
  load: number;
  hp: number;
  /** Ticks of Causeway speed boost left (DESIGN §10.3). */
  boostTicks: number;
}

/** A floating pile keeps its own value and never merges (DESIGN §6.5). */
export interface Pile {
  id: number;
  type: 'pile';
  q: number;
  r: number;
  /** Milli-wood. */
  amount: number;
  /** Milli-hex travelled towards the next river hex. */
  progress: number;
}

/**
 * A forest guard patrols its home hex and the hexes around it, planting baby forests on spent forest hexes and
 * attending them so they grow (DESIGN §8.7). It walks hex to hex.
 */
export interface ForestGuard {
  id: number;
  type: 'guard';
  owner: number;
  homeQ: number;
  homeR: number;
  /** The hex it stands on (or is leaving). */
  q: number;
  r: number;
  /** The hex it's walking to, or null when standing. */
  toQ: number | null;
  toR: number | null;
  /** Ticks walked towards (toQ, toR). */
  moveTicks: number;
  /** Ticks left attending the hex it stands on. */
  attendTicks: number;
  /** Empty land hexes it has turned into forest (Afforest upgrade). */
  afforested: number;
  hp: number;
}

/** A stone cutter stands on a rock and slowly breaks it (DESIGN §8.4d). Several can share one rock. */
export interface StoneCutter {
  id: number;
  type: 'cutter';
  owner: number;
  q: number;
  r: number;
  hp: number;
}

export type Entity = Structure | Carrier | Pile | ForestGuard | StoneCutter;

export interface GameState {
  tick: number;
  rng: Rng;
  /** 'start' while players take their starting turns (nothing else runs), then 'running'. */
  phase: 'start' | 'running';
  startTurns: StartTurns;
  players: Player[];
  /** Always sorted by id: new entities are appended with increasing ids, removal keeps order. */
  entities: Entity[];
  nextId: number;
  /** Remaining wood in each forest hex, milli-wood, indexed like map.hexes. 0 = no forest. */
  forestPool: number[];
  /** Log stack on each hex (forest, dock), milli-wood, indexed like map.hexes. */
  stacks: number[];
  /** Bitmask of players whose outposts cover each hex, indexed like map.hexes. */
  coverage: number[];
  /** Baby forest growth per hex, in ticks (-1 = no baby forest), indexed like map.hexes (DESIGN §8.7). */
  saplingGrowth: number[];
  /** Ticks of growth a baby forest has left from its last visit, indexed like map.hexes. */
  saplingCredit: number[];
  /** Land hexes that became forest through Afforest (they count as former forest afterwards). */
  grownForest: boolean[];
  /** Rocks broken by stone cutters (the hex is land now). Indexed like map.hexes. */
  rockGone: boolean[];
  /** Ticks of cutting done on each rock (one cutter adds 1 per tick). */
  rockWork: number[];
  /** Hexes dug by an excavator (DESIGN §8.4c). */
  dug: boolean[];
  /** Dug hexes that water has filled. */
  dugWater: boolean[];
  /** Flow strength of filled dug hexes: 0 in the first, +1 for each further one. */
  dugStrength: number[];
  /** Which river a filled dug hex belongs to (the one it branches from); -1 otherwise. */
  dugRiver: number[];
}

export type Command =
  | { type: 'placeOutpost'; player: number; q: number; r: number }
  | { type: 'place'; player: number; item: StructureKind; q: number; r: number }
  | { type: 'placeCarrier'; player: number; aQ: number; bQ: number; r: number }
  /** Pay for an item and add it to the craft queue (DESIGN §7.2). */
  | { type: 'craft'; player: number; item: ItemKind }
  /** A player whose slot a bot took over steps back in (DESIGN §5). */
  | { type: 'takeControl'; player: number }
  /** Put the item in hand into the warehouse (DESIGN §7.3b). */
  | { type: 'store'; player: number }
  /** Take warehouse item `index` back into the hand, to place next. */
  | { type: 'retrieve'; player: number; index: number }
  /** Dismantle one of your own structures (not outposts) or units for a 50% refund (DESIGN §7.3c). */
  | { type: 'dismantle'; player: number; id: number }
  /** Buy the next level of a path at the workshop (DESIGN §10). `type` indexes upgrades.json. */
  | { type: 'buyUpgrade'; player: number; upgradeType: number; path: number }
  /** Place a forest guard from the hand on hex (q, r) (DESIGN §8.7). */
  | { type: 'placeGuard'; player: number; q: number; r: number }
  /** Place a stone cutter from the hand on a rock (DESIGN §8.4d). */
  | { type: 'placeCutter'; player: number; q: number; r: number }
  /** Give `amount` whole wood to another player (DESIGN §7.3d). */
  | { type: 'give'; player: number; to: number; amount: number };
