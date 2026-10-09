import Phaser from 'phaser';
import config from './data/config.json';
import { MAX_PLAYERS, newSeed } from './net/lobby';
import { LocalNetwork } from './net/localTransport';
import { LockstepSession } from './net/lockstep';
import type { Config } from './sim/types';
import { fastForwardDemo } from './game/demo';
import { BootScene } from './game/scenes/BootScene';
import { GameScene, MAP } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';
import { SimRunner } from './game/simRunner';
import { playCommandSound } from './game/sfx';
import { addVolumeButton, hideVolumeButton } from './game/ui/volume';
import '@fontsource-variable/archivo/wdth.css';
import { runLobby } from './game/ui/lobbyScreen';

/** Everyone in a room must run the same rules and map, or lockstep would desync. */
function gameVersion(): string {
  const text = JSON.stringify(config) + JSON.stringify(MAP);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** Shows the game for a started match. */
function startGame(runner: SimRunner): void {
  // Dev: expose the runner for automated browser checks.
  if (import.meta.env.DEV) (window as unknown as { __runner: SimRunner }).__runner = runner;
  // Keep the match going even when the tab is in the background and stops drawing frames (browsers still run
  // timers there, if less often; the runner catches up on real time).
  setInterval(() => runner.update(), 100);
  runner.onSubmit = playCommandSound;
  // The game's text is drawn once into images, so the font must be loaded first (a short wait at most).
  const fonts = Promise.all(['400 12px', '700 12px'].map((w) => document.fonts.load(`${w} 'Archivo Variable'`)));
  void Promise.race([fonts, new Promise((r) => setTimeout(r, 2000))]).then(() => launch(runner));
}

function launch(runner: SimRunner): void {
  hideVolumeButton(); // in a match, Sound lives in the Menu
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1a120d',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, GameScene, UIScene],
    callbacks: { preBoot: (g) => g.registry.set('runner', runner) },
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

addVolumeButton(); // menu and match alike

const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has('demo')) {
  // Dev: skip the lobby, play solo and fast-forward (see CLAUDE.md).
  const t = new LocalNetwork().join('host');
  const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : newSeed();
  const slots = [{ name: 'Demo' }, ...Array.from({ length: MAX_PLAYERS - 1 }, () => ({ name: null }))];
  const runner = new SimRunner(MAP, config as Config, new LockstepSession(t, { seed, slots, you: 0, hostId: 'host' }, true));
  fastForwardDemo(runner, 0, Number(params.get('ff') ?? 20));
  startGame(runner);
} else {
  const auto = import.meta.env.DEV
    ? {
        host: params.get('host') ?? undefined,
        join: params.get('join') ?? undefined,
        name: params.get('name') ?? undefined,
        autostart: params.has('autostart') ? Number(params.get('autostart')) : undefined,
      }
    : {};
  void runLobby(gameVersion(), auto).then(({ session, hostLobby, state }) => {
    const runner = new SimRunner(MAP, config as Config, session, state);
    // A player who drops can join again with the same name (the host lets them back in).
    if (hostLobby) hostLobby.onLateHello = (peer, name) => runner.rejoin(peer, name);
    startGame(runner);
  });
}
