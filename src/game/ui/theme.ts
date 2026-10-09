// The wood look shared by the menu, the match HUD and the panels: dark charred-wood panels, birch text, ember for
// what's active, plywood stripes along panel edges.
import type Phaser from 'phaser';

export const FONT = "'Archivo Variable', sans-serif";
export const CHAR = 0x24160d;
export const BIRCH = '#e6cfa0';
export const MUTED = '#b8996c';
export const EMBER = 0xe8742a;
/** Button backgrounds: dark wood, ember when switched on or ready to press. */
export const BTN = '#3a2516';
export const BTN_ON = '#b8541c';
/** Finished things (bought upgrade levels). */
export const DONE = '#9fd8a8';
/** Plywood layers, drawn as thin stripes under a panel. */
export const PLY = [0xb98a55, 0xd9bd8a];

/** Draws a plywood edge (three 2-px stripes) along the bottom of a panel. */
export function plywoodEdge(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): void {
  for (let i = 0; i < 3; i++) g.fillStyle(PLY[i % 2]!, 1).fillRect(x, y + i * 2, w, 2);
}
