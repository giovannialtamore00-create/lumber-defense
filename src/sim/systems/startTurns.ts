// Starting turns (DESIGN §5): in a random order, each player places their first outpost on their own turn. The first
// human to play has the longer timer, later ones the shorter one. Running out of time hands the slot to a bot. Bot
// slots skip their turn. Once every turn is over the game runs in real time.
import type { SimContext } from '../context';
import type { GameState } from '../types';

/** The player whose starting turn it is, or null once the game is running. */
export function currentTurnPlayer(state: GameState): number | null {
  return state.phase === 'start' ? (state.startTurns.order[state.startTurns.current] ?? null) : null;
}

function nextTurn(state: GameState, ctx: SimContext): void {
  const t = state.startTurns;
  t.current++;
  const { firstTurnS, laterTurnS } = ctx.config.startTurns;
  t.ticksLeft = (t.firstUsed ? laterTurnS : firstTurnS) * ctx.config.tickRate;
  if (t.current >= t.order.length) state.phase = 'running';
}

/** Moves past turns that are over: the player has placed, or the slot is a bot's (bots stay idle until M7). */
function skipFinishedTurns(state: GameState, ctx: SimContext): void {
  const t = state.startTurns;
  while (state.phase === 'start') {
    const p = state.players[t.order[t.current]!]!;
    if (!p.started && !p.bot) return;
    if (p.started) t.firstUsed = true;
    nextTurn(state, ctx);
  }
}

/** Runs after this tick's commands while the phase is 'start': one tick off the current player's timer. */
export function startTurnsSystem(state: GameState, ctx: SimContext): void {
  const t = state.startTurns;
  skipFinishedTurns(state, ctx);
  if (state.phase !== 'start') return;
  if (--t.ticksLeft > 0) return;
  state.players[t.order[t.current]!]!.bot = true; // out of time: a bot takes the slot
  t.firstUsed = true;
  nextTurn(state, ctx);
  skipFinishedTurns(state, ctx);
}
