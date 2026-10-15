// Small pixel-art pictures for the HUD: item sprites cut from the art pack (build and workshop lists, warehouse) and
// hand-drawn tool icons (hammer, warehouse, trade, catapult stance). Rendering only.
import type Phaser from 'phaser';
import type { ItemKind } from '../../sim/types';
import { PACK_KEY, spriteName } from '../render/sprites';

/** The pack sprite that pictures each item (first stage, in the owner's colour where it has one). */
const ITEM_SPRITE: Record<ItemKind, string> = {
  outpost: 'outpost.s1',
  castle: 'outpost.s3',
  factory: 'mill.s1',
  dock: 'dock.s1',
  carrier: 'carrier.s1',
  woodchopper: 'woodchopper.s1',
  bridge: 'bridge.s1.flowSE',
  dam: 'dam.flowSE',
  workshop: 'workshop.s1',
  catapult: 'catapult.s1',
  forestGuard: 'forestGuard.s1',
  stoneCutter: 'stoneCutter.base',
  excavator: 'excavator.base',
};

/** Pixel bounds of the drawn part of each atlas frame, found once by scanning its alpha. */
const cropped = new Map<string, { w: number; h: number } | null>();

/** Adds (once) a frame trimmed to the drawn pixels of `key`, named `ui:<key>`. */
function trimmedFrame(scene: Phaser.Scene, key: string): { name: string; w: number; h: number } | null {
  const name = `ui:${key}`;
  if (!cropped.has(key)) {
    const tex = scene.textures.get(PACK_KEY);
    const f = tex?.has(key) ? tex.get(key) : null;
    let size: { w: number; h: number } | null = null;
    if (f) {
      const canvas = document.createElement('canvas');
      canvas.width = f.cutWidth;
      canvas.height = f.cutHeight;
      const c = canvas.getContext('2d', { willReadFrequently: true })!;
      c.drawImage(tex.getSourceImage() as HTMLImageElement, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const px = c.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      let x0 = f.cutWidth;
      let y0 = f.cutHeight;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < f.cutHeight; y++)
        for (let x = 0; x < f.cutWidth; x++)
          if (px[(y * f.cutWidth + x) * 4 + 3]! > 40) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      if (x1 >= 0) {
        size = { w: x1 - x0 + 1, h: y1 - y0 + 1 };
        tex.add(name, f.sourceIndex, f.cutX + x0, f.cutY + y0, size.w, size.h);
      }
    }
    cropped.set(key, size);
  }
  const size = cropped.get(key);
  return size ? { name, ...size } : null;
}

/** The item's pack sprite, fitted into a `box`-px square centred on (x, y). Undefined if the pack isn't loaded. */
export function addItemSprite(scene: Phaser.Scene, item: ItemKind, owner: number, x: number, y: number, box: number): Phaser.GameObjects.Image | undefined {
  const base = ITEM_SPRITE[item];
  const t = trimmedFrame(scene, spriteName(base, owner + 1)) ?? trimmedFrame(scene, base);
  if (!t) return undefined;
  // Whole-number scales keep the pixels square when the sprite is small enough to be enlarged.
  const fit = box / Math.max(t.w, t.h);
  return scene.add.image(x, y, PACK_KEY, t.name).setScale(fit >= 1 ? Math.floor(fit) : fit);
}

/** Tool pictures as pixel rows: one character per pixel, '.' is empty; colours from the palette. */
const TOOLS = {
  hammer: {
    pal: { d: 0x3b3f45, g: 0x8d949c, l: 0xd3d8de, w: 0x8a5a2b, b: 0xc48a4d },
    rows: [
      '...dddddd.....',
      '..dgglllld....',
      '.ddgglllldd...',
      '.dddgggggdd...',
      '..ddddddddd...',
      '......dwbd....',
      '......dwbd....',
      '......dwbd....',
      '......dwbd....',
      '......dwbd....',
      '......dwbd....',
      '......dwbd....',
      '......dddd....',
    ],
  },
  warehouse: {
    pal: { r: 0x7a2e1c, o: 0xa8452a, d: 0x3a2516, w: 0xc48a4d, l: 0xe0b878, k: 0x1a120d },
    rows: [
      '......rr......',
      '....rroorr....',
      '..rroooooorr..',
      'rroooooooooorr',
      '.dwwwwwwwwwwd.',
      '.dwkkkkkkkkwd.',
      '.dwklwlwlwkwd.',
      '.dwkwlwlwlkwd.',
      '.dwklwlwlwkwd.',
      '.dwkwlwlwlkwd.',
      '.dwkkkkkkkkwd.',
      '.dddddddddddd.',
    ],
  },
  trade: {
    pal: { a: 0xe8a33a, d: 0x7a4a14, b: 0x7fb4d9, e: 0x2c5a7c },
    rows: [
      '.....a........',
      '....aa........',
      '...aaaaaaaaaa.',
      '..aaaaaaaaaaa.',
      '...aaaaaaaaaa.',
      '....aa........',
      '.....a........',
      '........b.....',
      '........bb....',
      '.bbbbbbbbbb...',
      '.bbbbbbbbbbb..',
      '.bbbbbbbbbb...',
      '........bb....',
      '........b.....',
    ],
  },
  conquest: {
    pal: { p: 0x5a3a1e, f: 0x7fd0c8, s: 0x3a8c86 },
    rows: [
      '..pffffff.....',
      '..pffffffff...',
      '..pfffffffff..',
      '..pssfffffff..',
      '..pfssfffff...',
      '..pffffff.....',
      '..p...........',
      '..p...........',
      '..p...........',
      '..p...........',
      '..p...........',
      '.ppp..........',
    ],
  },
  peaceful: {
    pal: { p: 0x5a3a1e, w: 0xf4f0e2, s: 0xc9c2ad },
    rows: [
      '..pwwwwww.....',
      '..pwwwwwwww...',
      '..pwwwwwwwww..',
      '..pwwsswwwww..',
      '..pwwwwssww...',
      '..pwwwwww.....',
      '..p...........',
      '..p...........',
      '..p...........',
      '..p...........',
      '..p...........',
      '.ppp..........',
    ],
  },
  destruction: {
    pal: { r: 0xc8361a, o: 0xf07a22, y: 0xffd25a, w: 0xfff2c0 },
    rows: [
      '......r.......',
      '.....rr...r...',
      '....rrr..rr...',
      '...rrorr.rrr..',
      '..rrrorrrrorr.',
      '..rroooorroor.',
      '.rrooyyoooorr.',
      '.rroyyyyyoorr.',
      '.rooyywyyyorr.',
      '.rooywwwyyorr.',
      '..roywwwwyor..',
      '...rroooorr...',
    ],
  },
} satisfies Record<string, { pal: Record<string, number>; rows: string[] }>;

export type ToolIcon = keyof typeof TOOLS;

/** Draws a tool icon centred on (x, y), each picture pixel `px` screen pixels wide. */
export function drawToolIcon(g: Phaser.GameObjects.Graphics, icon: ToolIcon, x: number, y: number, px: number): void {
  const { pal, rows } = TOOLS[icon];
  const w = Math.max(...rows.map((r) => r.length));
  const left = Math.round(x - (w * px) / 2);
  const top = Math.round(y - (rows.length * px) / 2);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const color = (pal as Record<string, number>)[row[i]!];
      if (color !== undefined) g.fillStyle(color, 1).fillRect(left + i * px, top + j * px, px, px);
    }
  });
}
