import Phaser from 'phaser';
import { wholeUnits } from '../../sim/fixed';
import { hashState } from '../../sim/hash';
import { CRAFTABLE, craftCost, craftError, craftReductionBp, craftTicks, ownFactories } from '../../sim/systems/crafting';
import { currentTurnPlayer } from '../../sim/systems/startTurns';
import type { ItemKind, Structure } from '../../sim/types';
import { type Hex, distance } from '../../sim/hex';
import { dropOffs, pickupError, placementError } from '../../sim/systems/placement';
import { HEX_SIZE, ISO_SQUASH, hexToScreen } from '../iso';
import { drawItemIcon } from '../render/icons';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';
import type { PlacementHand } from '../input/placementHand';
import { ITEM_DESCRIPTIONS, ITEM_NAMES } from '../ui/items';
import { canDismantle, describe, kindOf, refundOf } from '../ui/describe';
import { WorkshopPanel } from '../ui/workshopPanel';
import { type ToolIcon, addItemSprite, drawToolIcon } from '../ui/pixelIcons';
import { ownsWorkshop } from '../../sim/upgrades';
import { toggleVolumePanel } from '../ui/volume';
import { BIRCH, BTN, BTN_ON, CHAR, EMBER, FONT, HUD, MUTED, plywoodEdge } from '../ui/theme';

const TEXT_STYLE = {
  fontFamily: FONT,
  fontSize: '13px',
  color: BIRCH,
  backgroundColor: '#24160ddd',
  padding: { x: 6, y: 4 },
};
/** Height of a build-list row. */
const ROW_H = 28;
/** Height of the top strip (menu, players, clock, stone, wood). */
const BAR_H = HUD.top;
/** Big text: the pause banner and the end screen. */
const BIG = { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: BIRCH, padding: { x: 12, y: 8 } };

/** One step of the setup guide: what to place and why, and the hex the arrow points at. */
interface Guide {
  title: string;
  body: string;
  hex: Hex | null;
}

interface BuildRow {
  item: ItemKind;
  hl: Phaser.GameObjects.Rectangle;
  price: Phaser.GameObjects.Text;
  /** Build time and what to do next, on the open row only. */
  info?: Phaser.GameObjects.Text;
}

interface DockButton {
  g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  size: number;
  icon: () => ToolIcon;
  label: () => string;
  bg: () => number;
  active: () => boolean;
  /** What it was last drawn as. */
  key: string;
}

/** A small log, the wood price mark. */
function drawLogIcon(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x8a5a2b, 1).fillRoundedRect(x - 9, y - 4, 16, 8, 3);
  g.fillStyle(0xd9b77e, 1).fillCircle(x + 6, y, 3.6);
  g.fillStyle(0x8a5a2b, 1).fillCircle(x + 6, y, 1.2);
}

/** Screen-fixed UI drawn above GameScene, unaffected by the map camera's pan and zoom. */
export class UIScene extends Phaser.Scene {
  private runner!: SimRunner;
  private woodText!: Phaser.GameObjects.Text;
  private stoneText!: Phaser.GameObjects.Text;
  private handText!: Phaser.GameObjects.Text;
  private warehouseChips: Phaser.GameObjects.GameObject[] = [];
  private warehouseKey = '';
  private warehouseAt = { x: 0, y: 0 };
  private statusText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private pausedBanner!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Container;
  private menuItems: { text: Phaser.GameObjects.Text; label: () => string }[] = [];
  private playerDots!: Phaser.GameObjects.Graphics;
  private playersRight = 0;
  private debugText!: Phaser.GameObjects.Text;
  private guideBox!: Phaser.GameObjects.Container;
  private guideBg!: Phaser.GameObjects.Graphics;
  private guideTitle!: Phaser.GameObjects.Text;
  private guideBody!: Phaser.GameObjects.Text;
  private guideArrow!: Phaser.GameObjects.Graphics;
  private guideW = 0;
  private guideH = 0;
  /** The marked castle hex and the half-second it was worked out in. */
  private castleSpot: Hex | null = null;
  private castleKey = -1;
  /** The last guide step and what it was worked out from (the legal-spot search runs twice a second, not every frame). */
  private guide: Guide | null = null;
  private guideKey = '';
  private rejoinButton!: Phaser.GameObjects.Text;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private alertText!: Phaser.GameObjects.Text;
  private queueGfx!: Phaser.GameObjects.Graphics;
  private queueText: Phaser.GameObjects.Text | undefined;
  private rows: BuildRow[] = [];
  private hoverRow: ItemKind | null = null;
  private dockButtons: DockButton[] = [];
  /** The hovered dock button or warehouse item: its name shows above it. */
  private dockTip: { text: () => string; x: number; y: number } | null = null;
  private dockLabel!: Phaser.GameObjects.Text;
  private workshop: WorkshopPanel | undefined;
  private hadWorkshop = false;
  private tip!: Phaser.GameObjects.Container;
  private tipKey = '';
  private confirm!: Phaser.GameObjects.Container;
  private confirmText!: Phaser.GameObjects.Text;
  private confirmYes!: Phaser.GameObjects.Text;
  /** What the confirmation's yes button does (dismantle or surrender). */
  private onConfirm: (() => void) | null = null;
  private defeatText!: Phaser.GameObjects.Text;
  private endShown = false;

  constructor() {
    super('UIScene');
  }

  /** Our player slot. */
  private get local(): number {
    return this.runner.localPlayer;
  }

  create(): void {
    this.runner = this.registry.get('runner') as SimRunner;
    this.rows = [];
    this.queueText = undefined;
    this.hoverRow = null;
    this.workshop = undefined;
    const { width, height } = this.scale;
    // Top strip: Menu, players, the clock (click it to pause), stone, and wood large at the top right (DESIGN §7.1).
    const bar = this.add.graphics();
    bar.fillStyle(CHAR, 0.94).fillRect(0, 0, width, BAR_H);
    plywoodEdge(bar, 0, BAR_H, width);
    this.add.text(12, BAR_H + 14, 'N ▲', { ...TEXT_STYLE, fontStyle: 'bold' }); // north is uphill: rivers flow south

    const icon = this.add.graphics();
    const ix = width - 150;
    icon.fillStyle(0x8a5a2b, 1);
    icon.fillRoundedRect(ix, 22, 34, 12, 5);
    icon.fillRoundedRect(ix + 4, 12, 30, 12, 5);
    icon.fillStyle(0xd9b77e, 1);
    icon.fillCircle(ix + 32, 28, 5.5);
    icon.fillCircle(ix + 32, 18, 5.5);
    this.woodText = this.add.text(width - 105, 6, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: BIRCH });
    // Stone (DESIGN §7.3a), left of the wood count.
    const sx = width - 250;
    icon.fillStyle(0x8a8d91, 1).fillPoints(
      [
        { x: sx, y: 34 },
        { x: sx + 4, y: 18 },
        { x: sx + 16, y: 12 },
        { x: sx + 28, y: 20 },
        { x: sx + 32, y: 34 },
      ],
      true,
    );
    icon.fillStyle(0xb3b6ba, 1).fillTriangle(sx + 6, 20, sx + 16, 14, sx + 14, 28);
    this.stoneText = this.add.text(sx + 40, 10, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#d9dbe0' });

    // Time played (match ticks, so it stops while paused); clicking it pauses and resumes.
    this.clockText = this.add
      .text(sx - 24, 11, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: BIRCH, padding: { x: 10, y: 4 } })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.runner.setPaused(!this.runner.paused));

    const menuButton = this.add
      .text(8, 11, '≡  Menu', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: BIRCH, padding: { x: 10, y: 4 } })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.menu.setVisible(!this.menu.visible));
    this.playersRight = menuButton.getBounds().right + 18;
    this.createMenu();
    this.defeatText = this.add
      .text((width - HUD.right) / 2, 142, 'You are out of the match: watching until it ends.', { ...TEXT_STYLE, fontSize: '16px', fontStyle: 'bold', backgroundColor: '#8a2a1ecc' })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.endShown = false;
    this.pausedBanner = this.add
      .text((width - HUD.right) / 2, height / 2, '', { ...BIG, fontSize: '40px', align: 'center', backgroundColor: '#24160dee', padding: { x: 24, y: 14 } })
      .setOrigin(0.5)
      .setDepth(400);

    // Shadows that fade the map into the screen edges under the build column and the tool dock.
    const fade = this.add.graphics();
    fade.fillGradientStyle(CHAR, CHAR, CHAR, CHAR, 0, 0.8, 0, 0.8).fillRect(width - HUD.right - 70, BAR_H, HUD.right + 70, height - BAR_H);
    fade.fillGradientStyle(CHAR, CHAR, CHAR, CHAR, 0, 0, 0.75, 0.75).fillRect(0, height - HUD.bottom - 40, width - HUD.right - 70, HUD.bottom + 40);

    this.createBuildColumn();
    this.createDock();

    this.statusText = this.add.text((width - HUD.right) / 2, height - HUD.bottom - 8, '', { ...TEXT_STYLE, fontSize: '15px' }).setOrigin(0.5, 1);
    // Tick, seed and state hash, for bug reports: only with ?debug in the address.
    this.debugText = this.add
      .text(12, height - 8, '', { fontFamily: 'monospace', fontSize: '10px', color: '#8a8a8a' })
      .setOrigin(0, 1)
      .setVisible(new URLSearchParams(location.search).has('debug'));

    // Guide box for the first steps (castle, free mill, dock and carrier): a big box in the middle with an arrow to a legal spot.
    this.guideW = Math.min(560, width - HUD.right - 60);
    this.guideBg = this.add.graphics();
    this.guideTitle = this.add
      .text(0, 16, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: BIRCH, align: 'center', wordWrap: { width: this.guideW - 40 } })
      .setOrigin(0.5, 0);
    this.guideBody = this.add
      .text(0, 56, '', { fontFamily: FONT, fontSize: '17px', color: '#e6d6b8', align: 'center', lineSpacing: 4, wordWrap: { width: this.guideW - 44 } })
      .setOrigin(0.5, 0);
    this.guideArrow = this.add.graphics().setDepth(400);
    this.guideBox = this.add.container(0, 0, [this.guideBg, this.guideTitle, this.guideBody]).setDepth(401).setVisible(false);
    this.guideKey = '';
    this.rejoinButton = this.add
      .text((width - HUD.right) / 2, BAR_H + 114, 'Take back control', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', backgroundColor: BTN_ON, padding: { x: 12, y: 6 } })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.runner.submit({ type: 'takeControl', player: this.local }));

    // Players, in the top strip after Menu: a colour dot and a name each. Alerts (desync, disconnects, host gone).
    this.playerDots = this.add.graphics();
    this.playerTexts = this.runner.state.players.map(() => this.add.text(0, 16, '', { fontFamily: FONT, fontSize: '15px', color: BIRCH }));
    this.alertText = this.add
      .text((width - HUD.right) / 2, height - 190, '', { ...TEXT_STYLE, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#8a2a1ecc' })
      .setOrigin(0.5, 1);

    this.createTooltip();
    this.createConfirm();

    // Re-layout on window resize; the scale manager is global, so drop the listener when the scene restarts.
    const relayout = () => this.scene.restart();
    this.scale.on('resize', relayout);
    this.events.once('shutdown', () => this.scale.off('resize', relayout));
    const ask = (id: number) => this.askDismantle(id);
    this.game.events.on('ask-dismantle', ask);
    this.events.once('shutdown', () => this.game.events.off('ask-dismantle', ask));
  }

  override update(): void {
    const { state, ctx } = this.runner;
    const me = state.players[this.local]!;
    this.woodText.setText(String(wholeUnits(me.wood)));
    this.stoneText.setText(String(me.stone));

    const secs = Math.floor(state.tick / ctx.config.tickRate);
    const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const paused = this.runner.paused;
    const clock = secs >= 3600 ? `${Math.floor(secs / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
    this.clockText.setText(`${paused ? '▶' : '⏸'}  ${clock}`).setBackgroundColor(paused ? BTN_ON : '#00000000');
    this.defeatText.setVisible(me.defeated && state.phase !== 'over');
    if (state.phase === 'over' && !this.endShown) this.showEndScreen();
    for (const m of this.menuItems) m.text.setText(m.label());
    const by = this.runner.session.pausedBy;
    this.pausedBanner
      .setText(`PAUSED\n${by === null || by === this.local ? 'by you' : `by ${this.slotName(by)}`}`)
      .setVisible(paused);

    this.updateBuildColumn();
    this.handText.setText(me.hand.length ? `In hand: ${me.hand.map((i) => ITEM_NAMES[i]).join(', ')}` : '').setVisible(me.hand.length > 0);
    this.updateDock();
    this.updateWarehouse();
    const status = (this.registry.get('status') as string | undefined) ?? '';
    this.statusText.setText(status).setVisible(status !== '');
    this.updateTutorial();
    this.workshop?.update();
    if (ownsWorkshop(state, this.local) !== this.hadWorkshop) this.scene.restart(); // the Workshop tab (un)locks
    this.updateTooltip();
    this.updatePlayers();
    this.debugText.setText(`tick ${state.tick}  seed ${this.registry.get('seed')}  hash ${hashState(state).toString(16)}`);
  }

  /** Name shown for a slot. */
  private slotName(i: number): string {
    return this.runner.session.info.slots[i]?.name ?? 'Bot';
  }

  /**
   * Tutorial and turn guidance (DESIGN §5): whose starting turn it is and the time left, then the first factory-mill.
   * If a bot has our slot, offer to take it back.
   */
  private updateTutorial(): void {
    const { state, ctx } = this.runner;
    const me = state.players[this.local]!;
    const secs = Math.ceil(state.startTurns.ticksLeft / ctx.config.tickRate);
    const turn = currentTurnPlayer(state);
    let guide: Guide | null = null;
    if (me.bot) {
      guide = { title: 'A bot has your slot', body: 'You ran out of time on your starting turn. You can step back in whenever you like, at the point the bot has reached.', hex: null };
    } else if (!me.started && turn !== null && turn !== this.local) {
      guide = { title: `Waiting for ${this.slotName(turn)} (${secs} s)`, body: 'Players place their castle one after another, in a random order. Plan around what the others choose.', hex: null };
    } else if (!me.started) {
      guide = {
        title: turn === this.local ? `Your turn: place your castle (${secs} s)` : 'Place your castle',
        body: 'Click the marked hex, or any green one in your highlighted region. The castle claims territory (7 hexes across) and works as a factory-mill. Its territory must hold a forest and a free riverside hex. A woodchopper starts cutting the nearest forest right away.',
        hex: this.castleHex(),
      };
    } else if (state.phase === 'start' && turn !== null) {
      guide = { title: `Waiting for ${this.slotName(turn)} (${secs} s)`, body: 'The game starts once every player has placed their castle.', hex: null };
    } else if (state.phase === 'running') {
      guide = this.guideStep();
    }
    this.drawGuide(guide);
    // The placement hint under the map would repeat the castle box, so it stays hidden until the castle stands.
    if (!me.started) this.statusText.setVisible(false);
    this.rejoinButton.setVisible(me.bot);
    if (me.bot) this.rejoinButton.setY(this.guideBox.y + this.guideH + 12);
  }

  /** A legal hex for the castle, the one nearest the middle of all legal spots (worked out twice a second). */
  private castleHex(): Hex | null {
    const { state, ctx } = this.runner;
    const key = Math.floor(state.tick / 5);
    if (key === this.castleKey) return this.castleSpot;
    this.castleKey = key;
    const legal = ctx.map.hexes.filter((h) => placementError(state, ctx, this.local, 'castle', h.q, h.r) === null);
    this.castleSpot = null;
    if (legal.length) {
      const mid = { q: Math.round(legal.reduce((s, h) => s + h.q, 0) / legal.length), r: Math.round(legal.reduce((s, h) => s + h.r, 0) / legal.length) };
      for (const h of legal) if (!this.castleSpot || distance(h, mid) < distance(this.castleSpot, mid)) this.castleSpot = h;
    }
    return this.castleSpot;
  }

  /**
   * The setup guide (DESIGN §5.3): while the free mill, dock or carrier is the item in hand, a big box in the middle
   * of the screen says what it does and points at a legal spot for it. Storing the item skips the step.
   */
  private guideStep(): Guide | null {
    const { state, ctx } = this.runner;
    const me = state.players[this.local]!;
    const hand = this.registry.get('hand') as PlacementHand | undefined;
    if (!hand || me.bot || hand.blueprint || hand.hammer) return null;
    const item = me.hand[0];
    if (item !== 'factory' && item !== 'dock' && item !== 'carrier') return null;
    const a = hand.carrierA;
    const key = `${item}|${a ? `${a.q},${a.r}` : ''}|${Math.floor(state.tick / 5)}`;
    if (key === this.guideKey) return this.guide;
    this.guideKey = key;

    const mine = (kind: string) => state.entities.filter((e): e is Structure => e.type === 'structure' && e.owner === this.local && e.kind === kind);
    const castle = mine('castle')[0];
    /** The legal hex closest to `near` (ties: map order). */
    const closest = (near: Hex | undefined, ok: (h: Hex) => boolean): Hex | null => {
      let best: Hex | null = null;
      for (const h of ctx.map.hexes) if (ok(h) && (!best || (near && distance(h, near) < distance(best, near)))) best = h;
      return best;
    };
    const legal = (h: Hex) => placementError(state, ctx, this.local, item, h.q, h.r) === null;
    if (item === 'factory')
      this.guide = {
        title: 'Step 1 of 3: place a factory-mill',
        body: 'Click the marked hex, or any green one by the river. Logs that reach a mill become your wood, and it builds what you order: a second mill means a second place to collect wood and a second build queue. (Your castle already works as a mill, so this is optional.)',
        hex: closest(castle, legal),
      };
    else if (item === 'dock') {
      const mills = mine('factory');
      this.guide = {
        title: 'Step 2 of 3: place the dock',
        body: 'Click the marked river hex next to your mill. Logs floating down the river pile up at the dock, and it feeds them to the mill next to it, 1 wood per second.',
        hex: closest(mills[mills.length - 1] ?? castle, legal),
      };
    } else if (!a) {
      const chopper = mine('woodchopper')[0];
      this.guide = {
        title: 'Step 3 of 3: place the carrier',
        body: 'Click your woodchopper (marked). It cuts logs in the forest; the carrier picks them up there and takes them to the river.',
        hex: me.startCarrierPending && chopper ? chopper : closest(castle, (h) => !pickupError(state, ctx, this.local, h.q, h.r) && dropOffs(state, ctx, this.local, h.q, h.r).length > 0),
      };
    } else {
      const d = dropOffs(state, ctx, this.local, a.q, a.r)[0];
      this.guide = {
        title: 'Step 3 of 3: where the carrier drops the logs',
        body: 'Click the marked hex. The carrier drives the logs along this row and drops them into the river (or straight into a mill on the row); the river floats them down to your dock.',
        hex: d ? { q: d.q, r: a.r } : null,
      };
    }
    return this.guide;
  }

  /** Draws the setup guide: the box in the middle, moved off the marked hex, and an arrow to a pulsing ring on it. */
  private drawGuide(guide: Guide | null): void {
    this.guideBox.setVisible(!!guide);
    this.guideArrow.clear();
    if (!guide) {
      this.guideKey = '';
      return;
    }
    const { width, height } = this.scale;
    this.guideTitle.setText(guide.title);
    this.guideBody.setText(guide.body);
    const bw = this.guideW;
    const bh = this.guideBody.y + this.guideBody.height + 16;
    this.guideH = bh;
    this.guideBg.clear();
    this.guideBg.fillStyle(0x000000, 0.4).fillRoundedRect(-bw / 2 + 3, 5, bw, bh, 5);
    this.guideBg.fillStyle(CHAR, 0.96).fillRoundedRect(-bw / 2, 0, bw, bh, 5);
    this.guideBg.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(-bw / 2, 0, 5, bh);
    this.guideBg.lineStyle(2, EMBER, 0.9).strokeRoundedRect(-bw / 2, 0, bw, bh, 5);

    // Where the marked hex is on screen.
    const game = this.scene.get('GameScene');
    const cam = game.cameras.main;
    const p = guide.hex ? hexToScreen(guide.hex) : null;
    const t = p ? { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom } : null;

    // The box sits in the middle of the free screen; if that covers the marked hex, it moves above or below it.
    const cx = (width - HUD.right) / 2;
    const top = BAR_H + 12;
    const bottom = height - HUD.bottom - 12;
    let y = (top + bottom) / 2 - bh / 2;
    if (t && t.x > cx - bw / 2 - 60 && t.x < cx + bw / 2 + 60 && t.y > y - 60 && t.y < y + bh + 60) {
      y = t.y > (top + bottom) / 2 ? t.y - 110 - bh : t.y + 110;
    }
    y = Phaser.Math.Clamp(y, top, bottom - bh);
    this.guideBox.setPosition(cx, y);
    if (!t) return;

    // Arrow from the box edge to the hex, and a pulsing ring around it.
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 180);
    const rx = HEX_SIZE * cam.zoom * 0.95;
    const ry = rx * ISO_SQUASH;
    const fx = Phaser.Math.Clamp(t.x, cx - bw / 2 + 20, cx + bw / 2 - 20);
    const fy = t.y < y ? y : y + bh;
    const ang = Math.atan2(t.y - fy, t.x - fx);
    const tipX = t.x - Math.cos(ang) * (ry + 8);
    const tipY = t.y - Math.sin(ang) * (ry + 8);
    const g = this.guideArrow;
    g.lineStyle(9, 0x000000, 0.45).lineBetween(fx, fy, tipX, tipY);
    g.lineStyle(5, EMBER, 1).lineBetween(fx, fy, tipX, tipY);
    const head = (s: number, color: number, alpha: number) =>
      g.fillStyle(color, alpha).fillTriangle(
        tipX + Math.cos(ang) * s,
        tipY + Math.sin(ang) * s,
        tipX + Math.cos(ang + 2.4) * 18 * (s / 8),
        tipY + Math.sin(ang + 2.4) * 18 * (s / 8),
        tipX + Math.cos(ang - 2.4) * 18 * (s / 8),
        tipY + Math.sin(ang - 2.4) * 18 * (s / 8),
      );
    head(11, 0x000000, 0.45);
    head(8, EMBER, 1);
    g.lineStyle(4, 0xffe2a8, 0.55 + 0.45 * pulse).strokeEllipse(t.x, t.y, (rx + 6 * pulse) * 2, (ry + 6 * pulse * ISO_SQUASH) * 2);
  }

  /** The hover pop-up (DESIGN §12): name and levels, what it does, and a hammer icon for your own items. */
  private createTooltip(): void {
    this.tip = this.add.container(0, 0).setDepth(500).setVisible(false);
    this.tipKey = '';
  }

  private updateTooltip(): void {
    const hover = this.registry.get('hoverThing') as { id: number; x: number; y: number } | null;
    const thing = hover ? this.runner.state.entities.find((e) => e.id === hover.id) : undefined;
    if (!hover || !thing || thing.type === 'pile' || thing.type === 'shot') {
      this.tip.setVisible(false);
      this.tipKey = '';
      return;
    }
    const { title, action } = describe(this.runner, thing);
    const mine = canDismantle(thing, this.local);
    const key = `${thing.id}|${title}|${action}|${mine}`;
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.tip.removeAll(true);
      const t1 = this.add.text(10, 6, title, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: BIRCH });
      const t2 = this.add.text(10, 24, action, { fontFamily: FONT, fontSize: '11px', color: MUTED });
      const w = Math.max(t1.width, t2.width) + 20 + (mine ? 34 : 0);
      const bg = this.add.graphics();
      bg.fillStyle(CHAR, 0.95).fillRoundedRect(0, 0, w, 44, 3);
      bg.lineStyle(2, PLAYER_COLORS[thing.owner] ?? 0xffffff, 1).strokeRoundedRect(0, 0, w, 44, 3);
      plywoodEdge(bg, 0, 45, w);
      // The pop-up blocks the map under it, so moving onto its hammer icon keeps it open.
      const hit = this.add.rectangle(0, 0, w, 44, 0x000000, 0).setOrigin(0, 0).setInteractive();
      this.tip.add([bg, hit, t1, t2]);
      if (mine) {
        const hx = w - 22;
        const icon = this.add.graphics();
        icon.fillStyle(0x6b3a2f, 1).fillRoundedRect(hx - 13, 9, 26, 26, 5);
        icon.fillStyle(0xd9c7a3, 1).fillRect(hx - 2, 16, 3, 14).fillRect(hx - 8, 13, 15, 6);
        const btn = this.add.rectangle(hx - 13, 9, 26, 26, 0x000000, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => this.askDismantle(thing.id));
        this.tip.add([icon, btn]);
      }
      this.tip.setSize(w, 44);
    }
    const { width } = this.scale;
    this.tip.setPosition(Phaser.Math.Clamp(hover.x - this.tip.width / 2, 8, width - this.tip.width - 8), Math.max(8, hover.y - 96));
    this.tip.setVisible(true);
  }

  /** The dismantle confirmation (DESIGN §7.3c). */
  private createConfirm(): void {
    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0, 0).setInteractive();
    const box = this.add.graphics();
    box.fillStyle(CHAR, 1).fillRoundedRect(width / 2 - 170, height / 2 - 70, 340, 140, 10);
    box.lineStyle(2, 0x6b3a2f, 1).strokeRoundedRect(width / 2 - 170, height / 2 - 70, 340, 140, 10);
    this.confirmText = this.add
      .text(width / 2, height / 2 - 40, '', { fontFamily: FONT, fontSize: '15px', color: BIRCH, align: 'center', wordWrap: { width: 300 } })
      .setOrigin(0.5, 0);
    const yes = (this.confirmYes = this.add
      .text(width / 2 - 70, height / 2 + 30, 'Dismantle', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', backgroundColor: '#b0473a' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.onConfirm?.();
        this.closeConfirm();
      }));
    const no = this.add
      .text(width / 2 + 70, height / 2 + 30, 'Cancel', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', backgroundColor: BTN })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.closeConfirm());
    this.confirm = this.add.container(0, 0, [shade, box, this.confirmText, yes, no]).setDepth(1000).setVisible(false);
  }

  private askDismantle(id: number): void {
    const thing = this.runner.state.entities.find((e) => e.id === id);
    if (!thing || thing.type === 'pile' || thing.type === 'shot' || !canDismantle(thing, this.local)) return;
    this.ask(
      `Are you sure you want to dismantle this ${ITEM_NAMES[kindOf(thing)]}?\n` +
        (thing.fire ? 'It is burning: no wood will be left.' : `You get ${refundOf(this.runner, thing)} wood back, left where it stands.`) +
        `\nTaking it apart takes ${Math.ceil(craftTicks(this.runner.state, this.runner.ctx, this.local, kindOf(thing)) / this.runner.ctx.config.tickRate)} s.`,
      'Dismantle',
      () => this.runner.submit({ type: 'dismantle', player: this.local, id }),
    );
  }

  private ask(question: string, yes: string, onYes: () => void): void {
    this.onConfirm = onYes;
    this.confirmText.setText(question);
    this.confirmYes.setText(yes);
    this.confirm.setVisible(true);
  }

  private closeConfirm(): void {
    this.onConfirm = null;
    this.confirm.setVisible(false);
  }

  /** Match over (DESIGN §11): who won, statistics per player, the match log, and back to the lobby. */
  private showEndScreen(): void {
    this.endShown = true;
    const { state } = this.runner;
    const { width, height } = this.scale;
    const me = state.players[this.local]!;
    const title = state.winner === this.local ? 'Victory!' : state.winner === null ? 'Nobody won' : me.started ? 'Defeat' : 'Match over';
    const sub = state.winner === null ? '' : `${this.slotName(state.winner)} wins by domination`;
    const rows = [['', 'Wood chopped', 'Wood collected', 'Damage dealt', 'Units crafted', 'Structures crafted', 'Territory', 'Outposts destroyed']];
    for (const p of state.players) {
      const s = p.stats;
      rows.push([
        this.slotName(p.id) + (p.id === this.local ? ' (you)' : ''),
        String(wholeUnits(s.woodChopped)),
        String(wholeUnits(s.woodCollected)),
        String(s.damageDealt),
        String(s.unitsCrafted),
        String(s.structuresCrafted),
        `${state.coverage.filter((c) => c & (1 << p.id)).length} hexes`,
        String(s.outpostsDestroyed),
      ]);
    }
    const w = Math.min(width - 40, 900);
    const h = 120 + rows.length * 34 + 70;
    const x = (width - w) / 2;
    const y = Math.max(20, (height - h) / 2);
    const shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const box = this.add.graphics();
    box.fillStyle(CHAR, 0.97).fillRoundedRect(x, y, w, h, 3);
    box.fillStyle(PLAYER_COLORS[state.winner ?? -1] ?? 0x8a7d68, 1).fillRect(x, y, w, 5); // winner's colour along the top
    plywoodEdge(box, x, y + h, w);
    // Header divider, then a faint band on every other player row.
    box.fillStyle(0xe6cfa0, 0.2).fillRect(x + 20, y + 140, w - 40, 1);
    for (let ri = 2; ri < rows.length; ri += 2) box.fillStyle(0xe6cfa0, 0.05).fillRect(x + 12, y + 106 + ri * 34, w - 24, 34);
    const parts: Phaser.GameObjects.GameObject[] = [shade, box];
    const titleColor = state.winner === this.local ? '#f0a060' : BIRCH;
    parts.push(this.add.text(width / 2, y + 18, title, { ...BIG, fontSize: '40px', color: titleColor }).setOrigin(0.5, 0));
    if (sub) parts.push(this.add.text(width / 2, y + 76, sub, { fontFamily: FONT, fontSize: '16px', color: MUTED }).setOrigin(0.5, 0));
    const colW = (w - 40) / rows[0]!.length;
    rows.forEach((row, ri) =>
      row.forEach((cell, ci) => {
        const color = ri === 0 ? MUTED : `#${(PLAYER_COLORS[ri - 1] ?? 0xffffff).toString(16).padStart(6, '0')}`;
        const style = { fontFamily: FONT, fontSize: ri === 0 ? '12px' : '15px', fontStyle: ri === 0 ? 'normal' : 'bold', color, align: 'center', wordWrap: { width: colW - 6 } };
        parts.push(this.add.text(x + 20 + ci * colW + (ci === 0 ? 0 : colW / 2), y + 110 + ri * 34, cell, style).setOrigin(ci === 0 ? 0 : 0.5, 0));
      }),
    );
    const button = (bx: number, label: string, bg: string, onClick: () => void) =>
      this.add
        .text(bx, y + h - 56, label, { ...BIG, fontSize: '20px', backgroundColor: bg })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onClick);
    parts.push(button(width / 2 - 140, 'Download match log', BTN, () => this.runner.downloadLog()));
    parts.push(button(width / 2 + 140, 'Back to lobby', BTN_ON, () => (window.location.href = window.location.pathname)));
    this.add.container(0, 0, parts).setDepth(2000);
  }

  /**
   * The build column on the right (DESIGN §7.1, §12): Build and Workshop tabs, then a compact list (pixel icon, name,
   * price). Clicking an item puts it on the mouse to place and opens its full description under it (§7.2).
   */
  private createBuildColumn(): void {
    const { width } = this.scale;
    const x = width - HUD.right + 8;
    const w = HUD.right - 16;
    this.hadWorkshop = ownsWorkshop(this.runner.state, this.local);
    const tab = (this.registry.get('tab') as string | undefined) ?? 'build';
    const tabW = (w - 6) / 2;
    const tabButton = (tx: number, label: string, id: string, enabled: boolean) => {
      const on = tab === id;
      this.add
        .text(tx, BAR_H + 8, `${label} ${on ? '▴' : '▾'}`, {
          fontFamily: FONT,
          fontSize: '16px',
          fontStyle: 'bold',
          // The open tab is bare birch plywood; closed ones are dark wood.
          color: on ? '#24160d' : enabled ? BIRCH : '#7d6a52',
          backgroundColor: on ? BIRCH : '#24160dee',
          fixedWidth: tabW,
          align: 'center',
          padding: { x: 0, y: 6 },
        })
        .setInteractive({ useHandCursor: enabled })
        .on('pointerdown', () => {
          if (!enabled) return this.registry.set('status', 'Build a workshop to unlock upgrades.');
          this.registry.set('tab', on ? 'none' : id); // clicking the open tab closes it
          this.scene.restart();
        });
    };
    tabButton(x, 'Build', 'build', true);
    tabButton(x + tabW + 6, 'Workshop', 'workshop', this.hadWorkshop);

    const top = BAR_H + 46;
    if (tab === 'workshop' && this.hadWorkshop) {
      this.workshop = new WorkshopPanel(this, this.runner, x, top, w);
      this.workshop.update();
      return;
    }
    if (tab !== 'build') return;
    const open = this.registry.get('buildSel') as ItemKind | undefined;
    const panel = this.add.graphics();
    const deco = this.add.graphics();
    let y = top + 4;
    for (const item of CRAFTABLE) {
      const hl = this.add
        .rectangle(x + 3, y, w - 6, ROW_H, EMBER, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => (this.hoverRow = item))
        .on('pointerout', () => {
          if (this.hoverRow === item) this.hoverRow = null;
        })
        .on('pointerdown', () => this.pickItem(item));
      if (!addItemSprite(this, item, this.local, x + 19, y + ROW_H / 2, 24)) drawItemIcon(deco, item, x + 19, y + ROW_H / 2, 20, 0xd9c7a3);
      this.add.text(x + 38, y + ROW_H / 2, ITEM_NAMES[item], { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: BIRCH }).setOrigin(0, 0.5);
      const price = this.add.text(x + w - 28, y + ROW_H / 2, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: BIRCH }).setOrigin(1, 0.5);
      drawLogIcon(deco, x + w - 15, y + ROW_H / 2);
      const row: BuildRow = { item, hl, price };
      y += ROW_H;
      if (item === open) {
        // The full description, in larger text, then the build time and what to do next (filled in every frame).
        const descTop = y;
        const desc = this.add.text(x + 14, y + 4, ITEM_DESCRIPTIONS[item], { fontFamily: FONT, fontSize: '15px', color: BIRCH, wordWrap: { width: w - 28 }, lineSpacing: 3 });
        y += desc.height + 10;
        row.info = this.add.text(x + 14, y, '', { fontFamily: FONT, fontSize: '14px', color: MUTED, wordWrap: { width: w - 28 }, lineSpacing: 3 });
        y += 64; // up to three lines
        deco.fillStyle(EMBER, 0.08).fillRect(x + 3, descTop, w - 6, y - descTop - 4);
        deco.fillStyle(EMBER, 0.9).fillRect(x + 3, descTop, 3, y - descTop - 4);
      }
      this.rows.push(row);
    }
    // The queue under the list: what is being built, what waits, and how many slots the factory-mills give.
    y += 4;
    deco.fillStyle(0xe6cfa0, 0.14).fillRect(x + 10, y, w - 20, 1);
    this.queueText = this.add.text(x + 12, y + 8, '', { fontFamily: FONT, fontSize: '13px', color: MUTED, lineSpacing: 3, wordWrap: { width: w - 24 } });
    this.queueGfx = this.add.graphics();
    y += 74;
    panel.fillStyle(CHAR, 0.94).fillRoundedRect(x, top, w, y - top, 3);
    plywoodEdge(panel, x, y, w);
    // The map under the panel doesn't take clicks; below the rows, so they still get theirs.
    this.add.rectangle(x, top, w, y - top, 0, 0).setOrigin(0, 0).setInteractive().setDepth(-1);
  }

  /** A click on a build row: opens its description and puts it on the mouse; clicking the active one again cancels. */
  private pickItem(item: ItemKind): void {
    const hand = this.registry.get('hand') as PlacementHand | undefined;
    if (!hand) return;
    const wasOpen = this.registry.get('buildSel') === item;
    if (wasOpen && hand.blueprint === item) {
      hand.cancel();
      this.registry.set('buildSel', undefined);
    } else {
      this.registry.set('buildSel', item);
      hand.cancel();
      // Place first, pay when placed (DESIGN §7.2); if it can't be bought now, the description says why.
      if (!craftError(this.runner.state, this.runner.ctx, this.local, item)) hand.blueprint = item;
    }
    if (wasOpen !== (this.registry.get('buildSel') === item)) this.scene.restart(); // the list re-lays out
  }

  private updateBuildColumn(): void {
    const { state, ctx } = this.runner;
    const me = state.players[this.local]!;
    const hand = this.registry.get('hand') as PlacementHand | undefined;
    for (const row of this.rows) {
      // Price and time as they are now: Efficiency, factory-mills and playtest mode included.
      const cost = craftCost(state, ctx, this.local, row.item);
      row.price.setText(String(wholeUnits(cost))).setColor(me.wood >= cost ? BIRCH : '#e0745a');
      const armed = hand?.blueprint === row.item;
      row.hl.setFillStyle(EMBER, armed ? 0.3 : this.hoverRow === row.item ? 0.12 : 0);
      if (!row.info) continue;
      const secs = craftTicks(state, ctx, this.local, row.item) / ctx.config.tickRate;
      const err = craftError(state, ctx, this.local, row.item);
      // While it is on the mouse, the status line at the bottom says where to click.
      const next = err ? `Can't build it: ${err}.` : armed ? 'Right-click to put it down.' : 'Click it again to place one.';
      row.info.setText(`Build time ${secs.toFixed(1)} s\n${next}`).setColor(err ? '#e0745a' : MUTED);
    }
    if (!this.queueText) return;
    // Queue: the item in production with its progress, then the waiting ones; slots = factory-mills.
    const slots = ownFactories(state, this.local).length;
    const reduction = craftReductionBp(state, ctx, this.local) / 100;
    const [job, ...waiting] = me.queue;
    this.queueText.setText(
      [
        job ? `Building: ${ITEM_NAMES[job.item]}` : 'Nothing being built',
        waiting.length ? `Next: ${waiting.map((j) => ITEM_NAMES[j.item]).join(', ')}` : '',
        `Queue ${me.queue.length}/${slots}${reduction > 0 ? ` · factory-mills −${reduction.toFixed(1)}% build time` : ''}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    this.queueGfx.clear();
    if (job && job.totalTicks > 0) {
      const b = this.queueText.getBounds();
      const bw = HUD.right - 40;
      this.queueGfx.fillStyle(0x000000, 0.5).fillRect(b.x, b.bottom + 4, bw, 5);
      this.queueGfx.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(b.x, b.bottom + 4, (bw * job.doneTicks) / job.totalTicks, 5);
    }
  }

  /**
   * The tool dock at the bottom left (DESIGN §7.3b–d, §8.6, §12): pixel-art buttons for the hammer, trade, the
   * catapult stance and the warehouse, named on hover. The warehouse's items sit next to it.
   */
  private createDock(): void {
    const { height } = this.scale;
    const size = 60;
    const y = height - size - 14;
    let x = 14;
    const hand = () => this.registry.get('hand') as PlacementHand | undefined;
    const me = () => this.runner.state.players[this.local]!;
    this.dockButtons = [];
    this.dockTip = null;
    const add = (b: Omit<DockButton, 'g' | 'x' | 'y' | 'size' | 'key'>, onClick: () => void) => {
      const btn: DockButton = { ...b, g: this.add.graphics(), x, y, size, key: '' };
      const tip = { text: b.label, x, y };
      this.add
        .rectangle(x, y, size, size, 0, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => (this.dockTip = tip))
        .on('pointerout', () => {
          if (this.dockTip === tip) this.dockTip = null;
        })
        .on('pointerdown', onClick);
      this.dockButtons.push(btn);
      x += size + 10;
    };
    add(
      {
        icon: () => 'hammer',
        label: () => (hand()?.hammer ? 'Hammer (on): click one of your items to take it apart. Right-click stops.' : 'Hammer'),
        bg: () => 0x3a2516,
        active: () => !!hand()?.hammer,
      },
      () => {
        const h = hand();
        if (!h) return;
        const on = !h.hammer;
        h.cancel();
        h.hammer = on;
      },
    );
    // Trade is dormant (M11): no button; the panel and the sim commands stay for later.
    // Offensive stance (DESIGN §8.6): what your catapults go for. Clicking cycles Destruction → Conquest → Peaceful.
    const STANCES = {
      destruction: { icon: 'destruction', name: 'Destruction: they hit the closest enemy target', bg: 0x7a2e1c, next: 'conquest' },
      conquest: { icon: 'conquest', name: 'Conquest: they only hit enemy outposts', bg: 0x2c5a5c, next: 'peaceful' },
      peaceful: { icon: 'peaceful', name: 'Peaceful: they hold fire and stay put', bg: 0x4a5a3a, next: 'destruction' },
    } as const;
    add(
      {
        icon: () => STANCES[me().stance].icon,
        label: () => `Catapults: ${STANCES[me().stance].name} (click to switch)`,
        bg: () => STANCES[me().stance].bg,
        active: () => false,
      },
      () => this.runner.submit({ type: 'setStance', player: this.local, stance: STANCES[me().stance].next }),
    );
    x += 8;
    // The warehouse is a bin (DESIGN §7.3b): click it to store the item in hand; its items show next to it.
    add(
      {
        icon: () => 'warehouse',
        label: () => {
          const m = me();
          if (m.hand.length && m.started) return `Warehouse: click to store the ${ITEM_NAMES[m.hand[0]!]} in hand`;
          return m.warehouse.length ? 'Warehouse: click an item next to it to pick it up' : 'Warehouse (empty)';
        },
        bg: () => 0x3a2516,
        active: () => false,
      },
      () => {
        if (me().hand.length && me().started) this.runner.submit({ type: 'store', player: this.local });
      },
    );
    this.warehouseAt = { x, y: y + 8 };
    this.warehouseChips = [];
    this.warehouseKey = '';
    this.dockLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: BIRCH, backgroundColor: '#24160df2', padding: { x: 9, y: 6 } })
      .setOrigin(0, 1)
      .setDepth(450)
      .setVisible(false);
    this.handText = this.add.text(14, y - 12, '', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold' }).setOrigin(0, 1);
  }

  /** Redraws a dock button only when its look changes; shows the hovered one's name above it. */
  private updateDock(): void {
    for (const b of this.dockButtons) {
      const tip = this.dockTip;
      const hover = !!tip && tip.x === b.x && tip.y === b.y;
      const active = b.active();
      const key = `${b.icon()}|${b.bg()}|${active}|${hover}`;
      if (key === b.key) continue;
      b.key = key;
      const { g, x, y, size } = b;
      g.clear();
      g.fillStyle(0x000000, 0.4).fillRoundedRect(x + 2, y + 4, size, size, 7); // drop shadow
      g.fillStyle(active ? 0xb8541c : b.bg(), 1).fillRoundedRect(x, y, size, size, 7);
      g.fillStyle(0xffffff, hover ? 0.14 : 0.06).fillRoundedRect(x + 4, y + 4, size - 8, size / 2 - 6, 4); // sheen
      g.lineStyle(2, active ? EMBER : hover ? 0xe6cfa0 : 0x6b4526, 1).strokeRoundedRect(x, y, size, size, 7);
      drawToolIcon(g, b.icon(), x + size / 2, y + size / 2, 3);
    }
    const tip = this.dockTip;
    this.dockLabel.setVisible(!!tip);
    if (tip) this.dockLabel.setText(tip.text()).setPosition(tip.x, tip.y - 8);
  }

  /** The warehouse's items, right of its button: a pixel icon each; clicking one puts it back in hand, to place next. */
  private updateWarehouse(): void {
    const items = this.runner.state.players[this.local]!.warehouse;
    const key = items.join(',') || '-';
    if (key === this.warehouseKey) return;
    this.warehouseKey = key;
    for (const c of this.warehouseChips) c.destroy();
    this.warehouseChips = [];
    this.dockTip = null;
    const s = 44;
    let x = this.warehouseAt.x;
    const y = this.warehouseAt.y;
    items.forEach((item, index) => {
      const g = this.add.graphics();
      g.fillStyle(0x2e1d11, 0.96).fillRoundedRect(x, y, s, s, 5);
      g.lineStyle(1.5, 0x8a5a2b, 1).strokeRoundedRect(x, y, s, s, 5);
      const img = addItemSprite(this, item, this.local, x + s / 2, y + s / 2, 34);
      if (!img) drawItemIcon(g, item, x + s / 2, y + s / 2, 26, 0xd9c7a3);
      const tip = { text: () => `${ITEM_NAMES[item]}: click to pick it up`, x, y };
      const hit = this.add
        .rectangle(x, y, s, s, 0, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => (this.dockTip = tip))
        .on('pointerout', () => {
          if (this.dockTip === tip) this.dockTip = null;
        })
        .on('pointerdown', () => this.runner.submit({ type: 'retrieve', player: this.local, index }));
      this.warehouseChips.push(g, hit, ...(img ? [img] : []));
      x += s + 6;
    });
  }

  /**
   * The Menu list under the Menu button, for what's used rarely: pause, playtest mode (DESIGN §7.5), the river
   * strength legend, controls, surrender (DESIGN §11) and leaving the match. Labels refresh every frame.
   */
  private createMenu(): void {
    const legend = this.drawRiverLegend(12, BAR_H + 50).setVisible(this.registry.get('legend') === true);
    const help = this.add
      .text(12, 0, 'North is uphill: rivers flow south.\nDrag or WASD: move the map\nMouse wheel: zoom\nC: show hex coordinates', {
        ...TEXT_STYLE,
        lineSpacing: 4,
        padding: { x: 10, y: 8 },
      })
      .setVisible(this.registry.get('help') === true);
    const placeHelp = () => help.setY(BAR_H + 50 + (legend.visible ? 80 : 0));
    placeHelp();

    const surrender = () => {
      const { state } = this.runner;
      if (state.phase !== 'running' || state.players[this.local]!.defeated) return;
      this.ask(
        'Surrender?\nYour outposts and catapults are dismantled (half their cost left as wood) and everything else you own turns neutral. You are out of the match.',
        'Surrender',
        () => this.runner.submit({ type: 'surrender', player: this.local }),
      );
    };
    const leave = () => {
      const host = this.runner.session.isHost && this.runner.session.info.slots.filter((x) => x.name !== null).length > 1;
      this.ask(
        'Leave this match and go back to the main menu?\n' +
          (host ? 'You are the host: the match ends for everyone.' : 'You can rejoin later with the same room code and name.'),
        'Leave',
        () => (window.location.href = window.location.pathname),
      );
    };
    const pm = this.runner.ctx.config.playtestMode;
    const items: [() => string, () => void][] = [
      [() => (this.runner.paused ? 'Resume' : 'Pause'), () => this.runner.setPaused(!this.runner.paused)],
      [
        () => (this.runner.state.playtest ? `Playtest mode: on (costs ${pm.costPct}%, times ${pm.timePct}%)` : 'Playtest mode: off'),
        () => this.runner.submit({ type: 'setPlaytest', player: this.local, on: !this.runner.state.playtest }),
      ],
      [
        () => `River strength: ${legend.visible ? 'shown' : 'hidden'}`,
        () => {
          legend.setVisible(!legend.visible);
          this.registry.set('legend', legend.visible);
          placeHelp();
        },
      ],
      [
        () => `Controls: ${help.visible ? 'shown' : 'hidden'}`,
        () => {
          help.setVisible(!help.visible);
          this.registry.set('help', help.visible);
        },
      ],
      [() => 'Sound…', toggleVolumePanel],
      [() => 'Surrender…', surrender],
      [() => 'Leave match…', leave],
    ];
    const W = 330;
    const H = 36;
    const box = this.add.graphics();
    box.fillStyle(CHAR, 0.97).fillRect(0, 0, W, items.length * H + 8);
    box.fillStyle(0xb98a55, 1).fillRect(0, items.length * H + 8, W, 3); // plywood edge
    this.menu = this.add.container(8, BAR_H + 4, [box]).setDepth(600).setVisible(false);
    this.menuItems = items.map(([label, run], i) => {
      const text = this.add
        .text(4, 4 + i * H, label(), { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: BIRCH, fixedWidth: W - 8, padding: { x: 12, y: 8 } })
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => text.setBackgroundColor(BTN))
        .on('pointerout', () => text.setBackgroundColor('#00000000'))
        .on('pointerdown', () => {
          run();
          this.menu.setVisible(false);
        });
      if (i >= items.length - 2) text.setColor('#f0a080'); // surrender and leave end your match
      this.menu.add(text);
      return { text, label };
    });
  }

  /** The players in the top strip, and alerts for desyncs, disconnects and the host leaving. */
  private updatePlayers(): void {
    const { state, session } = this.runner;
    const lines = state.players.map((p) => {
      const name = session.info.slots[p.id]?.name;
      const tags = [
        p.id === this.local ? 'you' : '',
        name !== null && p.bot ? 'bot playing' : '', // an empty slot is already called "Bot"
        session.left.has(p.id) ? 'disconnected' : '',
      ].filter(Boolean);
      return `${name ?? 'Bot'}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    });
    // One after another: a colour dot (a log end, as in the lobby), then the name.
    this.playerDots.clear();
    let x = this.playersRight;
    lines.forEach((line, i) => {
      const t = this.playerTexts[i];
      if (!t) return;
      this.playerDots.fillStyle(0x5a3a1e, 1).fillCircle(x + 8, 26, 8);
      this.playerDots.fillStyle(PLAYER_COLORS[i]!, 1).fillCircle(x + 8, 26, 6);
      t.setText(line).setX(x + 22).setAlpha(state.players[i]!.defeated ? 0.45 : 1);
      x = t.getBounds().right + 18;
    });

    const alerts: string[] = [];
    if (session.hostGone) alerts.push('The host left: the match has ended.');
    if (session.desync) alerts.push(`Desync at tick ${session.desync.tick} (player ${this.slotName(session.desync.slot)}): games may differ. Please report it.`);
    this.alertText.setText(alerts.join('\n')).setVisible(alerts.length > 0);
  }

  /** Explains river strength: weakest at the top of each half, strongest right above the waterfall / southern edge. */
  private drawRiverLegend(x: number, y: number): Phaser.GameObjects.Container {
    const w = 330;
    const h = 70;
    const g = this.add.graphics();
    g.fillStyle(CHAR, 0.87);
    g.fillRect(0, 0, w, h);

    const title = this.add.text(8, 5, 'River strength (water speed)', { fontFamily: FONT, fontSize: '13px', color: BIRCH, fontStyle: 'bold' });

    const barX = 8;
    const barY = 26;
    const barW = w - 16;
    const weak = Phaser.Display.Color.IntegerToColor(0x8fc8f0);
    const strong = Phaser.Display.Color.IntegerToColor(0x1d4f9c);
    for (let i = 0; i < barW; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(weak, strong, barW - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(barX + i, barY, 1, 12);
    }

    const small = { fontFamily: FONT, fontSize: '11px', color: MUTED };
    const weakText = this.add.text(barX, barY + 16, 'weak: top of each half', small);
    const strongText = this.add.text(barX + barW, barY + 16, 'strong: above waterfall / south edge', small).setOrigin(1, 0);
    return this.add.container(x, y, [g, title, weakText, strongText]);
  }
}
