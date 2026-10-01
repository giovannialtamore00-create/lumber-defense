import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { createInitialState } from '../src/sim/state';
import { placementError } from '../src/sim/systems/placement';
import { currentTurnPlayer } from '../src/sim/systems/startTurns';
import { step } from '../src/sim/tick';
import type { Config, GameState } from '../src/sim/types';
import { cell, setup } from './helpers';

const config = baseConfig as Config;
const FIRST = config.startTurns.firstTurnS * config.tickRate;
const LATER = config.startTurns.laterTurnS * config.tickRate;

// Room for several starts: forest on the left, river on the right.
const MAP = ['. . T T . . ~ . T T . . ~ .', '. . . . . . ~ . . . . . ~ .', '. . T . . . ~ . T . . . ~ .', '. . . . . . ~ . . . . . ~ .'];
const SPOTS = [cell(4, 1), cell(10, 1), cell(4, 3)];

/** A fresh match in its starting-turns phase, with `bots` marking bot slots. */
function match(players: number, bots: boolean[] = [], seed = 1) {
  const s = setup(MAP, config, players, seed);
  const state: GameState = createInitialState(s.ctx, players, seed, bots);
  for (const p of state.players) p.region = 0;
  return { ctx: s.ctx, state };
}
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};

describe('starting turns (DESIGN §5)', () => {
  it('turn order is random per match, and only the current player may place', () => {
    const orders = new Set([1, 2, 3, 4, 5, 6].map((seed) => match(3, [], seed).state.startTurns.order.join()));
    expect(orders.size).toBeGreaterThan(1);

    const { ctx, state } = match(3);
    const [first, second] = state.startTurns.order as [number, number];
    expect(placementError(state, ctx, second, 'outpost', SPOTS[0]!.q, SPOTS[0]!.r)).toBe('wait for your turn');
    step(state, ctx, [{ type: 'placeOutpost', player: second, q: SPOTS[0]!.q, r: SPOTS[0]!.r }]);
    expect(state.players[second]!.started).toBe(false);

    step(state, ctx, [{ type: 'placeOutpost', player: first, q: SPOTS[0]!.q, r: SPOTS[0]!.r }]);
    expect(state.players[first]!.started).toBe(true);
    expect(currentTurnPlayer(state)).toBe(second);
  });

  it('the game clock waits: nothing is cut or crafted until every turn is over', () => {
    const { ctx, state } = match(2);
    const [first, second] = state.startTurns.order as [number, number];
    step(state, ctx, [{ type: 'placeOutpost', player: first, q: SPOTS[0]!.q, r: SPOTS[0]!.r }]);
    run(state, ctx, 50);
    expect(state.stacks.every((s) => s === 0)).toBe(true);
    step(state, ctx, [{ type: 'placeOutpost', player: second, q: SPOTS[1]!.q, r: SPOTS[1]!.r }]);
    expect(state.phase).toBe('running');
    run(state, ctx, 50);
    expect(state.stacks.some((s) => s > 0)).toBe(true);
  });

  it('first player has 30 s, later players 15 s; running out of time hands the slot to a bot', () => {
    const { ctx, state } = match(3);
    const [first, second, third] = state.startTurns.order as [number, number, number];
    run(state, ctx, FIRST - 1);
    expect(currentTurnPlayer(state)).toBe(first);
    run(state, ctx, 1);
    expect(state.players[first]!.bot).toBe(true);
    expect(currentTurnPlayer(state)).toBe(second);
    run(state, ctx, LATER);
    expect(state.players[second]!.bot).toBe(true);
    expect(currentTurnPlayer(state)).toBe(third);
    expect(state.startTurns.ticksLeft).toBe(LATER);
  });

  it('bot slots skip their turn, and the first human still gets the long timer', () => {
    const probe = match(3);
    const botFirst = probe.state.startTurns.order[0]!;
    const bots = [0, 1, 2].map((id) => id === botFirst);
    const { ctx, state } = match(3, bots);
    step(state, ctx, []);
    expect(currentTurnPlayer(state)).toBe(state.startTurns.order[1]);
    expect(state.startTurns.ticksLeft).toBe(FIRST - 1);
  });

  it('a timed-out player can step back in and place their first outpost after the turns', () => {
    const { ctx, state } = match(2);
    const [first, second] = state.startTurns.order as [number, number];
    run(state, ctx, FIRST); // first times out
    step(state, ctx, [{ type: 'placeOutpost', player: second, q: SPOTS[1]!.q, r: SPOTS[1]!.r }]);
    expect(state.phase).toBe('running');

    step(state, ctx, [{ type: 'placeOutpost', player: first, q: SPOTS[0]!.q, r: SPOTS[0]!.r }]);
    expect(state.players[first]!.started).toBe(false); // the bot has the slot: ignored

    step(state, ctx, [
      { type: 'takeControl', player: first },
      { type: 'placeOutpost', player: first, q: SPOTS[0]!.q, r: SPOTS[0]!.r },
    ]);
    expect(state.players[first]!.bot).toBe(false);
    expect(state.players[first]!.started).toBe(true);
  });
});
