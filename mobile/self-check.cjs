'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('./race-core.js');
const seeded=()=>{let seed=81723;return()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};};
const rng=seeded(),history=Array.from({length:6},()=>Array(6).fill(0));
const race=Core.createRace(rng,history,0);
assert.equal(race.pairs.length,15,'PC odds board has all 15 unordered top-two pairs');
assert.deepEqual(new Set(race.pairs.map(p=>p.odds)),new Set(Core.PRICES),'all PC odds prices appear exactly once');
assert.deepEqual(Core.PRICES,[5,6,7,10,30,40,50,80,100,150,175,225,300,550,1500],'mobile pair price table applies the PC digit-based increases');
assert.equal(Core.adjustOddsByDigits(8),10,'single-digit odds add 2');
assert.equal(Core.adjustOddsByDigits(30),50,'two-digit odds add 20');
assert.equal(Core.adjustOddsByDigits(500),550,'three-digit odds add 50');
assert.equal(Core.adjustOddsByDigits(1000),1500,'four-digit odds add 500');
assert.equal(Core.roundToEven(2.5),2,'single-place base odds use the PC midpoint-to-even rounding rule');
assert.equal(Core.roundToEven(3.5),4,'single-place base odds use the PC midpoint-to-even rounding rule');
assert.equal(Core.totalBets({'1-2':5},{3:7}),12,'rolling stake includes pair and single-winner tickets');
assert.deepEqual(Core.singleOddsForStrengths([10,10,10,10,10,10]),[8,8,8,8,8,8],'mobile first-place odds use the same adjusted odds rule as PC');
assert.ok(race.tips.values.filter(x=>x>=96).length===1,'PC starter tip comes from strongest runner');
assert.ok(race.tips.values.filter(x=>x>=90&&x<=94).length===1,'PC finisher tip comes from second strongest runner');
assert.ok(race.probabilities&&Math.abs(Object.values(race.probabilities).reduce((a,b)=>a+b,0)-1)<1e-9,'PC top-pair model probabilities sum to one');
assert.equal(race.odds[Core.pairKey(race.finish[0],race.finish[1])],Core.getPairOdds(race,race.finish[0],race.finish[1]),'initial result pair references its locked price');
assert.ok(['DRY DIRT','LIGHT RAIN','WET GRASS','THUNDERSTORM','STRONG WIND'].includes(race.weather),'weather labels match the desktop card set');
assert.equal(race.windStrength>0,race.weather==='STRONG WIND','wind intensity only exists in strong wind');
for(const groupSize of [2,3,4]){
  const collision={...race,odds:{...race.baseOdds},singleOdds:race.baseSingleOdds.slice(),hazard:'NONE',incidentHorse:-1,collisionPartner:-1,collisionRiders:[]};
  Core.configureCollision(collision,groupSize);
  assert.equal(Core.collisionMultiplier(collision),groupSize,`${groupSize}-bike collision sets its matching odds multiplier`);
  assert.equal(new Set(collision.collisionRiders).size,groupSize,`${groupSize}-bike collision has distinct involved riders`);
  assert.ok(collision.collisionRiders.every(id=>collision.preIncidentOrder.indexOf(id)<groupSize),`${groupSize}-bike collision only involves the leading pack`);
  assert.ok(collision.collisionRiders.every(id=>Core.disqualified(collision,id)),`${groupSize}-bike collision disqualifies every involved rider`);
  assert.deepEqual(collision.odds,Object.fromEntries(Object.entries(collision.baseOdds).map(([key,value])=>[key,value*groupSize])),`${groupSize}-bike collision multiplies the displayed locked odds`);
  assert.deepEqual(collision.singleOdds,collision.baseSingleOdds.map(value=>value*groupSize),`${groupSize}-bike collision multiplies first-place odds`);
  assert.equal(Core.payout(3,collision.odds['1-2']),Core.payout(3,collision.baseOdds['1-2']*groupSize),`${groupSize}-bike collision multiplier reaches payout`);
  assert.equal(Core.payout(3,collision.singleOdds[4]),Core.payout(3,collision.baseSingleOdds[4]*groupSize),`${groupSize}-bike collision multiplier reaches first-place payout`);
}

const collisionRng=seeded();let naturalCollisions=0;
for(let i=0;i<5000;i++){
  const card=Core.createRace(collisionRng,history,0);
  if(card.hazard==='BIKE COLLISION'){
    naturalCollisions++;
    assert.ok(card.collisionRiders.length>=2&&card.collisionRiders.length<=4,'natural collision contains two to four riders');
    assert.equal(Core.collisionMultiplier(card),card.collisionRiders.length,'natural collision odds multiplier equals involved rider count');
    assert.ok(card.collisionRiders.every(id=>Core.disqualified(card,id)),'every natural collision rider is disqualified');
    assert.ok(card.odds['1-2']%Core.collisionMultiplier(card)===0,'natural pair odds include the collision multiplier');
  }
}
assert.ok(naturalCollisions>=130&&naturalCollisions<=270,`natural collision rate is approximately the independent 4% target (observed ${naturalCollisions}/5000)`);

const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8'),app=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8'),worker=fs.readFileSync(require('node:path').join(__dirname,'sw.js'),'utf8');
assert.match(html,/data-market="single"[^>]*>1ST PLACE/i,'mobile UI exposes a first-place market tab');
assert.match(html,/id="single-grid"/,'mobile UI has a single-runner odds board');
assert.match(app,/data-runner="\$\{id\}"[\s\S]*?\$\{odds\}×/,'single-runner cards display each rider’s current first-place odds');
assert.match(app,/payout\(singleBets\[first\]\|\|0,singleOdds\)/,'settlement pays a matching first-place ticket at the locked odds');
assert.match(app,/totalLiability\(bets,race\.odds\)\+RaceCore\.totalSingleLiability/,'stake capacity accounts for exposure in both markets');
assert.match(worker,/krace-mobile-v8/,'service-worker cache version is bumped so the changed odds UI can refresh');
assert.doesNotMatch(worker,/\.\/assets\//,'offline cache does not require audio files absent from the deployed mobile page');
assert.doesNotMatch(html,/<audio\b/i,'mobile audio does not depend on missing external media files');
assert.match(app,/new \(window\.AudioContext\|\|window\.webkitAudioContext\)/,'mobile music and incident cues synthesize locally through Web Audio');

const win=Core.createPayoutWindow();
for(let i=0;i<1001;i++)Core.recordWindow(win,10,i<1000?7:0);
assert.equal(win.length,1000,'rolling window retains exactly the last 1,000 settled rounds');
assert.deepEqual(Core.windowTotals(win),[10000,6993],'expired round leaves the cumulative rolling totals');
assert.equal(Core.expectedPayout(win,100,70),77,'over-target payout margin is recovered gradually');
assert.equal(Core.minPayout(win,100),0,'rolling recovery never forces an impossible per-round payout');
assert.equal(Core.maxPayout(win,100),1590,'rolling payout ceiling stays at 85 percent');
assert.equal(Core.maximumPairStake(4,100,20,399),25,'stake ceiling respects balance, pair cap, and house exposure');
assert.equal(Core.maximumPairStake(4,100,20,3800),100,'stake ceiling permits full pair limit when reserve covers it');
assert.equal(Core.payout(3,175),525,'whole-coin payout uses locked pair odds');

const bets=Object.fromEntries(Core.pairs().map(p=>[p.key,0]));bets[race.pairs[0].key]=4;
const controlled={...race,probabilities:{...race.probabilities},finish:race.finish.slice(),preIncidentOrder:race.preIncidentOrder.slice()};
Core.rollingControl(controlled,bets,Core.createPayoutWindow(),70,seeded());
assert.ok(Math.abs(Object.values(controlled.probabilities).reduce((a,b)=>a+b,0)-1)<1e-8,'ticket-conditioned PC outcome probabilities remain normalized');
assert.equal(controlled.finish.length,6,'payout adjustment still produces six actual finishers');
assert.equal(new Set(controlled.finish).size,6,'settled finish order contains each rider exactly once');
assert.deepEqual(controlled.finish,controlled.finish.slice().sort((a,b)=>controlled.finish.indexOf(a)-controlled.finish.indexOf(b)),'finish order remains stable after ticket conditioning');

for(let i=0;i<300;i++){
  const card=Core.createRace(seeded(),history,i%35);
  const run=Core.prepareMotion(card,seeded());
  assert.equal(run.finishOrder.length,6,'PC motion produces a six-rider finish order');
  assert.equal(new Set(run.finishOrder).size,6,'withdrawn riders remain exactly once in final record');
  assert.ok(run.fullTicks*33>=23000&&run.fullTicks*33<=33000,'race duration retains the PC 8-second final straight');
  if(card.hazard==='BIKE COLLISION')assert.ok((card.collisionRiders||[]).every(id=>run.finishOrder.indexOf(id)>=2),'every collision rider is excluded from the official top two');
}

// Repeatedly exercise the complete phone round: book the ticket, condition the
// PC finish probabilities, build motion, settle from the first two eligible
// crossings, and apply the locked pair odds.
const liveRng=seeded(),liveWindow=Core.createPayoutWindow();let liveHistory=Array.from({length:6},()=>Array(6).fill(0));
let liveCollisionRaces=0;
for(let i=0;i<1200;i++){
  const card=Core.createRace(liveRng,liveHistory,i),ticket=Object.fromEntries(Core.pairs().map(p=>[p.key,0]));
  const pick=Core.pairs()[Math.floor(liveRng()*15)];ticket[pick.key]=1+Math.floor(liveRng()*8);
  Core.rollingControl(card,ticket,liveWindow,70,liveRng);
  if(card.hazard==='BIKE COLLISION')liveCollisionRaces++;
  const motion=Core.prepareMotion(card,liveRng,33);
  const out=motion.finishOrder.filter(id=>!Core.disqualified(card,id)&&!(card.hazard!=='NONE'&&card.hazard!=='PIT STOP'&&id===card.incidentHorse)).slice(0,2);
  assert.equal(out.length,2,`race ${i+1} has two eligible finishers`);
  assert.ok(motion.finishTick<=motion.fullTicks+260,`race ${i+1} cutoff is within the scheduled extended race`);
  assert.equal(card.odds[Core.pairKey(out[0],out[1])],Core.getPairOdds(card,out[0],out[1]),`race ${i+1} payout pair uses its locked odds`);
  const paid=Core.payout(ticket[Core.pairKey(out[0],out[1])]||0,card.odds[Core.pairKey(out[0],out[1])]);
  Core.recordWindow(liveWindow,Object.values(ticket).reduce((a,b)=>a+b,0),paid);
  liveHistory=Core.pairHistoryIncrement(liveHistory,out[0],out[1]);
  assert.equal(liveWindow.length,Math.min(i+1,Core.WINDOW_SIZE),`race ${i+1} preserves a rolling 1,000-round window`);
}
assert.ok(liveCollisionRaces>0,`the 1,200-game live simulation exercises collisions (${liveCollisionRaces} observed)`);

const grid=Core.startingGrid(40,[10,20,30,40,50,60]);
assert.equal(new Set(grid.map(p=>p.x)).size,1,'six riders start on one common line');
for(const [h,w] of [[358,635],[201,358]]){
  const scale=Math.min(1,Math.max(.54,w/410)),margin=27*scale/h,centers=Core.laneCenters(.46,.96,margin);
  assert.equal(centers.length,6,'six bike lanes fit desktop and phone canvas sizes');
  assert.ok(centers.every(y=>y-margin>=.46-1e-9&&y+margin<=.96+1e-9),'all wheel bounds stay on the track');
}
console.log(`PC/mobile self-check passed: adjusted pair and first-place odds, explicit single market and payout wiring, collision x2/x3/x4 multipliers and DQ, natural collision rate ${naturalCollisions}/5000, and ${liveCollisionRaces} collision races exercised in 1,200 consecutive wager→motion→crossing→odds→payout→history rounds; desktop/mobile track bounds also passed.`);



