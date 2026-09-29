// Static, derived data the sim needs every tick: hex indices, neighbours, river flow and per-tick rates.
// Built once from the map and config; never mutated, never hashed.
import { perTick, toMilli } from './fixed';
import { type Hex, hexKey, neighbours } from './hex';
import type { MapData } from './map';
import type { Config } from './types';

export interface SimContext {
  map: MapData;
  config: Config;
  /** Allows `devGive` commands (dev builds only). */
  allowDevCommands: boolean;
  indexOf: Map<string, number>;
  /** Neighbour hex indices per hex, in the fixed DIRECTIONS order (missing neighbours skipped). */
  neighbourIdx: number[][];
  isRiver: boolean[];
  /** Downstream river hex indices, or 'exit'. Only set for river hexes. */
  down: (number[] | 'exit')[];
  /** Land hex adjacent to at least one river hex. */
  riverside: boolean[];
  rates: {
    woodchopper: number;
    carrierSpeed: number;
    floatSpeed: number;
    dockDispense: number;
    carrierCapacity: number;
    dockCapacity: number;
  };
}

export function createContext(map: MapData, config: Config, allowDevCommands = false): SimContext {
  const indexOf = new Map<string, number>();
  map.hexes.forEach((h, i) => indexOf.set(hexKey(h), i));
  const neighbourIdx = map.hexes.map((h) =>
    neighbours(h)
      .map((n) => indexOf.get(hexKey(n)))
      .filter((i): i is number => i !== undefined),
  );
  const isRiver = map.hexes.map((h) => h.terrain === 'river');
  const down: (number[] | 'exit')[] = map.hexes.map(() => []);
  for (const f of map.riverFlow) {
    const i = indexOf.get(hexKey(f))!;
    down[i] = f.down === 'exit' ? 'exit' : f.down.map((d) => indexOf.get(hexKey(d))!);
  }
  const riverside = map.hexes.map((h, i) => h.terrain !== 'river' && neighbourIdx[i]!.some((n) => isRiver[n]));
  const t = config.tickRate;
  return {
    map,
    config,
    allowDevCommands,
    indexOf,
    neighbourIdx,
    isRiver,
    down,
    riverside,
    rates: {
      woodchopper: perTick(config.woodchopper.woodPerSecond, t),
      carrierSpeed: perTick(config.carrier.speedHexPerSecond, t),
      floatSpeed: perTick(config.river.floatHexPerSecond, t),
      dockDispense: perTick(config.dock.dispensePerSecond, t),
      carrierCapacity: toMilli(config.carrier.capacity),
      dockCapacity: toMilli(config.dock.capacity),
    },
  };
}

export function idx(ctx: SimContext, h: Hex): number | undefined {
  return ctx.indexOf.get(hexKey(h));
}
