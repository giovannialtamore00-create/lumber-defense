import Phaser from 'phaser';
import map02 from '../../data/maps/map02.json';
import config from '../../data/config.json';
import { wholeUnits } from '../../sim/fixed';
import { DIRECTIONS, type Hex, hexKey } from '../../sim/hex';
import { type MapData, type MapHex, indexHexes, riverStrengthLevel } from '../../sim/map';
import { PlacementHand } from '../input/placementHand';
import { HEX_SIZE, ISO_SQUASH, TILE_DEPTH, type Point, edgeCorners, hexCorners, hexToScreen, screenToHex } from '../iso';
import {
  PLAYER_COLORS,
  carrierPosition,
  catapultPosition,
  drawCatapult,
  drawDebris,
  drawDismantleBar,
  drawFlames,
  drawHealthBar,
  drawImpact,
  drawShot,
  ownerColor,
  drawCarrier,
  drawCutters,
  drawGuard,
  drawSapling,
  guardPosition,
  drawPile,
  drawStack,
  drawStructure,
  pilePosition,
  stackPosition,
} from '../render/entities';
import { ownFactories, watermills } from '../../sim/systems/crafting';
import { isWorkingBridge } from '../../sim/systems/placement';
import type { Catapult, ItemKind, Ownable, StoneCutter, Structure } from '../../sim/types';
import { isOwnable } from '../../sim/state';
import { maxHp } from '../../sim/systems/combat';
import { craftTicks } from '../../sim/systems/crafting';
import { fireStrength } from '../../sim/systems/fire';
import { kindOf } from '../../sim/state';
import { MILLI } from '../../sim/fixed';
import { stackStage } from '../../sim/stack';
import { typeIndex, upgradeLevel } from '../../sim/upgrades';
import { type WaterFlow, SpritePool, addPackSprite, addWaterSprite, createGreyPack, packLoaded, packScale, usePixelFiltering } from '../render/sprites';
import { drawItemIcon } from '../render/icons';
import { hexOf, thingAt } from '../ui/describe';
import { bonusRow, downstream, isRock, isWater, riverIdAt } from '../../sim/water';
import type { SimRunner } from '../simRunner';

export const MAP = map02 as MapData;
const ORDERED = [...MAP.hexes].sort((a, b) => a.r - b.r || a.q - b.q);

const COLORS = {
  land: 0x9cbf6e,
  forest: 0x7aa457,
  river: 0x4a8fd0,
  riverWeak: 0x8fc8f0,
  riverStrong: 0x1d4f9c,
  foam: 0xffffff,
  rock: 0x9cbf6e,
  side: 0x5d4a33,
  riverSide: 0x2f5f8f,
  outline: 0x000000,
  tree: 0x2f6b34,
  treeLight: 0x3f8a45,
  trunk: 0x6b4a2b,
  rock1: 0x8a8d91,
  rock2: 0xb3b6ba,
  arrow: 0xe8f4ff,
  regionBorder: 0xfff3c4,
};

const REGION_NAMES = ['West', 'Middle-west', 'Middle-east', 'East'];

const STRENGTH_LEVELS = config.factoryMill.riverBonusBpByRow.length;
const MAX_STRENGTH = Math.max(...MAP.riverFlow.map((f) => riverStrengthLevel(MAP, f.r, STRENGTH_LEVELS)));

/** River colour from light (weak, top of a slope) to deep (strong, bottom of a slope). */
function riverColor(r: number): number {
  return riverColorForStrength(riverStrengthLevel(MAP, r, STRENGTH_LEVELS));
}

/** Water colour for a flow strength: 1 (or 0, dug water's first hex) is lightest, the strongest is deepest. */
function riverColorForStrength(level: number): number {
  const t = Math.max(0, Math.min(1, (level - 1) / Math.max(1, MAX_STRENGTH - 1)));
  const a = Phaser.Display.Color.IntegerToColor(COLORS.riverWeak);
  const b = Phaser.Display.Color.IntegerToColor(COLORS.riverStrong);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

/** Buildings and units are drawn 50% bigger than the pack's size (terrain and log stacks stay as drawn). */
const ITEM_SIZE = 1.5;
/** Several units of a kind on one hex are drawn as a stack, each this much smaller (DESIGN §12). */
const STACKED_SIZE = 0.7;
/**
 * Sprite stage (1–3) by the highest upgrade level the owner has on that type, Pokemon style: no upgrades = stage 1,
 * level 1–2 = stage 2, level 3 = stage 3. One look per stage, whichever path it came from.
 */
const STAGE_BY_LEVEL = [1, 2, 2, 3];
/** The woodchopper walks a loop around its forest hex: one lap in this many ms. */
const CHOPPER_LAP_MS = 9000;

/** How long a health bar stays up after an HP change, and how long impacts and damage numbers last (ms). */
const BAR_MS = 3000;
const IMPACT_MS = 350;
const NUMBER_MS = 900;

const ZOOM_MAX = 3;
/** Screen width of the build panel on the right (UIScene), which the map should not hide under. */
const SIDE_PANEL_PX = 340;

export class GameScene extends Phaser.Scene {
  private coordLabels: Phaser.GameObjects.Text[] = [];
  private runner!: SimRunner;
  private hand!: PlacementHand;
  private decor!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private pileLabels: Phaser.GameObjects.Text[] = [];
  /** Combat feedback, render-only: last HP seen per item, health bar timers, shots in the air, effects. */
  private hpSeen = new Map<number, number>();
  private barUntil = new Map<number, number>();
  private shotsSeen = new Map<number, { at: Point; targetId: number; damage: number }>();
  private impacts: { at: Point; t0: number }[] = [];
  private numbers: { text: Phaser.GameObjects.Text; at: Point; t0: number }[] = [];
  private decorKey = '';
  /** Pixel-art pack (public/assets/lumber-pack): terrain tiles, river water, and pooled structure/unit sprites. */
  private art = false;
  private tiles: (Phaser.GameObjects.Image | undefined)[] = [];
  private dugWater = new Map<number, Phaser.GameObjects.Sprite>();
  /** River water sprites by hex, so the water held behind a dam can stand still. */
  private riverWater = new Map<number, Phaser.GameObjects.Sprite>();
  private damKey = '';
  private sprites!: SpritePool;
  /** Last direction each carrier drove (1 east, -1 west), so it keeps facing that way while it waits. */
  private carrierDir = new Map<number, number>();
  /** Graphics drawn above the sprites (placeholders, progress icons, units without sprites, shots, bars). */
  private top!: Phaser.GameObjects.Graphics;
  private dugLayer!: Phaser.GameObjects.Graphics;
  private dugKey = '';
  private hover: Hex | null = null;
  /** The item the hover pop-up is about; it sticks while the mouse stays on its hex or over the pop-up. */
  private hoverId: number | null = null;
  private overUi = false;

  constructor() {
    super('GameScene');
  }

  /** Our player slot. */
  private get local(): number {
    return this.runner.localPlayer;
  }

  create(): void {
    this.runner = this.registry.get('runner') as SimRunner;
    this.hand = new PlacementHand(this.runner, this.local);
    this.registry.set('hand', this.hand); // the UI's hammer button toggles it
    this.hand.onAskDismantle = (id) => this.game.events.emit('ask-dismantle', id);
    const idx = indexHexes(MAP);
    this.art = packLoaded(this);
    if (this.art) {
      createGreyPack(this);
      usePixelFiltering(this);
    }
    const g = this.add.graphics();

    // Painter's order: north to south, so things further south draw on top (ARCHITECTURE §4 depth sorting).
    for (const h of ORDERED) {
      if (this.art) this.addTileSprite(h);
      else this.drawTile(g, h);
    }

    const overlay = this.add.graphics();
    if (!this.art) this.drawRiverFlow(overlay); // the animated water shows the flow
    this.drawRegionBorders(overlay, idx);
    this.drawWaterfalls(overlay);
    this.dugLayer = this.add.graphics(); // dug hexes: dry ditches and dug water (DESIGN §8.4c)
    this.decor = this.add.graphics();
    this.dyn = this.add.graphics();
    this.sprites = new SpritePool(this, 1, packScale(HEX_SIZE));
    this.top = this.add.graphics().setDepth(2);
    this.drawRegionLabels();
    this.createCoordLabels();
    // Labels stay readable above the sprites.
    for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Text) o.setDepth(3);

    this.setupCamera();
    this.setupInput();
  }

  override update(time: number): void {
    this.runner.update();
    const { state } = this.runner;
    // Trees and rocks change rarely (a forest runs out or regrows, a rock breaks): redraw only then.
    const decorKey = `${state.forestPool.filter((p) => p > 0).length}|${state.rockGone.filter(Boolean).length}|${state.saplingGrowth.filter((x) => x >= 0).length}`;
    const dugKey = state.dug.map((d, i) => (d ? (state.dugWater[i] ? 'w' : 'd') : '')).join(',');
    if (this.art) {
      if (decorKey !== this.decorKey || dugKey !== this.dugKey) this.refreshTiles();
      const damKey = state.entities.map((e) => (e.type === 'structure' && e.kind === 'dam' ? `${e.q},${e.r}` : '')).join('') + dugKey;
      if (damKey !== this.damKey) {
        this.damKey = damKey;
        this.refreshStillWater();
      }
      this.decorKey = decorKey;
      this.dugKey = dugKey;
    } else {
      if (decorKey !== this.decorKey) {
        this.decorKey = decorKey;
        this.drawDecor();
      }
      if (dugKey !== this.dugKey) {
        this.dugKey = dugKey;
        this.drawDug();
      }
    }
    this.drawDynamic(time);
  }

  /** Trees (only where the forest pool isn't empty) and rocks. Redrawn when a forest disappears. */
  private drawDecor(): void {
    this.decor.clear();
    const { state, ctx } = this.runner;
    for (const h of ORDERED) {
      const i = ctx.indexOf.get(hexKey(h))!;
      if (state.forestPool[i]! > 0) this.drawTrees(this.decor, h);
      if (isRock(state, ctx, i)) this.drawRock(this.decor, h);
    }
  }

  /** Dug hexes: a dry ditch is bare earth; dug water is drawn like a river, lighter where its flow is weaker. */
  private drawDug(): void {
    const g = this.dugLayer;
    g.clear();
    const { state, ctx } = this.runner;
    for (const h of ORDERED) {
      const i = ctx.indexOf.get(hexKey(h))!;
      if (!state.dug[i]) continue;
      const c = hexToScreen(h);
      const corners = hexCorners(c);
      if (!state.dugWater[i]) {
        g.fillStyle(0x8b6a43, 1).fillPoints(corners, true);
        g.lineStyle(2, 0x5d4a33, 0.8);
        for (const dy of [-6, 0, 6]) g.lineBetween(c.x - 14, c.y + dy, c.x + 14, c.y + dy);
        continue;
      }
      g.fillStyle(riverColorForStrength(state.dugStrength[i]!), 1).fillPoints(corners.map((p) => ({ x: p.x, y: p.y + 3 })), true);
      g.lineStyle(1, 0x000000, 0.18).strokePoints(corners.map((p) => ({ x: p.x, y: p.y + 3 })), true);
      // Flow arrows towards where the water goes.
      const down = downstream(state, ctx, i);
      g.fillStyle(COLORS.arrow, 0.85);
      for (const j of down === 'exit' ? [] : down) {
        const t = hexToScreen(ctx.map.hexes[j]!);
        const dx = t.x - c.x;
        const dy = t.y - c.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        g.fillTriangle(c.x + ux * 10, c.y + uy * 10, c.x - uy * 4, c.y + ux * 4, c.x + uy * 4, c.y - ux * 4);
      }
    }
  }

  /** Everything that changes: territory, previews, structures, stacks, carriers, piles. */
  private drawDynamic(time: number): void {
    let g = this.dyn;
    g.clear();
    const { state, ctx, alpha } = this.runner;
    const me = state.players[this.local]!;

    // Before the start, highlight the player's own region.
    if (!me.started) {
      const color = PLAYER_COLORS[this.local]!;
      g.fillStyle(color, 0.18 + 0.1 * Math.sin(time / 300));
      g.lineStyle(4, color, 1);
      MAP.hexes.forEach((h) => {
        if (h.region !== me.region) return;
        const corners = hexCorners(hexToScreen(h));
        g.fillPoints(corners, true);
        DIRECTIONS.forEach((d, k) => {
          const n = ctx.indexOf.get(hexKey({ q: h.q + d.q, r: h.r + d.r }));
          if (n !== undefined && MAP.hexes[n]!.region === me.region) return;
          const [a, b] = edgeCorners(k);
          g.lineBetween(corners[a]!.x, corners[a]!.y, corners[b]!.x, corners[b]!.y);
        });
      });
    }

    // Territory: each player's area gets a light tint and a border in their colour. Conflict zones (covered by more
    // than one player) get a red wash on top (DESIGN §9).
    MAP.hexes.forEach((h, i) => {
      const mask = state.coverage[i]!;
      if (!mask) return;
      const corners = hexCorners(hexToScreen(h));
      for (let p = 0; p < state.players.length; p++) {
        const bit = 1 << p;
        if (!(mask & bit)) continue;
        const color = PLAYER_COLORS[p] ?? 0xffffff;
        g.fillStyle(color, 0.1);
        g.fillPoints(corners, true);
        g.lineStyle(3, color, 0.9);
        DIRECTIONS.forEach((d, k) => {
          const n = ctx.indexOf.get(hexKey({ q: h.q + d.q, r: h.r + d.r }));
          if (n !== undefined && state.coverage[n]! & bit) return;
          const [a, b] = edgeCorners(k);
          g.lineBetween(corners[a]!.x, corners[a]!.y, corners[b]!.x, corners[b]!.y);
        });
      }
      if (mask & (mask - 1)) g.fillStyle(0xff3b30, 0.18).fillPoints(corners, true);
    });

    // Placement preview.
    const preview = this.hand.preview(this.hover);
    for (const cell of preview.cells) {
      g.fillStyle(cell.ok ? 0x3ddc84 : 0xff4d4d, cell.ok ? 0.35 : 0.5);
      g.fillPoints(hexCorners(hexToScreen(cell.hex)), true);
    }
    if (preview.route) {
      const a = hexToScreen(preview.route.a);
      const b = hexToScreen(preview.route.b);
      g.lineStyle(3, 0xffffff, 0.9);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    if (preview.ghost) {
      // The building being placed, floating over the hovered hex.
      const c = hexToScreen(preview.ghost.hex);
      g.fillStyle(0x000000, 0.35).fillEllipse(c.x, c.y + 2, 26, 9);
      drawItemIcon(g, preview.ghost.item, c.x, c.y - 16, 30, preview.ghost.ok ? 0xffffff : 0xffb0b0, 0.9);
    }
    this.registry.set('status', preview.message);

    // Hover pop-up (DESIGN §12): the item under the mouse gets an outline in its owner's colour, and the UI shows
    // its name and what it does. Not while placing something, so the placement preview stays clear.
    const placing = me.started && this.hand.current() !== null && !this.hand.hammer;
    const found = this.hoverId === null ? undefined : state.entities.find((e) => e.id === this.hoverId);
    const kept = found && isOwnable(found) ? found : null;
    const stays = kept && (this.overUi || (this.hover && hexOf(kept).q === this.hover.q && hexOf(kept).r === this.hover.r));
    const thing = placing ? null : stays ? kept : this.hover ? thingAt(this.runner, this.hover) : null;
    this.hoverId = thing?.id ?? null;
    if (thing) {
      const c = hexToScreen(hexOf(thing));
      g.lineStyle(4, ownerColor(thing.owner), 1);
      g.strokePoints(hexCorners(c), true);
      const cam = this.cameras.main;
      this.registry.set('hoverThing', { id: thing.id, x: (c.x - cam.worldView.x) * cam.zoom, y: (c.y - cam.worldView.y) * cam.zoom });
    } else {
      this.registry.set('hoverThing', null);
    }

    // Structures, then stacks, carriers and piles on top. Pack sprites where there is one (owned items); the rest,
    // and everything from here on, is drawn on the Graphics layer above the sprites.
    g = this.top;
    g.clear();
    this.sprites.begin();
    const entities = state.entities;
    for (const e of entities) {
      if (e.type !== 'structure') continue;
      const i = ctx.indexOf.get(hexKey(e))!;
      if (this.art && this.putStructure(e, i, time)) continue;
      drawStructure(g, e, time, {
        mills: e.kind === 'factory' ? this.millPositions(e) : undefined,
        working: e.kind === 'bridge' ? isWorkingBridge(state, ctx, i) : undefined,
        span: e.kind === 'bridge' ? this.bridgeSpan(i) : undefined,
        toWater: e.kind === 'dock' ? this.towardsWater(i) : undefined,
        hpFraction: e.kind === 'dam' ? e.hp / ctx.config.items.dam.hp : undefined,
        progress: e.kind === 'excavator' ? (e.workTicks ?? 0) / (ctx.config.excavator.digS * ctx.config.tickRate) : undefined,
      });
    }

    // Every workshop the player owns shows the upgrade being researched, filling like the crafting icon (DESIGN §8.5).
    const research = me.research[0];
    if (research && research.totalTicks > 0) {
      const progress = Math.min(1, (research.doneTicks + alpha) / research.totalTicks);
      const typeKind = ctx.upgrades.types[research.type]!.type as ItemKind;
      for (const w of entities) {
        if (w.type !== 'structure' || w.kind !== 'workshop' || w.owner !== this.local) continue;
        const c = hexToScreen(w);
        const box = { x: c.x - 11, y: c.y - 66, s: 22 };
        g.fillStyle(0x6f6f6f, 0.95).fillRect(box.x, box.y, box.s, box.s);
        g.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(box.x, box.y + box.s * (1 - progress), box.s, box.s * progress);
        g.lineStyle(1, 0x000000, 0.8).strokeRect(box.x, box.y, box.s, box.s);
        drawItemIcon(g, typeKind, c.x, box.y + box.s / 2, 18, 0x1e1e1e);
      }
    }

    // Every factory-mill the player owns shows the item being crafted: a grey icon filling with colour from the
    // bottom (DESIGN §7.2).
    const job = me.queue[0];
    if (job && job.totalTicks > 0) {
      const progress = Math.min(1, (job.doneTicks + alpha) / job.totalTicks);
      for (const f of ownFactories(state, this.local)) {
        const c = hexToScreen(f);
        const box = { x: c.x - 11, y: c.y - 58, s: 22 };
        g.fillStyle(0x6f6f6f, 0.95).fillRect(box.x, box.y, box.s, box.s);
        g.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(box.x, box.y + box.s * (1 - progress), box.s, box.s * progress);
        g.lineStyle(1, 0x000000, 0.8).strokeRect(box.x, box.y, box.s, box.s);
        drawItemIcon(g, job.item, c.x, box.y + box.s / 2, 18, 0x1e1e1e);
      }
    }
    MAP.hexes.forEach((h, i) => {
      if (state.debris[i]! <= 0) return;
      const c = hexToScreen(h);
      if (!(this.art && this.sprites.put(state.debrisBurnt[i] ? 'debris_burnt' : 'debris', c.x, c.y))) drawDebris(g, c, state.debrisBurnt[i]);
    });
    MAP.hexes.forEach((h, i) => {
      if (state.stacks[i]! <= 0) return;
      const stage = stackStage(state.stacks[i]!, ctx.config);
      const c = hexToScreen(h);
      if (this.art && stage > 0 && this.sprites.put(`logstack_${stage}`, c.x, c.y)) return;
      const onDock = entities.some((e) => e.type === 'structure' && e.kind === 'dock' && e.q === h.q && e.r === h.r);
      drawStack(g, stackPosition(c, onDock), state.stacks[i]!, ctx);
    });
    // Baby forests (DESIGN §8.7), then carriers and forest guards.
    const growS = ctx.config.forestGuard.growS * ctx.config.tickRate;
    MAP.hexes.forEach((h, i) => {
      if (state.saplingGrowth[i]! >= 0) drawSapling(g, hexToScreen(h), state.saplingGrowth[i]! / growS);
    });
    const stacks = this.unitStacks();
    for (const e of entities) {
      if (e.type !== 'carrier') continue;
      const { at, size } = this.stacked(e, carrierPosition(e, this.runner.prevCarrierQ.get(e.id), alpha), stacks);
      // The cart faces the way it drives along its row.
      const target = (e.phase === 'toA' ? e.pickupQ : e.bQ) * 1000;
      if (target !== e.posQ) this.carrierDir.set(e.id, target > e.posQ ? 1 : -1);
      const cart = { owner: e.owner, size, flipX: (this.carrierDir.get(e.id) ?? 1) < 0 };
      if (!(this.art && this.sprites.put(`carrier.s${this.stage(e.owner, 'carrier')}`, at.x, at.y, cart))) drawCarrier(g, e, at);
    }
    for (const e of entities) {
      if (e.type !== 'guard') continue;
      const { at, size } = this.stacked(e, guardPosition(e, ctx, alpha), stacks);
      if (!(this.art && this.sprites.put(`forestGuard.s${this.stage(e.owner, 'forestGuard')}`, at.x, at.y, { owner: e.owner, size }))) drawGuard(g, e, at, time);
    }
    // Stone cutters, grouped by the rock they work on, with the rock's progress.
    const rockTicks = ctx.config.stoneCutter.secondsPerRock * ctx.config.tickRate;
    const cutters = entities.filter((e): e is StoneCutter => e.type === 'cutter');
    for (const i of [...new Set(cutters.map((c) => ctx.indexOf.get(hexKey(c))!))]) {
      const here = cutters.filter((c) => ctx.indexOf.get(hexKey(c)) === i);
      const c = hexToScreen(ctx.map.hexes[i]!);
      const progress = Math.min(1, state.rockWork[i]! / rockTicks);
      const putCutter = (u: StoneCutter) => {
        const { at, size } = this.stacked(u, c, stacks);
        return this.sprites.put('stoneCutter.base', at.x, at.y, { owner: u.owner, size });
      };
      if (this.art && here.every(putCutter)) {
        g.fillStyle(0x000000, 0.6).fillRect(c.x - 14, c.y + 9, 28, 4);
        g.fillStyle(0xb3b6ba, 1).fillRect(c.x - 14, c.y + 9, 28 * progress, 4);
      } else drawCutters(g, here, c, progress, time);
    }

    const piles = entities.filter((e) => e.type === 'pile');
    while (this.pileLabels.length < piles.length)
      this.pileLabels.push(this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '10px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 1).setDepth(3));
    this.pileLabels.forEach((t, k) => {
      const p = piles[k];
      if (!p || p.type !== 'pile') return t.setVisible(false);
      const at = pilePosition(p, state, ctx, ctx.rates.floatSpeed * alpha);
      drawPile(g, at);
      t.setPosition(at.x + 9, at.y - 2).setText(String(wholeUnits(p.amount))).setVisible(true);
    });

    // Catapults and shots in the air (DESIGN §8.6), then health bars, impacts and damage numbers.
    for (const e of entities) {
      if (e.type !== 'catapult') continue;
      const base = catapultPosition(e, ctx, alpha);
      const { at, size } = this.stacked(e, base, stacks);
      const flipX = hexToScreen({ q: e.aimQ, r: e.aimR }).x < base.x - 1; // the sprite faces east
      if (!(this.art && this.sprites.put(`catapult.s${this.stage(e.owner, 'catapult')}`, at.x, at.y, { owner: e.owner, flipX, size }))) drawCatapult(g, e, at, this.swing(e));
    }
    this.sprites.end();
    for (const e of entities) if (e.type === 'shot') drawShot(g, e, alpha);
    this.drawFires(g, time, alpha);
    this.drawCombatFeedback(g, time, alpha);
  }

  /** Sprite stage 1–3 for the owner's items of a type (neutral items: stage 1). */
  private stage(owner: number, type: string): number {
    const { state, ctx } = this.runner;
    const levels = state.players[owner]?.upgrades[typeIndex(ctx, type)]?.levels ?? [0, 0];
    return STAGE_BY_LEVEL[Math.max(...levels)] ?? 1;
  }

  /** Units of the same kind standing on the same hex, by "kind|hex", in id order. */
  private unitStacks(): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const e of this.runner.state.entities) {
      if (e.type !== 'carrier' && e.type !== 'guard' && e.type !== 'cutter' && e.type !== 'catapult') continue;
      const h = hexOf(e);
      const key = `${e.type}|${h.q},${h.r}`;
      map.set(key, [...(map.get(key) ?? []), e.id]);
    }
    return map;
  }

  /**
   * Where a unit is drawn when others of its kind share its hex: a small stack going back into the hex, each one 30%
   * smaller, so they can all be seen (DESIGN §12). Alone, it's drawn where it is at full size.
   */
  private stacked(e: Ownable, at: Point, stacks: Map<string, number[]>): { at: Point; size: number } {
    const h = hexOf(e);
    const group = stacks.get(`${e.type}|${h.q},${h.r}`) ?? [e.id];
    if (group.length < 2) return { at, size: ITEM_SIZE };
    const k = group.indexOf(e.id);
    const n = group.length;
    const step = { x: 7, y: -5 }; // each further one sits up and to the right (further back)
    return { at: { x: at.x + (k - (n - 1) / 2) * step.x, y: at.y + (k - (n - 1) / 2) * step.y }, size: ITEM_SIZE * STACKED_SIZE };
  }

  /** A structure as a pack sprite (grey when neutral). False (draw the placeholder) if the sprite is missing. */
  private putStructure(e: Structure, i: number, time: number): boolean {
    const { state, ctx } = this.runner;
    const c = hexToScreen(e);
    const owner = e.owner;
    const size = ITEM_SIZE;
    const flow = this.flowAt(i);
    switch (e.kind) {
      case 'outpost':
        return this.sprites.put(`outpost.s${this.stage(owner, 'outpost')}`, c.x, c.y, { owner, size });
      case 'factory': {
        // The wheel is drawn on the south-west side: mirror it when the river is east. The building stands at the
        // edge of its hex, with the wheel in the water.
        const mill = this.millPositions(e)[0];
        const at = mill ? { x: c.x + (mill.x - c.x) * 0.45, y: c.y + (mill.y + 4 - c.y) * 0.45 } : c;
        return this.sprites.put(`mill.s${this.stage(owner, 'factory')}`, at.x, at.y, { owner, size, flipX: !!mill && mill.x > c.x });
      }
      case 'dock': {
        const w = this.towardsWater(i);
        return this.sprites.put(`dock.s${this.stage(owner, 'dock')}`, c.x, c.y, { owner, size, flipX: !!w && w.x > 0 });
      }
      case 'bridge':
        return this.sprites.put(`bridge.s${this.stage(owner, 'bridge')}.flow${flow}`, c.x, c.y, { owner, alpha: isWorkingBridge(state, ctx, i) ? 1 : 0.55 }); // spans the river: natural size
      case 'dam': {
        const damaged = e.hp * 2 < maxHp(state, ctx, e);
        return this.sprites.put(damaged ? `dam.damaged_flow${flow}` : `dam.flow${flow}`, c.x, c.y, { owner }); // spans the river: natural size
      }
      case 'workshop':
        return this.sprites.put(`workshop.s${this.stage(owner, 'workshop')}`, c.x, c.y, { owner, size });
      case 'excavator':
        return this.sprites.put((e.workTicks ?? 0) > 0 ? 'excavator.digging' : 'excavator.base', c.x, c.y, { owner, size });
      case 'woodchopper': {
        // Walks a loop around its trees (DESIGN §6.2: animation only), facing the way it walks.
        const a = ((time / CHOPPER_LAP_MS + e.id * 0.37) % 1) * Math.PI * 2;
        const rx = HEX_SIZE * 0.42;
        const ry = HEX_SIZE * 0.42 * ISO_SQUASH;
        const x = c.x + Math.cos(a) * rx;
        const y = c.y + Math.sin(a) * ry + 2;
        const name = `woodchopper.s${this.stage(owner, 'woodchopper')}`;
        return this.sprites.put(name, x, y, { owner, size, flipX: Math.sin(a) > 0 }); // dx/da = -sin(a): walking west when sin > 0
      }
    }
  }

  /** Which way the water runs on a water hex: towards the south-west or the south-east hex below it. */
  private flowAt(i: number): WaterFlow {
    const { state, ctx } = this.runner;
    const down = downstream(state, ctx, i);
    const first = down === 'exit' ? undefined : down[0];
    return first !== undefined && ctx.map.hexes[first]!.q < ctx.map.hexes[i]!.q ? 'SW' : 'SE';
  }

  /** Terrain tile or river water for one hex (pack art). */
  private addTileSprite(h: MapHex): void {
    const i = MAP.hexes.indexOf(h);
    const c = hexToScreen(h);
    const scale = packScale(HEX_SIZE);
    if (h.terrain === 'river') {
      const strength = (riverStrengthLevel(MAP, h.r, STRENGTH_LEVELS) - 1) / Math.max(1, MAX_STRENGTH - 1);
      const w = addWaterSprite(this, c.x, c.y, this.flowAt(i), strength)?.setScale(scale);
      if (w) this.riverWater.set(i, w);
      return;
    }
    this.tiles[i] = addPackSprite(this, 'hex_land', c.x, c.y)?.setScale(scale);
  }

  /** Water held behind a dam doesn't flow: those hexes show still water (DESIGN §8.4b). */
  private refreshStillWater(): void {
    const { state, ctx } = this.runner;
    const held = new Set<number>();
    for (const e of state.entities) {
      if (e.type !== 'structure' || e.kind !== 'dam') continue;
      const d = ctx.indexOf.get(hexKey(e))!;
      if (ctx.forkBranch[d]) continue; // on a fork it sends the wood down the other branch: the water still runs
      for (let j = 0; j < ctx.map.hexes.length; j++) {
        if (!isWater(state, ctx, j)) continue;
        const down = downstream(state, ctx, j);
        if (down !== 'exit' && down.includes(d)) held.add(j);
      }
    }
    for (const [i, w] of [...this.riverWater, ...this.dugWater]) {
      if (held.has(i)) w.anims.pause();
      else if (w.anims.isPaused) w.anims.resume();
    }
  }

  /** Terrain tiles follow the state: forest, cut forest, baby forest, rock, dug land, dug water. */
  private refreshTiles(): void {
    const { state, ctx } = this.runner;
    MAP.hexes.forEach((h, i) => {
      const tile = this.tiles[i];
      if (!tile) return;
      if (state.dugWater[i]) {
        tile.setVisible(false);
        if (!this.dugWater.has(i)) {
          const c = hexToScreen(h);
          const strength = state.dugStrength[i]! / Math.max(1, MAX_STRENGTH - 1);
          const w = addWaterSprite(this, c.x, c.y, this.flowAt(i), strength)?.setScale(packScale(HEX_SIZE));
          if (w) this.dugWater.set(i, w);
        }
        return;
      }
      const frame = state.dug[i]
        ? 'hex_dug'
        : isRock(state, ctx, i)
          ? 'hex_rock'
          : state.forestPool[i]! > 0
            ? 'hex_forest'
            : state.saplingGrowth[i]! >= 0
              ? 'hex_forest_baby'
              : h.terrain === 'forest' || state.grownForest[i]
                ? 'hex_forest_depleted'
                : 'hex_land';
      tile.setFrame(frame).setVisible(true);
    });
  }

  /** The throwing arm swings forward for a moment after a shot: 1 just fired → 0 cocked. */
  private swing(c: Catapult): number {
    const { ctx } = this.runner;
    const full = Math.round(ctx.config.tickRate / ctx.config.catapult.hitsPerSecond);
    const since = full - c.fireTicks;
    return c.fireTicks > 0 && since < 4 ? 1 - since / 4 : 0;
  }

  /** Flames on burning items, forests and debris (DESIGN §9b), and the hammer's progress on items being dismantled. */
  private drawFires(g: Phaser.GameObjects.Graphics, time: number, alpha: number): void {
    const { state, ctx } = this.runner;
    for (const e of state.entities) {
      if (!isOwnable(e)) continue;
      const at = this.screenPos(e, alpha);
      if (e.fire) drawFlames(g, at, fireStrength(ctx, e.fire, maxHp(state, ctx, e) * MILLI), time, e.id);
      if (e.dismantleTicks !== undefined) {
        const total = craftTicks(state, ctx, e.owner, kindOf(e));
        drawDismantleBar(g, { x: at.x, y: at.y + 8 }, 1 - e.dismantleTicks / Math.max(1, total));
      }
    }
    MAP.hexes.forEach((h, i) => {
      const forest = state.forestFire[i];
      if (forest) drawFlames(g, hexToScreen(h), fireStrength(ctx, forest, ctx.config.forest.woodPool * MILLI), time, i);
      const debris = state.debrisFire[i];
      if (debris) drawFlames(g, hexToScreen(h), fireStrength(ctx, debris, state.debris[i]! * MILLI), time, i + 7);
    });
  }

  /** Where an item is drawn right now. */
  private screenPos(e: Ownable, alpha: number): Point {
    const { ctx } = this.runner;
    if (e.type === 'carrier') return carrierPosition(e, this.runner.prevCarrierQ.get(e.id), alpha);
    if (e.type === 'guard') return guardPosition(e, ctx, alpha);
    if (e.type === 'catapult') return catapultPosition(e, ctx, alpha);
    return hexToScreen(e);
  }

  /**
   * Health bars only for a while after an HP change (damage, healing, HP upgrade) and while hovered (DESIGN §9). A
   * landed shot leaves a dust puff; damage shows as a red number rising above the item.
   */
  private drawCombatFeedback(g: Phaser.GameObjects.Graphics, time: number, alpha: number): void {
    const { state, ctx } = this.runner;
    const shots = new Map<number, { at: Point; targetId: number; damage: number }>();
    for (const e of state.entities) if (e.type === 'shot') shots.set(e.id, { at: hexToScreen({ q: e.toQ, r: e.toR }), targetId: e.targetId, damage: e.damage });
    for (const [id, shot] of this.shotsSeen) {
      if (shots.has(id)) continue;
      this.impacts.push({ at: shot.at, t0: time });
      // A killing blow: the target is gone, so its HP change can't be seen below.
      const target = state.entities.find((e) => e.id === shot.targetId);
      if (this.hpSeen.has(shot.targetId) && !target) this.floatNumber(shot.at, shot.damage, time);
      // A hit on a burning target: its HP change is mixed with fire damage, so show the hit itself.
      else if (target && isOwnable(target) && target.fire && this.hpSeen.get(target.id) !== target.hp) this.floatNumber(shot.at, shot.damage, time);
    }
    this.shotsSeen = shots;

    const seen = new Map<number, number>();
    for (const e of state.entities) {
      if (!isOwnable(e)) continue;
      const before = this.hpSeen.get(e.id);
      if (before !== undefined && before !== e.hp) {
        this.barUntil.set(e.id, time + BAR_MS);
        // Hits get a number; fire damage only shows on the bar (it ticks every moment, numbers would pile up).
        if (e.hp < before && !e.fire) this.floatNumber(this.screenPos(e, alpha), before - e.hp, time);
      }
      seen.set(e.id, e.hp);
      const until = this.barUntil.get(e.id) ?? 0;
      if (until <= time && e.id !== this.hoverId) continue;
      const p = this.screenPos(e, alpha);
      const fade = e.id === this.hoverId ? 1 : Math.min(1, (until - time) / 500);
      drawHealthBar(g, { x: p.x, y: p.y - (e.type === 'structure' ? 50 : 30) }, e.hp / maxHp(state, ctx, e), fade);
    }
    this.hpSeen = seen;

    this.impacts = this.impacts.filter((f) => time - f.t0 < IMPACT_MS);
    for (const f of this.impacts) drawImpact(g, f.at, (time - f.t0) / IMPACT_MS);
    this.numbers = this.numbers.filter((n) => {
      const t = (time - n.t0) / NUMBER_MS;
      if (t >= 1) {
        n.text.destroy();
        return false;
      }
      n.text.setPosition(n.at.x, n.at.y - 56 - 22 * t).setAlpha(1 - t * t);
      return true;
    });
  }

  private floatNumber(at: Point, amount: number, time: number): void {
    const text = this.add
      .text(at.x, at.y - 56, `-${amount}`, { fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ff4d3d', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(1000);
    this.numbers.push({ text, at, t0: time });
  }

  /** One water wheel per distinct river, on the factory-mill's side facing that river's strongest touching hex. */
  private millPositions(f: Structure): Point[] {
    const { ctx, state } = this.runner;
    const c = hexToScreen(f);
    return watermills(state, ctx, f).map((m) => {
      const n = ctx.neighbourIdx[ctx.indexOf.get(hexKey(f))!]!.find(
        (j) => isWater(state, ctx, j) && riverIdAt(state, ctx, j) === m.river && bonusRow(state, ctx, j) === m.row,
      )!;
      const w = hexToScreen(ctx.map.hexes[n]!);
      return { x: c.x + (w.x - c.x) * 0.55, y: c.y + (w.y - c.y) * 0.55 - 4 };
    });
  }

  /** Screen vector from a dock's hex towards a water hex next to it (the pier points that way). */
  private towardsWater(i: number): Point | undefined {
    const { ctx, state } = this.runner;
    const w = ctx.neighbourIdx[i]!.find((j) => isWater(state, ctx, j));
    if (w === undefined) return undefined;
    const a = hexToScreen(ctx.map.hexes[i]!);
    const b = hexToScreen(ctx.map.hexes[w]!);
    return { x: b.x - a.x, y: b.y - a.y };
  }

  /**
   * Screen vector along the direction a bridge piece spans: the first of the three hex axes with land or bridge on
   * both sides, else east–west.
   */
  private bridgeSpan(i: number): Point {
    const { ctx, state } = this.runner;
    const h = ctx.map.hexes[i]!;
    const at = (q: number, r: number) => ctx.indexOf.get(`${q},${r}`);
    const ok = (j: number | undefined) =>
      j !== undefined && (!isWater(state, ctx, j) || state.entities.some((e) => e.type === 'structure' && e.kind === 'bridge' && ctx.indexOf.get(hexKey(e)) === j));
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1]] as const) {
      if (ok(at(h.q + dq, h.r + dr)) && ok(at(h.q - dq, h.r - dr))) {
        const a = hexToScreen(h);
        const b = hexToScreen({ q: h.q + dq, r: h.r + dr });
        return { x: b.x - a.x, y: b.y - a.y };
      }
    }
    return { x: HEX_SIZE * Math.sqrt(3), y: 0 };
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    let downAt: { x: number; y: number } | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
      if (p.rightButtonDown()) this.hand.cancel();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Over the UI (e.g. the hover pop-up), keep the current hover so its buttons can be reached.
      this.overUi = this.scene.get('UIScene').input.hitTestPointer(p).length > 0;
      if (this.overUi) return;
      this.hover = screenToHex(this.cameras.main.getWorldPoint(p.x, p.y));
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      // A click is a press and release without dragging (dragging pans the camera).
      if (!downAt || p.rightButtonReleased() || Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) return;
      if (this.scene.get('UIScene').input.hitTestPointer(p).length > 0) return; // clicked a UI button
      this.hand.click(screenToHex(this.cameras.main.getWorldPoint(p.x, p.y)));
    });
    this.input.keyboard?.on('keydown-ESC', () => this.hand.cancel());
  }

  private drawTile(g: Phaser.GameObjects.Graphics, h: MapHex): void {
    const c = hexToScreen(h);
    const top = hexCorners(c);
    const isRiver = h.terrain === 'river';

    // Side face (visible on the south half) gives the isometric tile some thickness.
    const depth = isRiver ? TILE_DEPTH - 3 : TILE_DEPTH;
    const surfaceY = isRiver ? 3 : 0; // water sits slightly lower than land
    g.fillStyle(isRiver ? COLORS.riverSide : COLORS.side, 1);
    const side = [top[0]!, top[1]!, top[2]!, top[3]!].map((p) => ({ x: p.x, y: p.y + surfaceY }));
    g.fillPoints([...side, ...[...side].reverse().map((p) => ({ x: p.x, y: p.y + depth }))], true);

    const surface = top.map((p) => ({ x: p.x, y: p.y + surfaceY }));
    g.fillStyle(isRiver ? riverColor(h.r) : COLORS[h.terrain], 1);
    g.fillPoints(surface, true);
    g.lineStyle(1, COLORS.outline, 0.18);
    g.strokePoints(surface, true);
  }

  private drawTrees(g: Phaser.GameObjects.Graphics, h: MapHex): void {
    const c = hexToScreen(h);
    const s = HEX_SIZE;
    const spots = [
      { x: -0.38, y: -0.12 },
      { x: 0.36, y: -0.18 },
      { x: 0, y: 0.18 },
    ];
    for (const o of spots) {
      const x = c.x + o.x * s;
      const y = c.y + o.y * s;
      g.fillStyle(COLORS.trunk, 1);
      g.fillRect(x - 2, y - 3, 4, 6);
      g.fillStyle(COLORS.tree, 1);
      g.fillTriangle(x - 9, y - 2, x + 9, y - 2, x, y - 24);
      g.fillStyle(COLORS.treeLight, 1);
      g.fillTriangle(x - 7, y - 11, x + 7, y - 11, x, y - 28);
    }
  }

  private drawRock(g: Phaser.GameObjects.Graphics, h: MapHex): void {
    const c = hexToScreen(h);
    g.fillStyle(COLORS.rock1, 1);
    g.fillPoints(
      [
        { x: c.x - 14, y: c.y + 4 },
        { x: c.x - 10, y: c.y - 9 },
        { x: c.x + 1, y: c.y - 15 },
        { x: c.x + 12, y: c.y - 7 },
        { x: c.x + 15, y: c.y + 4 },
      ],
      true,
    );
    g.fillStyle(COLORS.rock2, 1);
    g.fillTriangle(c.x - 9, c.y - 8, c.x + 1, c.y - 14, c.x - 1, c.y - 1);
  }

  /** Chevrons from each river hex toward its downstream hex(es); exits point off the southern edge. */
  private drawRiverFlow(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COLORS.arrow, 0.85);
    for (const f of MAP.riverFlow) {
      const from = hexToScreen(f);
      const targets: Point[] =
        f.down === 'exit' ? [{ x: from.x, y: from.y + HEX_SIZE * 1.5 * ISO_SQUASH }] : f.down.map((d) => hexToScreen(d));
      for (const to of targets) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        // Arrow sits on the way out of the hex, pointing downstream; it grows with river strength.
        const k = 0.6 + (0.7 * (riverStrengthLevel(MAP, f.r, STRENGTH_LEVELS) - 1)) / Math.max(1, MAX_STRENGTH - 1);
        const tip = { x: from.x + ux * 14 * k, y: from.y + uy * 14 * k };
        const back = { x: from.x - ux * 2 * k, y: from.y - uy * 2 * k };
        const px = -uy * 6 * k;
        const py = ux * 6 * k;
        g.fillTriangle(tip.x, tip.y, back.x + px, back.y + py, back.x - px, back.y - py);
      }
    }
  }

  /** Foam on the southern edge of each river hex that drops over a waterfall, plus a label at the map's east edge. */
  private drawWaterfalls(g: Phaser.GameObjects.Graphics): void {
    for (const row of MAP.waterfallAfterRows) {
      for (const f of MAP.riverFlow) {
        if (f.r !== row) continue;
        const c = hexToScreen(f);
        const corners = hexCorners(c);
        // Southern edges: corners 1 → 2 → 3 (south-east, south, south-west).
        g.lineStyle(8, COLORS.foam, 1);
        g.strokePoints([corners[1]!, corners[2]!, corners[3]!], false);
        g.fillStyle(COLORS.foam, 0.9);
        for (const dx of [-14, -7, 0, 7, 14]) g.fillCircle(c.x + dx, corners[2]!.y + 7 - Math.abs(dx) * 0.2, 3);
      }
      const rowHexes = MAP.hexes.filter((h) => h.r === row).map(hexToScreen);
      const east = Math.max(...rowHexes.map((p) => p.x));
      const y = rowHexes[0]!.y + HEX_SIZE * 0.75 * ISO_SQUASH;
      this.add
        .text(east + HEX_SIZE * 1.2, y, ['≈ Waterfall', 'river slope resets'], {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#1d4f9ccc',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0, 0.5);
    }
  }

  private drawRegionBorders(g: Phaser.GameObjects.Graphics, idx: Map<string, MapHex>): void {
    g.lineStyle(3, COLORS.regionBorder, 0.9);
    for (const h of MAP.hexes) {
      const corners = hexCorners(hexToScreen(h));
      DIRECTIONS.forEach((d, k) => {
        const n = idx.get(hexKey({ q: h.q + d.q, r: h.r + d.r }));
        if (!n || n.region === h.region) return;
        const [a, b] = edgeCorners(k);
        g.lineBetween(corners[a]!.x, corners[a]!.y, corners[b]!.x, corners[b]!.y);
      });
    }
  }

  private drawRegionLabels(): void {
    for (let r = 0; r < REGION_NAMES.length; r++) {
      const own = MAP.hexes.filter((h) => h.region === r);
      const pts = own.map(hexToScreen);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      // Labels sit above the map, one per vertical strip.
      const cy = Math.min(...MAP.hexes.map((h) => hexToScreen(h).y)) - HEX_SIZE * 1.3;
      this.add
        .text(cx, cy, REGION_NAMES[r]!, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#fff3c4',
          backgroundColor: '#00000088',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5)
        .setAlpha(0.9);
    }
  }

  /** Axial coordinate labels, toggled with C, so the designer can refer to specific hexes. */
  private createCoordLabels(): void {
    for (const h of MAP.hexes) {
      const c = hexToScreen(h);
      const t = this.add
        .text(c.x, c.y + 6, hexKey(h as Hex), { fontFamily: 'monospace', fontSize: '9px', color: '#000000' })
        .setOrigin(0.5)
        .setVisible(new URLSearchParams(window.location.search).has('coords'));
      this.coordLabels.push(t);
    }
    this.input.keyboard?.on('keydown-C', () => {
      for (const t of this.coordLabels) t.setVisible(!t.visible);
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    const pts = MAP.hexes.map(hexToScreen);
    const minX = Math.min(...pts.map((p) => p.x)) - HEX_SIZE * 2;
    const maxX = Math.max(...pts.map((p) => p.x)) + HEX_SIZE * 5; // room for the waterfall label
    const minY = Math.min(...pts.map((p) => p.y)) - HEX_SIZE * 3;
    const maxY = Math.max(...pts.map((p) => p.y)) + HEX_SIZE * 3;
    // The camera stays on the map: the furthest you can zoom out shows the whole map as big as it fits the window,
    // and you can only zoom in from there.
    // The build panel covers the right edge of the screen: the map fits left of it, with room to scroll past.
    const fitZoom = () => Math.min(ZOOM_MAX, (this.scale.width - SIDE_PANEL_PX) / (maxX - minX), this.scale.height / (maxY - minY));
    const bound = () => {
      // Spare height at the furthest zoom goes equally above and below, so the map sits in the middle.
      const spareY = Math.max(0, (this.scale.height / fitZoom() - (maxY - minY)) / 2);
      cam.setBounds(minX, minY - spareY, maxX - minX + SIDE_PANEL_PX / fitZoom(), maxY - minY + 2 * spareY);
    };
    bound();
    cam.setZoom(fitZoom());
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);

    // Dev: `?zoom=2.5` zooms onto the local player's first outpost (close-up screenshots with `?demo`).
    const zoomParam = new URLSearchParams(window.location.search).get('zoom');
    const outpost = this.runner.state.entities.find((e) => e.type === 'structure' && e.kind === 'outpost' && e.owner === this.local);
    if (import.meta.env.DEV && zoomParam && outpost?.type === 'structure') {
      const c = hexToScreen(outpost);
      cam.setZoom(Number(zoomParam));
      cam.centerOn(c.x, c.y);
    }

    // Pan: drag with any mouse button.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    // Zoom: mouse wheel, anchored on the cursor.
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), fitZoom(), ZOOM_MAX));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    // A resized window changes how far out the whole map fits.
    const refit = () => {
      bound();
      cam.setZoom(Math.max(cam.zoom, fitZoom()));
    };
    this.scale.on('resize', refit);
    this.events.once('shutdown', () => this.scale.off('resize', refit));

    // Keyboard pan.
    const keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.events.on('update', (_t: number, dt: number) => {
      if (!keys) return;
      const v = (dt * 0.6) / cam.zoom;
      if (keys.A!.isDown || keys.LEFT!.isDown) cam.scrollX -= v;
      if (keys.D!.isDown || keys.RIGHT!.isDown) cam.scrollX += v;
      if (keys.W!.isDown || keys.UP!.isDown) cam.scrollY -= v;
      if (keys.S!.isDown || keys.DOWN!.isDown) cam.scrollY += v;
    });
  }
}
