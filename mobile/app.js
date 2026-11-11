(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('race-canvas'), ctx = canvas.getContext('2d');
  const PALETTE = ['#f0f4f4','#ed4f9b','#ff644e','#3989ff','#ffd347','#38c88e'];
  const STORE_KEY = 'krace-mobile-v1';
  const initial = { round: 1, roundsStarted: 0, coins: 10, totalIn: 0, totalOut: 0, houseReserve: 100000, pairHistory: Array.from({length:6},()=>Array(6).fill(0)), historyRaces: 0, history: [], payoutRounds: [], audio: false };
  let state;
  try { state = { ...initial, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { state = { ...initial }; }
  // Audio needs a user gesture after every reload. Avoid restoring a stale ON label.
  state.audio = false;
  state.round = Math.max(1, Number(state.round) || 1); state.roundsStarted = Math.max(0, Number(state.roundsStarted) || state.round - 1); state.coins = Math.max(0, Number(state.coins) || 0);state.totalIn=Math.max(0,Number(state.totalIn)||0);state.totalOut=Math.max(0,Number(state.totalOut)||0);state.historyRaces=Math.max(0,Number(state.historyRaces)||0);
  state.history = Array.isArray(state.history) ? state.history.slice(0, 5) : [];
  state.pairHistory = Array.isArray(state.pairHistory) && state.pairHistory.length === 6 ? state.pairHistory : initial.pairHistory;
  state.houseReserve = Number.isFinite(Number(state.houseReserve)) ? Number(state.houseReserve) : 100000;
  const rng = Math.random, payoutWindow = RaceCore.createPayoutWindow(Array.isArray(state.payoutRounds)?state.payoutRounds:[]);
  let race = RaceCore.createRace(rng,state.pairHistory,state.historyRaces||0), outcome = null, bets = {}, singleBets = {}, selected = '1-2', selectedRunner = 1, betMode = 'pair', phase = 'betting';
  let raceStart = 0, motion = null, raceDuration = 0, fallenIds = [], crossed = [], countdownAt=0, resultAt=0, raf = 0, deferredInstall = null;
  let audioCtx=null,musicTimer=0,musicStep=0,musicMode='theme';
  let stormNextFlash = 0, stormFlashUntil = 0, stormBoltX = .76;

  function save() { try { state.payoutRounds=payoutWindow.slice(-RaceCore.WINDOW_SIZE); localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, audio: false })); } catch { notice('Progress could not be saved by this browser.'); } }
  function notice(text) { $('notice').textContent = text; }
  function formatRound(n) { return String(n).padStart(3, '0'); }
  function pairStake(key) { return bets[key] || 0; }
  function selectedStake(){return betMode==='pair'?pairStake(selected):(singleBets[selectedRunner]||0);}
  function totalStake(){return RaceCore.totalBets(bets,singleBets);}
  function updateHud() {
    $('round-number').textContent = formatRound(state.round); $('coin-balance').textContent = state.coins;$('total-in').textContent=state.totalIn;$('total-out').textContent=state.totalOut;
    $('races-played').textContent = state.roundsStarted; $('selected-stake').textContent = selectedStake();
    $('total-stake').textContent = totalStake();
    $('tip-starter').textContent = race.tips.starter; $('tip-finisher').textContent = race.tips.finisher; $('tip-sprint').textContent = race.tips.sprint;
    $('weather-label').textContent = race.weather === 'STRONG WIND' ? `WIND ${race.headwind ? 'HEAD' : 'TAIL'} · ${race.windStrength}%` : race.weather; $('weather-pill')?.classList.toggle('storm', race.weather === 'THUNDERSTORM');
    $('weather-pill')?.classList.toggle('windy', race.weather === 'STRONG WIND');
    $('race-card')?.classList.toggle('storm', race.weather === 'THUNDERSTORM');
    $('weather-dot').style.color = race.weather === 'THUNDERSTORM' ? '#a6c5ff' : '#72f0c4';
    $('music-toggle').textContent = state.audio ? '♫ ON' : '♫ OFF'; $('music-toggle').setAttribute('aria-label', state.audio ? 'Turn music off' : 'Turn music on');
    updatePairs(); renderHistory(); updatePhase(); save();
  }
  function updatePhase() {
    $('phase-title').textContent = phase === 'betting' ? 'Choose your pair' : phase === 'racing' ? 'Hold your nerve' : phase === 'lastOdds' ? 'Last odds · next race' : 'Official result';
    $('race-clock').textContent = phase === 'betting' ? 'BETTING OPEN' : phase === 'racing' ? 'RACE IN PROGRESS' : phase === 'result' && countdownAt ? `${Math.max(0,Math.ceil((countdownAt-performance.now())/1000))}s` : phase === 'lastOdds' ? 'LAST RESULT' : 'OFFICIAL RESULT';
    $('track-status').textContent = phase === 'racing' ? 'LIVE · SIX RIDERS' : phase === 'result' || phase === 'lastOdds' ? 'SECOND RIDER HOME' : 'SIDE VIEW · 6 RIDERS';
    $('race-button').disabled = phase !== 'betting';
    $('race-button').innerHTML = phase === 'betting' ? 'START RACE <span>›</span>' : phase === 'racing' ? 'RACING…' : phase === 'result' ? 'RESULT' : 'NEXT ODDS';
    $('bet-panel').classList.toggle('locked', phase !== 'betting');
    $('coin-in').disabled = phase==='racing'; $('coin-out').disabled = phase==='racing'; $('reset-game').disabled=phase==='racing'||(phase==='result'&&countdownAt>performance.now());
  }
  function updatePairs() {
    const grid = $('pair-grid');
    grid.innerHTML = race.pairs.slice().sort((a,b) => a.a-b.a || a.b-b.b).map(p => {
      const stake = pairStake(p.key);
      return `<button class="pair-card ${p.key === selected ? 'selected' : ''}" data-pair="${p.key}" aria-pressed="${p.key === selected}" ${phase !== 'betting' ? 'disabled' : ''}><span class="pair-top"><span class="pair-id">${p.a} – ${p.b}</span><span class="pair-odds">${p.odds}×</span></span><span class="pair-stake">BET <b>${stake}</b></span></button>`;
    }).join('');
    $('single-grid').innerHTML = race.singleOdds.map((odds,index)=>{const id=index+1,stake=singleBets[id]||0;return `<button class="pair-card ${id===selectedRunner?'selected':''}" data-runner="${id}" aria-pressed="${id===selectedRunner}" ${phase!=='betting'?'disabled':''}><span class="pair-top"><span class="pair-id">1ST · #${id}</span><span class="pair-odds">${odds}×</span></span><span class="pair-stake">BET <b>${stake}</b></span></button>`;}).join('');
    $('pair-grid').hidden=betMode!=='pair';$('single-grid').hidden=betMode!=='single';
    $('market-title').textContent=betMode==='pair'?'PICK YOUR TOP TWO':'PICK THE 1ST PLACE RIDER';
    $('market-help').textContent=betMode==='pair'?'Either order wins · odds lock at start':'Only the first finisher wins · odds lock at start';
    document.querySelectorAll('[data-market]').forEach(button=>{const active=button.dataset.market===betMode;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
  }
  function renderHistory() {
    $('history-list').innerHTML = state.history.length ? state.history.map(h => `<div class="history-item"><small>ROUND ${formatRound(h.round)}</small><b>${h.first}–${h.second}</b><small>PAIR ${h.odds}× · 1ST ${h.singleOdds||'—'}×</small><small>PAID ${h.payout}</small></div>`).join('') : '<span class="empty-history">Your latest five races appear here.</span>';
  }
  function changeStake(delta) {
    if (phase !== 'betting') return;
    const target=betMode==='pair'?bets:singleBets,key=betMode==='pair'?selected:selectedRunner,odd=betMode==='pair'?(race.odds[selected]||0):(race.singleOdds[selectedRunner-1]||0),old=target[key]||0;
    const liability=RaceCore.totalLiability(bets,race.odds)+RaceCore.totalSingleLiability(singleBets,race.singleOdds)-old*Math.max(0,odd-1),available=Math.max(0,state.houseReserve+1000000-liability);
    const next = Math.max(0, Math.min(RaceCore.maximumPairStake(old,state.coins,odd,available), old + delta));
    if (next > old && state.coins < next - old) return notice('Not enough virtual coins. Add coins or lower this stake.');
    state.coins += old - next; if (next) target[key] = next; else delete target[key];
    notice(next >= 100 ? 'This selection reached its 100-coin limit.' : `Stake updated. ${betMode==='pair'?'Pair':'first-place'} selections keep separate stakes.`); updateHud();
  }
  function newRound() {
    phase = 'betting'; state.round=state.roundsStarted+1; race = RaceCore.createRace(rng,state.pairHistory,state.historyRaces||0); outcome = null; bets = {}; singleBets = {}; selected = '1-2'; selectedRunner=1; betMode='pair'; fallenIds = []; motion=null;countdownAt=0;resultAt=0;
    stormNextFlash = 0; stormFlashUntil = 0;
    $('progress-fill').style.width = '0%'; $('finish-readout').classList.remove('show'); notice('Choose a pair, set its stake, then start the race.'); updateHud(); drawIdle();if(state.audio)startMusic('theme');
  }
  function startRace() {
    if (phase !== 'betting') return;
    const stakeTotal = totalStake();
    if(stakeTotal<1){notice('Select at least one pair and place a virtual coin stake before starting.');return;}
    try { RaceCore.rollingControl(race,bets,payoutWindow,70,rng,singleBets); }
    catch(error){notice(`Race could not start: ${error.message}`);return;}
    motion=RaceCore.prepareMotion(race,rng,33);
    raceDuration=motion.fullTicks*33;
    outcome={preIncidentOrder:race.preIncidentOrder.slice(),finishOrder:motion.finishOrder.slice()};
    fallenIds=race.hazard==='BIKE COLLISION'?(race.collisionRiders||[race.incidentHorse,race.collisionPartner]).slice():race.hazard!=='NONE'&&race.hazard!=='PIT STOP'?[race.incidentHorse]:[];
    race._incidentShown=false;
    const accounting=RaceCore.startRaceAccounting(state.coins,stakeTotal);
    state.roundsStarted++; state.round=state.roundsStarted; state.totalIn+=accounting.totalInDelta;
    state.houseReserve+=stakeTotal; raceStart=performance.now(); crossed=[];
    phase = 'racing'; notice('Race underway. Watch the riders fight for the finish.');
    updateHud(); cancelAnimationFrame(raf); raf = requestAnimationFrame(animate);
  }
  function finishRace(now = performance.now()) {
    phase = 'result';
    const eligible=motion.finishOrder.filter(id=>!fallenIds.includes(id));
    const first=eligible[0],second=eligible[1];
    if(!first||!second){phase='betting';notice('Race settlement stopped: fewer than two riders crossed. Please start a fresh race.');newRound();return;}
    outcome={...outcome,first,second,key:RaceCore.pairKey(first,second),odds:race.odds[RaceCore.pairKey(first,second)],singleOdds:race.singleOdds[first-1]};
    const { key, odds, singleOdds } = outcome;
    const pairPayout=RaceCore.payout(pairStake(key),odds),singlePayout=RaceCore.payout(singleBets[first]||0,singleOdds),payout=pairPayout+singlePayout;
    state.coins += payout; state.totalOut += payout; state.houseReserve-=payout;
    RaceCore.recordWindow(payoutWindow,totalStake(),payout);
    state.pairHistory=RaceCore.pairHistoryIncrement(state.pairHistory,first,second);state.historyRaces++;
    state.history.unshift({ round: state.round, first, second, odds, singleOdds, payout, weather: race.weather, incident: race.hazard }); state.history = state.history.slice(0,5);
    const collisionLabel=race.hazard==='BIKE COLLISION'?`BIKE COLLISION ×${RaceCore.collisionMultiplier(race)} · `:'';
    const card = $('finish-readout'); card.innerHTML = `<small>OFFICIAL FINISH</small><strong>1ST #${first} · 2ND #${second}</strong><small>${collisionLabel}PAIR ${key} · ${odds}× · 1ST #${first} ${singleOdds}×</small>`; card.classList.add('show');
    state.displayPayout=payout;resultAt=now;countdownAt=payout?now+10000:0;
    $('progress-fill').style.width = '100%'; notice(payout ? `OFFICIAL ${first}–${second} · PAIR ${odds}× · 1ST #${first} ${singleOdds}× · PAID ${payout}. Winner countdown: ${payout} → 0.` : `OFFICIAL ${first}–${second} · pair ${odds}× · first-place #${first} ${singleOdds}× · no matching stake.`);
    updateHud(); if(payout)startMusic('win');
    renderTrack(1, now, true);raf=requestAnimationFrame(animateAfterRace);
  }
  function animate(now) {
    if (phase !== 'racing') return;
    const elapsed=now-raceStart,tick=elapsed/33,progress=Math.min(1,elapsed/raceDuration),incidentTick=motion.incidentTick;
    $('race-clock').textContent=`${Math.max(0,(motion.finishTick-tick)*.033).toFixed(1)}s`;
    $('progress-fill').style.width=`${Math.min(100,tick/motion.finishTick*100)}%`;
    if(race.hazard!=='NONE'&&!race._incidentShown&&tick>=incidentTick){race._incidentShown=true;playIncidentCue(race.hazard);notice(race.hazard==='BIKE COLLISION'?`Bike collision: riders #${(race.collisionRiders||[race.incidentHorse,race.collisionPartner]).join(', #')} are out. Winning odds ×${RaceCore.collisionMultiplier(race)}.`:race.hazard==='PIT STOP'?`#${race.incidentHorse} loses time at a pit stop; the race continues.`:`#${race.incidentHorse} is out after ${race.hazard.toLowerCase()}. Race continues.`);}
    const activeCrossings=motion.finishOrder.filter(id=>!fallenIds.includes(id)&&tick>=motion.durations[id-1]);crossed=activeCrossings;
    renderTrack(progress,now,true);
    if(crossed.length>=2){finishRace(now);return;}
    raf = requestAnimationFrame(animate);
  }
  function animateAfterRace(now){if(phase==='result'&&countdownAt){const remaining=Math.max(0,Math.ceil((countdownAt-now)/1000));$('race-clock').textContent=`${remaining}s`;const left=Math.max(0,Math.ceil((state.displayPayout||0)*(countdownAt-now)/10000));const small=$('finish-readout').querySelector('small:last-child');if(small)small.textContent=`${race.hazard==='BIKE COLLISION'?`COLLISION ×${RaceCore.collisionMultiplier(race)} · `:''}PAIR ${outcome.key} ${outcome.odds}× · 1ST #${outcome.first} ${outcome.singleOdds}× · COUNTDOWN ${left} → 0`;if(now>=countdownAt){countdownAt=0;stopMusic();phase='lastOdds';resultAt=now;updatePhase();}else{raf=requestAnimationFrame(animateAfterRace);return;}}
    if(phase==='result'&&!countdownAt){if(now-resultAt>=1650){phase='lastOdds';resultAt=now;updatePhase();}else{raf=requestAnimationFrame(animateAfterRace);return;}}
    if(phase==='lastOdds'){if(now-resultAt>=2300){newRound();return;}$('race-clock').textContent='LAST RESULT';raf=requestAnimationFrame(animateAfterRace);}}
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width*dpr)), h = Math.max(1, Math.round(rect.height*dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr,0,0,dpr,0,0); return { w: rect.width, h: rect.height };
  }
  function renderTrack(progress = 0, now = 0, racing = false) {
    const {w,h} = fitCanvas(), storm = race.weather === 'THUNDERSTORM', wet = storm || race.weather === 'WET GRASS' || race.weather === 'LIGHT RAIN';
    const sky = ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,storm?'#182840':'#85b8c4'); sky.addColorStop(.42,storm?'#43555a':'#d5d7b2'); sky.addColorStop(.43,storm?'#345c3f':'#529052'); sky.addColorStop(1,wet?'#275f3c':'#7a6e43');
    ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
    if(storm){
      // Make the weather readable at a glance: layered storm clouds, rain, and
      // a bolt confined to the sky so the racing field stays legible.
      ctx.fillStyle='#111d2d';
      for(let i=0;i<9;i++){const cx=w*(i/8)+Math.sin(i*3.7)*w*.035,cy=h*(.055+(i%3)*.04),rx=w*(.11+(i%3)*.025),ry=h*(.055+(i%2)*.025);ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='rgba(186,211,255,.12)';ctx.beginPath();ctx.ellipse(w*.75,h*.13,w*.17,h*.08,0,0,Math.PI*2);ctx.fill();
      if(!stormNextFlash){stormBoltX=.68+Math.random()*.22;stormNextFlash=now+3600+Math.random()*3200;}
      if(now>=stormNextFlash){stormBoltX=.62+Math.random()*.3;stormFlashUntil=now+190;stormNextFlash=now+5200+Math.random()*6500;}
      const boltX=w*stormBoltX;
      ctx.save();ctx.shadowColor='#d9edff';ctx.shadowBlur=14;ctx.strokeStyle=now<stormFlashUntil?'#f1f8ff':'rgba(191,218,255,.38)';ctx.lineWidth=now<stormFlashUntil?3:1.4;
      ctx.beginPath();ctx.moveTo(boltX,h*.03);ctx.lineTo(boltX-w*.025,h*.105);ctx.lineTo(boltX+w*.008,h*.13);ctx.lineTo(boltX-w*.035,h*.235);ctx.stroke();ctx.restore();
      if(now<stormFlashUntil){ctx.fillStyle='rgba(220,235,255,.18)';ctx.fillRect(0,0,w,h);}
    }
    // Distant grandstand, rolling course details, and rail.
    ctx.fillStyle=storm?'#16262b':'#384942'; ctx.fillRect(0,h*.22,w,h*.16);
    ctx.fillStyle=storm?'#f2b764':'#e5d29a'; for(let i=0;i<32;i++){const x=(i*w/32+((progress*35)% (w/32)))%w;ctx.fillRect(x,h*.25+(i%3)*3,2,2);}
    const trackTop=.46, trackBottom=.96;
    ctx.fillStyle=wet?'#367745':'#907447'; ctx.fillRect(0,h*trackTop,w,h*(trackBottom-trackTop));
    // Continuous outside rails keep the six straight lanes legible on narrow screens.
    ctx.strokeStyle='rgba(231,226,188,.88)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,h*trackTop);ctx.lineTo(w,h*trackTop);ctx.moveTo(0,h*trackBottom);ctx.lineTo(w,h*trackBottom);ctx.stroke();
    // Lane marks/paint, subtle standing water on wet courses.
    for(let lane=1;lane<6;lane++){const y=h*(trackTop+(trackBottom-trackTop)*lane/6);ctx.strokeStyle='rgba(241,224,166,.52)';ctx.setLineDash([7,10]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.setLineDash([]);
    if(wet){for(let i=0;i<5;i++){const px=((i*91+progress*40)%w);ctx.fillStyle='rgba(165,216,205,.48)';ctx.beginPath();ctx.ellipse(px,h*(.52+(i%4)*.09),8,2,0,0,Math.PI*2);ctx.fill();}}
    if(storm){ctx.save();ctx.strokeStyle='rgba(206,225,247,.34)';ctx.lineWidth=.8;for(let i=0;i<54;i++){const x=(i*79+now*.16)%w,y=(i*43+now*.47)%h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+11);ctx.stroke();}ctx.restore();}
    if(race.weather==='STRONG WIND'){
      const direction=race.headwind?-1:1;ctx.save();ctx.strokeStyle='rgba(208,240,255,.46)';ctx.lineWidth=1;
      for(let i=0;i<18;i++){const x=((i*83+now*.19*direction)%w+w)%w,y=h*(.49+(i%6)*.082),len=12+race.windStrength*.18;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+direction*len,y-2);ctx.stroke();}
      ctx.restore();
    }
    // Start gate on left, finish line on right. The striped gate spans the full
    // six-lane field so the start is unmistakable even on a phone-sized canvas.
    const sx=w*.075, fx=w*.91, top=h*(trackTop-.02), bottom=h*(trackBottom+.02);
    ctx.fillStyle='#101a17';ctx.fillRect(sx-7,top,14,bottom-top);
    for(let y=top;y<bottom;y+=14){ctx.fillStyle=(Math.floor((y-top)/14)%2)?'#101a17':'#f4f0d8';ctx.fillRect(sx-5,y,10,7);}
    ctx.strokeStyle='#f4f0d8';ctx.lineWidth=2;ctx.strokeRect(sx-8,top,16,bottom-top);
    ctx.fillStyle='#e9edda';ctx.fillRect(fx-2,top,4,bottom-top);
    for(let y=top;y<bottom;y+=10){ctx.fillStyle=(Math.floor((y-top)/10)%2)?'#12201b':'#f4f0d8';ctx.fillRect(fx-3,y,6,5);}
    ctx.fillStyle='#f6f0ce';ctx.font='800 9px system-ui';ctx.fillText('START GATE',Math.max(3,sx-8),h*(trackTop-.04));ctx.textAlign='right';ctx.fillText('FINISH',Math.min(w-3,fx+15),h*(trackTop-.04));ctx.textAlign='left';
    const showPreIncidentOrder=!!(outcome&&race.incident&&!race._incidentShown);
    const orderIndex = outcome ? (showPreIncidentOrder?outcome.preIncidentOrder:outcome.finishOrder) : [1,2,3,4,5,6];
    const riderScale=Math.min(1,Math.max(.54,w/410));
    const riderMargin=(27*riderScale)/h;
    const laneYs=RaceCore.laneCenters(trackTop,trackBottom,riderMargin).map(y=>y*h);
    const grid=RaceCore.startingGrid(sx+12,laneYs);
    for(let id=1;id<=6;id++){
      const isFallen=fallenIds.includes(id)&&race._incidentShown;
      const preRank=outcome?.preIncidentOrder.indexOf(id) ?? id-1;
      const rank=orderIndex.indexOf(id), rankSafe=rank<0?id-1:rank;
      const lane=(id-1), y=laneYs[lane];
      let p;
      const inRace=racing && (phase==='racing' || phase==='result');
      if(inRace){
        const tick=Math.max(0,(now-raceStart)/33), isPit=id===race.incidentHorse&&race.hazard==='PIT STOP', loss=isPit?(race.incidentTimeLossTicks||130):0;
        const duration=isFallen?(motion?.preDurations[id-1]||1):(motion?.durations[id-1]||1), movingDuration=Math.max(1,duration-loss), mainTicks=Math.max(1,Math.ceil(movingDuration-motion.straightTicks));
        const eventTick=motion?.incidentTick||Infinity;
        if(isFallen)p=RaceCore.progressWithExtendedStraight(Math.min(tick,eventTick),mainTicks,motion.straightTicks,motion.surges[id-1],motion.tipRanks[id-1]);
        else if(isPit&&tick>=eventTick){const loss=race.incidentTimeLossTicks||130;p=tick<eventTick+loss?RaceCore.progressWithExtendedStraight(eventTick,mainTicks,motion.straightTicks,motion.surges[id-1],motion.tipRanks[id-1]):RaceCore.progressWithExtendedStraight(Math.min(duration,tick-loss),mainTicks,motion.straightTicks,motion.surges[id-1],motion.tipRanks[id-1]);}
        else p=RaceCore.progressWithExtendedStraight(Math.min(tick,duration),mainTicks,motion.straightTicks,motion.surges[id-1],motion.tipRanks[id-1]);
        p=.07+.93*Math.pow(Math.max(0,Math.min(1,p)),.88);
      } else p=.07;
      let x=inRace?sx+(fx-sx)*p:grid[lane].x,drawY=y;
      if(inRace&&race._incidentShown&&race.hazard==='BIKE COLLISION'&&(race.collisionRiders||[race.incidentHorse,race.collisionPartner]).includes(id)){
        const lead=motion.incidentHorse?motion.incidentHorse:race.incidentHorse,leadTick=Math.min((now-raceStart)/33,motion.incidentTick),leadMain=Math.max(1,Math.ceil(motion.preDurations[lead-1]-motion.straightTicks));
        const contactP=RaceCore.progressWithExtendedStraight(leadTick,leadMain,motion.straightTicks,motion.surges[lead-1],motion.tipRanks[lead-1]),contactX=sx+(fx-sx)*(.07+.93*Math.pow(Math.max(0,Math.min(1,contactP)),.88));
        const collisionPairs=RaceCore.collisionPairs(race),pairIndex=collisionPairs.findIndex(pair=>pair.includes(id));
        if(pairIndex>=0){const pair=collisionPairs[pairIndex],pairMid=(laneYs[pair[0]-1]+laneYs[pair[1]-1])/2;x=contactX+pairIndex*12;drawY=pairMid+(id===pair[0]?-5:5);}
        else{x=contactX-10;drawY=laneYs[id-1];}
      }
      drawCyclist(x,drawY,riderScale,id,now,inRace&&progress>.72,isFallen);
      if(isFallen&&race.hazard==='BIKE COLLISION'){
        const pulse=.55+.45*Math.sin(now/42+id);ctx.save();ctx.strokeStyle=`rgba(255,220,104,${pulse})`;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(x-8*riderScale,y-18*riderScale);ctx.lineTo(x+8*riderScale,y-6*riderScale);ctx.moveTo(x+8*riderScale,y-18*riderScale);ctx.lineTo(x-8*riderScale,y-6*riderScale);ctx.stroke();ctx.restore();
      }
    }
  }
  function drawCyclist(x,y,scale,id,now,sprint,fallen){
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,22,24,3,0,0,Math.PI*2);ctx.fill();
    const jersey=PALETTE[id-1];
    if(fallen){
      ctx.strokeStyle='#131d1d';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(-14,17,9,3,0,0,Math.PI*2);ctx.ellipse(14,17,9,3,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=jersey;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-5,13);ctx.lineTo(3,8);ctx.lineTo(9,15);ctx.stroke();
      ctx.fillStyle='#e1ad86';ctx.beginPath();ctx.arc(5,5,4,0,Math.PI*2);ctx.fill();
      drawPlate(0,3,id,jersey);ctx.restore();return;
    }
    const phase=(now/115+(id*.47))%(Math.PI*2), crankX=0, crankY=9, r=5.5;
    const rear={x:-15,y:14},front={x:15,y:14};
    ctx.strokeStyle='#182329';ctx.lineWidth=2.1;ctx.beginPath();ctx.arc(rear.x,rear.y,9,0,Math.PI*2);ctx.arc(front.x,front.y,9,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#bcd2cb';ctx.lineWidth=.6;for(const c of [rear,front]){for(let k=0;k<6;k++){const a=k*Math.PI/3+phase;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+8*Math.cos(a),c.y+8*Math.sin(a));ctx.stroke();}}
    ctx.strokeStyle=jersey;ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(rear.x,rear.y);ctx.lineTo(-5,4);ctx.lineTo(crankX,crankY);ctx.lineTo(rear.x,rear.y);ctx.moveTo(-5,4);ctx.lineTo(8,5);ctx.lineTo(front.x,front.y);ctx.stroke();
    const p1={x:crankX+Math.cos(phase)*r,y:crankY+Math.sin(phase)*r},p2={x:crankX-Math.cos(phase)*r,y:crankY-Math.sin(phase)*r};
    const hip={x:-2,y:sprint?1:-1};ctx.strokeStyle='#17222c';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(hip.x,hip.y);ctx.lineTo(-1,6);ctx.lineTo(p1.x,p1.y);ctx.moveTo(hip.x,hip.y);ctx.lineTo(3,6);ctx.lineTo(p2.x,p2.y);ctx.stroke();
    ctx.strokeStyle=jersey;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(hip.x,hip.y);ctx.lineTo(6,sprint?1:0);ctx.stroke();
    ctx.strokeStyle='#e0b18c';ctx.lineWidth=2.1;ctx.beginPath();ctx.moveTo(6,sprint?1:0);ctx.lineTo(11,4);ctx.lineTo(13,1);ctx.stroke();
    ctx.fillStyle='#e0b18c';ctx.beginPath();ctx.arc(7,-5,3.3,0,Math.PI*2);ctx.fill();ctx.fillStyle=jersey;ctx.beginPath();ctx.arc(7,-7,3.7,Math.PI,Math.PI*2);ctx.fill();
    drawPlate(0,1,id,jersey);
    ctx.restore();
  }
  function drawPlate(x,y,id,color){ctx.fillStyle=color;ctx.fillRect(x-7,y-6,14,13);ctx.strokeStyle='#101713';ctx.lineWidth=1.35;ctx.strokeRect(x-7,y-6,14,13);ctx.fillStyle='#09100d';ctx.font='900 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,x,y+.2);ctx.textAlign='left';ctx.textBaseline='alphabetic';}
  function drawIdle(){renderTrack(0,performance.now(),false);}
  function ensureAudio(){audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')return audioCtx.resume();return Promise.resolve();}
  function playNote(hz,when,duration,volume,wave='triangle'){if(!audioCtx||!hz)return;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=wave;osc.frequency.setValueAtTime(hz,when);gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(volume,when+.018);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(gain).connect(audioCtx.destination);osc.start(when);osc.stop(when+duration+.025);}
  const THEME_LEAD=[392,0,466,523,587,0,523,466,392,0,349,392,466,523,466,392],THEME_BASS=[98,0,0,0,116.54,0,0,0,130.81,0,0,0,116.54,0,0,0];
  const WIN_LEAD=[523,659,784,659,587,784,1047,784,659,784,988,784,698,880,1047,880,784,988,1175,988,880,1047,1319,1047,988,1175,1397,1175,1047,1319,1568,1319,1175,1397,1760,1568,1397,1568,1760,2093];
  function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=0;}}
  function musicTick(){if(!state.audio||!audioCtx)return;const win=musicMode==='win',incident=musicMode==='incident',lead=win?WIN_LEAD:incident?[392,330,262,220,196,220,262,196,174,196,220,174]:THEME_LEAD,step=musicStep,when=audioCtx.currentTime+.02;if(win&&step>=40){stopMusic();return;}if(incident&&step>=12){stopMusic();if(phase==='racing'&&state.audio)setTimeout(()=>startMusic('theme'),300);return;}const hz=lead[step%lead.length];playNote(hz,when,win?.20:incident?.16:.15,win?.052:incident?.052:.035,incident?'sawtooth':'triangle');if(!win&&!incident){const bass=THEME_BASS[step%THEME_BASS.length];playNote(bass,when,.27,.025,'sine');}musicStep++;}
  function startMusic(mode='theme'){if(!state.audio||!audioCtx)return;stopMusic();musicMode=mode;musicStep=0;musicTick();musicTimer=setInterval(musicTick,mode==='win'?250:mode==='incident'?180:200);}
  function playIncidentCue(){if(state.audio&&audioCtx)startMusic('incident');}
  function resetGame(){if(phase==='racing'||(phase==='result'&&countdownAt>performance.now()))return;const refund=totalStake();state.coins+=refund;bets={};singleBets={};state.houseReserve=Math.max(0,state.houseReserve);state.pairHistory=Array.from({length:6},()=>Array(6).fill(0));state.historyRaces=0;payoutWindow.length=0;newRound();notice('New game. Coin balance, race number and cumulative totals kept; unsettled bets refunded.');}
  $('pair-grid').addEventListener('click', e => {const card=e.target.closest('[data-pair]');if(!card||phase!=='betting')return;selected=card.dataset.pair;notice('Pair selected. Use + or − to set its separate stake.');updateHud();});
  $('single-grid').addEventListener('click',e=>{const card=e.target.closest('[data-runner]');if(!card||phase!=='betting')return;selectedRunner=Number(card.dataset.runner);notice(`Rider #${selectedRunner} selected for first place. Use + or − to set its stake.`);updateHud();});
  document.querySelectorAll('[data-market]').forEach(button=>button.addEventListener('click',()=>{if(phase!=='betting')return;betMode=button.dataset.market;notice(betMode==='pair'?'Top-two market selected.':'First-place market selected.');updateHud();}));
  $('stake-plus').addEventListener('click',()=>changeStake(1));$('stake-minus').addEventListener('click',()=>changeStake(-1));
  $('race-button').addEventListener('click',startRace);
  $('coin-in').addEventListener('click',()=>{if(phase==='betting'){state.coins+=10;notice('10 virtual coins added.');updateHud();}});
  $('coin-out').addEventListener('click',()=>{if(phase!=='racing'){state.coins=0;bets={};singleBets={};notice('Virtual coin balance returned to zero.');updateHud();}});
  $('reset-game').addEventListener('click',resetGame);
  $('music-toggle').addEventListener('click',async()=>{
    state.audio=!state.audio;
    if(state.audio){try{await ensureAudio();startMusic(phase==='result'&&countdownAt?'win':'theme');notice('Race music and effects are on.');}
      catch{state.audio=false;notice('This browser could not start audio. Check its sound permission and try again.');}}
    else{stopMusic();audioCtx?.suspend();notice('Race music is off.');}
    save();updateHud();
  });
  const showLastGame=()=>{const h=state.history[0];notice(h?`Last race ${formatRound(h.round)}: 1ST #${h.first}, 2ND #${h.second} · pair odds ${h.odds}× · payout ${h.payout} · ${h.weather} · ${h.incident}.`:'No completed races yet.');};
  $('last-game').addEventListener('click',showLastGame);$('last-game-inline').addEventListener('click',showLastGame);
  window.addEventListener('resize',drawIdle); window.addEventListener('orientationchange',()=>setTimeout(drawIdle,100));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('install-btn').hidden=true;});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stopMusic();audioCtx?.suspend();}
    else if(state.audio)ensureAudio().then(()=>startMusic(phase==='result'&&countdownAt?'win':'theme')).catch(()=>{});
  });
  if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js?v=20261111-r1').catch(()=>{});
  updateHud();drawIdle();
})();
