// Tournament of up to 50 matches over all strategies in tournament.json + workshop.json, on the real sim (map02).
// Three phases, seats rotate every game so each strategy plays several start regions:
//   1. three groups of four, 4 games each   2. top 8 in two groups, 4 games each   3. final: top 4, FINAL_GAMES games
// Matches run with the game's playtest mode (costs and times -50%) so they finish faster; results show relative
// strength, not the real balance. A close finish at the time limit is replayed (same seed) 50% longer.
//   npx tsx tools/battle-tournament50.ts [--seed 200] [--out sim-results/tournament50.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULTS, type MatchResult, type Strategy, runMatch } from './battle-sim';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};

const MAX_MATCHES = 50;
const BASE_MINUTES = 20; // approved for this run (the project default is 10); tie extension below is +50%
const TIE_MINUTES = 30;
const TIE_GAP_PCT = 5; // PLACEHOLDER: top two within 5% territory at the limit count as "equal chances"
const FINAL_GAMES = 12;
const PLAYTEST = true;

const list = [
  ...(JSON.parse(readFileSync('tools/battle-strategies/tournament.json', 'utf8')) as Partial<Strategy>[]),
  ...(JSON.parse(readFileSync('tools/battle-strategies/workshop.json', 'utf8')) as Partial<Strategy>[]),
];
const byName = Object.fromEntries(list.map((s) => [s.name!, { ...DEFAULTS, ...s } as Strategy]));
const names = ['S', 'P', 'O', 'B', 'S2', 'P2', 'O2', 'X', 'W1', 'W2', 'W3', 'W4'];
let seed = Number(flag('--seed', '200'));
const all: MatchResult[] = [];
const points: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
const wins: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
let extended = 0;

function playGame(group: string[], g: number): void {
  if (all.length >= MAX_MATCHES) return;
  const seats = group.map((_, i) => group[(i + g) % group.length]!);
  const strategies = seats.map((n) => byName[n]!);
  const s = seed++;
  let m = runMatch(strategies, s, BASE_MINUTES, PLAYTEST);
  if (!m.domination) {
    const top = [...m.players].filter((p) => !p.defeated).sort((a, b) => b.territory - a.territory);
    if (top.length >= 2 && top[0]!.territory > 0 && ((top[0]!.territory - top[1]!.territory) * 100) / top[0]!.territory <= TIE_GAP_PCT) {
      m = runMatch(strategies, s, TIE_MINUTES, PLAYTEST);
      extended++;
    }
  }
  all.push(m);
  for (const p of m.players) points[p.strategy]! += (m.winner === p.seat ? 3 : 0) + (p.defeated ? 0 : 1);
  if (m.winnerStrategy in wins) wins[m.winnerStrategy]!++;
}

function phase(label: string, groups: string[][], games: number): void {
  console.log(`\n== ${label}`);
  for (const group of groups) {
    const before = { ...points };
    for (let g = 0; g < games; g++) playGame(group, g);
    const gained = group.map((n) => `${n} +${points[n]! - before[n]!}`).join(', ');
    console.log(`  ${group.join(' ')}: ${gained}`);
  }
}
const rank = (pool: string[]) => [...pool].sort((a, b) => points[b]! - points[a]!);

phase('Phase 1: three groups', [names.slice(0, 4), names.slice(4, 8), names.slice(8, 12)], 4);
const top8 = rank(names).slice(0, 8);
phase('Phase 2: top 8 in two groups (snake seeding)', [[top8[0]!, top8[3]!, top8[4]!, top8[7]!], [top8[1]!, top8[2]!, top8[5]!, top8[6]!]], 4);
const finalists = rank(top8).slice(0, 4);
phase(`Phase 3: final, ${finalists.join(' ')}`, [finalists], FINAL_GAMES);

console.log(`\n=== ${all.length} matches (cap ${MAX_MATCHES}), ${extended} extended to ${TIE_MINUTES} min on a close finish, playtest mode on`);
console.log('points      ', rank(names).map((n) => `${n} ${points[n]}`).join(', '));
console.log('match wins  ', rank(names).map((n) => `${n} ${wins[n]}`).join(', '));
const region: Record<string, { n: number; wins: number; terr: number }> = {};
for (const m of all) for (const p of m.players) {
  const r = (region[p.region] ??= { n: 0, wins: 0, terr: 0 });
  r.n++;
  r.terr += p.territory;
  if (m.winner === p.seat) r.wins++;
}
for (const k of Object.keys(region).sort()) console.log(`region ${k}: ${region[k]!.wins}/${region[k]!.n} wins (${Math.round((region[k]!.wins * 100) / region[k]!.n)}%), avg territory ${(region[k]!.terr / region[k]!.n).toFixed(1)}`);
const oldWins = names.slice(0, 8).reduce((s, n) => s + wins[n]!, 0);
const wsWins = names.slice(8).reduce((s, n) => s + wins[n]!, 0);
console.log(`old strategies won ${oldWins}, workshop family (W1-W4) won ${wsWins}; domination ${all.filter((m) => m.domination).length}/${all.length}`);
const out = flag('--out', 'sim-results/tournament50.json');
writeFileSync(out, JSON.stringify(all.map((m) => ({ ...m, players: m.players.map((p) => ({ ...p, snapshots: undefined })) })), null, 1));
console.log('saved', out);
