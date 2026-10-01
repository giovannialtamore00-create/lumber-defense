import { describe, expect, it } from 'vitest';
import config from '../src/data/config.json';
import map01 from '../src/data/maps/map01.json';
import { type SimContext, createContext } from '../src/sim/context';
import { hashState } from '../src/sim/hash';
import type { MapData } from '../src/sim/map';
import { createInitialState } from '../src/sim/state';
import { dropOffs, placementError } from '../src/sim/systems/placement';
import { step } from '../src/sim/tick';
import type { Command, Config, GameState } from '../src/sim/types';

/** Scripted play for every player: start, factory, a carrier from the woodchopper, a dock. Reads state, never writes. */
function scriptedCommands(state: GameState, ctx: SimContext): Command[] {
  const cmds: Command[] = [];
  for (const p of state.players) {
    const legal = (item: 'outpost' | 'factory' | 'dock') =>
      ctx.map.hexes.find((h) => placementError(state, ctx, p.id, item, h.q, h.r) === null);
    if (!p.started) {
      const h = legal('outpost'); // only the player whose starting turn it is gets a legal spot
      if (h) cmds.push({ type: 'placeOutpost', player: p.id, q: h.q, r: h.r });
    } else if (p.hand[0] === 'factory' || p.hand[0] === 'dock') {
      const h = legal(p.hand[0]);
      if (h) cmds.push({ type: 'place', player: p.id, item: p.hand[0], q: h.q, r: h.r });
    } else if (p.hand[0] === 'carrier') {
      const chopper = state.entities.find((e) => e.type === 'structure' && e.kind === 'woodchopper' && e.owner === p.id);
      if (chopper && chopper.type === 'structure') {
        const b = dropOffs(state, ctx, p.id, chopper.q, chopper.r)[0];
        if (b) cmds.push({ type: 'placeCarrier', player: p.id, aQ: chopper.q, bQ: b.q, r: chopper.r });
      }
    } else if (p.queue.length === 0 && p.hand.length === 0) {
      // Craft a carrier first, then a dock (one factory-mill = one item at a time).
      const hasCarrier = state.entities.some((e) => e.type === 'carrier' && e.owner === p.id);
      const hasDock = state.entities.some((e) => e.type === 'structure' && e.kind === 'dock' && e.owner === p.id);
      if (!hasCarrier) cmds.push({ type: 'craft', player: p.id, item: 'carrier' });
      else if (!hasDock) cmds.push({ type: 'craft', player: p.id, item: 'dock' });
    }
  }
  return cmds;
}

describe('determinism (ARCHITECTURE §5)', () => {
  it('two sims with the same seed and commands have equal hashes every tick', () => {
    const ctx = createContext(map01 as MapData, config as Config);
    const a = createInitialState(ctx, 4, 12345);
    const b = createInitialState(ctx, 4, 12345);
    let sawPile = false;

    for (let t = 0; t < 6000; t++) {
      const cmds = scriptedCommands(a, ctx);
      step(a, ctx, cmds);
      step(b, ctx, structuredClone(cmds));
      expect(hashState(b)).toBe(hashState(a));
      sawPile ||= a.entities.some((e) => e.type === 'pile');
    }

    // The scripted play did exercise the economy.
    expect(a.players.every((p) => p.started)).toBe(true);
    expect(a.entities.filter((e) => e.type === 'carrier')).toHaveLength(4);
    expect(sawPile).toBe(true);
  });

  it('a different seed gives a different match', () => {
    const ctx = createContext(map01 as MapData, config as Config);
    expect(hashState(createInitialState(ctx, 4, 1))).not.toBe(hashState(createInitialState(ctx, 4, 2)));
  });
});
