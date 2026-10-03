// Placeholder art for structures, machines, stacks and piles (ARCHITECTURE.md §8): simple stylized shapes tinted with
// player colours. Everything here only reads sim state.
import type Phaser from 'phaser';
import type { SimContext } from '../../sim/context';
import { MILLI } from '../../sim/fixed';
import { stackStage } from '../../sim/stack';
import type { Carrier, Catapult, ForestGuard, GameState, Pile, Shot, StoneCutter, Structure } from '../../sim/types';
import { downstream } from '../../sim/water';
import { HEX_SIZE, type Point, hexToScreen } from '../iso';

export const PLAYER_COLORS = [0xe0533d, 0x3d7be0, 0xe8c547, 0x9b5de5];
/** Neutral items (DESIGN §9) are grey. */
export const NEUTRAL_COLOR = 0x9a9a9a;
export const ownerColor = (owner: number) => PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;
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

/** What a structure's look depends on beyond the structure itself. */
export interface StructureLook {
  /** Factory-mill: one water wheel per distinct river, towards that river's hex (DESIGN §6.7). */
  mills?: Point[];
  /** Bridge: working, or a half bridge. */
  working?: boolean;
  /** Dam: HP left as a fraction of full. */
  hpFraction?: number;
  /** Dock: screen vector from the dock's hex centre to the centre of a water hex next to it. */
  toWater?: Point;
  /** Bridge: screen vector from its centre to the next hex along the direction it spans. */
  span?: Point;
  /** Excavator, workshop: work done, 0..1 (excavator digging). */
  progress?: number;
}

function drawWheel(g: G, at: Point, timeMs: number): void {
  g.lineStyle(2, DARK, 1);
  g.strokeCircle(at.x, at.y, 8);
  const a = timeMs / 600;
  for (let k = 0; k < 4; k++) {
    const t = a + (k * Math.PI) / 4;
    g.lineBetween(at.x - Math.cos(t) * 8, at.y - Math.sin(t) * 8, at.x + Math.cos(t) * 8, at.y + Math.sin(t) * 8);
  }
}

export function drawStructure(g: G, s: Structure, timeMs: number, look: StructureLook = {}): void {
  const c = hexToScreen(s);
  const color = ownerColor(s.owner);
  switch (s.kind) {
    case 'bridge': {
      // A curved deck from one bank to the other: it starts and ends on the neighbouring hexes' edges and arches up
      // in the middle. A half bridge stops halfway and is greyed.
      const d = look.span ?? { x: HEX_SIZE * Math.sqrt(3), y: 0 };
      const reach = 0.62;
      const from = { x: c.x - d.x * reach, y: c.y - d.y * reach };
      const to = look.working ? { x: c.x + d.x * reach, y: c.y + d.y * reach } : { x: c.x + d.x * 0.1, y: c.y + d.y * 0.1 };
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const nx = (-(to.y - from.y) / len) * 5;
      const ny = ((to.x - from.x) / len) * 5;
      const steps = 12;
      const curve: Point[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const lift = Math.sin(Math.PI * t) * 9; // arch
        curve.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - lift });
      }
      // Deck: the curve widened both ways.
      g.fillStyle(look.working ? PLANK : 0x7d6a55, 1);
      g.fillPoints([...curve.map((p) => ({ x: p.x + nx, y: p.y + ny })), ...[...curve].reverse().map((p) => ({ x: p.x - nx, y: p.y - ny }))], true);
      g.lineStyle(1, DARK, 0.7);
      for (const p of curve.slice(1, -1)) g.lineBetween(p.x + nx, p.y + ny, p.x - nx, p.y - ny);
      // Rails, and a post in the owner's colour at each end.
      g.lineStyle(2, DARK, 0.9);
      g.strokePoints(curve.map((p) => ({ x: p.x - nx, y: p.y - ny - 3 })), false);
      g.fillStyle(color, 1);
      g.fillRect(from.x - 2, from.y - 9, 3, 7);
      if (look.working) g.fillRect(to.x - 1, to.y - 9, 3, 7);
      break;
    }
    case 'dam': {
      // A wooden wall across the water, with an HP bar once damaged.
      g.fillStyle(PLANK, 1);
      g.fillRect(c.x - 20, c.y - 9, 40, 12);
      g.lineStyle(1, DARK, 0.7);
      for (let x = -16; x < 20; x += 6) g.lineBetween(c.x + x, c.y - 9, c.x + x, c.y + 3);
      g.fillStyle(color, 1);
      g.fillRect(c.x - 20, c.y - 12, 40, 3);
      if (look.hpFraction !== undefined && look.hpFraction < 1) {
        g.fillStyle(0x000000, 0.7).fillRect(c.x - 16, c.y + 7, 32, 4);
        g.fillStyle(look.hpFraction > 0.3 ? 0x3ddc84 : 0xff4d4d, 1).fillRect(c.x - 16, c.y + 7, 32 * look.hpFraction, 4);
      }
      break;
    }
    case 'workshop': {
      // A workshop with a small tower, so it's easy to tell apart from a factory-mill.
      g.fillStyle(0xb58b5a, 1);
      g.fillRect(c.x - 15, c.y - 13, 20, 13);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x - 18, c.y - 12, c.x + 8, c.y - 12, c.x - 5, c.y - 22);
      g.lineStyle(3, DARK, 1);
      g.lineBetween(c.x - 9, c.y - 2, c.x - 3, c.y - 9);
      g.fillStyle(0x9c7448, 1);
      g.fillRect(c.x + 6, c.y - 30, 9, 30);
      g.fillStyle(DARK, 1);
      g.fillRect(c.x + 8, c.y - 24, 5, 5);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x + 4, c.y - 30, c.x + 17, c.y - 30, c.x + 10.5, c.y - 39);
      break;
    }
    case 'excavator': {
      // A small digger with a progress bar while it digs.
      g.fillStyle(0xe0b13a, 1);
      g.fillRect(c.x - 12, c.y - 8, 16, 7);
      g.fillRect(c.x - 9, c.y - 15, 8, 7);
      g.fillStyle(DARK, 1);
      g.fillRect(c.x - 13, c.y - 1, 18, 4);
      const swing = Math.sin(timeMs / 300) * 3;
      g.lineStyle(3, 0xe0b13a, 1);
      g.lineBetween(c.x + 2, c.y - 10, c.x + 10, c.y - 16 + swing);
      g.lineBetween(c.x + 10, c.y - 16 + swing, c.x + 14, c.y - 4 + swing);
      g.fillStyle(color, 1);
      g.fillRect(c.x - 9, c.y - 18, 8, 3);
      const f = look.progress ?? 0;
      g.fillStyle(0x000000, 0.6).fillRect(c.x - 14, c.y + 6, 28, 4);
      g.fillStyle(0x8a5a2b, 1).fillRect(c.x - 14, c.y + 6, 28 * f, 4);
      break;
    }
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
      // Factory-mill: a building with a water wheel on each river side it touches.
      g.fillStyle(0xcfc3a8, 1);
      g.fillRect(c.x - 11, c.y - 16, 22, 16);
      g.fillStyle(color, 1);
      g.fillTriangle(c.x - 14, c.y - 15, c.x + 14, c.y - 15, c.x, c.y - 27);
      g.fillStyle(DARK, 1);
      g.fillRect(c.x - 3, c.y - 8, 6, 8);
      for (const m of look.mills ?? []) drawWheel(g, m, timeMs);
      break;
    }
    case 'dock': {
      // A pier from the middle of its hex out over the water, on posts in the owner's colour.
      const w = look.toWater ?? { x: HEX_SIZE * Math.sqrt(3), y: 0 };
      const len = Math.hypot(w.x, w.y);
      const ux = w.x / len;
      const uy = w.y / len;
      const px = -uy * 8;
      const py = ux * 8;
      const start = { x: c.x - ux * 6, y: c.y - uy * 6 };
      const end = { x: c.x + w.x * 0.78, y: c.y + w.y * 0.78 }; // reaches into the water hex
      g.fillStyle(PLANK, 1);
      g.fillPoints(
        [
          { x: start.x + px, y: start.y + py },
          { x: end.x + px, y: end.y + py },
          { x: end.x - px, y: end.y - py },
          { x: start.x - px, y: start.y - py },
        ],
        true,
      );
      g.lineStyle(1, DARK, 0.6);
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const m = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
        g.lineBetween(m.x + px, m.y + py, m.x - px, m.y - py);
      }
      g.fillStyle(color, 1);
      for (const s2 of [1, -1]) {
        g.fillRect(end.x + px * s2 - 1.5, end.y + py * s2 - 10, 3, 12);
        g.fillRect(start.x + px * s2 - 1.5, start.y + py * s2 - 10, 3, 10);
      }
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
  const color = ownerColor(c.owner);
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
export function pilePosition(p: Pile, state: GameState, ctx: SimContext, extraProgress: number): Point {
  const here = hexToScreen(p);
  const i = ctx.indexOf.get(`${p.q},${p.r}`)!;
  const down = downstream(state, ctx, i);
  const t = Math.min(1, (p.progress + extraProgress) / MILLI);
  const next =
    down === 'exit' || down.length !== 1 ? { x: here.x, y: here.y + (down === 'exit' || down.length > 1 ? HEX_SIZE * 0.6 : 0) } : hexToScreen(ctx.map.hexes[down[0]!]!);
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

/** Where a forest guard is drawn: between the hex it's leaving and the one it's walking to. */
export function guardPosition(g: ForestGuard, ctx: SimContext, alpha: number): Point {
  const from = hexToScreen(g);
  if (g.toQ === null || g.toR === null) return from;
  const to = hexToScreen({ q: g.toQ, r: g.toR });
  const stepTicks = Math.round(ctx.config.forestGuard.secondsPerHex * ctx.config.tickRate);
  const t = Math.min(1, (g.moveTicks + alpha) / stepTicks);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** A forest guard: a ranger with a green hat; a little watering can while attending. */
export function drawGuard(g: G, guard: ForestGuard, at: Point, timeMs: number): void {
  const color = ownerColor(guard.owner);
  const bob = guard.toQ !== null ? Math.abs(Math.sin(timeMs / 120)) * 2 : 0;
  const y = at.y - bob;
  g.fillStyle(color, 1);
  g.fillRect(at.x - 3, y - 10, 6, 9);
  g.fillStyle(0xf1c9a5, 1);
  g.fillCircle(at.x, y - 13, 3);
  g.fillStyle(0x2f6b34, 1);
  g.fillTriangle(at.x - 5, y - 14, at.x + 5, y - 14, at.x, y - 20);
  if (guard.attendTicks > 0) {
    g.fillStyle(0x7fb8e0, 1);
    g.fillRect(at.x + 4, y - 8, 5, 4);
    for (let k = 0; k < 3; k++) g.fillCircle(at.x + 11 + k * 2, y - 3 + ((timeMs / 60 + k * 3) % 6), 1);
  }
}

/** A baby forest: sprouts that grow with it, and a thin growth bar. */
export function drawSapling(g: G, c: Point, fraction: number): void {
  const h = 4 + 12 * fraction;
  for (const dx of [-10, 0, 10]) {
    g.fillStyle(0x6b4a2b, 1);
    g.fillRect(c.x + dx - 1, c.y - 1, 2, 3);
    g.fillStyle(0x4fa35a, 1);
    g.fillTriangle(c.x + dx - 4, c.y, c.x + dx + 4, c.y, c.x + dx, c.y - h);
  }
  g.fillStyle(0x000000, 0.5).fillRect(c.x - 12, c.y + 6, 24, 3);
  g.fillStyle(0x4fa35a, 1).fillRect(c.x - 12, c.y + 6, 24 * fraction, 3);
}

/** Stone cutters on a rock: little figures chipping at it, and the rock's progress bar (DESIGN §8.4d). */
export function drawCutters(g: G, cutters: StoneCutter[], at: Point, progress: number, timeMs: number): void {
  cutters.forEach((c, k) => {
    const x = at.x - 10 + k * 8;
    const y = at.y + 6;
    g.fillStyle(ownerColor(c.owner), 1);
    g.fillRect(x - 2.5, y - 8, 5, 7);
    g.fillStyle(0xf1c9a5, 1);
    g.fillCircle(x, y - 11, 2.5);
    const swing = Math.sin(timeMs / 120 + c.id) * 0.9;
    g.lineStyle(2, DARK, 1);
    g.lineBetween(x + 2, y - 6, x + 2 + Math.cos(swing) * 6, y - 6 - Math.sin(swing) * 6);
  });
  g.fillStyle(0x000000, 0.6).fillRect(at.x - 14, at.y + 9, 28, 4);
  g.fillStyle(0xb3b6ba, 1).fillRect(at.x - 14, at.y + 9, 28 * progress, 4);
}

/** Where a catapult is drawn: between the hex it's leaving and the one it's driving to. */
export function catapultPosition(c: Catapult, ctx: SimContext, alpha: number): Point {
  const from = hexToScreen(c);
  if (c.toQ === null || c.toR === null) return from;
  const to = hexToScreen({ q: c.toQ, r: c.toR });
  const stepTicks = Math.round(ctx.config.tickRate / ctx.config.catapult.speedHexPerSecond);
  const t = Math.min(1, (c.moveTicks + alpha) / stepTicks);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * A catapult on wheels, facing its target (or home): the throwing arm is cocked back, and swings forward for a
 * moment after a shot (`swing` 1 → 0).
 */
export function drawCatapult(g: G, c: Catapult, at: Point, swing: number): void {
  const color = ownerColor(c.owner);
  const aim = hexToScreen({ q: c.aimQ, r: c.aimR });
  const dir = aim.x < at.x - 1 ? -1 : 1;
  g.fillStyle(0x000000, 0.3).fillEllipse(at.x, at.y + 2, 30, 8);
  g.fillStyle(PLANK, 1).fillRect(at.x - 13, at.y - 7, 26, 6);
  g.fillStyle(color, 1).fillRect(at.x - 13, at.y - 3, 26, 2);
  g.fillStyle(DARK, 1);
  g.fillCircle(at.x - 9, at.y, 3.5);
  g.fillCircle(at.x + 9, at.y, 3.5);
  // Arm: pivots at the back, cocked behind (angle ~150°) or thrown forward (~60°).
  const pivot = { x: at.x - dir * 4, y: at.y - 7 };
  const angle = ((150 - 90 * swing) * Math.PI) / 180;
  const tip = { x: pivot.x + dir * Math.cos(Math.PI - angle) * 18, y: pivot.y - Math.sin(angle) * 18 };
  g.lineStyle(3, PLANK, 1).lineBetween(pivot.x, pivot.y, tip.x, tip.y);
  g.fillStyle(DARK, 1).fillCircle(pivot.x, pivot.y, 2);
  if (swing === 0) g.fillStyle(0x6f6f6f, 1).fillCircle(tip.x, tip.y - 2, 3);
}

/** A shot in its arc: stones fly high, arrows low (DESIGN §8.6). */
export function drawShot(g: G, s: Shot, alpha: number): void {
  const from = hexToScreen({ q: s.fromQ, r: s.fromR });
  const to = hexToScreen({ q: s.toQ, r: s.toR });
  const t = Math.min(1, (s.flightTicks - s.ticksLeft + alpha) / s.flightTicks);
  const lift = s.kind === 'stone' ? 70 : 18;
  const pos = (u: number) => ({ x: from.x + (to.x - from.x) * u, y: from.y - 18 + (to.y - from.y) * u - 4 * lift * u * (1 - u) });
  const p = pos(t);
  if (s.kind === 'stone') {
    g.fillStyle(0x000000, 0.25).fillEllipse(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 8, 3);
    g.fillStyle(0x6f6f6f, 1).fillCircle(p.x, p.y, 4);
    g.fillStyle(0xa0a0a0, 1).fillCircle(p.x - 1, p.y - 1, 1.5);
  } else {
    const q = pos(Math.max(0, t - 0.08));
    g.lineStyle(2, 0x3a2a1a, 1).lineBetween(q.x, q.y, p.x, p.y);
    g.fillStyle(0xdddddd, 1).fillCircle(p.x, p.y, 1.5);
  }
}

/** Debris of a destroyed structure: broken planks and rubble (DESIGN §9). */
export function drawDebris(g: G, c: Point): void {
  g.fillStyle(0x5d4a33, 0.5).fillEllipse(c.x, c.y + 2, 34, 12);
  g.lineStyle(3, PLANK, 1);
  g.lineBetween(c.x - 12, c.y + 2, c.x - 2, c.y - 4);
  g.lineBetween(c.x + 2, c.y + 4, c.x + 13, c.y - 1);
  g.lineStyle(3, 0x6b4a2b, 1).lineBetween(c.x - 6, c.y - 6, c.x + 6, c.y - 8);
  g.fillStyle(0x8a8d91, 1);
  g.fillCircle(c.x - 4, c.y + 3, 2.5);
  g.fillCircle(c.x + 7, c.y - 4, 2);
}

/** Health bar above an item: green to red as it loses HP. */
export function drawHealthBar(g: G, at: Point, fraction: number, alpha = 1): void {
  const f = Math.max(0, Math.min(1, fraction));
  const color = f > 0.6 ? 0x4fc35a : f > 0.3 ? 0xe8c547 : 0xe0533d;
  g.fillStyle(0x000000, 0.7 * alpha).fillRect(at.x - 15, at.y - 1, 30, 6);
  g.fillStyle(color, alpha).fillRect(at.x - 14, at.y, 28 * f, 4);
}

/** Impact: a small dust puff that grows and fades (`t` 0 → 1). */
export function drawImpact(g: G, at: Point, t: number): void {
  const a = 1 - t;
  g.fillStyle(0xcbb89a, 0.7 * a);
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2;
    g.fillCircle(at.x + Math.cos(ang) * 10 * t, at.y + Math.sin(ang) * 4 * t - 4, 3 + 3 * t);
  }
}
