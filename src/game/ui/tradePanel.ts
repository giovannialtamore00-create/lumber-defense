// Trading window (DESIGN §7.3d): pick another player, type an amount, Send. A small HTML panel over the game.
import { wholeUnits } from '../../sim/fixed';
import { PLAYER_COLORS } from '../render/entities';
import type { SimRunner } from '../simRunner';

const CSS = `
#trade { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 20; width: min(320px, calc(100vw - 32px));
  box-sizing: border-box; background: #26211a; border: 1px solid #4a3d2c; border-radius: 10px; padding: 18px;
  color: #e8dcc4; font-family: sans-serif; }
#trade h2 { margin: 0 0 12px; font-size: 18px; color: #f3e3c3; }
#trade label { display: block; font-size: 12px; color: #b8a98c; margin: 10px 0 4px; }
#trade select, #trade input { width: 100%; box-sizing: border-box; padding: 8px; font-size: 15px; border-radius: 6px;
  border: 1px solid #5a4a36; background: #1b1712; color: #f3e3c3; }
#trade .row { display: flex; gap: 8px; margin-top: 14px; }
#trade button { flex: 1; padding: 9px; font-size: 15px; font-weight: bold; border: 0; border-radius: 6px; cursor: pointer;
  background: #2f6b34; color: #fff; }
#trade button.secondary { background: #4a4038; }
#trade .err { color: #e06a5a; min-height: 16px; font-size: 12px; margin-top: 8px; }
`;

export function openTradePanel(runner: SimRunner): void {
  if (document.getElementById('trade')) return;
  const { state, session } = runner;
  const me = runner.localPlayer;
  const others = state.players.filter((p) => p.id !== me);
  const name = (i: number) => session.info.slots[i]?.name ?? 'Bot';
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = document.createElement('div');
  panel.id = 'trade';
  panel.innerHTML = `
    <h2>Give wood</h2>
    <label for="trade-to">To</label>
    <select id="trade-to">${others.map((p) => `<option value="${p.id}" style="color:#${PLAYER_COLORS[p.id]!.toString(16).padStart(6, '0')}">${name(p.id).replace(/[<>&"]/g, '')}</option>`).join('')}</select>
    <label for="trade-amount">Amount (you have ${wholeUnits(state.players[me]!.wood)} wood)</label>
    <input id="trade-amount" type="number" min="1" step="1" value="10">
    <div class="err"></div>
    <div class="row"><button id="trade-send">Send</button><button id="trade-close" class="secondary">Close</button></div>`;
  document.head.appendChild(style);
  document.body.appendChild(panel);
  const close = () => {
    panel.remove();
    style.remove();
  };
  const amountInput = panel.querySelector<HTMLInputElement>('#trade-amount')!;
  amountInput.focus();
  amountInput.select();
  panel.querySelector<HTMLButtonElement>('#trade-close')!.onclick = close;
  panel.querySelector<HTMLButtonElement>('#trade-send')!.onclick = () => {
    const to = Number(panel.querySelector<HTMLSelectElement>('#trade-to')!.value);
    const amount = Math.floor(Number(amountInput.value));
    const have = wholeUnits(runner.state.players[me]!.wood);
    const err = panel.querySelector<HTMLElement>('.err')!;
    if (!(amount >= 1)) return void (err.textContent = 'Enter at least 1 wood.');
    if (amount > have) return void (err.textContent = `You only have ${have} wood.`);
    runner.submit({ type: 'give', player: me, to, amount });
    close();
  };
  // Keep typing in the panel from also moving the map (WASD) or toggling coordinates (C).
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') panel.querySelector<HTMLButtonElement>('#trade-send')!.click();
  });
}
