(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('race-canvas'), ctx = canvas.getContext('2d');
  const PALETTE = ['#f0f4f4','#ed4f9b','#ff644e','#3989ff','#ffd347','#38c88e'];
  const STORE_KEY = 'krace-mobile-v1';
  const initial = { round: 1, coins: 10, totalIn: 0, totalOut: 0, history: [], audio: false };
  let state;
  try { state = { ...initial, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { state = { ...initial }; }
  state.round = Math.max(1, Number(state.round) || 1); state.coins = Math.max(0, Number(state.coins) || 0);
  state.history = Array.isArray(state.history) ? state.history.slice(0, 5) : [];
  let race = RaceCore.createRace(), order = null, bets = {}, selected = '1-2', phase = 'betting';
  let raceStart = 0, raceDuration = 25000, fallenId = 0, fallAt = 0, roundTones = null, audioCtx = null, raf = 0, deferredInstall = null;

  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { notice('Progress could not be saved by this browser.'); } }
  function notice(text) { $('notice').textContent = text; }
  function formatRound(n) { return String(n).padStart(3, '0'); }
  function pairStake(key) { return bets[key] || 0; }
  function updateHud() {
    $('round-number').textContent = formatRound(state.round); $('coin-balance').textContent = state.coins;
    $('races-played').textContent = Math.max(0, state.round - 1); $('selected-stake').textContent = pairStake(selected);
    $('total-stake').textContent = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
    $('tip-starter').textContent = race.tips.starter; $('tip-finisher').textContent = race.tips.finisher; $('tip-sprint').textContent = race.tips.sprint;
    $('weather-label').textContent = race.weather; $('weather-pill')?.classList.toggle('storm', race.weather === 'THUNDERSTORM');
    $('weather-dot').style.color = race.weather === 'THUNDERSTORM' ? '#a6c5ff' : '#72f0c4';
    $('music-toggle').textContent = state.audio ? '♫' : '♪'; $('music-toggle').setAttribute('aria-label', state.audio ? 'Turn music off' : 'Turn music on');
    updatePairs(); renderHistory(); updatePhase(); save();
  }
  function updatePhase() {
    $('phase-title').textContent = phase === 'betting' ? 'Choose your pair' : phase === 'racing' ? 'Hold your nerve' : 'Race complete';
    $('race-clock').textContent = phase === 'betting' ? 'BETTING OPEN' : phase === 'racing' ? 'RACE IN PROGRESS' : 'OFFICIAL RESULT';
    $('track-status').textContent = phase === 'racing' ? 'FINAL STRAIGHT · SPRINT' : phase === 'result' ? 'SECOND RIDER HOME' : 'SIDE VIEW · 6 RIDERS';
    $('race-button').disabled = phase === 'racing';
    $('race-button').innerHTML = phase === 'betting' ? 'BET NOW <span>›</span>' : phase === 'racing' ? 'RACING…' : 'NEXT ROUND <span>›</span>';
    $('bet-panel').classList.toggle('locked', phase === 'racing' || phase === 'result');
    $('coin-in').disabled = phase !== 'betting'; $('coin-out').disabled = phase !== 'betting';
  }
  function updatePairs() {
    const grid = $('pair-grid');
    grid.innerHTML = race.pairs.slice().sort((a,b) => a.a-b.a || a.b-b.b).map(p => {
      const stake = pairStake(p.key);
      return `<button class="pair-card ${p.key === selected ? 'selected' : ''}" data-pair="${p.key}" aria-pressed="${p.key === selected}" ${phase !== 'betting' ? 'disabled' : ''}><span class="pair-top"><span class="pair-id">${p.a} – ${p.b}</span><span class="pair-odds">${p.odds}×</span></span><span class="pair-stake">BET <b>${stake}</b></span></button>`;
    }).join('');
  }
  function renderHistory() {
    $('history-list').innerHTML = state.history.length ? state.history.map(h => `<div class="history-item"><small>ROUND ${formatRound(h.round)}</small><b>${h.first}–${h.second}</b><small>${h.odds}× · +${h.payout}</small></div>`).join('') : '<span class="empty-history">Your latest five races appear here.</span>';
  }
  function changeStake(delta) {
    if (phase !== 'betting') return;
    const old = pairStake(selected), next = Math.max(0, Math.min(100, old + delta));
    if (next > old && state.coins < next - old) return notice('Not enough virtual coins. Add coins or lower this stake.');
    state.coins += old - next; if (next) bets[selected] = next; else delete bets[selected];
    notice(next >= 100 ? 'This pair reached its 100-coin limit.' : 'Stake updated. Each pair keeps its own stake.'); updateHud();
  }
  function newRound() {
    phase = 'betting'; race = RaceCore.createRace(); order = null; bets = {}; selected = '1-2'; fallenId = 0; fallAt = 0;
    $('progress-fill').style.width = '0%'; $('finish-readout').classList.remove('show'); notice('Choose a pair, then set your virtual coin stake.'); updateHud(); drawIdle();
  }
  function startRace() {
    if (phase === 'result') { state.round++; newRound(); return; }
    if (phase !== 'betting') return;
    const stakeTotal = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
    if (stakeTotal > state.coins) return notice('Your total stake is higher than your coin balance.');
    order = RaceCore.drawFinishOrder(race);
    fallenId = race.incident ? order[0] : 0;
    // The incident changes the real finish order: a withdrawn rider cannot be one of the finishers.
    const activeOrder = fallenId ? order.slice(1) : order.slice();
    const finishOrder = activeOrder.concat(fallenId ? [fallenId] : []);
    order = finishOrder;
    state.coins -= stakeTotal; state.totalIn += stakeTotal; raceStart = performance.now();
    raceDuration = 23000 + Math.floor(Math.random() * 10001); fallAt = raceDuration * (race.incident?.trigger || 1);
    if (fallenId) {
      // Show the incident during the race, but retain the generated order of all other riders.
      const split = order.indexOf(fallenId); order.splice(split, 1); order.push(fallenId);
    }
    phase = 'racing'; notice(race.incident ? `A sudden ${race.incident.type.toLowerCase()} — the rider is withdrawn.` : 'No incident this race. The order is decided on the course.');
    updateHud(); playCue('start'); cancelAnimationFrame(raf); raf = requestAnimationFrame(animate);
  }
  function finishRace() {
    phase = 'result';
    const first = order[0], second = order[1], key = RaceCore.pairKey(first, second), odds = RaceCore.getPairOdds(race, first, second);
    const payout = RaceCore.payout(pairStake(key), odds);
    state.coins += payout; state.totalOut += payout;
    state.history.unshift({ round: state.round, first, second, odds, payout, weather: race.weather, incident: race.incident?.type || 'NONE' }); state.history = state.history.slice(0,5);
    const card = $('finish-readout'); card.textContent = `🏁  ${first} – ${second}  ·  ${odds}×`; card.classList.add('show');
    $('progress-fill').style.width = '100%'; notice(payout ? `Winning pair ${first}–${second} · ${odds}× odds · ${payout} virtual coins paid.` : `Official result ${first}–${second} · winning odds ${odds}× · no matching stake.`);
    updateHud(); playCue(payout ? 'win' : 'finish');
  }
  function animate(now) {
    if (phase !== 'racing') return;
    const elapsed = now - raceStart, progress = Math.min(1, elapsed / raceDuration);
    $('race-clock').textContent = `${Math.max(0, (raceDuration - elapsed) / 1000).toFixed(1)}s`;
    $('progress-fill').style.width = `${Math.min(100, progress * 100)}%`;
    if (fallenId && !race._incidentShown && elapsed >= fallAt) { race._incidentShown = true; playCue('fall'); }
    renderTrack(progress, now, true);
    if (elapsed >= raceDuration) { finishRace(); drawIdle(); return; }
    raf = requestAnimationFrame(animate);
  }
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
    // Distant grandstand, rolling course details, and rail.
    ctx.fillStyle=storm?'#16262b':'#384942'; ctx.fillRect(0,h*.22,w,h*.16);
    ctx.fillStyle=storm?'#f2b764':'#e5d29a'; for(let i=0;i<32;i++){const x=(i*w/32+((progress*35)% (w/32)))%w;ctx.fillRect(x,h*.25+(i%3)*3,2,2);}
    ctx.fillStyle=wet?'#367745':'#907447'; ctx.fillRect(0,h*.49,w,h*.43);
    // Lane marks/paint, subtle standing water on wet courses.
    for(let lane=1;lane<6;lane++){const y=h*(.49+lane*.071);ctx.strokeStyle='rgba(241,224,166,.52)';ctx.setLineDash([7,10]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.setLineDash([]);
    if(wet){for(let i=0;i<5;i++){const px=((i*91+progress*40)%w);ctx.fillStyle='rgba(165,216,205,.48)';ctx.beginPath();ctx.ellipse(px,h*(.52+(i%4)*.09),8,2,0,0,Math.PI*2);ctx.fill();}}
    // Start gate on left, finish line on right.
    const sx=w*.075, fx=w*.91, top=h*.47, bottom=h*.94;
    ctx.fillStyle='#e9edda';ctx.fillRect(sx-2,top,4,bottom-top);ctx.fillRect(fx-2,top,4,bottom-top);
    for(let y=top;y<bottom;y+=10){ctx.fillStyle=(Math.floor((y-top)/10)%2)?'#12201b':'#f4f0d8';ctx.fillRect(fx-3,y,6,5);}
    ctx.fillStyle='#f6f0ce';ctx.font='700 8px system-ui';ctx.fillText('START',Math.max(3,sx-13),h*.45);ctx.textAlign='right';ctx.fillText('FINISH',Math.min(w-3,fx+15),h*.45);ctx.textAlign='left';
    const orderIndex = order ? order : [1,2,3,4,5,6];
    for(let id=1;id<=6;id++){
      const rank=orderIndex.indexOf(id), rankSafe=rank<0?id-1:rank;
      const lane=(id-1), y=h*(.535+lane*.071), isFallen=id===fallenId && race._incidentShown;
      let p;
      if(phase==='racing'&&racing){
        const finishRank=fallenId?(rankSafe+1):rankSafe;
        const rankOffset=(5-finishRank)*.055;
        p=Math.min(.99,Math.pow(progress,.78)*(0.72+rankOffset));
        if(finishRank===0)p=Math.min(.99,progress*.89+rankOffset*.15);
        if(finishRank===1)p=Math.min(.99,progress*.84+rankOffset*.11);
        if(progress>.72)p=Math.min(.99,p+(progress-.72)*.42);
        if(isFallen)p=Math.min(.8,Math.pow(fallAt/raceDuration,.78)*(0.72+rankOffset));
      } else p=.07+lane*.012;
      const x=sx+(fx-sx)*p;
      drawCyclist(x,y,Math.min(1,Math.max(.54,w/410)),id,now,phase==='racing'&&progress>.72,isFallen);
    }
    if(storm){ctx.fillStyle='rgba(9,20,30,.17)';ctx.fillRect(0,0,w,h);if(progress>.15 && progress<.45 && Math.floor(now/750)%6===0){ctx.fillStyle='rgba(215,232,255,.18)';ctx.fillRect(0,0,w,h);}}
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
  function drawPlate(x,y,id,color){ctx.fillStyle=color;ctx.fillRect(x-5,y-4,10,9);ctx.strokeStyle='#101713';ctx.lineWidth=1.2;ctx.strokeRect(x-5,y-4,10,9);ctx.fillStyle='#09100d';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,x,y+.2);ctx.textAlign='left';ctx.textBaseline='alphabetic';}
  function drawIdle(){renderTrack(0,performance.now(),false);}
  function audioCue(type){
    if(!state.audio)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();
      const tones=type==='win'?[523,659,784,1047]:type==='fall'?[240,170]:type==='start'?[390,520]:[440,660];
      tones.forEach((hz,i)=>{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='triangle';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,audioCtx.currentTime+i*.11);gain.gain.exponentialRampToValueAtTime(.08,audioCtx.currentTime+i*.11+.02);gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+i*.11+.16);osc.connect(gain).connect(audioCtx.destination);osc.start(audioCtx.currentTime+i*.11);osc.stop(audioCtx.currentTime+i*.11+.18);});
    }catch{/* Audio is optional; the game remains playable without it. */}
  }
  function playCue(type){audioCue(type);}
  $('pair-grid').addEventListener('click', e => {const card=e.target.closest('[data-pair]');if(!card||phase!=='betting')return;selected=card.dataset.pair;notice('Pair selected. Use + or − to set its separate stake.');updateHud();});
  $('stake-plus').addEventListener('click',()=>changeStake(1));$('stake-minus').addEventListener('click',()=>changeStake(-1));
  $('race-button').addEventListener('click',startRace);
  $('coin-in').addEventListener('click',()=>{if(phase==='betting'){state.coins+=10;notice('10 virtual coins added.');updateHud();}});
  $('coin-out').addEventListener('click',()=>{if(phase==='betting'){const total=Object.values(bets).reduce((s,n)=>s+n,0);state.coins+=total;bets={};notice('Uncommitted stakes returned to your wallet.');updateHud();}});
  $('music-toggle').addEventListener('click',()=>{state.audio=!state.audio;save();updateHud();if(state.audio)playCue('start');});
  $('last-game').addEventListener('click',()=>{const h=state.history[0];notice(h?`Last race ${formatRound(h.round)}: ${h.first}–${h.second} · ${h.odds}× · payout ${h.payout}.`:'No completed races yet.');});
  window.addEventListener('resize',drawIdle); window.addEventListener('orientationchange',()=>setTimeout(drawIdle,100));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('install-btn').hidden=true;});
  if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
  updateHud();drawIdle();
})();

