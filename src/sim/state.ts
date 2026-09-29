import type { SimContext } from './context';
import { toMilli } from './fixed';
import { createRng, nextInt } from './rng';
import type { Entity, GameState, Structure } from './types';

/** New match: regions are assigned at random from the seed (DESIGN §5). */
export function createInitialState(ctx: SimContext, playerCount: number, seed: number): GameState {
  const { map, config } = ctx;
  const rng = createRng(seed);

  // Fisher–Yates with the seeded RNG.
  const regions = [...Array(config.mapRules.regionCount).keys()];
  for (let i = regions.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [regions[i], regions[j]] = [regions[j]!, regions[i]!];
  }

  return {
    tick: 0,
    rng,
    players: [...Array(playerCount).keys()].map((id) => ({
      id,
      region: regions[id]!,
      wood: toMilli(config.startingWood),
      hand: [],
      started: false,
    })),
    entities: [],
    nextId: 1,
    forestPool: map.hexes.map((h) => (h.terrain === 'forest' ? toMilli(h.woodPool ?? config.forest.woodPool) : 0)),
    stacks: map.hexes.map(() => 0),
    coverage: map.hexes.map(() => 0),
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
