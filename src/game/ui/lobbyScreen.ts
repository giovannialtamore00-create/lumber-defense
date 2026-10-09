// Lobby screen (ARCHITECTURE.md §7), plain HTML over the page: enter a name, create a room or join one by code (or
// an invite link `?room=CODE`), or play solo. Resolves with the lockstep session once the match starts.
import { ClientLobby, HostLobby, MAX_PLAYERS, newRoomCode, newSeed } from '../../net/lobby';
import { LocalNetwork } from '../../net/localTransport';
import { LockstepSession } from '../../net/lockstep';
import { PeerTransport, hostPeerId } from '../../net/peerTransport';
import type { SlotInfo } from '../../net/protocol';
import type { GameState } from '../../sim/types';
import { PLAYER_COLORS } from '../render/entities';
import '@fontsource-variable/archivo/wdth.css';
import { startAmbience } from './ambience';

// Look: a birch-plywood panel with scorched edges, in front of a pine forest at dusk with a river along the bottom
// carrying logs. The title is burnt in like a branding iron (glows ember-orange on load, then cools to char), a fire
// glows somewhere behind the trees and embers drift up from the treeline.
const CSS = `
#lobby { --birch: #e6cfa0; --ply: #b98a55; --char: #24160d; --ember: #e8742a; --cut: #a33a24;
  position: fixed; inset: 0; display: grid; place-items: center; overflow: hidden; z-index: 10;
  font-family: 'Archivo Variable', system-ui, sans-serif; color: var(--char);
  background:
    radial-gradient(ellipse 60% 30% at 70% 72%, rgba(232, 116, 42, 0.28), transparent 70%),
    linear-gradient(180deg, #0c1411 0%, #16241d 55%, #22301f 75%); }
#lobby > div:last-of-type { position: relative; z-index: 2; }
#lobby .forest { position: absolute; left: 0; right: 0; bottom: 17vh; width: 100%; height: 42vh; }
#lobby .river { position: absolute; left: 0; right: 0; bottom: 0; height: 18vh; overflow: hidden;
  background: linear-gradient(180deg, #2c5a5c 0%, #1b4148 30%, #0f2a30 100%);
  box-shadow: inset 0 6px 10px rgba(0, 0, 0, 0.45); }
/* Ripples: short pale streaks on thin rows, sliding downstream (left to right) at two speeds. */
#lobby .river::before, #lobby .river::after { content: ''; position: absolute; inset: 0;
  -webkit-mask: repeating-linear-gradient(180deg, #000 0 1px, transparent 1px 9px);
  mask: repeating-linear-gradient(180deg, #000 0 1px, transparent 1px 9px);
  background: repeating-linear-gradient(97deg, rgba(200, 235, 235, 0.16) 0 34px, transparent 34px 150px);
  animation: flow 9s linear infinite; }
#lobby .river::after { top: 4px; background: repeating-linear-gradient(83deg, rgba(200, 235, 235, 0.1) 0 18px, transparent 18px 97px);
  animation-duration: 6s; }
@keyframes flow { from { background-position-x: 0; } to { background-position-x: 300px; } }
#lobby .log { position: absolute; left: -90px; width: 74px; height: 14px; border-radius: 7px; z-index: 1;
  background: linear-gradient(180deg, #8f5f35, #5a3a1e 70%, #3e2814);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3); animation: drift linear infinite; }
#lobby .log::after { content: ''; position: absolute; right: -2px; top: 0; width: 14px; height: 14px; border-radius: 50%;
  background: radial-gradient(circle, #e2c08a 0 2px, #c99a5e 2px 3px, #dcb47a 3px 5px, #6b4423 5px); }
@keyframes drift {
  0% { transform: translate(0, 0) rotate(-2deg); }
  25% { transform: translate(27vw, 3px) rotate(1deg); }
  50% { transform: translate(55vw, 0) rotate(-1deg); }
  75% { transform: translate(82vw, 3px) rotate(2deg); }
  100% { transform: translate(calc(100vw + 120px), 0) rotate(-2deg); } }
#lobby .panel { position: relative; width: min(420px, calc(100vw - 32px)); box-sizing: border-box; padding: 30px 30px 26px;
  border-radius: 3px; margin-bottom: 10px;
  background:
    radial-gradient(circle at 0 0, rgba(45, 20, 6, 0.75), transparent 70px),
    radial-gradient(circle at 100% 0, rgba(45, 20, 6, 0.6), transparent 55px),
    radial-gradient(circle at 100% 100%, rgba(45, 20, 6, 0.8), transparent 80px),
    radial-gradient(circle at 0 100%, rgba(45, 20, 6, 0.55), transparent 50px),
    repeating-linear-gradient(91deg, rgba(150, 105, 50, 0.07) 0 2px, transparent 2px 11px),
    var(--birch);
  box-shadow: inset 0 0 26px rgba(70, 30, 8, 0.55), 0 18px 40px rgba(0, 0, 0, 0.55); }
/* The panel's thickness: the layers of the plywood show along the bottom edge. */
#lobby .panel::after { content: ''; position: absolute; left: 2px; right: 2px; bottom: -10px; height: 10px;
  border-radius: 0 0 3px 3px; background: repeating-linear-gradient(180deg, var(--ply) 0 2px, #d9bd8a 2px 4px);
  box-shadow: inset 0 0 8px rgba(45, 20, 6, 0.6); }
#lobby .brand { margin: 0 0 6px; font-weight: 800; font-stretch: 125%; line-height: 0.95; text-transform: uppercase;
  color: var(--char); transform: rotate(-1.5deg); transform-origin: left;
  text-shadow: 0 0 1px #3a1a08, 0 0 7px rgba(110, 45, 10, 0.45); }
#lobby h1.brand { font-size: 15px; letter-spacing: 4px; }
#lobby h1.brand span { display: block; font-size: 40px; letter-spacing: 0; }
#lobby h1.brand.hot { animation: brand 2.6s ease-out both; }
@keyframes brand {
  0% { color: #ffd27a; text-shadow: 0 0 6px #ffb347, 0 0 18px #ff6a00, 0 0 34px #e8461a; }
  35% { color: #ff8a2a; text-shadow: 0 0 4px #ff6a00, 0 0 14px #c0360c, 0 0 24px rgba(160, 40, 10, 0.6); }
  100% { color: var(--char); text-shadow: 0 0 1px #3a1a08, 0 0 7px rgba(110, 45, 10, 0.45); } }
#lobby .sub { margin: 10px 0 20px; font-size: 14px; color: #6e4c2c; }
#lobby label { display: block; font-size: 13px; font-weight: 600; color: #5a3a1e; margin: 16px 0 5px; }
#lobby input { width: 100%; box-sizing: border-box; padding: 10px 11px; font: inherit; font-size: 16px; color: var(--char);
  border: 0; border-bottom: 2px solid #8a5f34; border-radius: 2px; background: rgba(90, 50, 15, 0.1);
  box-shadow: inset 0 2px 4px rgba(70, 35, 10, 0.25); }
#lobby input::placeholder { color: #9a7a58; }
#lobby .row { display: flex; gap: 8px; }
#lobby .row input { flex: 1; text-transform: uppercase; letter-spacing: 4px; font-weight: 700; }
#lobby button { padding: 11px 16px; font: inherit; font-size: 16px; font-weight: 700; border-radius: 2px; cursor: pointer;
  color: var(--birch); border: 0; background: linear-gradient(180deg, #3a2516, var(--char));
  box-shadow: inset 0 1px 0 rgba(255, 200, 140, 0.12); transition: box-shadow 0.15s, color 0.15s; }
#lobby button:hover:not(:disabled) { color: #ffd9a8; box-shadow: inset 0 -3px 0 var(--ember), 0 0 14px rgba(232, 116, 42, 0.35); }
#lobby button.secondary { background: transparent; color: var(--char); box-shadow: inset 0 0 0 2px var(--char); }
#lobby button.secondary:hover:not(:disabled) { color: var(--char); box-shadow: inset 0 0 0 2px var(--char), inset 0 -4px 0 var(--ember); }
#lobby button:disabled { opacity: 0.5; cursor: default; }
#lobby :focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
#lobby .wide { width: 100%; margin-top: 16px; }
#lobby .err { color: var(--cut); min-height: 18px; font-size: 14px; font-weight: 600; margin-top: 12px; }
#lobby .code { font-size: 54px; letter-spacing: 10px; text-align: center; transform: rotate(-1deg); transform-origin: center;
  margin: 4px 0 2px; }
#lobby .slot { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-weight: 600;
  border-bottom: 1px dashed rgba(90, 55, 25, 0.4); }
/* Player colours as log ends: a ring of bark around the cut. */
#lobby .dot { width: 16px; height: 16px; border-radius: 50%; flex: none;
  box-shadow: 0 0 0 2px #5a3a1e, inset 0 0 0 3px rgba(255, 255, 255, 0.18), inset 0 0 0 5px rgba(0, 0, 0, 0.15); }
#lobby .muted { color: #8a6a48; font-weight: 400; font-style: italic; }
#lobby .note { font-size: 13px; color: #7a5a3a; margin: 12px 0 0; }
#lobby .ember { position: absolute; bottom: 30vh; z-index: 1; width: 3px; height: 3px; border-radius: 50%; background: #ffb347;
  box-shadow: 0 0 6px 2px rgba(255, 106, 0, 0.8); opacity: 0; animation: rise linear infinite; }
@keyframes rise {
  0% { transform: translate(0, 0); opacity: 0; }
  10% { opacity: 1; }
  60% { opacity: 0.8; }
  100% { transform: translate(var(--drift), -55vh); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  #lobby .ember { display: none; }
  #lobby .river::before, #lobby .river::after, #lobby .log { animation: none; }
  #lobby h1.brand.hot { animation: none; } }
`;

/** Embers rising from the bottom of the screen: left position (%), seconds per rise, start delay, sideways drift (px). */
const EMBERS: [number, number, number, number][] = [
  [8, 9, 0, 30], [17, 12, 4, -20], [29, 10, 7, 25], [41, 14, 2, -35], [52, 11, 9, 15],
  [63, 13, 1, -25], [72, 9, 5, 40], [84, 12, 3, -15], [93, 10, 8, 20], [36, 15, 11, 10],
];

/** Logs floating down the river: distance from the river's top (%), seconds to cross, start delay (negative: already on the way). */
const LOGS: [number, number, number][] = [[18, 48, -10], [52, 38, -30], [34, 56, -44]];

/** Three rows of pines as an SVG, darker in front. Fixed pseudo-random shapes so the skyline is the same every time. */
function forestSvg(): string {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 1000) / 1000;
  const row = (color: string, spacing: number, base: number, minH: number, maxH: number) => {
    let paths = '';
    for (let x = -20; x < 1220; x += spacing * (0.6 + rnd() * 0.8)) {
      const h = minH + rnd() * (maxH - minH);
      const w = h * 0.32;
      // Three stacked tiers make the pine shape.
      for (let t = 0; t < 3; t++) {
        const top = base - h + (t * h) / 4;
        const tw = w * (0.55 + t * 0.25);
        const bottom = top + h * 0.45;
        paths += `M${x.toFixed(0)} ${top.toFixed(0)}L${(x + tw).toFixed(0)} ${bottom.toFixed(0)}L${(x - tw).toFixed(0)} ${bottom.toFixed(0)}Z`;
      }
    }
    return `<path fill="${color}" d="${paths}"/><rect fill="${color}" x="0" y="${base - 2}" width="1200" height="40"/>`;
  };
  return `<svg class="forest" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    ${row('#1f3428', 34, 300, 110, 170)}${row('#14251c', 46, 310, 140, 220)}${row('#0b1610', 62, 322, 170, 260)}</svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function savedName(): string {
  try {
    return localStorage.getItem('ild-name') ?? '';
  } catch {
    return '';
  }
}
function saveName(name: string): void {
  try {
    localStorage.setItem('ild-name', name);
  } catch {
    /* private mode: fine */
  }
}

function slotList(slots: SlotInfo[], you: number): string {
  return slots
    .map(
      (s, i) => `<div class="slot"><span class="dot" style="background:${hex(PLAYER_COLORS[i]!)}"></span>
        ${s.name === null ? '<span class="muted">empty: a bot will join</span>' : esc(s.name) + (i === you ? ' (you)' : '')}</div>`,
    )
    .join('');
}

/**
 * Dev-only shortcuts for testing two browsers against each other without clicking:
 * `?host=CODE&name=A&autostart=2` opens room CODE and starts once 2 humans are in; `?join=CODE&name=B` joins it.
 */
interface AutoLobby {
  host?: string;
  join?: string;
  name?: string;
  autostart?: number;
}

/** What the lobby hands over: the session, plus the host's lobby (for rejoins) or a rejoined match's state. */
export interface LobbyResult {
  session: LockstepSession;
  hostLobby?: HostLobby;
  state?: GameState;
}

export function runLobby(version: string, auto: AutoLobby = {}): Promise<LobbyResult> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'lobby';
  root.innerHTML =
    forestSvg() +
    `<div class="river">${LOGS.map(
      ([top, secs, delay]) => `<i class="log" style="top:${top}%;animation-duration:${secs}s;animation-delay:${delay}s"></i>`,
    ).join('')}</div>` +
    EMBERS.map(
      ([left, secs, delay, drift]) =>
        `<i class="ember" style="left:${left}%;animation-duration:${secs}s;animation-delay:${delay}s;--drift:${drift}px"></i>`,
    ).join('');
  const stopAmbience = startAmbience();
  const view = document.createElement('div');
  root.appendChild(view);
  document.body.appendChild(root);

  return new Promise((resolve) => {
    const done = (result: LobbyResult) => {
      stopAmbience();
      root.remove();
      style.remove();
      resolve(result);
    };

    const menu = (error = '') => {
      const invited = new URLSearchParams(location.search).get('room') ?? '';
      view.innerHTML = `<div class="panel">
        <h1 class="brand hot">IKEA<span>Lumber Defense</span></h1>
        <p class="sub">For 2 to 4 players. Wood floats downstream.</p>
        <label for="name">Your name</label>
        <input id="name" maxlength="16" value="${esc(savedName())}" placeholder="Nickname">
        <button id="create" class="wide">Create a room</button>
        <label for="code">Join a room</label>
        <div class="row"><input id="code" maxlength="4" value="${esc(invited)}" placeholder="CODE"><button id="join">Join</button></div>
        <button id="solo" class="wide secondary">Play solo</button>
        <div class="err">${esc(error)}</div>
      </div>`;
      const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
      const name = () => {
        const n = $<HTMLInputElement>('name').value.trim().slice(0, 16);
        saveName(n);
        return n || 'Player';
      };
      const busy = (msg: string) => {
        for (const b of view.querySelectorAll('button')) b.disabled = true;
        $('create').parentElement!.querySelector('.err')!.textContent = msg;
      };
      $('create').onclick = () => {
        busy('Opening a room…');
        void host(name());
      };
      $('join').onclick = () => {
        const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
        if (code.length !== 4) return menu('Room codes have 4 characters.');
        busy('Joining…');
        void join(name(), code);
      };
      $('solo').onclick = () => {
        const net = new LocalNetwork();
        const t = net.join('host');
        const slots: SlotInfo[] = [{ name: name() }, ...Array.from({ length: MAX_PLAYERS - 1 }, () => ({ name: null }))];
        done({ session: new LockstepSession(t, { seed: newSeed(), slots, you: 0, hostId: 'host' }, true) });
      };
      if (invited) $('name').focus();
    };

    const host = async (name: string, fixedCode?: string) => {
      let transport: PeerTransport | null = null;
      let code = '';
      for (let attempt = 0; attempt < 3 && !transport; attempt++) {
        code = fixedCode ?? newRoomCode();
        try {
          transport = await PeerTransport.host(code);
        } catch (e) {
          if (attempt === 2) return menu(`Couldn't open a room: ${(e as Error).message}`);
        }
      }
      const lobby = new HostLobby(transport!, name, version);
      const invite = `${location.origin}${location.pathname}?room=${code}`;
      const render = () => {
        view.innerHTML = `<div class="panel">
          <label style="margin-top:0;text-align:center">Room code</label>
          <div class="brand code">${code}</div>
          <p class="sub" style="text-align:center">Friends join with this code, or with the invite link.</p>
          <button id="copy" class="wide secondary">Copy invite link</button>
          <label>Players</label>${slotList(lobby.slots, 0)}
          <button id="start" class="wide">Start match</button>
          <p class="note">Empty slots are filled by bots.</p>
        </div>`;
        root.querySelector<HTMLButtonElement>('#copy')!.onclick = (ev) => {
          void navigator.clipboard?.writeText(invite);
          (ev.target as HTMLButtonElement).textContent = 'Copied!';
        };
        root.querySelector<HTMLButtonElement>('#start')!.onclick = () => {
          const info = lobby.start();
          done({ session: new LockstepSession(transport!, info, true, lobby.peerSlots), hostLobby: lobby });
        };
      };
      lobby.onChange = () => {
        render();
        const humans = lobby.slots.filter((x) => x.name !== null).length;
        if (auto.autostart && humans >= auto.autostart) root.querySelector<HTMLButtonElement>('#start')!.click();
      };
      render();
    };

    const join = async (name: string, code: string) => {
      let transport: PeerTransport;
      try {
        transport = await PeerTransport.join(code);
      } catch (e) {
        return menu(`Couldn't join ${code}: ${(e as Error).message}`);
      }
      const hostId = hostPeerId(code);
      const lobby = new ClientLobby(transport, hostId, name, version);
      const render = () => {
        view.innerHTML = `<div class="panel">
          <label style="margin-top:0;text-align:center">Room code</label>
          <div class="brand code">${esc(code)}</div>
          <p class="sub">Waiting for the host to start the match…</p>
          ${slotList(lobby.slots, lobby.you)}
        </div>`;
      };
      lobby.onChange = render;
      lobby.onRefused = (reason) => {
        transport.close();
        menu(`Can't join: ${reason}`);
      };
      lobby.onStart = (info) => done({ session: new LockstepSession(transport, info, false) });
      lobby.onRejoin = (msg) => {
        const session = new LockstepSession(transport, { seed: msg.seed, slots: msg.slots, you: msg.you, hostId }, false);
        session.resume(msg);
        done({ session, state: msg.state });
      };
      render();
    };

    if (auto.host) void host(auto.name ?? 'Host', auto.host.toUpperCase());
    else if (auto.join) void join(auto.name ?? 'Guest', auto.join.toUpperCase());
    else menu();
  });
}
