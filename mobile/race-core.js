/* Pure race rules for the standalone mobile draft. */
(function (root) {
  'use strict';
  const N = 6;
  const PRICES = [3, 4, 5, 8, 10, 20, 30, 60, 80, 100, 125, 175, 250, 500, 1000];
  const pairKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function makeTips(rng) {
    const ids = [1, 2, 3, 4, 5, 6];
    const values = Array(6).fill(0);
    const ranges = [[96, 101], [90, 95], [58, 66]];
    const chosen = [];
    ranges.forEach(([lo, hi]) => {
      const index = Math.floor(rng() * ids.length);
      const id = ids.splice(index, 1)[0];
      values[id - 1] = lo + Math.floor(rng() * (hi - lo));
      chosen.push(id);
    });
    ids.forEach(id => values[id - 1] = 20 + Math.floor(rng() * 26));
    return { starter: chosen[0], finisher: chosen[1], sprint: chosen[2], values };
  }

  function strengthsFor(tips, rng) {
    return tips.values.map(value => {
      const dayForm = (65 + Math.floor(rng() * 71)) / 100;
      return Math.max(1, Math.round((0.78 * Math.pow(value / 100, 2) + 0.22 * dayForm * dayForm) * 1e6));
    });
  }
  function allOrders(weights, visit) {
    const order = [], used = Array(weights.length).fill(false);
    function walk(probability) {
      if (order.length === weights.length) { visit(order.slice(), probability); return; }
      const total = weights.reduce((sum, w, i) => sum + (used[i] ? 0 : w), 0);
      for (let i = 0; i < weights.length; i++) if (!used[i]) {
        used[i] = true; order.push(i + 1);
        walk(probability * weights[i] / total);
        order.pop(); used[i] = false;
      }
    }
    walk(1);
  }
  function pairProbabilities(weights) {
    const map = {};
    allOrders(weights, (order, probability) => {
      const key = pairKey(order[0], order[1]); map[key] = (map[key] || 0) + probability;
    });
    return map;
  }
  function createRace(rng = Math.random) {
    const tips = makeTips(rng), weights = strengthsFor(tips, rng), chances = pairProbabilities(weights);
    const pairs = [];
    for (let a = 1; a <= N; a++) for (let b = a + 1; b <= N; b++) pairs.push({ a, b, key: pairKey(a, b), chance: chances[pairKey(a, b)] });
    const sortedByChance = pairs.slice().sort((x, y) => y.chance - x.chance || x.a - y.a || x.b - y.b);
    const prices = PRICES.slice().sort((a, b) => a - b);
    sortedByChance.forEach((pair, i) => pair.odds = prices[i]);
    const odds = Object.fromEntries(pairs.map(p => [p.key, p.odds]));
    const weatherRoll = rng();
    const weather = weatherRoll < .50 ? 'CLEAR' : weatherRoll < .72 ? 'LIGHT RAIN' : weatherRoll < .92 ? 'WET GRASS' : 'THUNDERSTORM';
    // A surprise can happen, but most races remain incident-free.
    const incident = rng() < .12 ? { type: rng() < .48 ? 'FALL' : (weather === 'THUNDERSTORM' ? 'STARTLE' : 'SLIP'), trigger: .58 + rng() * .14 } : null;
    return { tips, weights, pairs, odds, weather, incident };
  }
  function drawFinishOrder(race, rng = Math.random) {
    const remaining = race.weights.map((weight, i) => ({ id: i + 1, weight }));
    const order = [];
    while (remaining.length) {
      const total = remaining.reduce((s, r) => s + r.weight, 0);
      let value = rng() * total, at = 0;
      while (at < remaining.length - 1 && (value -= remaining[at].weight) > 0) at++;
      order.push(remaining.splice(at, 1)[0].id);
    }
    return order;
  }
  function payout(stake, odds) { return Math.floor(Math.max(0, stake) * Math.max(0, odds)); }
  // Stake coins are reserved as the player changes each pair's amount. Starting
  // the race records that reserved input but must not reserve or deduct it again.
  function startRaceAccounting(balance, totalStake) {
    return {
      balance: Math.max(0, Math.trunc(Number(balance) || 0)),
      totalInDelta: Math.max(0, Math.trunc(Number(totalStake) || 0))
    };
  }
  function startingGrid(startX, laneYs) {
    return laneYs.map(y => ({ x: startX, y }));
  }
  // The first two finish thresholds are explicit: the scene can stop as soon
  // as the actual top two have crossed, while later riders remain on track.
  function finishProgress(rank) { return 0.82 + Math.max(0, Math.trunc(rank)) * 0.045; }
  function riderRaceProgress(progress, rank) {
    return clamp(Math.max(0, Number(progress) || 0) / finishProgress(rank), 0, 1);
  }
  function riderRaceProgressForOrder(order, riderId, progress) {
    const rank = order.indexOf(riderId);
    return riderRaceProgress(progress, rank < 0 ? order.length : rank);
  }
  function normalizeIncidentOrder(order, incident) {
    if (!incident) return order.slice();
    const affected = order[0];
    return order.slice(1).concat(affected);
  }
  // Resolve the official outcome once. The animation, result card, history, and
  // payout all consume this same immutable finish order and pair key.
  function resolveOutcome(race, drawnOrder, incident) {
    const valid = Array.isArray(drawnOrder) && drawnOrder.length === N &&
      new Set(drawnOrder).size === N && drawnOrder.every(id => Number.isInteger(id) && id >= 1 && id <= N);
    if (!valid) throw new Error('Finish order must contain riders 1–6 exactly once.');
    const finishOrder = normalizeIncidentOrder(drawnOrder, incident);
    const first = finishOrder[0], second = finishOrder[1], key = pairKey(first, second);
    return Object.freeze({ finishOrder: Object.freeze(finishOrder), first, second, key, odds: getPairOdds(race, first, second) });
  }
  function getPairOdds(race, a, b) { return race.odds[pairKey(a, b)] || 0; }
  root.RaceCore = { pairKey, createRace, drawFinishOrder, payout, normalizeIncidentOrder, resolveOutcome, getPairOdds, startRaceAccounting, startingGrid, finishProgress, riderRaceProgress, riderRaceProgressForOrder, PRICES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RaceCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);

