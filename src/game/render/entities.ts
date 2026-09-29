// Placeholder art for structures, machines, stacks and piles (ARCHITECTURE.md §8): simple stylized shapes tinted with
// player colours. Everything here only reads sim state.
import type Phaser from 'phaser';
import type { SimContext } from '../../sim/context';
import { MILLI } from '../../sim/fixed';
import { stackStage } from '../../sim/stack';
import type { Carrier, Pile, Structure } from '../../sim/types';
import { HEX_SIZE, type Point, hexToScreen } from '../iso';

export const PLAYER_COLORS = [0xe0533d, 0x3d7be0, 0xe8c547, 0x9b5de5];
const LOG = 0x8a5a2b;
const LOG_END = 0xd9b77e;
const DARK = 0x2b2118;
const PLANK = 0x9c6b3c;

type G = Phaser.GameObjects.Graphics;

/** Log stack icon: 1 log, 2 logs, or a 2+1 pyramid (DESIGN §6.3). */
export function drawStack(g: G, at: Point, milliWood: number, ctx: SimContext): void {
  const stage = stackStage(milliWood, ctx.config);
  const logs: Point[] =
    stage === 1 ? [{ x: 0, y: 0 }] : stage === 2 ? [{ x: -5, y: 0 }, { x: 5, y: 0 }] : stage === 3 ? [{ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -5 }] : [];
  for (const l of logs) {
    g.fillStyle(LOG, 1);
    g.fillRoundedRect(at.x + l.x - 5, at.y + l.y - 2.5, 10, 5, 2);
    g.fillStyle(LOG_END, 1);
    g.fillCircle(at.x + l.x + 5, at.y + l.y, 2.5);
  }
}

export function drawStructure(g: G, s: Structure, timeMs: number): void {
  const c = hexToScreen(s);
  const color = PLAYER_COLORS[s.owner] ?? 0xffffff;
  switch (s.kind) {
    case 'outpost': {
      g.fillStyle(PLANK, 1);
      g.fillRect(c.x - 7, c.y - 22, 14, 24);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x - 10, c.y - 21, c.x + 10, c.y - 21, c.x, c.y - 32);
      g.lineStyle(2, DARK, 1);
      g.lineBetween(c.x, c.y - 32, c.x, c.y - 42);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x, c.y - 42, c.x + 9, c.y - 39, c.x, c.y - 36);
      break;
    }
    case 'factory': {
      // Factory-mill: a building with a water wheel.
      g.fillStyle(0xcfc3a8, 1);
      g.fillRect(c.x - 14, c.y - 16, 22, 16);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x - 17, c.y - 15, c.x + 11, c.y - 15, c.x - 3, c.y - 27);
      g.fillStyle(DARK, 1);
      g.fillRect(c.x - 6, c.y - 8, 6, 8);
      const wheel = { x: c.x + 13, y: c.y - 6 };
      g.lineStyle(2, DARK, 1);
      g.strokeCircle(wheel.x, wheel.y, 8);
      const a = timeMs / 600;
      for (let k = 0; k < 4; k++) {
        const t = a + (k * Math.PI) / 4;
        g.lineBetween(wheel.x - Math.cos(t) * 8, wheel.y - Math.sin(t) * 8, wheel.x + Math.cos(t) * 8, wheel.y + Math.sin(t) * 8);
      }
      break;
    }
    case 'dock': {
      g.fillStyle(PLANK, 1);
      g.fillPoints(
        [
          { x: c.x - 16, y: c.y - 4 },
          { x: c.x + 14, y: c.y - 4 },
          { x: c.x + 18, y: c.y + 4 },
          { x: c.x - 12, y: c.y + 4 },
        ],
        true,
      );
      g.lineStyle(1, DARK, 0.6);
      for (let x = -10; x <= 10; x += 6) g.lineBetween(c.x + x, c.y - 4, c.x + x + 4, c.y + 4);
      g.fillStyle(color, 1);
      g.fillRect(c.x - 15, c.y - 14, 3, 12);
      g.fillRect(c.x + 13, c.y - 14, 3, 12);
      break;
    }
    case 'woodchopper': {
      // Wanders inside its hex as an animation only (DESIGN §6.2).
      const t = timeMs / 900 + s.id * 1.7;
      const x = c.x + Math.sin(t) * HEX_SIZE * 0.35;
      const y = c.y - 2 + Math.cos(t * 0.7) * HEX_SIZE * 0.12;
      g.fillStyle(color, 1);
      g.fillRect(x - 3, y - 10, 6, 8);
      g.fillStyle(0xf1c9a5, 1);
      g.fillCircle(x, y - 13, 3);
      g.lineStyle(2, DARK, 1);
      const swing = Math.sin(timeMs / 150 + s.id) * 0.8;
      g.lineBetween(x + 3, y - 8, x + 3 + Math.cos(swing) * 7, y - 8 - Math.sin(swing) * 7);
      break;
    }
  }
}

/** Where a hex's stack is drawn: bottom of the hex; for docks, bottom right (DESIGN §6.6). */
export function stackPosition(c: Point, onDock: boolean): Point {
  return onDock ? { x: c.x + 12, y: c.y + 10 } : { x: c.x, y: c.y + 11 };
}

export function carrierPosition(c: Carrier, prevQ: number | undefined, alpha: number): Point {
  const q = (prevQ ?? c.posQ) + ((c.posQ - (prevQ ?? c.posQ)) * alpha);
  return hexToScreen({ q: q / MILLI, r: c.r });
}

export function drawCarrier(g: G, c: Carrier, at: Point): void {
  const color = PLAYER_COLORS[c.owner] ?? 0xffffff;
  g.fillStyle(color, 1);
  g.fillRect(at.x - 7, at.y - 9, 14, 7);
  g.fillStyle(DARK, 1);
  g.fillCircle(at.x - 4, at.y - 1, 2.5);
  g.fillCircle(at.x + 4, at.y - 1, 2.5);
  if (c.load > 0) {
    g.fillStyle(LOG, 1);
    g.fillRoundedRect(at.x - 6, at.y - 13, 12, 4, 2);
  }
}

/** A pile drifts from its hex towards the next one as it progresses (straight down at a fork, until it picks). */
export function pilePosition(p: Pile, ctx: SimContext, extraProgress: number): Point {
  const here = hexToScreen(p);
  const i = ctx.indexOf.get(`${p.q},${p.r}`)!;
  const down = ctx.down[i]!;
  const t = Math.min(1, (p.progress + extraProgress) / MILLI);
  const next =
    down === 'exit' || down.length !== 1 ? { x: here.x, y: here.y + HEX_SIZE * 0.6 } : hexToScreen(ctx.map.hexes[down[0]!]!);
  return { x: here.x + (next.x - here.x) * t, y: here.y + (next.y - here.y) * t };
}

export function drawPile(g: G, at: Point): void {
  g.fillStyle(LOG, 1);
  g.fillRoundedRect(at.x - 7, at.y - 3, 14, 4, 2);
  g.fillRoundedRect(at.x - 5, at.y - 6, 12, 4, 2);
  g.fillStyle(LOG_END, 1);
  g.fillCircle(at.x + 7, at.y - 1, 2);
  g.fillCircle(at.x + 7, at.y - 4, 2);
}
