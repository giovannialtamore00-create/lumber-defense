# Lumber Defense asset pack

Isometric pixel sprites in the chunky outline style, plus an animated river.

## Files

| File | What it is |
|---|---|
| `assets/atlas.png` | Every sprite in one image (10 columns of 140 x 140 cells). |
| `assets/manifest.json` | Sprite names, atlas rectangles, anchor, hex geometry, player colours. |
| `assets/sprites/*.png` | The same sprites as separate files, for engines that prefer them. |
| `assets/water.png` | Baked river frames (8 frames per row, rows 0 to 5 are strength light to dark, row 6 is the waterfall). |
| `lumber-assets.js` | Loader and hex helpers (no dependencies). |
| `water.js` | Running water. Bakes its own frames at runtime, so `water.png` is optional. |
| `preview.html` | Standalone page showing a sample map and the full catalogue. |

## Quick start

```html
<script src="water.js"></script>
<script src="lumber-assets.js"></script>
<script>
  LumberAssets.load('assets/').then(function (A) {
    var p = A.hexToScreen(2, 1);                       // axial hex -> screen centre
    A.draw(ctx, 'hex_land', p.x, p.y);                 // tile
    A.draw(ctx, 'outpost.archer', p.x, p.y, {player: 2}); // structure on it
    A.drawWater(ctx, q.x, q.y, timeSeconds, 0.5);      // river hex, strength 0..1
  });
</script>
```

## Rules the sprites follow

* **One anchor.** Every sprite is 140 x 140 px and its anchor (the hex centre at ground level) is at pixel (70, 104) (taller cells leave room for stage-3 buildings). Draw a tile and a structure at the same x, y and they line up. The anchor is in `manifest.tile.anchor`.
* **Hex.** Flat-top, squashed 2:1: 128 px wide, about 55 px tall. Column step 96 px, row step 55.43 px (`manifest.tile`). Structures sit inside the hex and cover roughly a third of it. Only the dock pokes out past the hex edge.
* **Orientation.** North is up. Rivers run top to bottom. The mill wheel and the dock point down-left (south-west), so put them on the east bank of a river. Bridge and dam are drawn across the river, left to right.
* **Owner colour.** Player sprites come in four colours with a suffix `.p1` to `.p4`. Pass `{player: n}` to `draw()`. Colours are in `manifest.players`.
* **Draw order.** Sort by screen y (back to front). Draw all tiles first, then objects. Tall sprites extend up to about 60 px above the anchor.
* **Scaling.** Draw with nearest-neighbour scaling (`imageSmoothingEnabled = false`). Use whole-number scales for crisp pixels.

## Sprite names

Structures (each has four player colours, `.p1` to `.p4`). Upgradable ones have **3 stages** (`.s1` small and simple, `.s2` bigger with more parts, `.s3` bigger again with one more feature): `outpost.sN`, `mill.sN`, `dock.sN`, `workshop.sN`, `bridge.sN.flowSE` / `flowSW`. Fixed looks: `dam.flowSE` `dam.damaged_flowSE` (and SW), `excavator.base` `excavator.digging`.

Units (four player colours): `woodchopper.sN`, `carrier.sN`, `catapult.sN`, `forestGuard.sN` (3 stages each), `stoneCutter.base`.

Other: `debris`, `debris_burnt`. Review every sprite at once with `node review.js` (writes review.png). The game copies `dist-pointy/assets/{atlas.png,atlas.phaser.json,manifest.json,water.png}` into `public/assets/lumber-pack/`.

Terrain: `hex_land`, `hex_dug`, `hex_forest`, `hex_forest_depleted`, `hex_forest_baby`, `hex_rock`, `hex_outline` (white ring for hover and placement; tint it green or red in code).

Trees, rocks and resources: `tree_pine`, `tree_round`, `tree_baby`, `tree_stump`, `rock_s`, `rock_m`, `rock_l`, `stone`, `logstack_1` `logstack_2` `logstack_3` (the three log-stack stages; they sit at the bottom of the hex, slightly right).

River: use `A.drawWater(ctx, x, y, time, strength, opts)`. Strength 0 is a weak light blue river, 1 is strong dark blue. Pass `{waterfall: true}` for the waterfall hex. `opts.fps` (default 6) and `opts.scale` are optional.

## Hex helpers

* `A.hexToScreen(q, r, scale)` axial coordinates to the hex centre on screen.
* `A.screenToHex(x, y, scale)` the reverse, for mouse picking.
* `A.hexCorners(x, y, scale)` six corner points, for outlines or hit tests.

## Rebuilding

The pack is generated from code (`src/engine.js` renders boxes, cylinders and discs to pixels; `src/defs.js` describes every piece). Run `node build.js` to regenerate everything in `dist/`.
