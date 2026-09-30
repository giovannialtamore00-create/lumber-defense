// Small stylized item icons (placeholder art), centred on (x, y) in a box of size `s`. Used by the build menu and by
// the crafting-progress badge on every factory-mill (DESIGN §7.1, §7.2).
import type Phaser from 'phaser';
import type { ItemKind } from '../../sim/types';

export function drawItemIcon(g: Phaser.GameObjects.Graphics, kind: ItemKind, x: number, y: number, s: number, color: number, alpha = 1): void {
  const u = s / 20; // design grid: 20×20
  const P = (px: number, py: number) => ({ x: x + px * u, y: y + py * u });
  g.fillStyle(color, alpha);
  g.lineStyle(Math.max(1, 1.5 * u), color, alpha);
  switch (kind) {
    case 'outpost':
      g.fillRect(x - 3 * u, y - 4 * u, 6 * u, 12 * u);
      g.fillTriangle(P(-5, -4).x, P(-5, -4).y, P(5, -4).x, P(5, -4).y, P(0, -9).x, P(0, -9).y);
      break;
    case 'factory':
      g.fillRect(x - 8 * u, y - 2 * u, 10 * u, 9 * u);
      g.fillTriangle(P(-9, -2).x, P(-9, -2).y, P(3, -2).x, P(3, -2).y, P(-3, -8).x, P(-3, -8).y);
      g.strokeCircle(x + 6 * u, y + 3 * u, 4 * u);
      break;
    case 'dock':
      g.fillRect(x - 9 * u, y + 1 * u, 18 * u, 4 * u);
      g.fillRect(x - 8 * u, y - 6 * u, 2 * u, 12 * u);
      g.fillRect(x + 6 * u, y - 6 * u, 2 * u, 12 * u);
      break;
    case 'carrier':
      g.fillRect(x - 8 * u, y - 5 * u, 16 * u, 8 * u);
      g.fillCircle(x - 5 * u, y + 5 * u, 2.5 * u);
      g.fillCircle(x + 5 * u, y + 5 * u, 2.5 * u);
      break;
    case 'woodchopper':
      g.lineBetween(P(-6, 8).x, P(-6, 8).y, P(4, -6).x, P(4, -6).y);
      g.fillTriangle(P(2, -8).x, P(2, -8).y, P(9, -4).x, P(9, -4).y, P(4, -2).x, P(4, -2).y);
      break;
    case 'bridge':
      g.fillRect(x - 9 * u, y - 1 * u, 18 * u, 3 * u);
      g.beginPath();
      g.arc(x, y + 8 * u, 7 * u, Math.PI, 0);
      g.strokePath();
      break;
    case 'workshop':
      g.fillRect(x - 7 * u, y - 1 * u, 14 * u, 8 * u);
      g.fillTriangle(P(-9, -1).x, P(-9, -1).y, P(9, -1).x, P(9, -1).y, P(0, -8).x, P(0, -8).y);
      break;
    case 'catapult':
      g.fillRect(x - 8 * u, y + 2 * u, 16 * u, 3 * u);
      g.lineBetween(P(-4, 2).x, P(-4, 2).y, P(7, -7).x, P(7, -7).y);
      g.fillCircle(x + 7 * u, y - 7 * u, 2.5 * u);
      g.fillCircle(x - 5 * u, y + 7 * u, 2 * u);
      g.fillCircle(x + 5 * u, y + 7 * u, 2 * u);
      break;
  }
}
