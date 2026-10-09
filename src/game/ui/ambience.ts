// Menu ambience, made in the browser with Web Audio (no sound files): a river (filtered noise that swells and
// babbles), wind in the trees, and the odd bird. The on/off choice is remembered.

const KEY = 'ild-sound';

export function soundWanted(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
function saveSoundWanted(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: fine */
  }
}

/** Noise through a filter whose volume drifts with a slow wobble. */
function noiseLayer(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, type: BiquadFilterType, freq: number,
  q: number, level: number, wobbleHz: number, wobbleDepth: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.loopStart = Math.random();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = level;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = wobbleHz;
  const depth = ctx.createGain();
  depth.gain.value = wobbleDepth;
  lfo.connect(depth).connect(gain.gain);
  src.connect(filter).connect(gain).connect(out);
  src.start(0, Math.random() * 2);
  lfo.start();
}

/** One bird: a few quick rising whistles, placed somewhere left or right. */
function chirp(ctx: AudioContext, out: AudioNode): void {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(out);
  const base = 2200 + Math.random() * 1600;
  const notes = 2 + Math.floor(Math.random() * 4);
  let t = ctx.currentTime + 0.05;
  for (let i = 0; i < notes; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(pan);
    osc.start(t);
    osc.stop(t + 0.1);
    t += 0.11 + Math.random() * 0.08;
  }
}

/** Starts the ambience on the first click or key press. Returns a function that fades it out and shuts it down. */
export function startAmbience(button: HTMLButtonElement): () => void {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let birds = 0;
  let on = soundWanted();

  const label = () => (button.textContent = on ? 'Sound on' : 'Sound off');
  const fadeTo = (v: number, secs: number) => {
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(v, ctx.currentTime + secs);
  };
  const scheduleBird = () => {
    birds = window.setTimeout(() => {
      if (ctx && master && on) chirp(ctx, master);
      scheduleBird();
    }, 3000 + Math.random() * 6000);
  };

  const build = () => {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseLayer(ctx, master, noise, 'lowpass', 600, 0.7, 0.064, 0.13, 0.016); // the river's body
    noiseLayer(ctx, master, noise, 'bandpass', 1400, 1.2, 0.014, 0.9, 0.01); // babbling over stones
    noiseLayer(ctx, master, noise, 'bandpass', 3200, 0.8, 0.01, 0.07, 0.01); // wind in the leaves
    scheduleBird();
  };

  const wake = () => {
    if (!on) return;
    if (!ctx) build();
    void ctx!.resume();
    fadeTo(0.5, 2.5);
  };
  // Starts 2 s after the page opens. If the browser still blocks sound then (no click yet), the first click does it.
  let due = false;
  const firstTouch = () => {
    if (!due) return; // the timer below starts it
    window.removeEventListener('pointerdown', firstTouch);
    window.removeEventListener('keydown', firstTouch);
    wake();
  };
  window.addEventListener('pointerdown', firstTouch);
  window.addEventListener('keydown', firstTouch);
  const delay = window.setTimeout(() => {
    due = true;
    wake();
  }, 2000);

  button.onclick = () => {
    on = !on;
    saveSoundWanted(on);
    label();
    if (on) wake();
    else fadeTo(0, 0.4);
  };
  label();

  return () => {
    window.removeEventListener('pointerdown', firstTouch);
    window.removeEventListener('keydown', firstTouch);
    clearTimeout(birds);
    clearTimeout(delay);
    fadeTo(0, 1.2);
    const c = ctx;
    if (c) setTimeout(() => void c.close(), 1300);
  };
}
