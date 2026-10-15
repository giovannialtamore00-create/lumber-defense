// Workshop tab (DESIGN §10, §12): every structure type as a compact row (pixel icon, name, cheapest next price); the
// open one shows its two upgrade paths one under the other, in larger text, with each level and a Buy button.
// Research progress on top.
// Rebuilds itself only when something it shows changes; the progress bar updates every frame.
import type Phaser from 'phaser';
import type { ItemKind } from '../../sim/types';
import { MAX_LEVEL, levelData, ownsWorkshop, researchPoolBp, upgradeError, upgradePrice, workshopCount } from '../../sim/upgrades';
import { drawItemIcon } from '../render/icons';
import { addItemSprite } from './pixelIcons';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';
import { BIRCH, BTN, BTN_ON, CHAR, DONE, EMBER, FONT, MUTED, plywoodEdge } from './theme';

const ROW_H = 30;
const SMALL = { fontFamily: FONT, fontSize: '13px', color: MUTED };
const BOLD = { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: BIRCH };
/** Greyed-out text: locked levels, nothing bought yet. */
const DIM = '#7d6a52';

export class WorkshopPanel {
  private container: Phaser.GameObjects.Container;
  private key = '';
  private bar!: Phaser.GameObjects.Graphics;
  /** Where the research progress bar sits (under the research line, which may wrap). */
  private barY = 30;
  /** Height of the panel as last built (the UI places things under it). */
  height = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runner: SimRunner,
    private readonly left: number,
    private readonly top: number,
    private readonly width: number,
  ) {
    this.container = scene.add.container(left, top);
  }

  private get player(): number {
    return this.runner.localPlayer;
  }

  private get open(): number {
    return (this.scene.registry.get('workshopOpen') as number | undefined) ?? -1;
  }

  /** Call every frame. */
  update(): void {
    const { state } = this.runner;
    const me = state.players[this.player]!;
    const r0 = me.research[0];
    const key = JSON.stringify([
      this.open,
      me.upgrades,
      me.research.map((r) => [r.type, r.path, r.level]),
      r0 ? Math.floor(r0.doneTicks / 10) : -1,
      workshopCount(state, this.player),
      Math.floor(me.wood / 10_000),
    ]);
    if (key !== this.key) {
      this.key = key;
      this.rebuild();
    }
    // Research progress bar.
    this.bar.clear();
    const r = me.research[0];
    if (r && r.totalTicks > 0) {
      this.bar.fillStyle(0x000000, 0.6).fillRect(10, this.barY, this.width - 20, 6).lineStyle(1, EMBER, 0.8).strokeRect(9.5, this.barY - 0.5, this.width - 19, 7);
      this.bar.fillStyle(PLAYER_COLORS[this.player]!, 1).fillRect(10, this.barY, ((this.width - 20) * r.doneTicks) / r.totalTicks, 6);
    }
  }

  private rebuild(): void {
    const { state, ctx } = this.runner;
    const me = state.players[this.player]!;
    this.container.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.container.add(o), o);
    const bg = add(this.scene.add.graphics());
    const g = add(this.scene.add.graphics());

    // Research line, then the queue: one slot per workshop, extra workshops research faster (DESIGN §8.5).
    const name = (x: { type: number; path: number; level: number }) =>
      `${ctx.upgrades.types[x.type]!.name} · ${ctx.upgrades.types[x.type]!.paths[x.path]!.name} ${x.level}`;
    const [r, ...waiting] = me.research;
    const head = !ownsWorkshop(state, this.player)
      ? 'Build a workshop to research upgrades.'
      : r
        ? `Researching ${name(r)}${r.totalTicks ? ` (${Math.ceil((r.totalTicks - r.doneTicks) / ctx.config.tickRate)} s)` : ''}`
        : 'Pick an upgrade below.';
    const headText = add(this.scene.add.text(10, 8, head, { ...BOLD, wordWrap: { width: this.width - 20 } }));
    this.barY = headText.y + headText.height + 6;
    this.bar = add(this.scene.add.graphics());
    const slots = workshopCount(state, this.player);
    const pool = researchPoolBp(state, ctx, this.player) / 100;
    const queueLine = `Queue ${me.research.length}/${slots}${pool ? ` · ${slots} workshops: research −${pool}%` : ''}${waiting.length ? ` · next: ${waiting.map(name).join(', ')}` : ''}`;
    const queueText = add(this.scene.add.text(10, this.barY + 12, queueLine, { ...SMALL, wordWrap: { width: this.width - 20 } }));

    let y = queueText.y + queueText.height + 8;
    ctx.upgrades.types.forEach((type, t) => {
      const prog = me.upgrades[t]!;
      const isOpen = this.open === t;
      // Row: pixel icon, name, the cheapest next level's price.
      const row = add(this.scene.add.rectangle(3, y, this.width - 6, ROW_H, EMBER, isOpen ? 0.22 : 0).setOrigin(0, 0));
      row
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => row.setFillStyle(EMBER, isOpen ? 0.3 : 0.12))
        .on('pointerout', () => row.setFillStyle(EMBER, isOpen ? 0.22 : 0))
        .on('pointerdown', () => {
          this.scene.registry.set('workshopOpen', isOpen ? -1 : t);
          this.scene.scene.restart(); // re-layout: the panel's height changed
        });
      const icon = addItemSprite(this.scene, type.type as ItemKind, this.player, 19, y + ROW_H / 2, 24);
      if (icon) add(icon);
      else drawItemIcon(g, type.type as ItemKind, 19, y + ROW_H / 2, 20, 0xd9c7a3);
      add(this.scene.add.text(38, y + ROW_H / 2, type.name, BOLD).setOrigin(0, 0.5));
      const prices = [0, 1].map((k) => upgradePrice(state, ctx, this.player, t, k)?.cost).filter((c): c is number => c !== undefined);
      const cheapest = prices.length ? Math.min(...prices) : null;
      const priceText = cheapest === null ? 'max' : String(cheapest);
      add(this.scene.add.text(this.width - 28, y + ROW_H / 2, priceText, { ...BOLD, color: cheapest !== null && me.wood < cheapest * 1000 ? '#e0745a' : BIRCH }).setOrigin(1, 0.5));
      if (cheapest !== null) {
        g.fillStyle(0x8a5a2b, 1).fillRoundedRect(this.width - 24, y + ROW_H / 2 - 4, 16, 8, 3);
        g.fillStyle(0xd9b77e, 1).fillCircle(this.width - 9, y + ROW_H / 2, 3.6);
      }
      y += ROW_H;
      if (!isOpen) return;

      // The two paths, one under the other, in larger text.
      const top = y;
      type.paths.forEach((path, k) => {
        const x = 14;
        const w = this.width - 28;
        let py = y + 8;
        const lvl = prog.levels[k as 0 | 1];
        const second = prog.first !== -1 && prog.first !== k;
        add(this.scene.add.text(x, py, `${path.name}  ${lvl}/${MAX_LEVEL}`, BOLD));
        if (second) add(this.scene.add.text(x + w, py + 2, '×2 price', { ...SMALL, color: '#e0a35a' }).setOrigin(1, 0));
        py += 24;
        for (let L = 1; L <= MAX_LEVEL; L++) {
          const d = levelData(ctx, t, k, L)!;
          const mark = L <= lvl ? '✓' : d.locked ? '🔒' : L === lvl + 1 ? '→' : '·';
          const color = L <= lvl ? DONE : d.locked ? DIM : L === lvl + 1 ? BIRCH : MUTED;
          const text = add(this.scene.add.text(x, py, `${mark} L${L}  ${d.desc}${d.locked ? ' (locked)' : ''}`, { ...SMALL, fontSize: '14px', color, wordWrap: { width: w } }));
          py += text.height + 4;
        }
        // Buy button for the next level.
        const price = upgradePrice(state, ctx, this.player, t, k);
        const err = upgradeError(state, ctx, this.player, t, k);
        const label = !price ? 'Fully upgraded' : err ? `L${price.level}: ${err}` : `Buy L${price.level} · ${price.cost} wood · ${price.ticks / ctx.config.tickRate} s`;
        const btn = add(
          this.scene.add.text(x, py + 4, label, {
            fontFamily: FONT,
            fontSize: '14px',
            fontStyle: 'bold',
            color: !err && price ? '#ffffff' : MUTED,
            backgroundColor: !err && price ? BTN_ON : BTN,
            padding: { x: 8, y: 5 },
            wordWrap: { width: w - 16 },
          }),
        );
        if (!err && price) {
          btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.runner.submit({ type: 'buyUpgrade', player: this.player, upgradeType: t, path: k });
          });
        }
        y = py + btn.height + 12;
        if (k === 0) g.fillStyle(0xe6cfa0, 0.14).fillRect(x, y - 4, w, 1);
      });
      g.fillStyle(EMBER, 0.08).fillRect(3, top, this.width - 6, y - top);
      g.fillStyle(EMBER, 0.9).fillRect(3, top, 3, y - top);
      y += 4;
    });

    bg.fillStyle(CHAR, 0.94).fillRoundedRect(0, 0, this.width, y + 6, 3);
    plywoodEdge(bg, 0, y + 6, this.width);
    // The map under the panel doesn't take clicks; at the back, so the rows still get theirs.
    this.container.sendToBack(add(this.scene.add.rectangle(0, 0, this.width, y + 6, 0, 0).setOrigin(0, 0).setInteractive()));
    this.height = y + 12;
  }

  destroy(): void {
    this.container.destroy();
  }
}
