import Phaser from 'phaser';
import { wholeUnits } from '../../sim/fixed';
import { hashState } from '../../sim/hash';
import { CRAFTABLE, craftCost, craftError, craftReductionBp, craftTicks, ownFactories } from '../../sim/systems/crafting';
import { currentTurnPlayer } from '../../sim/systems/startTurns';
import type { ItemKind } from '../../sim/types';
import { drawItemIcon } from '../render/icons';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';
import type { PlacementHand } from '../input/placementHand';
import { ITEM_DESCRIPTIONS, ITEM_NAMES } from '../ui/items';
import { openTradePanel } from '../ui/tradePanel';
import { canDismantle, describe, kindOf, refundOf } from '../ui/describe';
import { WORKSHOP_W, WorkshopPanel } from '../ui/workshopPanel';
import { ownsWorkshop } from '../../sim/upgrades';
import { toggleVolumePanel } from '../ui/volume';

/** The wood look shared with the main menu: dark charred-wood panels, birch text, ember for what's active. */
export const FONT = "'Archivo Variable', sans-serif";
const CHAR = 0x24160d;
const BIRCH = '#e6cfa0';
const MUTED = '#b8996c';
const EMBER = 0xe8742a;
const TEXT_STYLE = {
  fontFamily: FONT,
  fontSize: '13px',
  color: BIRCH,
  backgroundColor: '#24160ddd',
  padding: { x: 6, y: 4 },
};
const PANEL_W = 320;
const ROW_H = 46;
/** Height of the top strip (menu, players, clock, stone, wood). */
const BAR_H = 52;
/** The big buttons (Build, Workshop, Hammer, Trade, warehouse): twice the normal size (DESIGN §12). */
const BIG = { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: BIRCH, padding: { x: 12, y: 8 } };
/** Button backgrounds: dark wood, ember when switched on. */
const BTN = '#3a2516';
const BTN_ON = '#b8541c';

/** Screen-fixed UI drawn above GameScene, unaffected by the map camera's pan and zoom. */
export class UIScene extends Phaser.Scene {
  private runner!: SimRunner;
  private woodText!: Phaser.GameObjects.Text;
  private stoneText!: Phaser.GameObjects.Text;
  private handText!: Phaser.GameObjects.Text;
  private storeButton!: Phaser.GameObjects.Text;
  private warehouseTitle!: Phaser.GameObjects.Text;
  private warehouseChips: Phaser.GameObjects.Text[] = [];
  private warehouseKey = '';
  private warehouseAt = { x: 0, y: 0 };
  private statusText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private pausedBanner!: Phaser.GameObjects.Text;
  private stanceButton!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Container;
  private menuItems: { text: Phaser.GameObjects.Text; label: () => string }[] = [];
  private playerDots!: Phaser.GameObjects.Graphics;
  private playersRight = 0;
  private debugText!: Phaser.GameObjects.Text;
  private tutorial!: Phaser.GameObjects.Container;
  private tutorialTitle!: Phaser.GameObjects.Text;
  private tutorialBody!: Phaser.GameObjects.Text;
  private rejoinButton!: Phaser.GameObjects.Text;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private alertText!: Phaser.GameObjects.Text;
  private queueGfx!: Phaser.GameObjects.Graphics;
  private queueText!: Phaser.GameObjects.Text;
  private rows: { item: ItemKind; bg: Phaser.GameObjects.Rectangle; price: Phaser.GameObjects.Text }[] = [];
  private craftButton: Phaser.GameObjects.Text | undefined;
  private workshop: WorkshopPanel | undefined;
  private hadWorkshop = false;
  private hammerButton!: Phaser.GameObjects.Text;
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
    this.craftButton = undefined;
    this.workshop = undefined;
    const { width, height } = this.scale;
    // Top strip: Menu, players, the clock (click it to pause), stone, and wood large at the top right (DESIGN §7.1).
    const bar = this.add.graphics();
    bar.fillStyle(CHAR, 0.94).fillRect(0, 0, width, BAR_H);
    for (let i = 0; i < 3; i++) bar.fillStyle(i % 2 ? 0xd9bd8a : 0xb98a55, 1).fillRect(0, BAR_H + i * 2, width, 2); // plywood edge
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
      .text((width - PANEL_W) / 2, 142, 'You are out of the match: watching until it ends.', { ...TEXT_STYLE, fontSize: '16px', fontStyle: 'bold', backgroundColor: '#8a2a1ecc' })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.endShown = false;
    this.pausedBanner = this.add
      .text((width - PANEL_W) / 2, height / 2, '', { ...BIG, fontSize: '40px', align: 'center', backgroundColor: '#24160dee', padding: { x: 24, y: 14 } })
      .setOrigin(0.5)
      .setDepth(400);

    const left = width - PANEL_W - 12;
    // Tabs: Build, and Workshop next to it once you own a workshop (DESIGN §12). Clicking the open tab closes it.
    this.hadWorkshop = ownsWorkshop(this.runner.state, this.local);
    const tab = (this.registry.get('tab') as string | undefined) ?? 'build';
    const tabButton = (x: number, label: string, id: string, enabled: boolean) =>
      this.add
        .text(x, BAR_H + 12, `${label} ${tab === id ? '▴' : '▾'}`, {
          ...BIG,
          // The open tab is bare birch plywood; closed ones are dark wood.
          color: tab === id ? '#24160d' : enabled ? BIRCH : '#7d6a52',
          backgroundColor: tab === id ? BIRCH : '#24160dee',
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: enabled })
        .on('pointerdown', () => {
          if (!enabled) return this.registry.set('status', 'Build a workshop to unlock upgrades.');
          this.registry.set('tab', tab === id ? 'none' : id);
          this.scene.restart();
        });
    const wsTab = tabButton(width - 12, 'Workshop', 'workshop', this.hadWorkshop);
    tabButton(wsTab.getBounds().left - 6, 'Build', 'build', true);
    const open = tab === 'build';

    let y = BAR_H + 70;
    if (tab === 'workshop' && this.hadWorkshop) {
      this.workshop = new WorkshopPanel(this, this.runner, width - WORKSHOP_W - 12, y);
      this.workshop.update();
      y += this.workshop.height + 8;
    }
    if (open) {
      const g = this.add.graphics();
      g.fillStyle(CHAR, 0.94);
      g.fillRoundedRect(left, y, PANEL_W, CRAFTABLE.length * ROW_H + 52, 3);
      CRAFTABLE.forEach((item, k) => {
        const ry = y + 6 + k * ROW_H;
        if (k > 0) g.fillStyle(0xe6cfa0, 0.08).fillRect(left + 12, ry - 1, PANEL_W - 24, 1); // thin divider
        const bg = this.add
          .rectangle(left + 4, ry, PANEL_W - 8, ROW_H - 4, EMBER, 0)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.registry.set('buildSel', item));
        drawItemIcon(g, item, left + 24, ry + ROW_H / 2 - 2, 26, 0xd9c7a3);
        this.add.text(left + 44, ry + 3, ITEM_NAMES[item], { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: BIRCH });
        this.add.text(left + 44, ry + 21, ITEM_DESCRIPTIONS[item], { fontFamily: FONT, fontSize: '10px', color: MUTED, wordWrap: { width: PANEL_W - 120 } });
        const price = this.add.text(left + PANEL_W - 10, ry + 4, '', { fontFamily: FONT, fontSize: '12px', color: BIRCH, align: 'right' }).setOrigin(1, 0);
        this.rows.push({ item, bg, price });
      });
      y += CRAFTABLE.length * ROW_H + 10;
      this.craftButton = this.add
        .text(left + PANEL_W / 2, y + 4, '', { ...TEXT_STYLE, fontSize: '14px', fontStyle: 'bold', padding: { x: 12, y: 6 } })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const sel = this.registry.get('buildSel') as ItemKind | undefined;
          if (sel && !craftError(this.runner.state, this.runner.ctx, this.local, sel)) this.runner.submit({ type: 'craft', player: this.local, item: sel });
        });
      y += 48;
    }

    // Queue and hand under the menu.
    this.queueGfx = this.add.graphics();
    this.queueText = this.add.text(left, y, '', { ...TEXT_STYLE, fixedWidth: PANEL_W });
    this.handText = this.add.text(width - 12, y + 70, '', TEXT_STYLE).setOrigin(1, 0);

    // Tools at the bottom left: hammer, trade, catapult stance, and binning the item in hand (DESIGN §7.3b–d, §8.6).
    const toolsY = height - 150;
    const button = (x: number, label: string, bg: string, onClick: () => void, fixedWidth = 0) =>
      this.add
        .text(x, toolsY, label, { ...BIG, backgroundColor: bg, fixedWidth, align: 'center' })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onClick);
    this.hammerButton = button(10, 'Hammer', BTN, () => {
      const hand = this.registry.get('hand') as PlacementHand | undefined;
      if (!hand) return;
      const on = !hand.hammer;
      hand.cancel();
      hand.hammer = on;
    }, 210); // fixed width: the label changes to 'Hammer (on)'
    const trade = button(this.hammerButton.getBounds().right + 10, 'Trade', BTN, () => openTradePanel(this.runner));
    // Offensive stance (DESIGN §8.6): what your catapults go for.
    this.stanceButton = button(trade.getBounds().right + 10, '', BTN, () => {
      const now = this.runner.state.players[this.local]!.stance;
      this.runner.submit({ type: 'setStance', player: this.local, stance: now === 'conquest' ? 'destruction' : 'conquest' });
    }, 330);
    this.storeButton = button(this.stanceButton.getBounds().right + 10, 'Put in warehouse', BTN, () =>
      this.runner.submit({ type: 'store', player: this.local }),
    );
    // The warehouse, always shown (DESIGN §7.3b): click an item to pick it up.
    this.warehouseTitle = this.add.text(10, toolsY + 66, 'Warehouse', { ...BIG, fontSize: '20px', padding: { x: 8, y: 4 }, backgroundColor: '#24160ddd' });
    this.warehouseAt = { x: this.warehouseTitle.getBounds().right + 8, y: toolsY + 66 };
    this.warehouseChips = [];
    this.warehouseKey = '';

    this.statusText = this.add.text(width / 2, height - 16, '', { ...TEXT_STYLE, fontSize: '15px' }).setOrigin(0.5, 1);
    // Tick, seed and state hash, for bug reports: only with ?debug in the address.
    this.debugText = this.add
      .text(12, height - 8, '', { fontFamily: 'monospace', fontSize: '10px', color: '#8a8a8a' })
      .setOrigin(0, 1)
      .setVisible(new URLSearchParams(location.search).has('debug'));

    // Tutorial pop-up for the first steps of a match, at the top centre.
    const tw = Math.min(460, width - PANEL_W - 60);
    const box = this.add.graphics();
    box.fillStyle(CHAR, 0.95).fillRoundedRect(-tw / 2, 0, tw, 92, 3);
    box.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(-tw / 2, 0, 4, 92); // your colour down the left edge
    this.tutorialTitle = this.add.text(0, 10, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: BIRCH }).setOrigin(0.5, 0);
    this.tutorialBody = this.add
      .text(0, 40, '', { fontFamily: FONT, fontSize: '12px', color: MUTED, align: 'center', wordWrap: { width: tw - 28 } })
      .setOrigin(0.5, 0);
    this.tutorial = this.add.container((width - PANEL_W) / 2, BAR_H + 14, [box, this.tutorialTitle, this.tutorialBody]);
    this.rejoinButton = this.add
      .text((width - PANEL_W) / 2, BAR_H + 114, 'Take back control', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', backgroundColor: BTN_ON, padding: { x: 12, y: 6 } })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.runner.submit({ type: 'takeControl', player: this.local }));

    // Players, in the top strip after Menu: a colour dot and a name each. Alerts (desync, disconnects, host gone).
    this.playerDots = this.add.graphics();
    this.playerTexts = this.runner.state.players.map(() => this.add.text(0, 16, '', { fontFamily: FONT, fontSize: '15px', color: BIRCH }));
    this.alertText = this.add
      .text((width - PANEL_W) / 2, height - 190, '', { ...TEXT_STYLE, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#8a2a1ecc' })
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
    const conquest = me.stance === 'conquest';
    this.stanceButton
      .setText(conquest ? 'Catapults: Conquest' : 'Catapults: Destruction')
      .setBackgroundColor(conquest ? '#2c5a5c' : '#7a2e1c');
    for (const m of this.menuItems) m.text.setText(m.label());
    const by = this.runner.session.pausedBy;
    this.pausedBanner
      .setText(`PAUSED\n${by === null || by === this.local ? 'by you' : `by ${this.slotName(by)}`}`)
      .setVisible(paused);

    // Build menu: price and craft time with the current reduction; selected row highlighted.
    const sel = this.registry.get('buildSel') as ItemKind | undefined;
    for (const row of this.rows) {
      // Price and time as they are now: Efficiency, factory-mills and playtest mode included.
      const secs = craftTicks(state, ctx, this.local, row.item) / ctx.config.tickRate;
      const cost = craftCost(state, ctx, this.local, row.item);
      row.price.setText(`${wholeUnits(cost)} wood\n${secs.toFixed(1)} s`);
      row.price.setColor(me.wood >= cost ? BIRCH : '#e0745a');
      row.bg.setFillStyle(EMBER, row.item === sel ? 0.22 : 0);
    }
    if (this.craftButton) {
      const err = sel ? craftError(state, ctx, this.local, sel) : 'pick an item above';
      this.craftButton.setText(sel ? (err ? `Can't craft ${ITEM_NAMES[sel]}: ${err}` : `Craft ${ITEM_NAMES[sel]}`) : 'Pick an item above');
      const ready = sel && !err;
      this.craftButton.setBackgroundColor(ready ? BIRCH : BTN).setColor(ready ? '#24160d' : MUTED);
    }

    // Queue: the item in production with its progress, then the waiting ones; slots = factory-mills.
    const slots = ownFactories(state, this.local).length;
    const reduction = craftReductionBp(state, ctx, this.local) / 100;
    const [job, ...waiting] = me.queue;
    const boost = reduction > 0 ? `−${reduction.toFixed(1)}% craft time` : 'no craft-time reduction yet';
    const lines = [`Queue ${me.queue.length}/${slots} · factory-mills: ${boost}`];
    lines.push(job ? `Crafting ${ITEM_NAMES[job.item]}` : 'Nothing crafting');
    if (waiting.length) lines.push(`Next: ${waiting.map((j) => ITEM_NAMES[j.item]).join(', ')}`);
    this.queueText.setText(lines.join('\n'));
    this.queueGfx.clear();
    if (job && job.totalTicks > 0) {
      const b = this.queueText.getBounds();
      this.queueGfx.fillStyle(CHAR, 0.9).fillRect(b.x + 6, b.bottom + 2, PANEL_W - 12, 6);
      this.queueGfx.fillStyle(PLAYER_COLORS[this.local]!, 1).fillRect(b.x + 6, b.bottom + 2, ((PANEL_W - 12) * job.doneTicks) / job.totalTicks, 6);
    }

    this.handText.setText(me.hand.length ? `In hand: ${me.hand.map((i) => ITEM_NAMES[i]).join(', ')}` : '').setVisible(me.hand.length > 0);
    this.storeButton.setVisible(me.hand.length > 0 && me.started);
    this.updateWarehouse();
    const status = (this.registry.get('status') as string | undefined) ?? '';
    this.statusText.setText(status).setVisible(status !== '');
    this.updateTutorial();
    this.workshop?.update();
    if (ownsWorkshop(state, this.local) !== this.hadWorkshop) this.scene.restart(); // the Workshop tab (un)locks
    const hand = this.registry.get('hand') as PlacementHand | undefined;
    this.hammerButton.setText(hand?.hammer ? 'Hammer (on)' : 'Hammer').setBackgroundColor(hand?.hammer ? BTN_ON : BTN);
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
    let step: [string, string] | null = null;
    if (me.bot) {
      step = ['A bot has your slot', 'You ran out of time on your starting turn. You can step back in whenever you like, at the point the bot has reached.'];
    } else if (!me.started && turn !== null && turn !== this.local) {
      step = [`Waiting for ${this.slotName(turn)} (${secs} s)`, 'Players place their first outpost one after another, in a random order. Plan around what the others choose.'];
    } else if (!me.started) {
      step = [
        turn === this.local ? `Your turn: place your first outpost (${secs} s)` : 'Place your first outpost',
        'Click a green hex inside your highlighted region. Its territory (5 hexes across) must hold a forest and a free riverside hex. A woodchopper starts cutting the nearest forest right away.',
      ];
    } else if (state.phase === 'start' && turn !== null) {
      step = [`Waiting for ${this.slotName(turn)} (${secs} s)`, 'The game starts once every player has placed their first outpost.'];
    } else if (me.hand.includes('factory') && ownFactories(state, this.local).length === 0) {
      step = [
        'Place your first factory-mill',
        'Click a riverside hex inside your territory. Wood that reaches it becomes yours, and it lets you craft. Lower down the river crafts faster.',
      ];
    }
    this.tutorial.setVisible(step !== null);
    this.rejoinButton.setVisible(me.bot);
    if (step) {
      this.tutorialTitle.setText(step[0]);
      this.tutorialBody.setText(step[1]);
    }
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
      bg.fillStyle(CHAR, 0.95).fillRoundedRect(0, 0, w, 44, 6);
      bg.lineStyle(2, PLAYER_COLORS[thing.owner] ?? 0xffffff, 1).strokeRoundedRect(0, 0, w, 44, 6);
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
    box.fillStyle(CHAR, 0.97).fillRoundedRect(x, y, w, h, 12);
    box.lineStyle(3, PLAYER_COLORS[state.winner ?? -1] ?? 0x8a7d68, 1).strokeRoundedRect(x, y, w, h, 12);
    const parts: Phaser.GameObjects.GameObject[] = [shade, box];
    parts.push(this.add.text(width / 2, y + 18, title, { ...BIG, fontSize: '40px' }).setOrigin(0.5, 0));
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

  /** The warehouse: one clickable chip per item; clicking one puts it back in hand, to place next. */
  private updateWarehouse(): void {
    const items = this.runner.state.players[this.local]!.warehouse;
    const key = items.join(',') || '-';
    if (key === this.warehouseKey) return;
    this.warehouseKey = key;
    for (const c of this.warehouseChips) c.destroy();
    let x = this.warehouseAt.x;
    let y = this.warehouseAt.y;
    if (items.length === 0) {
      this.warehouseChips = [this.add.text(x, y, '(empty)', { ...BIG, fontSize: '20px', padding: { x: 8, y: 4 }, color: '#8a7d68', backgroundColor: '#24160ddd' })];
      return;
    }
    this.warehouseChips = items.map((item, index) => {
      const chip = this.add
        .text(x, y, ITEM_NAMES[item], { ...BIG, fontSize: '20px', padding: { x: 8, y: 4 }, backgroundColor: '#3a2516ee' })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.runner.submit({ type: 'retrieve', player: this.local, index }));
      x = chip.getBounds().right + 6;
      if (x > this.warehouseAt.x + 520) {
        x = this.warehouseAt.x;
        y += 36;
      }
      return chip;
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
