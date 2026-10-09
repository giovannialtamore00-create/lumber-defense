// Workshop tab (DESIGN §10, §12): every structure type as a dropdown row; the open one shows its two upgrade paths
// side by side with each level's name, short description, price and a Buy button. Research progress on top.
// Rebuilds itself only when something it shows changes; the progress bar updates every frame.
import type Phaser from 'phaser';
import type { ItemKind } from '../../sim/types';
import { MAX_LEVEL, levelData, ownsWorkshop, researchPoolBp, upgradeError, upgradePrice, workshopCount } from '../../sim/upgrades';
import { drawItemIcon } from '../render/icons';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';
import { BIRCH, BTN, BTN_ON, CHAR, DONE, EMBER, FONT, MUTED, plywoodEdge } from './theme';

export const WORKSHOP_W = 440;
const ROW_H = 30;
const SMALL = { fontFamily: FONT, fontSize: '11px', color: MUTED, wordWrap: { width: WORKSHOP_W / 2 - 24 } };
const BOLD = { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: BIRCH };
/** Greyed-out text: locked levels, nothing bought yet. */
const DIM = '#7d6a52';

export class WorkshopPanel {
  private container: Phaser.GameObjects.Container;
  private key = '';
  private bar!: Phaser.GameObjects.Graphics;
  /** Height of the panel as last built (the UI places things under it). */
  height = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runner: SimRunner,
    private readonly left: number,
    private readonly top: number,
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
      this.bar.fillStyle(0x000000, 0.6).fillRect(10, 30, WORKSHOP_W - 20, 6).lineStyle(1, EMBER, 0.8).strokeRect(9.5, 29.5, WORKSHOP_W - 19, 7);
      this.bar.fillStyle(PLAYER_COLORS[this.player]!, 1).fillRect(10, 30, ((WORKSHOP_W - 20) * r.doneTicks) / r.totalTicks, 6);
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
    add(this.scene.add.text(10, 8, head, BOLD));
    this.bar = add(this.scene.add.graphics());
    const slots = workshopCount(state, this.player);
    const pool = researchPoolBp(state, ctx, this.player) / 100;
    const queueLine = `Queue ${me.research.length}/${slots}${pool ? ` · ${slots} workshops: research −${pool}%` : ''}${waiting.length ? ` · next: ${waiting.map(name).join(', ')}` : ''}`;
    add(this.scene.add.text(10, 40, queueLine, { ...SMALL, wordWrap: { width: WORKSHOP_W - 20 } }));

    let y = 62;
    ctx.upgrades.types.forEach((type, t) => {
      const prog = me.upgrades[t]!;
      const isOpen = this.open === t;
      // Row: icon, name, current levels, ▾/▴.
      const row = add(this.scene.add.rectangle(4, y, WORKSHOP_W - 8, ROW_H - 2, isOpen ? EMBER : 0xe6cfa0, isOpen ? 0.25 : 0.04).setOrigin(0, 0));
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.scene.registry.set('workshopOpen', isOpen ? -1 : t);
        this.scene.scene.restart(); // re-layout: the panel's height changed
      });
      drawItemIcon(g, type.type as ItemKind, 20, y + ROW_H / 2 - 1, 18, 0xd9c7a3);
      add(this.scene.add.text(36, y + 7, type.name, BOLD));
      const tags = type.paths.map((p, k) => (prog.levels[k as 0 | 1] ? `${p.name} ${prog.levels[k as 0 | 1]}` : '')).filter(Boolean).join(' · ');
      add(this.scene.add.text(WORKSHOP_W - 30, y + 8, tags || 'no upgrades', { ...SMALL, color: tags ? DONE : DIM }).setOrigin(1, 0));
      add(this.scene.add.text(WORKSHOP_W - 18, y + 6, isOpen ? '▴' : '▾', BOLD));
      y += ROW_H;
      if (!isOpen) return;

      // The two paths side by side.
      const colW = WORKSHOP_W / 2;
      let maxY = y;
      type.paths.forEach((path, k) => {
        const x = 8 + k * colW;
        let py = y + 6;
        const lvl = prog.levels[k as 0 | 1];
        const second = prog.first !== -1 && prog.first !== k;
        add(this.scene.add.text(x, py, `${path.name}  ${lvl}/${MAX_LEVEL}`, BOLD));
        if (second) add(this.scene.add.text(x + colW - 18, py + 1, '×2 price', { ...SMALL, color: '#e0a35a' }).setOrigin(1, 0));
        py += 20;
        for (let L = 1; L <= MAX_LEVEL; L++) {
          const d = levelData(ctx, t, k, L)!;
          const mark = L <= lvl ? '✓' : d.locked ? '🔒' : L === lvl + 1 ? '→' : '·';
          const color = L <= lvl ? DONE : d.locked ? DIM : L === lvl + 1 ? BIRCH : MUTED;
          const text = add(this.scene.add.text(x, py, `${mark} L${L}  ${d.desc}${d.locked ? ' (locked)' : ''}`, { ...SMALL, color }));
          py += text.height + 4;
        }
        // Buy button for the next level.
        const price = upgradePrice(state, ctx, this.player, t, k);
        const err = upgradeError(state, ctx, this.player, t, k);
        const label = !price ? 'Fully upgraded' : err ? `L${price.level}: ${err}` : `Buy L${price.level} · ${price.cost} wood · ${price.ticks / ctx.config.tickRate} s`;
        const btn = add(
          this.scene.add.text(x, py + 2, label, {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: !err && price ? '#ffffff' : MUTED,
            backgroundColor: !err && price ? BTN_ON : BTN,
            padding: { x: 6, y: 4 },
            wordWrap: { width: colW - 24 },
          }),
        );
        if (!err && price) {
          btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.runner.submit({ type: 'buyUpgrade', player: this.player, upgradeType: t, path: k });
          });
        }
        maxY = Math.max(maxY, py + btn.height + 10);
      });
      g.lineStyle(1, 0xe6cfa0, 0.15).lineBetween(WORKSHOP_W / 2, y + 4, WORKSHOP_W / 2, maxY - 6);
      y = maxY;
    });

    bg.fillStyle(CHAR, 0.94).fillRoundedRect(0, 0, WORKSHOP_W, y + 6, 3);
    plywoodEdge(bg, 0, y + 6, WORKSHOP_W);
    this.height = y + 12;
  }

  destroy(): void {
    this.container.destroy();
  }
}
