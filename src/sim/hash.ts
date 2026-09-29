// State checksum for desync detection (ARCHITECTURE.md §5, §7). FNV-1a over a canonical JSON form of the state.
// The state holds only integers, strings, booleans, arrays and plain objects built in a fixed key order, so the
// JSON text is the same on every client.
import type { GameState } from './types';

export function hashState(state: GameState): number {
  const text = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
