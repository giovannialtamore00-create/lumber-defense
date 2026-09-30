import Phaser from 'phaser';
import { wholeUnits } from '../../sim/fixed';
import { hashState } from '../../sim/hash';
import { CRAFTABLE, craftError, craftReductionBp, craftTicks, ownFactories } from '../../sim/systems/crafting';
import type { ItemKind } from '../../sim/types';
import { drawItemIcon } from '../render/icons';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';
import { ITEM_DESCRIPTIONS, ITEM_NAMES } from '../ui/items';
import { LOCAL_PLAYER } from './GameScene';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontSize: '13px',
  color: '#e8dcc4',
  backgroundColor: '#000000aa',
  padding: { x: 6, y: 4 },
};
const PANEL_W = 320;
const ROW_H = 50;

/** Screen-fixed UI drawn above GameScene, unaffected by the map camera's pan and zoom. */
export class UIScene extends Phaser.Scene {
  private runner!: SimRunner;
  private woodText!: Phaser.GameObjects.Text;
  private handText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private tutorial!: Phaser.GameObjects.Container;
  private tutorialTitle!: Phaser.GameObjects.Text;
  private tutorialBody!: Phaser.GameObjects.Text;
  private queueGfx!: Phaser.GameObjects.Graphics;
  private queueText!: Phaser.GameObjects.Text;
  private rows: { item: ItemKind; bg: Phaser.GameObjects.Rectangle; price: Phaser.GameObjects.Text }[] = [];
  private craftButton: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.runner = this.registry.get('runner') as SimRunner;
    this.rows = [];
    this.craftButton = undefined;
    const { width, height } = this.scale;
    this.add.text(10, 8, '▲ NORTH (uphill) — rivers flow south   ·   drag / WASD: pan   ·   wheel: zoom   ·   C: coordinates', TEXT_STYLE);
    this.drawRiverLegend(10, height - 80);

    // Top right: wood count, large, with a wood icon, and the build dropdown under it (DESIGN §7.1).
    const icon = this.add.graphics();
    const ix = width - 150;
    icon.fillStyle(0x8a5a2b, 1);
    icon.fillRoundedRect(ix, 22, 34, 12, 5);
    icon.fillRoundedRect(ix + 4, 12, 30, 12, 5);
    icon.fillStyle(0xd9b77e, 1);
    icon.fillCircle(ix + 32, 28, 5.5);
    icon.fillCircle(ix + 32, 18, 5.5);
    this.woodText = this.add.text(width - 105, 8, '', { fontFamily: 'sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#f3e3c3' });

    const left = width - PANEL_W - 12;
    const open = this.registry.get('buildOpen') !== false;
    this.add
      .text(width - 12, 56, open ? 'Build ▴' : 'Build ▾', { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', backgroundColor: '#3a2a16ee' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.registry.set('buildOpen', !open);
        this.scene.restart();
      });

    let y = 90;
    if (open) {
      const g = this.add.graphics();
      g.fillStyle(0x1b1712, 0.92);
      g.fillRoundedRect(left, y, PANEL_W, CRAFTABLE.length * ROW_H + 52, 6);
      CRAFTABLE.forEach((item, k) => {
        const ry = y + 6 + k * ROW_H;
        const bg = this.add
          .rectangle(left + 4, ry, PANEL_W - 8, ROW_H - 4, 0xffffff, 0)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.registry.set('buildSel', item));
        drawItemIcon(g, item, left + 24, ry + ROW_H / 2 - 2, 26, 0xd9c7a3);
        this.add.text(left + 44, ry + 3, ITEM_NAMES[item], { fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f3e3c3' });
        this.add.text(left + 44, ry + 21, ITEM_DESCRIPTIONS[item], { fontFamily: 'sans-serif', fontSize: '10px', color: '#b8a98c', wordWrap: { width: PANEL_W - 120 } });
        const price = this.add.text(left + PANEL_W - 10, ry + 4, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#f3e3c3', align: 'right' }).setOrigin(1, 0);
        this.rows.push({ item, bg, price });
      });
      y += CRAFTABLE.length * ROW_H + 10;
      this.craftButton = this.add
        .text(left + PANEL_W / 2, y + 4, '', { ...TEXT_STYLE, fontSize: '14px', fontStyle: 'bold', backgroundColor: '#2f6b34' })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const sel = this.registry.get('buildSel') as ItemKind | undefined;
          if (sel && !craftError(this.runner.state, this.runner.ctx, LOCAL_PLAYER, sel)) this.runner.submit({ type: 'craft', player: LOCAL_PLAYER, item: sel });
        });
      y += 48;
    }

    // Queue and hand under the menu.
    this.queueGfx = this.add.graphics();
    this.queueText = this.add.text(left, y, '', { ...TEXT_STYLE, fixedWidth: PANEL_W });
    this.handText = this.add.text(width - 12, y + 70, '', TEXT_STYLE).setOrigin(1, 0);

    this.statusText = this.add.text(width / 2, height - 16, '', { ...TEXT_STYLE, fontSize: '15px' }).setOrigin(0.5, 1);
    this.debugText = this.add.text(width - 12, height - 12, '', { fontFamily: 'monospace', fontSize: '10px', color: '#8a8a8a' }).setOrigin(1, 1);

    // Tutorial pop-up for the first steps of a match, at the top centre.
    const tw = Math.min(460, width - PANEL_W - 60);
    const box = this.add.graphics();
    box.fillStyle(0x1b1712, 0.94).fillRoundedRect(-tw / 2, 0, tw, 92, 8);
    box.lineStyle(2, PLAYER_COLORS[LOCAL_PLAYER]!, 1).strokeRoundedRect(-tw / 2, 0, tw, 92, 8);
    this.tutorialTitle = this.add.text(0, 10, '', { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f3e3c3' }).setOrigin(0.5, 0);
    this.tutorialBody = this.add
      .text(0, 40, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#cdbd9c', align: 'center', wordWrap: { width: tw - 28 } })
      .setOrigin(0.5, 0);
    this.tutorial = this.add.container((width - PANEL_W) / 2, 44, [box, this.tutorialTitle, this.tutorialBody]);

    // Re-layout on window resize; the scale manager is global, so drop the listener when the scene restarts.
    const relayout = () => this.scene.restart();
    this.scale.on('resize', relayout);
    this.events.once('shutdown', () => this.scale.off('resize', relayout));
  }

  override update(): void {
    const { state, ctx } = this.runner;
    const me = state.players[LOCAL_PLAYER]!;
    this.woodText.setText(String(wholeUnits(me.wood)));

    // Build menu: price and craft time with the current reduction; selected row highlighted.
    const sel = this.registry.get('buildSel') as ItemKind | undefined;
    for (const row of this.rows) {
      const c = ctx.config.items[row.item];
      const secs = me.started ? craftTicks(state, ctx, LOCAL_PLAYER, row.item) / ctx.config.tickRate : c.craftTimeS;
      row.price.setText(`${c.cost} wood\n${secs.toFixed(1)} s`);
      row.price.setColor(me.wood >= c.cost * 1000 ? '#f3e3c3' : '#e06a5a');
      row.bg.setFillStyle(0xffffff, row.item === sel ? 0.12 : 0);
    }
    if (this.craftButton) {
      const err = sel ? craftError(state, ctx, LOCAL_PLAYER, sel) : 'pick an item above';
      this.craftButton.setText(sel ? (err ? `Can't craft ${ITEM_NAMES[sel]}: ${err}` : `Craft ${ITEM_NAMES[sel]}`) : 'Pick an item above');
      this.craftButton.setBackgroundColor(sel && !err ? '#2f6b34' : '#4a4038');
    }

    // Queue: the item in production with its progress, then the waiting ones; slots = factory-mills.
    const slots = ownFactories(state, LOCAL_PLAYER).length;
    const reduction = craftReductionBp(state, ctx, LOCAL_PLAYER) / 100;
    const [job, ...waiting] = me.queue;
    const boost = reduction > 0 ? `−${reduction.toFixed(1)}% craft time` : 'no craft-time reduction yet';
    const lines = [`Queue ${me.queue.length}/${slots} · factory-mills: ${boost}`];
    lines.push(job ? `Crafting ${ITEM_NAMES[job.item]}` : 'Nothing crafting');
    if (waiting.length) lines.push(`Next: ${waiting.map((j) => ITEM_NAMES[j.item]).join(', ')}`);
    this.queueText.setText(lines.join('\n'));
    this.queueGfx.clear();
    if (job && job.totalTicks > 0) {
      const b = this.queueText.getBounds();
      this.queueGfx.fillStyle(0x000000, 0.6).fillRect(b.x + 6, b.bottom + 2, PANEL_W - 12, 6);
      this.queueGfx.fillStyle(PLAYER_COLORS[LOCAL_PLAYER]!, 1).fillRect(b.x + 6, b.bottom + 2, ((PANEL_W - 12) * job.doneTicks) / job.totalTicks, 6);
    }

    this.handText.setText(me.hand.length ? `In hand: ${me.hand.map((i) => ITEM_NAMES[i]).join(', ')}` : '').setVisible(me.hand.length > 0);
    const status = (this.registry.get('status') as string | undefined) ?? '';
    this.statusText.setText(status).setVisible(status !== '');
    this.updateTutorial();
    this.debugText.setText(`tick ${state.tick}  seed ${this.registry.get('seed')}  hash ${hashState(state).toString(16)}`);
  }

  /** Tutorial steps (DESIGN §5): the first outpost, then the first factory-mill. Hidden once both are placed. */
  private updateTutorial(): void {
    const { state } = this.runner;
    const me = state.players[LOCAL_PLAYER]!;
    let step: [string, string] | null = null;
    if (!me.started) {
      step = [
        'Place your first outpost',
        'Click a green hex inside your highlighted region. Its territory (5 hexes across) must hold a forest and a free riverside hex. A woodchopper starts cutting the nearest forest right away.',
      ];
    } else if (me.hand.includes('factory') && ownFactories(state, LOCAL_PLAYER).length === 0) {
      step = [
        'Place your first factory-mill',
        'Click a riverside hex inside your territory. Wood that reaches it becomes yours, and it lets you craft. Lower down the river crafts faster.',
      ];
    }
    this.tutorial.setVisible(step !== null);
    if (step) {
      this.tutorialTitle.setText(step[0]);
      this.tutorialBody.setText(step[1]);
    }
  }

  /** Explains river strength: weakest at the top of each half, strongest right above the waterfall / southern edge. */
  private drawRiverLegend(x: number, y: number): void {
    const w = 330;
    const h = 70;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.67);
    g.fillRect(x, y, w, h);

    this.add.text(x + 8, y + 5, 'River strength (water speed)', { fontFamily: 'sans-serif', fontSize: '13px', color: '#e8dcc4', fontStyle: 'bold' });

    const barX = x + 8;
    const barY = y + 26;
    const barW = w - 16;
    const weak = Phaser.Display.Color.IntegerToColor(0x8fc8f0);
    const strong = Phaser.Display.Color.IntegerToColor(0x1d4f9c);
    for (let i = 0; i < barW; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(weak, strong, barW - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(barX + i, barY, 1, 12);
    }

    const small = { fontFamily: 'sans-serif', fontSize: '11px', color: '#e8dcc4' };
    this.add.text(barX, barY + 16, 'weak: top of each half', small);
    this.add.text(barX + barW, barY + 16, 'strong: above waterfall / south edge', small).setOrigin(1, 0);
  }
}
