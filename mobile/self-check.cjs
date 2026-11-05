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
console.log('Mobile self-check passed: 15 odds, matching settlement, fall withdrawal, reserved-bet start accounting, aligned six-rider grid.');

