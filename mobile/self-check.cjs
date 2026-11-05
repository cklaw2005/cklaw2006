'use strict';
const assert = require('node:assert/strict');
const Core = require('./race-core.js');
const rng = (() => { let seed = 81723; return () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; }; })();

const race = Core.createRace(rng);
assert.equal(race.pairs.length, 15, 'all unordered pairs exist');
assert.equal(new Set(race.pairs.map(p => p.key)).size, 15, 'pair keys are unique');
assert.deepEqual(new Set(race.pairs.map(p => p.odds)), new Set(Core.PRICES), 'all published odds appear exactly once');
const order = Core.drawFinishOrder(race, rng);
assert.equal(new Set(order).size, 6, 'finish order has six distinct riders');
assert.equal(order.length, 6, 'finish order includes all six riders');
const actualPair = Core.pairKey(order[0], order[1]);
const odds = race.odds[actualPair];
assert.ok(odds >= 3 && odds <= 1000, 'actual winner odds exist');
assert.equal(Core.payout(7, odds), 7 * odds, 'payout uses the actual pair odds');
const fallenOrder = Core.normalizeIncidentOrder(order, { type: 'FALL' });
assert.deepEqual(fallenOrder.slice(0, 5), order.slice(1), 'fallen leader is withdrawn and cannot finish');
assert.equal(fallenOrder.at(-1), order[0], 'withdrawn rider is listed after active finishers');
assert.equal(Core.payout(0, odds), 0, 'no stake means no payout');
const reservedBetStart = Core.startRaceAccounting(0, 110);
assert.deepEqual(reservedBetStart, { balance: 0, totalInDelta: 110 }, 'a fully reserved bet starts without being deducted twice');
const startGrid = Core.startingGrid(40, [10, 20, 30, 40, 50, 60]);
assert.equal(startGrid.length, 6, 'start gate has six rider positions');
assert.equal(new Set(startGrid.map(position => position.x)).size, 1, 'all riders line up on one straight start line');
assert.deepEqual(startGrid.map(position => position.y), [10, 20, 30, 40, 50, 60], 'riders occupy separate lanes');
assert.ok(Core.riderRaceProgress(Core.finishProgress(0), 0) >= 1, 'the actual first rider visibly crosses before cutoff');
assert.ok(Core.riderRaceProgress(Core.finishProgress(0), 1) < 1, 'the actual second rider has not crossed before its turn');
assert.ok(Core.riderRaceProgress(Core.finishProgress(1), 0) >= 1, 'the actual winner is across when the second rider finishes');
assert.ok(Core.riderRaceProgress(Core.finishProgress(1), 1) >= 1, 'the actual second rider visibly crosses at cutoff');
assert.ok(Core.riderRaceProgress(Core.finishProgress(1), 2) < 1, 'third rider remains behind the cutoff');
for (let rank = 0; rank < 5; rank++) assert.ok(Core.finishProgress(rank) < Core.finishProgress(rank + 1), 'visual finish thresholds preserve official order');
let checkedOrders = 0;
function checkAllOrders(prefix, remaining) {
  if (!remaining.length) {
    const cutoff = Core.finishProgress(1);
    assert.ok(Core.riderRaceProgressForOrder(prefix, prefix[0], cutoff) >= 1, 'official winner is visibly across at cutoff');
    assert.ok(Core.riderRaceProgressForOrder(prefix, prefix[1], cutoff) >= 1, 'official second place is visibly across at cutoff');
    assert.ok(Core.riderRaceProgressForOrder(prefix, prefix[2], cutoff) < 1, 'third place remains behind at cutoff');
    checkedOrders++;
    return;
  }
  for (let i = 0; i < remaining.length; i++) checkAllOrders(prefix.concat(remaining[i]), remaining.slice(0, i).concat(remaining.slice(i + 1)));
}
checkAllOrders([], [1, 2, 3, 4, 5, 6]);
assert.equal(checkedOrders, 720, 'all possible rider orders preserve the visible result and two-place cutoff');
console.log('Mobile self-check passed: odds, payouts, incident withdrawal, reserved-bet launch, aligned gate, and actual-order finish cutoff.');

