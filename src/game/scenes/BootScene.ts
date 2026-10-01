import Phaser from 'phaser';
import type { SimRunner } from '../simRunner';

/** The runner (set by main.ts once the lobby has started a match) is in the registry; show the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const runner = this.registry.get('runner') as SimRunner;
    this.registry.set('seed', runner.session.info.seed);
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
