import Phaser from 'phaser';
import { wholeUnits } from '../../sim/fixed';
import { hashState } from '../../sim/hash';
import type { ItemKind } from '../../sim/types';
import { ITEM_NAMES } from '../input/placementHand';
import type { SimRunner } from '../simRunner';
import { LOCAL_PLAYER } from './GameScene';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontSize: '13px',
  color: '#e8dcc4',
  backgroundColor: '#000000aa',
  padding: { x: 6, y: 4 },
};

/** Screen-fixed UI drawn above GameScene, unaffected by the map camera's pan and zoom. */
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  private runner!: SimRunner;
  private woodText!: Phaser.GameObjects.Text;
  private handText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;

  create(): void {
    this.runner = this.registry.get('runner') as SimRunner;
    const { width, height } = this.scale;
    this.add.text(10, 8, '▲ NORTH (uphill) — rivers flow south   ·   drag / WASD: pan   ·   wheel: zoom   ·   C: coordinates', TEXT_STYLE);
    this.drawRiverLegend(10, height - 80);

    // Top right: wood count, large, with a wood icon (DESIGN §7.1). The build dropdown joins it in M3.
    const icon = this.add.graphics();
    const ix = width - 150;
    icon.fillStyle(0x8a5a2b, 1);
    icon.fillRoundedRect(ix, 22, 34, 12, 5);
    icon.fillRoundedRect(ix + 4, 12, 30, 12, 5);
    icon.fillStyle(0xd9b77e, 1);
    icon.fillCircle(ix + 32, 28, 5.5);
    icon.fillCircle(ix + 32, 18, 5.5);
    this.woodText = this.add.text(width - 105, 8, '', { fontFamily: 'sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#f3e3c3' });
    this.handText = this.add.text(width - 12, 56, '', TEXT_STYLE).setOrigin(1, 0);
    this.statusText = this.add.text(width / 2, height - 16, '', { ...TEXT_STYLE, fontSize: '15px' }).setOrigin(0.5, 1);
    this.debugText = this.add.text(width - 12, height - 12, '', { fontFamily: 'monospace', fontSize: '10px', color: '#8a8a8a' }).setOrigin(1, 1);

    if (this.runner.ctx.allowDevCommands) this.drawDevPanel(width - 12, 92);

    // Re-layout on window resize; the scale manager is global, so drop the listener when the scene restarts.
    const relayout = () => this.scene.restart();
    this.scale.on('resize', relayout);
    this.events.once('shutdown', () => this.scale.off('resize', relayout));
  }

  override update(): void {
    const { state } = this.runner;
    const me = state.players[LOCAL_PLAYER]!;
    this.woodText.setText(String(wholeUnits(me.wood)));
    this.handText.setText(me.hand.length ? `In hand: ${me.hand.map((i) => ITEM_NAMES[i]).join(', ')}` : '').setVisible(me.hand.length > 0);
    const status = (this.registry.get('status') as string | undefined) ?? '';
    this.statusText.setText(status).setVisible(status !== '');
    this.debugText.setText(`tick ${state.tick}  seed ${this.registry.get('seed')}  hash ${hashState(state).toString(16)}`);
  }

  /** Dev builds only (M2): free items in hand to test the economy loop. Crafting replaces this in M3. */
  private drawDevPanel(right: number, top: number): void {
    const items: ItemKind[] = ['carrier', 'dock', 'woodchopper', 'factory'];
    this.add.text(right, top, 'DEV: free item in hand', { fontFamily: 'sans-serif', fontSize: '11px', color: '#ffb347' }).setOrigin(1, 0);
    items.forEach((item, k) => {
      const b = this.add
        .text(right, top + 18 + k * 26, `+ ${ITEM_NAMES[item]}`, { ...TEXT_STYLE, backgroundColor: '#5a3a10dd' })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.runner.submit({ type: 'devGive', player: LOCAL_PLAYER, item });
      });
    });
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
