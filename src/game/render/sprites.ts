// Sprite pack loader (public/assets/lumber-pack). Pointy-top isometric pixel art drawn at HEX_SIZE 64.
// Every frame's pivot is the hex centre at ground level, so a sprite placed at hexToScreen(h) lands on its tile.
// Rendering only: nothing here reads or writes the sim. The Graphics-based draw functions stay as fallbacks:
// call hasSprite() first and fall back to them when a sprite is missing.
import Phaser from 'phaser';

export const PACK_KEY = 'lumber-pack';
const BASE = 'assets/lumber-pack/';
const WATER_KEY = `${PACK_KEY}-water`;
const MANIFEST_KEY = `${PACK_KEY}-manifest`;

/** Hex size the art was drawn for. iso.ts HEX_SIZE must equal this for sprites to line up 1:1. */
export const PACK_HEX_SIZE = 64;

export type WaterFlow = 'SE' | 'SW';

interface SpriteInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  group: string;
  /** Left edge and width of the drawn pixels. */
  bx?: number;
  bw?: number;
}
interface PackManifest {
  tile: { size: number; sq: number; orientation: string; topOffsetPx: number; anchor: { x: number; y: number }; w: number };
  players: { id: number; name: string; color: string }[];
  water: { frames: number; strengthSteps: number; flows: string[]; frameW: number; frameH: number };
  sprites: Record<string, SpriteInfo>;
}

/** Call from a scene's preload(). */
export function preloadLumberPack(scene: Phaser.Scene): void {
  scene.load.atlas(PACK_KEY, `${BASE}atlas.png`, `${BASE}atlas.phaser.json`);
  scene.load.json(MANIFEST_KEY, `${BASE}manifest.json`);
  scene.load.spritesheet(WATER_KEY, `${BASE}water.png`, { frameWidth: 140, frameHeight: 140 }); // = manifest water.frameW/H
}

function manifest(scene: Phaser.Scene): PackManifest | undefined {
  return scene.cache.json.get(MANIFEST_KEY) as PackManifest | undefined;
}

/** Sprite name with the owner suffix: spriteName('outpost.archer', 2) -> 'outpost.archer.p2'. Owners are 1-based. */
export function spriteName(name: string, owner?: number): string {
  return owner ? `${name}.p${owner}` : name;
}

export function hasSprite(scene: Phaser.Scene, name: string, owner?: number): boolean {
  const m = manifest(scene);
  return !!m && spriteName(name, owner) in m.sprites;
}

/** Add a pack sprite centred on a hex position (the pivot is the hex centre). Returns undefined if it is missing. */
export function addPackSprite(
  scene: Phaser.Scene,
  name: string,
  x: number,
  y: number,
  owner?: number,
): Phaser.GameObjects.Image | undefined {
  const m = manifest(scene);
  const key = spriteName(name, owner);
  const info = m?.sprites[key];
  if (!info) return undefined;
  return scene.add.image(x, y, PACK_KEY, key).setOrigin(info.ax / info.w, info.ay / info.h);
}

/** Owner colour from the pack manifest (hex string), for tinting UI to match the sprites. */
export function packPlayerColor(scene: Phaser.Scene, owner: number): string | undefined {
  return manifest(scene)?.players.find((p) => p.id === owner)?.color;
}

/**
 * Create the river animations. Names: `lumber-water-<flow>-<step>` (flow SE or SW, step 0..5 from weak to strong)
 * and `lumber-waterfall`. Play one on a Sprite made with addWaterSprite().
 */
export function createWaterAnims(scene: Phaser.Scene, fps = 6): void {
  const m = manifest(scene);
  if (!m) return;
  const { frames, strengthSteps, flows } = m.water;
  flows.forEach((flow, fi) => {
    for (let step = 0; step < strengthSteps; step++) {
      const row = fi * strengthSteps + step;
      const key = `lumber-water-${flow}-${step}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(WATER_KEY, { start: row * frames, end: row * frames + frames - 1 }),
        frameRate: fps,
        repeat: -1,
      });
    }
  });
  const fall = flows.length * strengthSteps;
  if (!scene.anims.exists('lumber-waterfall')) {
    scene.anims.create({
      key: 'lumber-waterfall',
      frames: scene.anims.generateFrameNumbers(WATER_KEY, { start: fall * frames, end: fall * frames + frames - 1 }),
      frameRate: fps,
      repeat: -1,
    });
  }
}

/** A river tile on a hex centre. strength is 0 (weak, light blue) to 1 (strong, dark blue). */
export function addWaterSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  flow: WaterFlow,
  strength: number,
  waterfall = false,
): Phaser.GameObjects.Sprite | undefined {
  const m = manifest(scene);
  if (!m) return undefined;
  const step = Math.max(0, Math.min(m.water.strengthSteps - 1, Math.round(strength * (m.water.strengthSteps - 1))));
  const s = scene.add.sprite(x, y, WATER_KEY, 0).setOrigin(m.tile.anchor.x / m.water.frameW, m.tile.anchor.y / m.water.frameH);
  s.play(waterfall ? 'lumber-waterfall' : `lumber-water-${flow}-${step}`);
  return s;
}

/** Enlarged sprites stop growing at this share of their hex's width (DESIGN §12: never too big for their hex). */
const HEX_FIT = 0.85;

/** The pack is drawn for hexes of PACK_HEX_SIZE; the game's hexes are HEX_SIZE, so sprites are scaled to fit. */
export function packScale(hexSize: number): number {
  return hexSize / PACK_HEX_SIZE;
}

/** True once the pack's atlas is loaded (if it failed, the Graphics fallbacks draw everything). */
export function packLoaded(scene: Phaser.Scene): boolean {
  return scene.textures.exists(PACK_KEY) && !!manifest(scene);
}

/** Grey copy of the atlas, for neutral items (DESIGN §9): same frame names, colours desaturated. */
const GREY_KEY = `${PACK_KEY}-grey`;

/** Builds the grey atlas once from the loaded one. */
export function createGreyPack(scene: Phaser.Scene): void {
  if (scene.textures.exists(GREY_KEY) || !scene.textures.exists(PACK_KEY)) return;
  const src = scene.textures.get(PACK_KEY);
  const img = src.getSourceImage() as HTMLImageElement;
  const canvas = scene.textures.createCanvas(GREY_KEY, img.width, img.height);
  if (!canvas) return;
  const c = canvas.getContext();
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  for (let k = 0; k < px.length; k += 4) {
    const lum = Math.round(0.3 * px[k]! + 0.59 * px[k + 1]! + 0.11 * px[k + 2]!);
    px[k] = px[k + 1] = px[k + 2] = Math.min(255, Math.round(lum * 0.85 + 30)); // a little lighter, so it reads as faded
  }
  c.putImageData(data, 0, 0);
  for (const name of src.getFrameNames()) {
    const f = src.get(name);
    canvas.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  canvas.refresh();
}

/** Crisp pixels: nearest-neighbour filtering on the pack's textures only (text and Graphics stay smooth). */
export function usePixelFiltering(scene: Phaser.Scene): void {
  for (const key of [PACK_KEY, GREY_KEY, WATER_KEY]) if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * Reuses pack images frame after frame: call begin(), put() each sprite to show, then end() hides the rest. Images
 * are depth-sorted by their screen y (further south on top), above `baseDepth`.
 */
export class SpritePool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly baseDepth: number,
    private readonly scale: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  /**
   * Shows `name` at (x, y): in the owner's colour (0-based), grey for neutral items (owner < 0), or as is for
   * sprites without owners. False if the pack has no such sprite.
   */
  put(
    name: string,
    x: number,
    y: number,
    opts: { owner?: number; flipX?: boolean; alpha?: number; /** × the pool's scale */ size?: number; /** radians */ rotation?: number } = {},
  ): boolean {
    const neutral = opts.owner !== undefined && opts.owner < 0;
    const key = spriteName(name, opts.owner === undefined ? undefined : neutral ? 1 : opts.owner + 1);
    const info = manifest(this.scene)?.sprites[key];
    const texture = neutral ? GREY_KEY : PACK_KEY;
    if (!info || !this.scene.textures.exists(texture)) return false;
    let img = this.images[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, texture, key);
      this.images.push(img);
    }
    this.used++;
    img
      .setTexture(texture, key)
      .setOrigin(info.ax / info.w, info.ay / info.h)
      .setScale(this.scale * this.fitted(opts.size ?? 1, info))
      .setRotation(opts.rotation ?? 0)
      .setPosition(x, y)
      .setFlipX(!!opts.flipX)
      .setAlpha(opts.alpha ?? 1)
      .setDepth(this.baseDepth + (y + 10_000) / 1_000_000)
      .setVisible(true);
    return true;
  }

  /** Enlarging (size > 1) stops once the sprite would be wider than HEX_FIT of a hex; it never shrinks below 1. */
  private fitted(size: number, info: SpriteInfo): number {
    const hexW = manifest(this.scene)?.tile.w;
    if (size <= 1 || !info.bw || !hexW) return size;
    return Math.min(size, Math.max(1, (HEX_FIT * hexW) / info.bw));
  }

  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i]!.setVisible(false);
  }
}
