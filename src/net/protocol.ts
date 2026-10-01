// Messages between host and clients (ARCHITECTURE.md §7).
import type { Command } from '../sim/types';

export interface SlotInfo {
  /** Player name, or null for an empty slot (a bot fills it). */
  name: string | null;
}

export type NetMessage =
  // Lobby
  | { t: 'hello'; name: string; version: string }
  | { t: 'lobby'; slots: SlotInfo[]; you: number }
  | { t: 'refused'; reason: string }
  | { t: 'start'; seed: number; slots: SlotInfo[]; you: number }
  // Match
  | { t: 'cmd'; command: Command }
  | { t: 'bundle'; tick: number; commands: Command[] }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'desync'; tick: number; slot: number }
  | { t: 'left'; slot: number };
