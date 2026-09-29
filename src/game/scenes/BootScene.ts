import Phaser from 'phaser';
import config from '../../data/config.json';
import { LocalTransport } from '../../net/localTransport';
import type { Config } from '../../sim/types';
import { fastForwardDemo } from '../demo';
import { SimRunner } from '../simRunner';
import { MAP } from './GameScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Single player for now (M2). The host picks the seed; `?seed=123` makes a match reproducible.
    const param = new URLSearchParams(window.location.search).get('seed');
    const seed = param !== null ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]!;
    const runner = new SimRunner(MAP, config as Config, 1, seed, new LocalTransport(), import.meta.env.DEV);
    this.registry.set('runner', runner);
    this.registry.set('seed', seed);

    const params = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV && params.has('demo')) fastForwardDemo(runner, 0, Number(params.get('ff') ?? 20));

    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
