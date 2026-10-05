import type { SimContext } from './context';
import { toMilli } from './fixed';
import { type Rng, createRng, nextInt } from './rng';
import { MILLI } from './fixed';
import type { Hex } from './hex';
import type { Entity, GameState, ItemKind, Ownable, Structure } from './types';

/** Fisher–Yates with the seeded RNG. */
function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

/**
 * New match (DESIGN §5): regions and the starting turn order are random from the seed. `bots[i]` marks slots a bot
 * fills (no human in that slot).
 */
export function createInitialState(ctx: SimContext, playerCount: number, seed: number, bots: boolean[] = []): GameState {
  const { map, config } = ctx;
  const rng = createRng(seed);
  const regions = shuffle(rng, [...Array(config.mapRules.regionCount).keys()]);
  const order = shuffle(rng, [...Array(playerCount).keys()]);

  return {
    tick: 0,
    rng,
    phase: 'start',
    winner: null,
    playtest: false,
    startTurns: { order, current: 0, ticksLeft: config.startTurns.firstTurnS * config.tickRate, firstUsed: false },
    players: [...Array(playerCount).keys()].map((id) => ({
      id,
      region: regions[id]!,
      wood: toMilli(config.startingWood),
      stone: 0,
      hand: [],
      warehouse: [],
      queue: [],
      started: false,
      bot: bots[id] ?? false,
      upgrades: ctx.upgrades.types.map(() => ({ levels: [0, 0] as [number, number], first: -1 })),
      research: [],
      defeated: false,
      stance: 'destruction',
      stats: { woodChopped: 0, woodCollected: 0, damageDealt: 0, unitsCrafted: 0, structuresCrafted: 0, outpostsDestroyed: 0, woodSpent: 0 },
    })),
    entities: [],
    nextId: 1,
    forestPool: map.hexes.map((h) => (h.terrain === 'forest' ? toMilli(h.woodPool ?? config.forest.woodPool) : 0)),
    stacks: map.hexes.map(() => 0),
    coverage: map.hexes.map(() => 0),
    saplingGrowth: map.hexes.map(() => -1),
    saplingCredit: map.hexes.map(() => 0),
    grownForest: map.hexes.map(() => false),
    rockGone: map.hexes.map(() => false),
    rockWork: map.hexes.map(() => 0),
    dug: map.hexes.map(() => false),
    dugWater: map.hexes.map(() => false),
    dugStrength: map.hexes.map(() => 0),
    dugRiver: map.hexes.map(() => -1),
    debris: map.hexes.map(() => 0),
    debrisBurnt: map.hexes.map(() => false),
    forestFire: map.hexes.map(() => null),
    debrisFire: map.hexes.map(() => null),
  };
}

export function addEntity<E extends Entity>(state: GameState, e: Omit<E, 'id'>): E {
  const entity = { ...e, id: state.nextId++ } as E;
  state.entities.push(entity);
  return entity;
}

export function removeEntity(state: GameState, id: number): void {
  const i = state.entities.findIndex((e) => e.id === id);
  if (i >= 0) state.entities.splice(i, 1);
}

export function structures(state: GameState): Structure[] {
  return state.entities.filter((e): e is Structure => e.type === 'structure');
}

/** The structure on a hex (one per hex, DESIGN §4.1). */
export function structureAt(state: GameState, q: number, r: number): Structure | undefined {
  return state.entities.find((e): e is Structure => e.type === 'structure' && e.q === q && e.r === r);
}

export function isOwnable(e: Entity): e is Ownable {
  return e.type !== 'pile' && e.type !== 'shot';
}

/** The item kind of an ownable entity (its config entry). */
export function kindOf(e: Ownable): ItemKind {
  switch (e.type) {
    case 'structure':
      return e.kind;
    case 'carrier':
      return 'carrier';
    case 'guard':
      return 'forestGuard';
    case 'cutter':
      return 'stoneCutter';
    case 'catapult':
      return 'catapult';
  }
}

/** The hex an item stands on now (a carrier: the hex it's closest to). */
export function hexOf(e: Ownable): Hex {
  return e.type === 'carrier' ? { q: Math.round(e.posQ / MILLI), r: e.r } : { q: e.q, r: e.r };
}
