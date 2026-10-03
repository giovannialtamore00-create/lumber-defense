// Messages between host and clients (ARCHITECTURE.md §7).
import type { Command, GameState } from '../sim/types';

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
  | { t: 'left'; slot: number }
  // Pause: a client asks the host; the host decides and tells everyone (slot = who pressed it).
  | { t: 'pause'; paused: boolean }
  | { t: 'paused'; paused: boolean; slot: number }
  // Rejoin: a player who dropped joins again mid-match; the host sends them the match as it is now.
  | {
      t: 'rejoin';
      seed: number;
      slots: SlotInfo[];
      you: number;
      state: GameState;
      /** Bundles the host has already closed for the ticks not stepped yet. */
      bundles: [number, Command[]][];
      paused: boolean;
      pausedBy: number | null;
      left: number[];
    }
  | { t: 'back'; slot: number };
