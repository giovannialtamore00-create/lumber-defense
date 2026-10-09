// Short in-game sound effects, made with Web Audio (no sound files): one for each kind of player action, and a
// thud when a catapult stone lands. Render-only, never in the sim. Loudness follows the "Effects" slider (volume.ts).
import type { Command } from '../sim/types';
import { volume } from './ui/volume';

/** Loudness at 100% on the slider. Kept low: these play often. */
const FULL = 0.2;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
  if (volume('effects') === 0 || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  out!.gain.value = FULL * volume('effects');
  return { ctx, out: out!, noise: noise! };
}

/** A pitched tone that fades out: `from` → `to` Hz over `secs`. */
function tone(type: OscillatorType, from: number, to: number, secs: number, level: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + secs);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  osc.connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + secs + 0.02);
}

/** A burst of filtered noise that fades out: knocks, cracks and dust. */
function burst(type: BiquadFilterType, freq: number, secs: number, level: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
  src.stop(t + secs + 0.02);
}

const SOUNDS = {
  /** Something set down on the map: a wooden thunk. */
  place: () => {
    tone('sine', 170, 90, 0.18, 0.9);
    burst('lowpass', 900, 0.08, 0.6);
  },
  /** Crafting an item: two quick hammer knocks. */
  build: () => {
    tone('triangle', 420, 300, 0.07, 0.7);
    burst('bandpass', 2000, 0.04, 0.5);
    tone('triangle', 460, 320, 0.07, 0.7, 0.13);
    burst('bandpass', 2200, 0.04, 0.5, 0.13);
  },
  /** Taking something down: a splintering crack. */
  destroy: () => {
    burst('bandpass', 1100, 0.3, 0.9);
    tone('sawtooth', 220, 70, 0.25, 0.25);
  },
  /** Buying an upgrade: two rising notes. */
  upgrade: () => {
    tone('triangle', 523, 523, 0.18, 0.5);
    tone('triangle', 784, 784, 0.3, 0.5, 0.1);
  },
  /** Any other button: a soft wooden click. */
  click: () => tone('triangle', 900, 600, 0.05, 0.35),
  /** A catapult stone landing: a low thud with dust. */
  hit: () => {
    tone('sine', 110, 45, 0.25, 0.8);
    burst('lowpass', 500, 0.3, 0.6);
  },
};

const FOR_COMMAND: Partial<Record<Command['type'], keyof typeof SOUNDS>> = {
  placeOutpost: 'place',
  place: 'place',
  placeCarrier: 'place',
  placeGuard: 'place',
  placeCutter: 'place',
  placeCatapult: 'place',
  craft: 'build',
  dismantle: 'destroy',
  buyUpgrade: 'upgrade',
};

/** The sound for a command the local player just sent. */
export function playCommandSound(c: Command): void {
  SOUNDS[FOR_COMMAND[c.type] ?? 'click']();
}

export function playCatapultHit(): void {
  SOUNDS.hit();
}
