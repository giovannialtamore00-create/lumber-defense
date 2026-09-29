import Phaser from 'phaser';
import map01 from '../../data/maps/map01.json';
import { DIRECTIONS, type Hex, hexKey } from '../../sim/hex';
import { type MapData, type MapHex, indexHexes, riverStrengthLevel } from '../../sim/map';
import { HEX_SIZE, ISO_SQUASH, TILE_DEPTH, type Point, edgeCorners, hexCorners, hexToScreen } from '../iso';

const MAP = map01 as MapData;

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

const REGION_NAMES = ['Region 0 (NW)', 'Region 1 (NE)', 'Region 2 (SW)', 'Region 3 (SE)'];

const MAX_STRENGTH = Math.max(...MAP.riverFlow.map((f) => riverStrengthLevel(MAP, f.r)));

/** River colour from light (weak, top of a slope) to deep (strong, bottom of a slope). */
function riverColor(r: number): number {
  const t = (riverStrengthLevel(MAP, r) - 1) / Math.max(1, MAX_STRENGTH - 1);
  const a = Phaser.Display.Color.IntegerToColor(COLORS.riverWeak);
  const b = Phaser.Display.Color.IntegerToColor(COLORS.riverStrong);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

export class GameScene extends Phaser.Scene {
  private coordLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    const idx = indexHexes(MAP);
    const g = this.add.graphics();

    // Painter's order: north to south, so things further south draw on top (ARCHITECTURE §4 depth sorting).
    const ordered = [...MAP.hexes].sort((a, b) => a.r - b.r || a.q - b.q);
    for (const h of ordered) this.drawTile(g, h);

    const decor = this.add.graphics();
    for (const h of ordered) {
      if (h.terrain === 'forest') this.drawTrees(decor, h);
      if (h.terrain === 'rock') this.drawRock(decor, h);
    }

    const overlay = this.add.graphics();
    this.drawRiverFlow(overlay);
    this.drawRegionBorders(overlay, idx);
    this.drawWaterfalls(overlay);
    this.drawRegionLabels();
    this.createCoordLabels();

    this.setupCamera();
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
        const k = 0.6 + (0.7 * (riverStrengthLevel(MAP, f.r) - 1)) / Math.max(1, MAX_STRENGTH - 1);
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
      // Labels sit outside the map: north regions above it, south regions below it.
      const ys = MAP.hexes.map((h) => hexToScreen(h).y);
      const cy = r < 2 ? Math.min(...ys) - HEX_SIZE * 1.3 : Math.max(...ys) + HEX_SIZE * 1.5;
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
    cam.setBounds(minX - 400, minY - 400, maxX - minX + 800, maxY - minY + 800);
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    cam.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width / (maxX - minX), (this.scale.height - 40) / (maxY - minY)), ZOOM_MIN, ZOOM_MAX));

    // Pan: drag with any mouse button.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    // Zoom: mouse wheel, anchored on the cursor.
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), ZOOM_MIN, ZOOM_MAX));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

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
