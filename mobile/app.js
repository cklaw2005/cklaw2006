(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('race-canvas'), ctx = canvas.getContext('2d');
  const PALETTE = ['#f0f4f4','#ed4f9b','#ff644e','#3989ff','#ffd347','#38c88e'];
  const STORE_KEY = 'krace-mobile-v1';
  const initial = { round: 1, coins: 10, totalIn: 0, totalOut: 0, history: [], audio: false };
  let state;
  try { state = { ...initial, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { state = { ...initial }; }
  // Audio needs a user gesture after every reload. Avoid restoring a stale ON label.
  state.audio = false;
  state.round = Math.max(1, Number(state.round) || 1); state.coins = Math.max(0, Number(state.coins) || 0);
  state.history = Array.isArray(state.history) ? state.history.slice(0, 5) : [];
  let race = RaceCore.createRace(), outcome = null, bets = {}, selected = '1-2', phase = 'betting';
  let raceStart = 0, raceDuration = 25000, fallenId = 0, fallAt = 0, audioCtx = null, musicTimer = 0, musicStep = 0, raf = 0, deferredInstall = null;
  let stormNextFlash = 0, stormFlashUntil = 0, stormBoltX = .76;

  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, audio: false })); } catch { notice('Progress could not be saved by this browser.'); } }
  function notice(text) { $('notice').textContent = text; }
  function formatRound(n) { return String(n).padStart(3, '0'); }
  function pairStake(key) { return bets[key] || 0; }
  function updateHud() {
    $('round-number').textContent = formatRound(state.round); $('coin-balance').textContent = state.coins;
    $('races-played').textContent = Math.max(0, state.round - 1); $('selected-stake').textContent = pairStake(selected);
    $('total-stake').textContent = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
    $('tip-starter').textContent = race.tips.starter; $('tip-finisher').textContent = race.tips.finisher; $('tip-sprint').textContent = race.tips.sprint;
    $('weather-label').textContent = race.weather; $('weather-pill')?.classList.toggle('storm', race.weather === 'THUNDERSTORM');
    $('race-card')?.classList.toggle('storm', race.weather === 'THUNDERSTORM');
    $('weather-dot').style.color = race.weather === 'THUNDERSTORM' ? '#a6c5ff' : '#72f0c4';
    $('music-toggle').textContent = state.audio ? '♫ ON' : '♫ OFF'; $('music-toggle').setAttribute('aria-label', state.audio ? 'Turn music off' : 'Turn music on');
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
    phase = 'betting'; race = RaceCore.createRace(); outcome = null; bets = {}; selected = '1-2'; fallenId = 0; fallAt = 0;
    stormNextFlash = 0; stormFlashUntil = 0;
    $('progress-fill').style.width = '0%'; $('finish-readout').classList.remove('show'); notice('Choose a pair, then set your virtual coin stake.'); updateHud(); drawIdle();
  }
  function startRace() {
    if (phase === 'result') { state.round++; newRound(); return; }
    if (phase !== 'betting') return;
    const stakeTotal = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
    const accounting = RaceCore.startRaceAccounting(state.coins, stakeTotal);
    const drawnOrder = RaceCore.drawFinishOrder(race);
    fallenId = race.incident ? drawnOrder[0] : 0;
    outcome = RaceCore.resolveOutcome(race, drawnOrder, race.incident);
    state.coins = accounting.balance; state.totalIn += accounting.totalInDelta; raceStart = performance.now();
    raceDuration = 23000 + Math.floor(Math.random() * 10001); fallAt = raceDuration * (race.incident?.trigger || 1);
    phase = 'racing'; notice(race.incident ? `A sudden ${race.incident.type.toLowerCase()} — the rider is withdrawn.` : 'No incident this race. The order is decided on the course.');
    updateHud(); playCue('start'); cancelAnimationFrame(raf); raf = requestAnimationFrame(animate);
  }
  function finishRace(now = performance.now()) {
    phase = 'result';
    const { first, second, key, odds } = outcome;
    const payout = RaceCore.payout(pairStake(key), odds);
    state.coins += payout; state.totalOut += payout;
    state.history.unshift({ round: state.round, first, second, odds, payout, weather: race.weather, incident: race.incident?.type || 'NONE' }); state.history = state.history.slice(0,5);
    const card = $('finish-readout'); card.innerHTML = `<small>OFFICIAL FINISH</small><strong>1ST #${first} · 2ND #${second}</strong><small>PAIR ${key} · ${odds}×</small>`; card.classList.add('show');
    $('progress-fill').style.width = '100%'; notice(payout ? `Winning pair ${first}–${second} · ${odds}× odds · ${payout} virtual coins paid.` : `Official result ${first}–${second} · winning odds ${odds}× · no matching stake.`);
    updateHud(); playCue(payout ? 'win' : 'finish');
    // Keep the camera on the actual finish instead of resetting the riders to the start.
    renderTrack(RaceCore.finishProgress(1), now, true);
  }
  function animate(now) {
    if (phase !== 'racing') return;
    const elapsed = now - raceStart, progress = Math.min(1, elapsed / raceDuration);
    const cutoff = RaceCore.finishProgress(1), cutoffTime = raceDuration * cutoff;
    $('race-clock').textContent = `${Math.max(0, (cutoffTime - elapsed) / 1000).toFixed(1)}s`;
    $('progress-fill').style.width = `${Math.min(100, progress / cutoff * 100)}%`;
    if (fallenId && !race._incidentShown && elapsed >= fallAt) { race._incidentShown = true; playCue('fall'); }
    renderTrack(progress, now, true);
    if (progress >= cutoff) { finishRace(now); return; }
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
    // Start gate on left, finish line on right. The striped gate spans the full
    // six-lane field so the start is unmistakable even on a phone-sized canvas.
    const sx=w*.075, fx=w*.91, top=h*(trackTop-.02), bottom=h*(trackBottom+.02);
    ctx.fillStyle='#101a17';ctx.fillRect(sx-7,top,14,bottom-top);
    for(let y=top;y<bottom;y+=14){ctx.fillStyle=(Math.floor((y-top)/14)%2)?'#101a17':'#f4f0d8';ctx.fillRect(sx-5,y,10,7);}
    ctx.strokeStyle='#f4f0d8';ctx.lineWidth=2;ctx.strokeRect(sx-8,top,16,bottom-top);
    ctx.fillStyle='#e9edda';ctx.fillRect(fx-2,top,4,bottom-top);
    for(let y=top;y<bottom;y+=10){ctx.fillStyle=(Math.floor((y-top)/10)%2)?'#12201b':'#f4f0d8';ctx.fillRect(fx-3,y,6,5);}
    ctx.fillStyle='#f6f0ce';ctx.font='800 9px system-ui';ctx.fillText('START GATE',Math.max(3,sx-8),h*(trackTop-.04));ctx.textAlign='right';ctx.fillText('FINISH',Math.min(w-3,fx+15),h*(trackTop-.04));ctx.textAlign='left';
    const orderIndex = outcome ? outcome.finishOrder : [1,2,3,4,5,6];
    const riderScale=Math.min(1,Math.max(.54,w/410));
    const riderMargin=(27*riderScale)/h;
    const laneYs=RaceCore.laneCenters(trackTop,trackBottom,riderMargin).map(y=>y*h);
    const grid=RaceCore.startingGrid(sx+12,laneYs);
    for(let id=1;id<=6;id++){
      const rank=orderIndex.indexOf(id), rankSafe=rank<0?id-1:rank;
      const lane=(id-1), y=laneYs[lane], isFallen=id===fallenId && race._incidentShown;
      let p;
      const inRace=racing && (phase==='racing' || phase==='result');
      if(inRace){
        const raceProgress=isFallen?Math.min(progress,fallAt/raceDuration):progress;
        const riderProgress=RaceCore.riderRaceProgressForOrder(orderIndex,id,raceProgress);
        p=.07+.93*Math.pow(riderProgress,.88);
        if(!isFallen && raceProgress>=RaceCore.finishProgress(rankSafe))p=Math.min(1.04,p+.028);
      } else p=.07;
      const x=inRace?sx+(fx-sx)*p:grid[lane].x;
      drawCyclist(x,y,riderScale,id,now,inRace&&progress>.72,isFallen);
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
  function drawPlate(x,y,id,color){ctx.fillStyle=color;ctx.fillRect(x-5,y-4,10,9);ctx.strokeStyle='#101713';ctx.lineWidth=1.2;ctx.strokeRect(x-5,y-4,10,9);ctx.fillStyle='#09100d';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,x,y+.2);ctx.textAlign='left';ctx.textBaseline='alphabetic';}
  function drawIdle(){renderTrack(0,performance.now(),false);}
  function ensureAudio(){
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')return audioCtx.resume();
    return Promise.resolve();
  }
  function playNote(hz, when, duration, volume, wave='triangle'){
    if(!audioCtx||!hz)return;
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(hz,when);
    gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(volume,when+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(gain).connect(audioCtx.destination);osc.start(when);osc.stop(when+duration+.025);
  }
  const MUSIC_LEAD=[392,0,466,523,587,0,523,466,392,0,349,392,466,523,466,392];
  const MUSIC_BASS=[98,0,0,0,116.54,0,0,0,130.81,0,0,0,116.54,0,0,0];
  function musicTick(){
    if(!state.audio||!audioCtx)return;
    const step=musicStep%MUSIC_LEAD.length,when=audioCtx.currentTime+.025;
    playNote(MUSIC_LEAD[step],when,.15,.035,'triangle');
    playNote(MUSIC_BASS[step],when,.28,.025,'sine');
    musicStep++;
  }
  function startMusic(){if(musicTimer)clearInterval(musicTimer);musicStep=0;musicTick();musicTimer=setInterval(musicTick,200);}
  function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=0;}}
  function audioCue(type){
    if(!state.audio)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();
      const tones=type==='win'?[523,659,784,1047]:type==='fall'?[240,170]:type==='start'?[390,520]:[440,660];
      tones.forEach((hz,i)=>playNote(hz,audioCtx.currentTime+i*.11,.16,.065,'triangle'));
    }catch{/* Audio is optional; the game remains playable without it. */}
  }
  function playCue(type){audioCue(type);}
  $('pair-grid').addEventListener('click', e => {const card=e.target.closest('[data-pair]');if(!card||phase!=='betting')return;selected=card.dataset.pair;notice('Pair selected. Use + or − to set its separate stake.');updateHud();});
  $('stake-plus').addEventListener('click',()=>changeStake(1));$('stake-minus').addEventListener('click',()=>changeStake(-1));
  $('race-button').addEventListener('click',startRace);
  $('coin-in').addEventListener('click',()=>{if(phase==='betting'){state.coins+=10;notice('10 virtual coins added.');updateHud();}});
  $('coin-out').addEventListener('click',()=>{if(phase==='betting'){const total=Object.values(bets).reduce((s,n)=>s+n,0);state.coins+=total;bets={};notice('Uncommitted stakes returned to your wallet.');updateHud();}});
  $('music-toggle').addEventListener('click',async()=>{
    state.audio=!state.audio;
    if(state.audio){try{await ensureAudio();startMusic();notice('Race music is on. Tap the music button again to stop it.');}
      catch{state.audio=false;notice('This browser could not start audio. Check its sound permission and try again.');}}
    else{stopMusic();notice('Race music is off.');}
    save();updateHud();
  });
  $('last-game').addEventListener('click',()=>{const h=state.history[0];notice(h?`Last race ${formatRound(h.round)}: ${h.first}–${h.second} · ${h.odds}× · payout ${h.payout}.`:'No completed races yet.');});
  window.addEventListener('resize',drawIdle); window.addEventListener('orientationchange',()=>setTimeout(drawIdle,100));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('install-btn').hidden=true;});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stopMusic();if(audioCtx?.state==='running')audioCtx.suspend();}
    else if(state.audio&&audioCtx){audioCtx.resume().then(startMusic).catch(()=>{});}
  });
  if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js?v=20261105-r5').catch(()=>{});
  updateHud();drawIdle();
})();

