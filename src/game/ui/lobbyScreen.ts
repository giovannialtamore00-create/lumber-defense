// Lobby screen (ARCHITECTURE.md §7), plain HTML over the page: enter a name, create a room or join one by code (or
// an invite link `?room=CODE`), or play solo. Resolves with the lockstep session once the match starts.
import { ClientLobby, HostLobby, MAX_PLAYERS, newRoomCode, newSeed } from '../../net/lobby';
import { LocalNetwork } from '../../net/localTransport';
import { LockstepSession } from '../../net/lockstep';
import { PeerTransport, hostPeerId } from '../../net/peerTransport';
import type { SlotInfo } from '../../net/protocol';
import { PLAYER_COLORS } from '../render/entities';

const CSS = `
#lobby { position: fixed; inset: 0; display: grid; place-items: center; background: #1b1f24; color: #e8dcc4;
  font-family: sans-serif; z-index: 10; }
#lobby .card { width: min(420px, calc(100vw - 32px)); background: #26211a; border: 1px solid #4a3d2c; border-radius: 10px;
  padding: 24px; box-sizing: border-box; }
#lobby h1 { margin: 0 0 4px; font-size: 26px; color: #f3e3c3; }
#lobby .sub { margin: 0 0 18px; color: #b8a98c; font-size: 13px; }
#lobby label { display: block; font-size: 12px; color: #b8a98c; margin: 12px 0 4px; }
#lobby input { width: 100%; box-sizing: border-box; padding: 9px 10px; font-size: 15px; border-radius: 6px;
  border: 1px solid #5a4a36; background: #1b1712; color: #f3e3c3; }
#lobby .row { display: flex; gap: 8px; }
#lobby .row input { flex: 1; text-transform: uppercase; letter-spacing: 3px; }
#lobby button { padding: 9px 14px; font-size: 15px; font-weight: bold; border-radius: 6px; border: 0; cursor: pointer;
  background: #2f6b34; color: #fff; }
#lobby button.secondary { background: #4a4038; }
#lobby button:disabled { opacity: 0.5; cursor: default; }
#lobby .wide { width: 100%; margin-top: 14px; }
#lobby .err { color: #e06a5a; min-height: 18px; font-size: 13px; margin-top: 10px; }
#lobby .code { font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #f3e3c3; text-align: center; margin: 6px 0; }
#lobby .slot { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #3a3025; }
#lobby .dot { width: 14px; height: 14px; border-radius: 50%; }
#lobby .muted { color: #8a7d68; font-style: italic; }
#lobby .note { font-size: 12px; color: #8a7d68; margin-top: 10px; }
`;

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
        ${s.name === null ? '<span class="muted">empty: a bot will play (idle for now)</span>' : esc(s.name) + (i === you ? ' (you)' : '')}</div>`,
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

export function runLobby(version: string, auto: AutoLobby = {}): Promise<LockstepSession> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'lobby';
  document.body.appendChild(root);

  return new Promise((resolve) => {
    const done = (session: LockstepSession) => {
      root.remove();
      style.remove();
      resolve(session);
    };

    const menu = (error = '') => {
      const invited = new URLSearchParams(location.search).get('room') ?? '';
      root.innerHTML = `<div class="card">
        <h1>IKEA Lumber Defense</h1>
        <p class="sub">2–4 players · wood floats downstream</p>
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
        for (const b of root.querySelectorAll('button')) b.disabled = true;
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
        done(new LockstepSession(t, { seed: newSeed(), slots, you: 0, hostId: 'host' }, true));
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
        root.innerHTML = `<div class="card">
          <h1>Room</h1>
          <div class="code">${code}</div>
          <p class="sub" style="text-align:center">Friends join with this code, or with the invite link.</p>
          <button id="copy" class="wide secondary">Copy invite link</button>
          <label>Players</label>${slotList(lobby.slots, 0)}
          <button id="start" class="wide">Start match</button>
          <p class="note">Empty slots are filled by bots (they stay idle until bots are built).</p>
        </div>`;
        root.querySelector<HTMLButtonElement>('#copy')!.onclick = (ev) => {
          void navigator.clipboard?.writeText(invite);
          (ev.target as HTMLButtonElement).textContent = 'Copied!';
        };
        root.querySelector<HTMLButtonElement>('#start')!.onclick = () => {
          const info = lobby.start();
          done(new LockstepSession(transport!, info, true, lobby.peerSlots));
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
        root.innerHTML = `<div class="card">
          <h1>Room ${esc(code)}</h1>
          <p class="sub">Waiting for the host to start the match…</p>
          ${slotList(lobby.slots, lobby.you)}
        </div>`;
      };
      lobby.onChange = render;
      lobby.onRefused = (reason) => {
        transport.close();
        menu(`Can't join: ${reason}`);
      };
      lobby.onStart = (info) => done(new LockstepSession(transport, info, false));
      render();
    };

    if (auto.host) void host(auto.name ?? 'Host', auto.host.toUpperCase());
    else if (auto.join) void join(auto.name ?? 'Guest', auto.join.toUpperCase());
    else menu();
  });
}
