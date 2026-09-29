// GameState, entities and commands (ARCHITECTURE.md §6). Everything here is plain data with integer numbers.
import type config from '../data/config.json';
import type { Rng } from './rng';

export type Config = typeof config;

/** The factory is the unified factory-mill (DESIGN §6.7): built on the riverside. */
export type StructureKind = 'outpost' | 'factory' | 'dock' | 'woodchopper';
export type ItemKind = StructureKind | 'carrier';

export interface Player {
  id: number;
  region: number;
  /** Wood count, milli-wood. */
  wood: number;
  /** Crafted items waiting to be placed, oldest first. */
  hand: ItemKind[];
  /** True once the first outpost is placed. */
  started: boolean;
}

export interface Structure {
  id: number;
  type: 'structure';
  kind: StructureKind;
  owner: number;
  q: number;
  r: number;
  hp: number;
}

/** A carrier loops A → B along one row (DESIGN §6.4). Positions are milli-hex along the row's q axis. */
export interface Carrier {
  id: number;
  type: 'carrier';
  owner: number;
  r: number;
  aQ: number;
  bQ: number;
  /** River drop-off: q of the river hex the load is dropped into. Factory drop-off: null. */
  riverQ: number | null;
  posQ: number;
  phase: 'toA' | 'toB';
  /** Carried wood, milli-wood. */
  load: number;
  hp: number;
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

export type Entity = Structure | Carrier | Pile;

export interface GameState {
  tick: number;
  rng: Rng;
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
}

export type Command =
  | { type: 'placeOutpost'; player: number; q: number; r: number }
  | { type: 'place'; player: number; item: StructureKind; q: number; r: number }
  | { type: 'placeCarrier'; player: number; aQ: number; bQ: number; r: number }
  /** Dev builds only (M2 testing, replaced by crafting in M3): puts an item in the player's hand for free. */
  | { type: 'devGive'; player: number; item: ItemKind };
