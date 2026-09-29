// Validates a map against DESIGN.md §4.3 and the designer's map decisions.
//   npm run validate-map [-- path/to/map.json]
import { readFileSync } from 'node:fs';
import config from '../src/data/config.json';
import type { MapData } from '../src/sim/map';
import { checkMap } from './mapChecks';

const path = process.argv[2] ?? 'src/data/maps/map01.json';
const map = JSON.parse(readFileSync(path, 'utf8')) as MapData;
const results = checkMap(map, config);

console.log(`Validating ${path} (${map.id})\n`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(42)} ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
