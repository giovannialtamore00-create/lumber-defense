import Phaser from 'phaser';

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

  create(): void {
    this.add.text(10, 8, '▲ NORTH (uphill) — rivers flow south   ·   drag / WASD: pan   ·   wheel: zoom   ·   C: coordinates', TEXT_STYLE);
    this.drawRiverLegend(10, this.scale.height - 80);
    // Re-layout on window resize; the scale manager is global, so drop the listener when the scene restarts.
    const relayout = () => this.scene.restart();
    this.scale.on('resize', relayout);
    this.events.once('shutdown', () => this.scale.off('resize', relayout));
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
