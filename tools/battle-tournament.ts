// Tournament: two groups of four strategies play best-of-N (different seeds), the top two of each group meet in a
// final. Points: 3 for a win, 1 per surviving seat at the end, so domination and staying alive both count.
//   npx tsx tools/battle-tournament.ts <strategies.json> --groups S,P,O,B/S2,P2,O2,X [--games 3] [--seed 100] [--playtest]
import { readFileSync } from 'node:fs';
import { DEFAULTS, type MatchResult, type Strategy, runMatch } from './battle-sim';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const byName = Object.fromEntries((JSON.parse(readFileSync(args[0]!, 'utf8')) as Strategy[]).map((s) => [s.name, { ...DEFAULTS, ...s }]));
const groups = flag('--groups', '').split('/').map((g) => g.split(','));
const games = Number(flag('--games', '3'));
let seed = Number(flag('--seed', '100'));
const playtest = args.includes('--playtest');
const all: MatchResult[] = [];

function play(names: string[], label: string): string[] {
  const points: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  console.log(`\n== ${label}: ${names.join(' vs ')}`);
  for (let g = 0; g < games; g++) {
    // Rotate seats so nobody keeps the same seat.
    const seats = names.map((_, i) => names[(i + g) % names.length]!);
    const m = runMatch(seats.map((n) => byName[n]!), seed++, 30, playtest);
    all.push(m);
    for (const p of m.players) points[p.strategy]! += (m.winner === p.seat ? 3 : 0) + (p.defeated ? 0 : 1);
    console.log(`  game ${g + 1} (seed ${m.seed}): ${m.winnerStrategy}${m.domination ? ` by domination at ${m.endedAt} min` : ' at the 30:00 cap'}`);
  }
  const ranked = [...names].sort((a, b) => points[b]! - points[a]!);
  console.log(`  points: ${ranked.map((n) => `${n} ${points[n]}`).join(', ')}`);
  return ranked;
}

const qualified = groups.flatMap((g, i) => play(g, `Group ${String.fromCharCode(65 + i)}`).slice(0, 2));
const final = play(qualified, 'Final');
console.log(`\nChampion: ${final[0]}`);
const done = all.filter((m) => m.domination);
console.log(`Matches: ${all.length}, finished by domination: ${done.length} (${Math.round((done.length * 100) / all.length)}%), lengths: ${all.map((m) => m.endedAt).join(', ')}`);
