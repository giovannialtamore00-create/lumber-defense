// Battle simulator (balance tool): four scripted bots play a full match on the real sim (no rendering) with the
// strategies from a JSON file, up to a time cap, logging every player every 5 minutes. Only normal commands are used.
//   npx tsx tools/battle-sim.ts <strategies.json> --seats A,B,C,Base [--seed 5] [--minutes 30] [--playtest] [--out m.json]
// The winner at the cap is the player with the most territory (hexes covered), then the most buildings; a domination
// win before the cap counts as a win.
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULTS, type Strategy, createBot } from '../src/bots/bot';
import config from '../src/data/config.json';
import map02 from '../src/data/maps/map02.json';
import { createContext } from '../src/sim/context';
import type { MapData } from '../src/sim/map';
import { createInitialState } from '../src/sim/state';
import { step } from '../src/sim/tick';
import type { Config, GameState } from '../src/sim/types';

export type { Strategy };
export { DEFAULTS };

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};

export interface Snapshot {
  min: number;
  woodCut: number;
  woodSpent: number;
  wood: number;
  buildings: number;
  territory: number;
  units: number;
  catapults: number;
  upgrades: number;
  alive: boolean;
}

export interface PlayerResult {
  seat: number;
  strategy: string;
  region: number;
  turnOrder: number;
  territory: number;
  buildings: number;
  defeated: boolean;
  snapshots: Snapshot[];
  kinds: Record<string, number>;
  catapultsBuilt: number;
  upgradeLevels: Record<string, string>;
  damageDealt: number;
  outpostsDestroyed: number;
  maxTerritoryLostIn10: number; // percent of peak territory lost during the first 10 minutes
}

export interface MatchResult {
  seed: number;
  minutes: number;
  endedAt: number;
  domination: boolean;
  winner: number;
  winnerStrategy: string;
  players: PlayerResult[];
  notes: string[];
}

export function runMatch(strategies: Strategy[], seed: number, minutes: number, playtest: boolean, cfg: Config = config as Config): MatchResult {
  const ctx = createContext(map02 as MapData, cfg);
  const state: GameState = createInitialState(ctx, 4, seed, [false, false, false, false]);
  const notes: string[] = [];
  const territoryOf = (p: number) => state.coverage.filter((c) => c & (1 << p)).length;
  const peakIn10 = [0, 0, 0, 0];
  const lostIn10 = [0, 0, 0, 0];
  const bots = strategies.map((s, i) => createBot(ctx, state, i, s, { asBot: false, debugNotes: process.env.BATTLE_DEBUG ? notes : undefined }));
  if (playtest) state.playtest = true;
  const snapshots: Snapshot[][] = [[], [], [], []];
  const totalTicks = minutes * 600;
  let lastSeen = '';
  let sameFor = 0;
  for (let guard = 0; guard < totalTicks + 3000; guard++) {
    if (state.phase === 'over') break;
    if (state.phase === 'running' && state.tick >= totalTicks) break;
    const cmds = guard % 20 === 0 ? bots.flatMap((b) => b.think()) : [];
    step(state, ctx, cmds);
    const min = state.tick / 600;
    if (state.tick % 600 === 0) {
      for (let pl = 0; pl < 4; pl++) {
        const t = territoryOf(pl);
        if (min <= 10) {
          peakIn10[pl] = Math.max(peakIn10[pl]!, t);
          if (peakIn10[pl]! > 0) lostIn10[pl] = Math.max(lostIn10[pl]!, Math.round(((peakIn10[pl]! - t) * 100) / peakIn10[pl]!));
        }
      }
      // Loop detection: nobody's wood, buildings or territory changed for 5 minutes in the running phase.
      const sig = state.players.map((pl) => `${pl.wood}|${pl.stats.woodSpent}`).join(',');
      sameFor = sig === lastSeen ? sameFor + 1 : 0;
      lastSeen = sig;
      if (sameFor === 5) notes.push(`stalled: no wood movement for any player for 5 min at ${Math.round(min)} min`);
    }
    if (state.tick % 3000 === 0 && state.phase === 'running') {
      state.players.forEach((pl, i) => {
        const units = state.entities.filter((e) => e.type !== 'structure' && e.type !== 'pile' && e.type !== 'shot' && 'owner' in e && e.owner === i).length;
        snapshots[i]!.push({
          min: Math.round(min),
          woodCut: Math.floor(pl.stats.woodChopped / 1000),
          woodSpent: Math.floor(pl.stats.woodSpent / 1000),
          wood: Math.floor(pl.wood / 1000),
          buildings: state.entities.filter((e) => e.type === 'structure' && e.owner === i).length,
          territory: territoryOf(i),
          units,
          catapults: state.entities.filter((e) => e.type === 'catapult' && e.owner === i).length,
          upgrades: pl.upgrades.reduce((s, u) => s + u.levels[0] + u.levels[1], 0),
          alive: !pl.defeated,
        });
      });
    }
  }
  const players: PlayerResult[] = state.players.map((pl, i) => {
    const kinds: Record<string, number> = {};
    for (const e of state.entities) if (e.type === 'structure' && e.owner === i) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    return {
      seat: i,
      strategy: strategies[i]!.name,
      region: pl.region,
      turnOrder: state.startTurns.order.indexOf(i),
      territory: territoryOf(i),
      buildings: state.entities.filter((e) => e.type === 'structure' && e.owner === i).length,
      defeated: pl.defeated,
      snapshots: snapshots[i]!,
      kinds,
      catapultsBuilt: bots[i]!.catapultsBuilt,
      upgradeLevels: Object.fromEntries(ctx.upgrades.types.map((t, k) => [t.type, pl.upgrades[k]!.levels.join('/')]).filter(([, l]) => l !== '0/0')),
      damageDealt: pl.stats.damageDealt,
      outpostsDestroyed: pl.stats.outpostsDestroyed,
      maxTerritoryLostIn10: lostIn10[i]!,
    };
  });
  const domination = state.phase === 'over';
  const ranked = [...players].filter((x) => !x.defeated).sort((a, b) => b.territory - a.territory || b.buildings - a.buildings);
  const winner = domination ? (state.winner ?? -1) : (ranked[0]?.seat ?? -1);
  return { seed, minutes, endedAt: Math.round(state.tick / 60) / 10, domination, winner, winnerStrategy: strategies[winner]?.name ?? '-', players, notes };
}

function loadStrategies(file: string): Record<string, Strategy> {
  const list = JSON.parse(readFileSync(file, 'utf8')) as Partial<Strategy>[];
  return Object.fromEntries(list.map((s) => [s.name!, { ...DEFAULTS, ...s } as Strategy]));
}

export function printMatch(m: MatchResult): void {
  console.log(`seed ${m.seed}: winner ${m.winnerStrategy} (seat ${m.winner})${m.domination ? ' by domination' : ''}, ended at ${m.endedAt} min`);
  for (const pl of m.players) {
    const curve = pl.snapshots.map((s) => `${s.min}m b${s.buildings} t${s.territory} cut${s.woodCut} spent${s.woodSpent} c${s.catapults} u${s.upgrades}`).join(' | ');
    console.log(
      `  ${pl.strategy.padEnd(6)} region ${pl.region} turn ${pl.turnOrder} | terr ${pl.territory} bldg ${pl.buildings}${pl.defeated ? ' DEFEATED' : ''} | cats ${pl.catapultsBuilt} dmg ${pl.damageDealt} outposts-killed ${pl.outpostsDestroyed} | lost-in-10 ${pl.maxTerritoryLostIn10}% | upg ${JSON.stringify(pl.upgradeLevels)}`,
    );
    console.log(`         ${curve}`);
  }
  for (const n of m.notes) console.log(`  NOTE ${n}`);
}

if (process.argv[1]?.endsWith('battle-sim.ts') && args[0]) {
  const all = loadStrategies(args[0]);
  const seats = flag('--seats', Object.keys(all).slice(0, 4).join(',')).split(',');
  const m = runMatch(seats.map((s) => all[s]!), Number(flag('--seed', '5')), Number(flag('--minutes', '30')), args.includes('--playtest'));
  printMatch(m);
  const out = flag('--out', '');
  if (out) writeFileSync(out, JSON.stringify(m, null, 1));
}
