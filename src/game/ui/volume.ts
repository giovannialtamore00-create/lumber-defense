// Volume settings: two sliders (forest and river ambience, effects), remembered between visits. A small "Sound"
// button opens the panel; it's shown in the menu and during a match.

export type Channel = 'ambience' | 'effects';

const KEYS: Record<Channel, string> = { ambience: 'ild-vol-ambience', effects: 'ild-vol-effects' };
const listeners = new Set<() => void>();

/** 0 (silent) to 1 (full). */
export function volume(ch: Channel): number {
  try {
    const v = localStorage.getItem(KEYS[ch]);
    return v === null ? 1 : Math.min(1, Math.max(0, Number(v) / 100));
  } catch {
    return 1;
  }
}
function setVolume(ch: Channel, percent: number): void {
  try {
    localStorage.setItem(KEYS[ch], String(percent));
  } catch {
    /* private mode: fine */
  }
  for (const f of listeners) f();
}
/** Called whenever a slider moves. Returns a function that stops listening. */
export function onVolumeChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const CSS = `
.vol { position: fixed; right: 14px; bottom: 14px; z-index: 20; font-family: 'Archivo Variable', system-ui, sans-serif; }
.vol > button { padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 700; border: 0; border-radius: 2px; cursor: pointer;
  color: #e6cfa0; background: rgba(20, 14, 9, 0.8); box-shadow: inset 0 0 0 1px rgba(230, 207, 160, 0.35); }
.vol > button:hover { box-shadow: inset 0 0 0 1px rgba(230, 207, 160, 0.35), inset 0 -3px 0 #e8742a; }
.vol .box { position: absolute; right: 0; bottom: calc(100% + 8px); width: 220px; padding: 14px 16px 6px; border-radius: 3px;
  background: #e6cfa0; color: #24160d; box-shadow: inset 0 0 14px rgba(70, 30, 8, 0.45), 0 10px 24px rgba(0, 0, 0, 0.5); }
.vol label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #5a3a1e; }
.vol input { width: 100%; margin: 6px 0 12px; accent-color: #24160d; }
.vol :focus-visible { outline: 2px solid #e8742a; outline-offset: 2px; }
/* In a match the button is hidden: the Menu opens the panel, just under the Menu list. */
.vol.in-match { right: auto; bottom: auto; left: 346px; top: 58px; }
.vol.in-match > button { display: none; }
.vol.in-match .box { position: static; }
`;

let panel: { root: HTMLDivElement; box: HTMLDivElement; openedAt: number } | null = null;

/** In a match: hide the corner button (Menu → Sound opens the panel instead). */
export function hideVolumeButton(): void {
  panel?.root.classList.add('in-match');
  if (panel) panel.box.hidden = true;
}

export function toggleVolumePanel(): void {
  if (!panel) return;
  panel.box.hidden = !panel.box.hidden;
  panel.openedAt = performance.now();
}

/** Adds the "Sound" button (bottom-right). Returns a function that removes it. */
export function addVolumeButton(): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'vol';
  const row = (ch: Channel, name: string) => {
    const p = Math.round(volume(ch) * 100);
    return `<label for="vol-${ch}">${name}<span>${p}%</span></label><input id="vol-${ch}" type="range" min="0" max="100" step="5" value="${p}">`;
  };
  root.innerHTML = `<div class="box" hidden>${row('ambience', 'Forest and river')}${row('effects', 'Effects')}</div>
    <button type="button" aria-expanded="false">Sound</button>`;
  const box = root.querySelector<HTMLDivElement>('.box')!;
  const button = root.querySelector('button')!;
  button.onclick = () => {
    box.hidden = !box.hidden;
    button.setAttribute('aria-expanded', String(!box.hidden));
  };
  for (const input of root.querySelectorAll('input')) {
    input.oninput = () => {
      input.previousElementSibling!.querySelector('span')!.textContent = `${input.value}%`;
      setVolume(input.id.slice(4) as Channel, Number(input.value));
    };
  }
  // Clicking elsewhere closes the panel (but not the click that just opened it from the match Menu).
  const away = (ev: PointerEvent) => {
    if (!root.contains(ev.target as Node) && performance.now() - (panel?.openedAt ?? 0) > 100) box.hidden = true;
  };
  window.addEventListener('pointerdown', away);
  document.head.appendChild(style);
  document.body.appendChild(root);
  panel = { root, box, openedAt: 0 };
  return () => {
    panel = null;
    window.removeEventListener('pointerdown', away);
    root.remove();
    style.remove();
  };
}
