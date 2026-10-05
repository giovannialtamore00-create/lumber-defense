// Runs a batch of battle-sim matches and summarises win rates (by strategy, starting region, turn order and what the
// players used).
//   npx tsx tools/battle-batch.ts <strategies.json> --seeds 1,2,3,4,5 [--seats Base,A,B,C] [--minutes 30] [--playtest] [--out batch.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULTS, type MatchResult, type Strategy, printMatch, runMatch } from './battle-sim';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const list = JSON.parse(readFileSync(args[0]!, 'utf8')) as Strategy[];
const byName = Object.fromEntries(list.map((s) => [s.name, s]));
const seats = flag('--seats', list.slice(0, 4).map((s) => s.name).join(',')).split(',');
const seeds = flag('--seeds', '1,2,3,4,5').split(',').map(Number);
const minutes = Number(flag('--minutes', '30'));
const playtest = args.includes('--playtest');

const matches: MatchResult[] = [];
for (const seed of seeds) {
  const m = runMatch(seats.map((s) => withDefaults(byName[s]!)), seed, minutes, playtest);
  matches.push(m);
  printMatch(m);
}

function withDefaults(s: Partial<Strategy>): Strategy {
  return { ...DEFAULTS, ...s } as Strategy;
}

// Summary.
const tally = (key: (m: MatchResult) => string) => {
  const t: Record<string, number> = {};
  for (const m of matches) t[key(m)] = (t[key(m)] ?? 0) + 1;
  return t;
};
const winnerOf = (m: MatchResult) => m.players.find((p) => p.seat === m.winner);
console.log('\n=== summary of', matches.length, 'matches');
console.log('wins by strategy      ', JSON.stringify(tally((m) => m.winnerStrategy)));
console.log('wins by start region  ', JSON.stringify(tally((m) => String(winnerOf(m)?.region))));
console.log('wins by turn order    ', JSON.stringify(tally((m) => String(winnerOf(m)?.turnOrder))));
console.log('dominations           ', matches.filter((m) => m.domination).length, 'ended at', matches.map((m) => m.endedAt).join(', '));
const early = matches.flatMap((m) => m.players.filter((p) => p.maxTerritoryLostIn10 > 30).map((p) => `${p.strategy}@seed${m.seed}:${p.maxTerritoryLostIn10}%`));
console.log('lost >30% in 10 min   ', early.join(' ') || 'none');
const used = (pred: (p: MatchResult['players'][number]) => boolean, label: string) => {
  const users = matches.flatMap((m) => m.players.filter(pred).map((p) => ({ m, p })));
  const wins = users.filter(({ m, p }) => m.winner === p.seat).length;
  console.log(`${label.padEnd(22)} used by ${users.length} players, won ${wins} (${users.length ? Math.round((wins * 100) / users.length) : 0}%)`);
};
used((p) => p.catapultsBuilt > 0, 'catapults');
used((p) => p.catapultsBuilt === 0, 'no catapults');
used((p) => (p.upgradeLevels.outpost ?? '0/0').split('/')[1] !== '0', 'outpost archer');
used((p) => (p.upgradeLevels.woodchopper ?? '0/0') !== '0/0', 'woodchopper upgrades');
used((p) => (p.upgradeLevels.forestGuard ?? '0/0') !== '0/0', 'forest guard upgrades');
used((p) => (p.upgradeLevels.catapult ?? '0/0') !== '0/0', 'catapult upgrades');
used((p) => (p.kinds.workshop ?? 0) > 0, 'workshop');
const out = flag('--out', '');
if (out) writeFileSync(out, JSON.stringify(matches, null, 1));
