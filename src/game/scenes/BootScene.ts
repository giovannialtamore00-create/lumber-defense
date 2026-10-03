import Phaser from 'phaser';
import type { SimRunner } from '../simRunner';
import { createWaterAnims, preloadLumberPack } from '../render/sprites';

/** The runner (set by main.ts once the lobby has started a match) is in the registry; show the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    preloadLumberPack(this);
  }

  create(): void {
    createWaterAnims(this);
    const runner = this.registry.get('runner') as SimRunner;
    this.registry.set('seed', runner.session.info.seed);
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
