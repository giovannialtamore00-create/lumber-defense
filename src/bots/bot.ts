// Bot brain (ARCHITECTURE.md §7, M7): looks at the match and returns ordinary commands, like a player would. In the game
// it runs on the host only, for slots a bot plays; `tools/battle-sim.ts` uses the same brain for balance runs. It
// doesn't have to be deterministic across clients: only its commands go through lockstep.
import strategies from '../data/botStrategies.json';
import type { SimContext } from '../sim/context';
import { distance, hexesInRadius } from '../sim/hex';
import { isConflictFor } from '../sim/systems/combat';
import { craftError } from '../sim/systems/crafting';
import { canPlaceAnywhere, dropOffs, pickupError, placementError } from '../sim/systems/placement';
import { isCoveredBy } from '../sim/systems/territory';
import type { Catapult, Command, GameState, ItemKind, Structure, StructureKind } from '../sim/types';
import { typeIndex, upgradeError } from '../sim/upgrades';

export interface Strategy {
  name: string;
  // Economy
  millsEarly: number; // factory-mills before anything else grows
  docksPerMill: number; // only next to a factory-mill
  choppersPerOutpost: number;
  carriersPerChopper: number;
  guardsPerOutpost: number;
  expandBelowForest: number; // new outpost when the uncut forest in our territory drops below this
  expandEveryBuildings: number; // or every N buildings (0 = off)
  maxOutposts: number;
  workshopAt: number; // buildings before the workshop (0 = never)
  upgrades: [string, number][]; // bought in order, one level each
  // Military
  aggressionFromMin: number; // from this minute, new outposts push toward the nearest enemy (999 = never)
  catapultsFromMin: number; // from this minute, build catapults
  catapultsPerConflict: number; // catapults wanted (in total) while we have a conflict zone
  catapultsIdle: number; // catapults wanted even without a conflict zone (aggressors prepare)
  /** From this minute, focus everything on the weakest living enemy's nearest outpost (999 = never). */
  focusFromMin: number;
  /** Only attack an enemy whose wood income is at most 1/leadRatio of ours (game theory: fight when ahead). */
  leadRatio: number;
  /** Attack in Conquest (outposts only, capture the rest) instead of Destruction. */
  conquest: boolean;
}

export const DEFAULTS = strategies.defaults as Strategy;

/** How often a bot looks at the match and acts. */
export const THINK_EVERY_TICKS = strategies.thinkEveryTicks;

/** The strategies in-game bots play, in slot order (designer's pick: the round 3 mix). */
export const IN_GAME_STRATEGIES: Strategy[] = strategies.inGame.map((s) => ({ ...DEFAULTS, ...s }) as Strategy);

export interface BotOptions {
  /** In the game: the slot is a bot's (`player.bot`), so commands carry `bot: true`. In battle-sim: false. */
  asBot: boolean;
  /** Battle-sim debug lines (BATTLE_DEBUG): pushed here every 5 minutes. */
  debugNotes?: string[];
}

export interface Bot {
  think(): Command[];
  /** Catapults placed so far. */
  readonly catapultsBuilt: number;
}

export function createBot(ctx: SimContext, state: GameState, me: number, st: Strategy, opts: BotOptions): Bot {
  const queue: Command[] = [];
  const send = (c: Command) => queue.push(opts.asBot ? { ...c, bot: true } : c);
  const hexes = ctx.map.hexes;
  const idxOf = (h: { q: number; r: number }) => ctx.indexOf.get(`${h.q},${h.r}`);
  const territoryOf = (pl: number) => state.coverage.filter((c) => c & (1 << pl)).length;
  let catapultsBuilt = 0;

  /** Wood collected per player at each minute mark, for income estimates. */
  const collectedAt: number[][] = state.players.map(() => []);
  let recordedTick = 0;
  /** Wood income over the last 2 minutes (wood that reached factory-mills, plus nothing else). */
  const income = (pl: number) => {
    const h = collectedAt[pl]!;
    const now = state.players[pl]!.stats.woodCollected;
    const then = h.length >= 2 ? h[h.length - 2]! : 0;
    return Math.max(0, now - then) / 1000;
  };

  const p = () => state.players[me]!;
  const mine = (k: StructureKind) => state.entities.filter((e): e is Structure => e.type === 'structure' && e.kind === k && e.owner === me);
  const count = (t: string) => state.entities.filter((e) => e.type === t && 'owner' in e && e.owner === me).length;
  const buildings = () => state.entities.filter((e) => e.type === 'structure' && e.owner === me).length;
  const covered = (i: number) => isCoveredBy(state, i, me);
  const legal = (item: ItemKind) => hexes.filter((h) => !placementError(state, ctx, me, item, h.q, h.r, opts.asBot));
  const territoryForest = () => state.forestPool.reduce((s, w, i) => s + (covered(i) ? w : 0), 0) / 1000;
  const millNear = (h: { q: number; r: number }) => mine('factory').some((f) => distance(f, h) === 1);
  const minute = () => state.tick / 600;
  const enemyOutposts = () => state.entities.filter((e): e is Structure => e.type === 'structure' && e.kind === 'outpost' && e.owner >= 0 && e.owner !== me);
  const conflictHexes = () => hexes.map((_, i) => i).filter((i) => isConflictFor(state, i, me));
  const aggressive = () => minute() >= st.aggressionFromMin;
  /**
   * Who to attack, if anyone: from focusFromMin, the enemy we out-produce the most (income over the last 2 minutes,
   * at least leadRatio times theirs), weighted toward the nearest and the smallest. Returns that enemy's outpost
   * nearest to us. Fighting an equal is a coin flip that lets the others grow, so we only fight when ahead. To hit it,
   * it must sit in a conflict zone inside our territory: an outpost of ours within 3 hexes covers it.
   */
  function focusTarget(): Structure | null {
    if (minute() < st.focusFromMin) return null;
    const mineOut = mine('outpost');
    if (!mineOut.length) return null;
    const myIncome = income(me);
    let best: { score: number; outpost: Structure } | null = null;
    for (const pl of state.players) {
      if (pl.id === me || !pl.started || pl.defeated) continue;
      const theirs = enemyOutposts().filter((o) => o.owner === pl.id);
      if (!theirs.length) continue;
      const theirIncome = income(pl.id);
      // Fight only when ahead: in income, or in army (1.5x theirs + 2), or in the final duel from minute 15 (no third
      // player left to profit from the fight; round 3: two equal survivors sat on 50-70 idle catapults until 30:00).
      const army = (pl2: number) => state.entities.filter((e) => e.type === 'catapult' && e.owner === pl2).length;
      const duel = state.players.filter((x) => x.id !== me && x.started && !x.defeated).length === 1 && minute() >= 15;
      const ahead = myIncome >= st.leadRatio * theirIncome || army(me) >= 1.5 * army(pl.id) + 2 || duel;
      if (!ahead) continue;
      const d = (o: Structure) => Math.min(...mineOut.map((m) => distance(m, o)));
      const nearest = theirs.reduce((x, y) => (d(y) < d(x) ? y : x));
      const score = (myIncome + 1) / (theirIncome + 1) - d(nearest) * 0.15 - territoryOf(pl.id) / 100;
      if (!best || score > best.score) best = { score, outpost: nearest };
    }
    return best?.outpost ?? null;
  }
  const targetCovered = (t: Structure) => covered(idxOf(t)!);

  const expansionScore = (h: { q: number; r: number }, radius: number) =>
    hexesInRadius(h, radius).reduce((s, n) => {
      const i = idxOf(n);
      if (i === undefined || covered(i)) return s;
      return s + state.forestPool[i]! / 1000 / 20 + (ctx.riverside[i] ? 1 : 0) + (ctx.riverRow[i] ?? 0) * 0 + 0.3;
    }, 0);
  /** Pushing toward an enemy: new hexes that the enemy covers (conflict) count most. */
  const pushScore = (h: { q: number; r: number }) => {
    const enemies = enemyOutposts();
    if (!enemies.length) return expansionScore(h, ctx.config.outpost.territoryRadius);
    const near = Math.min(...enemies.map((e) => distance(e, h)));
    const conflict = hexesInRadius(h, ctx.config.outpost.territoryRadius).filter((n) => {
      const i = idxOf(n);
      return i !== undefined && (state.coverage[i]! & ~(1 << me)) !== 0;
    }).length;
    return conflict * 3 - near;
  };

  function unservedChoppers() {
    return mine('woodchopper').filter((w) => !dropOffs(state, ctx, me, w.q, w.r).some((d) => d.riverQ === null));
  }

  function spot(item: ItemKind): { q: number; r: number } | null {
    const spots = legal(item);
    if (!spots.length) return null;
    const byScore = (f: (h: { q: number; r: number }) => number) => spots.reduce((a, b) => (f(b) > f(a) ? b : a));
    switch (item) {
      case 'outpost':
        if (!p().started) return byScore((h) => expansionScore(h, ctx.config.outpost.firstTerritoryRadius));
        {
          // Focus: as close as possible to the target outpost, so our territory covers it.
          const t = focusTarget();
          if (t && !targetCovered(t)) return byScore((h) => -distance(h, t));
        }
        return aggressive() ? byScore(pushScore) : byScore((h) => expansionScore(h, ctx.config.outpost.territoryRadius));
      case 'factory':
        return byScore((h) => {
          const i = idxOf(h)!;
          const river = Math.max(0, ...ctx.neighbourIdx[i]!.map((n) => ctx.riverRow[n]!));
          const forest = hexesInRadius(h, 3).filter((n) => {
            const j = idxOf(n);
            return j !== undefined && state.forestPool[j]! > 0 && n.r === h.r;
          }).length;
          const serves = unservedChoppers().some((w) => w.r === h.r && Math.abs(w.q - h.q) <= ctx.config.carrier.maxRouteDistance);
          return river + forest * 2 + (serves ? 100 : 0);
        });
      case 'dock':
        return spots.find(millNear) ?? null;
      case 'woodchopper':
        return byScore((h) => state.forestPool[idxOf(h)!]! / 1000 + (mine('factory').some((f) => f.r === h.r && Math.abs(f.q - h.q) <= 5) ? 100 : 0));
      case 'forestGuard':
        return byScore((h) =>
          hexesInRadius(h, 1).filter((n) => {
            const j = idxOf(n);
            return j !== undefined && covered(j) && state.forestPool[j] === 0 && (hexes[j]!.terrain === 'forest' || state.grownForest[j]);
          }).length,
        );
      case 'catapult': {
        // Focus: 4 hexes from the target outpost (in range, out of archer reach), so it's their closest target.
        const ft = focusTarget();
        if (ft) {
          const others = enemyOutposts().filter((o) => o !== ft);
          return byScore((h) => {
            const d = distance(h, ft);
            const safe = others.every((o) => distance(o, h) >= 3);
            return (d === 4 ? 60 : d === 3 ? 50 : 0) - Math.abs(d - 4) + (safe ? 20 : 0);
          });
        }
        // Near the conflict zone (or the nearest enemy outpost) but out of reach of enemy archers: at least 4 hexes
        // from any enemy outpost (batch 1 found catapults placed in archer range die and get rebuilt in a loop).
        const zone = conflictHexes().map((i) => hexes[i]!);
        const targets = zone.length ? zone : enemyOutposts();
        const safe = (h: { q: number; r: number }) => enemyOutposts().every((e) => distance(e, h) >= 4);
        if (!targets.length) return byScore((h) => -Math.min(...mine('outpost').map((o) => distance(o, h))));
        return byScore((h) => (safe(h) ? 100 : 0) - Math.min(...targets.map((t) => distance(t, h))));
      }
      default:
        return byScore((h) => -Math.min(...mine('outpost').map((o) => distance(o, h))));
    }
  }

  function carrierRoute(): { aQ: number; bQ: number; r: number } | null {
    const served = new Map<string, number>();
    for (const c of state.entities) if (c.type === 'carrier' && c.owner === me) served.set(`${c.aQ},${c.r}`, (served.get(`${c.aQ},${c.r}`) ?? 0) + 1);
    for (const w of mine('woodchopper')) {
      if ((served.get(`${w.q},${w.r}`) ?? 0) >= st.carriersPerChopper || pickupError(state, ctx, me, w.q, w.r)) continue;
      const drops = dropOffs(state, ctx, me, w.q, w.r);
      const drop = drops.find((d) => d.riverQ === null) ?? drops[0];
      if (drop) return { aQ: w.q, bQ: drop.q, r: w.r };
    }
    return null;
  }

  /** Every minute mark: remember everyone's collected wood, for `income`. */
  function recordIncome() {
    if (state.tick === 0 || state.tick % 600 !== 0 || state.tick === recordedTick) return;
    recordedTick = state.tick;
    for (const pl of state.players) collectedAt[pl.id]!.push(pl.stats.woodCollected);
  }

  let upgradeStep = 0;
  function think(): Command[] {
    recordIncome();
    if (p().defeated || state.phase === 'over') return [];
    if (opts.asBot && !p().bot) return []; // the player took their slot back
    if (p().bot && !opts.asBot) send({ type: 'takeControl', player: me });
    else if (!p().started) {
      const h = spot('outpost');
      if (h) send({ type: 'placeOutpost', player: me, q: h.q, r: h.r });
    } else {
      if (opts.debugNotes && state.tick % 3000 === 0) {
        const t = focusTarget();
        const cats = state.entities.filter((e): e is Catapult => e.type === 'catapult' && e.owner === me);
        opts.debugNotes.push(`m${Math.round(minute())} ${st.name}: target ${t ? `outpost of p${t.owner} at ${t.q},${t.r} covered=${targetCovered(t)}` : 'none'} cats ${cats.length}${t && cats.length ? ` nearest-cat-dist ${Math.min(...cats.map((c) => distance(c, t)))}` : ''} outposts ${mine('outpost').length} spot-dist ${t ? (() => { const h = spot('outpost'); return h ? distance(h, t) : 'no spot'; })() : '-'} queue ${p().queue.map((j) => j.item).join('+') || '-'} hand ${p().hand.join('+') || '-'} wood ${Math.floor(p().wood / 1000)} craftErr ${craftError(state, ctx, me, 'outpost')}`);
      }
      const invaded = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0 && covered(idxOf(e)!));
      const want = invaded || !st.conquest || !focusTarget() ? 'destruction' : 'conquest';
      if (p().stance !== want) send({ type: 'setStance', player: me, stance: want });
      plan();
    }
    return queue.splice(0);
  }

  function plan() {
    const item = p().hand[0];
    if (item) {
      if (item === 'carrier') {
        const route = carrierRoute();
        return send(route ? { type: 'placeCarrier', player: me, ...route } : { type: 'store', player: me });
      }
      const h = spot(item);
      if (!h) return send({ type: 'store', player: me });
      if (item === 'forestGuard') return send({ type: 'placeGuard', player: me, q: h.q, r: h.r });
      if (item === 'catapult') {
        catapultsBuilt++;
        return send({ type: 'placeCatapult', player: me, q: h.q, r: h.r });
      }
      return send({ type: 'place', player: me, item: item as StructureKind, q: h.q, r: h.r });
    }
    const useless = mine('dock').find((d) => !millNear(d) && d.dismantleTicks === undefined);
    if (useless) return send({ type: 'dismantle', player: me, id: useless.id });
    // Defence: once any enemy catapult exists, get Archer L1 first (archers only shoot catapults).
    const threat = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0);
    const archer = typeIndex(ctx, 'outpost');
    if (threat && mine('workshop').length && p().upgrades[archer]!.levels[1] === 0 && !p().research.some((r) => r.type === archer) && !upgradeError(state, ctx, me, archer, 1))
      return send({ type: 'buyUpgrade', player: me, upgradeType: archer, path: 1 });
    const next = st.upgrades[upgradeStep];
    if (next && mine('workshop').length) {
      const t = typeIndex(ctx, next[0]);
      const err = upgradeError(state, ctx, me, t, next[1]);
      if (!err) {
        upgradeStep++;
        return send({ type: 'buyUpgrade', player: me, upgradeType: t, path: next[1] });
      }
      if (err === 'fully upgraded') upgradeStep++;
    }
    const outposts = mine('outpost').length;
    const n = (k: StructureKind) => mine(k).length;
    const wants: ItemKind[] = [];
    const conflict = conflictHexes().length > 0;
    // Defence: enemy catapults in or near our land -> a defensive army right away, whatever the plan (round 3: the
    // Patient bot waited for its planned minute and was overrun every match).
    const near = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0 && mine('outpost').some((o) => distance(o, e) <= 6));
    if (near && count('catapult') < 3) wants.push('catapult');
    // Focus fire: first make the target outpost hittable (cover it with an outpost), then mass catapults on it.
    const ft = focusTarget();
    if (ft) {
      // Army first (sim 1: pushing outposts with no army behind them built 31 outposts and lost every one), then
      // creep one outpost closer whenever the army is ready.
      const army = 3 + Math.floor(p().wood / 50_000);
      if (count('catapult') < 3) wants.push('catapult');
      else if (!targetCovered(ft)) {
        // Only an outpost within 3 hexes of the target covers it. No free hex there (round 3: territories fill up with
        // forest and buildings): make room by dismantling one of our own buildings near the target, like a player would.
        const h = spot('outpost');
        const closest = Math.min(...mine('outpost').map((o) => distance(o, ft)));
        const queued = p().queue.some((j) => j.item === 'outpost') || p().hand.includes('outpost');
        // Creep: any free hex that brings an outpost closer to the target than we already are (one at a time).
        if (h && (distance(h, ft) <= ctx.config.outpost.territoryRadius || distance(h, ft) < closest)) {
          if (!queued) wants.push('outpost');
        }
        else if (mine('workshop').length && !p().research.length && closest <= ctx.config.outpost.territoryRadius + 3 && !upgradeError(state, ctx, me, typeIndex(ctx, 'outpost'), 0)) {
          // Our outposts are just out of reach: Reach (+1 radius for every outpost) covers the target.
          return send({ type: 'buyUpgrade', player: me, upgradeType: typeIndex(ctx, 'outpost'), path: 0 });
        } else if (!state.entities.some((e) => e.type === 'structure' && e.owner === me && e.dismantleTicks !== undefined)) {
          // Never factory-mills: they are the economy (taking them down left two broke survivors in a stalemate).
          const room = mine('dock').concat(mine('excavator'), mine('workshop').length > 1 ? mine('workshop') : [])
            .filter((b) => distance(b, ft) <= ctx.config.outpost.territoryRadius && state.forestPool[idxOf(b)!] === 0 && b.kind !== 'woodchopper')
            .sort((x, y) => distance(x, ft) - distance(y, ft))[0];
          if (room) return send({ type: 'dismantle', player: me, id: room.id });
        }
      }
      if (count('catapult') < army) wants.push('catapult');
    } else if (minute() >= st.catapultsFromMin) {
      // A fixed army per strategy, plus one more per 100 banked wood (batch 3: bots banked ~2,700 wood with nothing
      // to spend it on, so no match was ever won before the cap).
      const surplus = Math.floor(p().wood / 100_000);
      const wantCats = (conflict ? st.catapultsPerConflict : st.catapultsIdle) + surplus;
      // Stop feeding a front that keeps killing them: at most twice the planned army in total.
      const capped = catapultsBuilt >= 2 * Math.max(st.catapultsPerConflict, st.catapultsIdle) + surplus && p().wood < 300_000; // the cap only stops loops when broke
      if (count('catapult') < wantCats && !capped) wants.push('catapult');
    }
    if (count('carrier') < n('woodchopper') * st.carriersPerChopper && carrierRoute()) wants.push('carrier');
    if (n('factory') < 1) wants.push('factory');
    if (n('woodchopper') < 2) wants.push('woodchopper');
    if (n('dock') < n('factory') * st.docksPerMill) wants.push('dock');
    if (n('factory') < st.millsEarly) wants.push('factory');
    if (unservedChoppers().length > 0 && n('factory') < 3 * outposts) wants.push('factory');
    if (st.workshopAt && n('workshop') < 1 && buildings() >= st.workshopAt) wants.push('workshop');
    const expand =
      outposts < st.maxOutposts &&
      (territoryForest() < st.expandBelowForest ||
        (st.expandEveryBuildings > 0 && buildings() >= outposts * st.expandEveryBuildings) ||
        (aggressive() && !conflict));
    // Every bot gets a second outpost by minute 6 (batch 1: C never expanded and was overrun).
    if (expand || (outposts < 2 && minute() >= 6)) wants.push('outpost');
    if (n('woodchopper') < st.choppersPerOutpost * outposts) wants.push('woodchopper');
    if (count('guard') < st.guardsPerOutpost * outposts) wants.push('forestGuard');
    const pick = wants.find(
      (k) => !craftError(state, ctx, me, k) && (k === 'carrier' ? !!carrierRoute() : canPlaceAnywhere(state, ctx, me, k) && spot(k) !== null),
    );
    if (pick) send({ type: 'craft', player: me, item: pick });
  }

  return {
    think,
    get catapultsBuilt() {
      return catapultsBuilt;
    },
  };
}
