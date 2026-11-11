/* Browser port of the six-cyclist PC game's rules. Keep odds, rolling payout,
   reserve, incidents and crossing settlement in this one rules module. */
(function (root) {
  'use strict';
  const N = 6, START_COINS = 10, MAX_BET = 100, WINDOW_SIZE = 1000, COLLISION_PERCENT = 4;
  const ORIGINAL_ODDS = [3, 4, 5, 8, 10, 20, 30, 60, 80, 100, 125, 175, 250, 500, 1000];
  function adjustOddsByDigits(odds){if(odds<=0)throw new RangeError('Odds must be positive.');return odds<10?odds+2:odds<100?odds+20:odds<1000?odds+50:odds+500;}
  const PRICES = ORIGINAL_ODDS.map(adjustOddsByDigits).sort((a,b)=>a-b);
  const pairKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const pairs = () => { const out=[]; for(let a=1;a<=N;a++)for(let b=a+1;b<=N;b++)out.push({a,b,key:`${a}-${b}`}); return out; };
  function makeTips(rng) {
    const remaining=[1,2,3,4,5,6],values=Array(N).fill(0);
    for(let i=0;i<3;i++){const at=Math.floor(rng()*remaining.length),id=remaining.splice(at,1)[0];values[id-1]=i===0?96+Math.floor(rng()*5):i===1?90+Math.floor(rng()*5):58+Math.floor(rng()*8);}
    remaining.forEach(id=>values[id-1]=20+Math.floor(rng()*26));
    return {values};
  }
  function strengthsFor(tips,rng=Math.random,pairHistory=null,historicalRaces=0){
    let strengths=tips.values.map(value=>{const dayForm=(65+Math.floor(rng()*71))/100;return Math.max(1,Math.round((.78*Math.pow(value/100,2)+.22*dayForm*dayForm)*1e6));});
    if(!pairHistory||historicalRaces<=0)return strengths;
    const prior=pairProbabilities(strengths), influence=Math.min(.20,historicalRaces/(historicalRaces+12)*.20);
    strengths=strengths.map((strength,i)=>{let modeled=0,observed=0;for(let j=0;j<N;j++)if(j!==i){modeled+=prior[`${Math.min(i+1,j+1)}-${Math.max(i+1,j+1)}`]||0;observed+=pairHistory[i][j]||0;}
      const smooth=(observed+12*modeled)/(historicalRaces+12);return Math.max(1,Math.round(strength*Math.pow(smooth/modeled,influence)));});
    return strengths;
  }
  function allOrders(weights,visit){const order=[],used=Array(N).fill(false);function walk(p){if(order.length===N){visit(order.slice(),p);return;}const total=weights.reduce((s,w,i)=>s+(used[i]?0:w),0);for(let i=0;i<N;i++)if(!used[i]){used[i]=true;order.push(i+1);walk(p*weights[i]/total);order.pop();used[i]=false;}}walk(1);}
  function pairProbabilities(weights){const probs=Object.fromEntries(pairs().map(p=>[p.key,0]));allOrders(weights,(order,p)=>{probs[pairKey(order[0],order[1])]+=p;});return probs;}
  function drawOrderForPair(weights,a,b,rng){const remaining=Array.from({length:N},(_,i)=>i+1).filter(id=>id!==a&&id!==b),order=rng()<weights[a-1]/(weights[a-1]+weights[b-1])?[a,b]:[b,a];
    while(remaining.length){const total=remaining.reduce((s,id)=>s+weights[id-1],0);let draw=rng()*total,at=0;while(at<remaining.length-1&&(draw-=weights[remaining[at]-1])>0)at++;order.push(remaining.splice(at,1)[0]);}return order;}
  function drawFinishOrderFromPairs(weights,probs,rng=Math.random){let draw=rng(),picked=pairs().at(-1);for(const p of pairs()){draw-=probs[p.key];if(draw<0){picked=p;break;}}return drawOrderForPair(weights,picked.a,picked.b,rng);}
  function pricesFor(probs){const ps=pairs();ps.sort((x,y)=>probs[y.key]-probs[x.key]||x.a-y.a||x.b-y.b);const prices=PRICES,odds={};ps.forEach((p,i)=>odds[p.key]=prices[i]);return odds;}
  function roundToEven(value){const floor=Math.floor(value),fraction=value-floor;if(fraction<.5)return floor;if(fraction>.5)return floor+1;return floor%2===0?floor:floor+1;}
  function singleOddsForStrengths(weights){const total=weights.reduce((sum,value)=>sum+value,0);return weights.map(value=>adjustOddsByDigits(Math.max(1,roundToEven(total/value))));}
  function tipRankings(tips){return tips.values.map((v,i)=>({id:i+1,v})).sort((a,b)=>b.v-a.v||a.id-b.id).map(x=>x.id);}
  function makeCard(rng,pairHistory,historicalRaces){
    const tips=makeTips(rng),weights=strengthsFor(tips,rng,pairHistory,historicalRaces),probabilities=pairProbabilities(weights),baseOdds=pricesFor(probabilities),odds={...baseOdds},baseSingleOdds=singleOddsForStrengths(weights),singleOdds=baseSingleOdds.slice();
    const finish=drawFinishOrderFromPairs(weights,probabilities,rng),preIncidentOrder=finish.slice(),weatherRoll=Math.floor(rng()*100);
    const weather=weatherRoll<50?'DRY DIRT':weatherRoll<72?'LIGHT RAIN':weatherRoll<90?'WET GRASS':weatherRoll<96?'THUNDERSTORM':'STRONG WIND';
    const slipPercent=weather==='DRY DIRT'?6:weather==='LIGHT RAIN'?12:weather==='WET GRASS'?16:weather==='STRONG WIND'?10:8;
    const windStrength=weather==='STRONG WIND'?65+Math.floor(rng()*36):0,headwind=rng()<.5;
    const windResistance=Array.from({length:N},()=>35+Math.floor(rng()*61));
    const incidentRoll=Math.floor(rng()*100),incidentPercent=25+slipPercent;
    let bookie=-1,slipped=-1,incidentOriginalRank=-1,hazard='NONE',incidentHorse=-1,collisionPartner=-1,pitStopHorse=-1;
    if(incidentRoll<25||incidentRoll<incidentPercent){incidentHorse=finish[0];incidentOriginalRank=0;if(incidentRoll<25){bookie=incidentHorse;hazard='BOOKIE TRIP';}else{slipped=incidentHorse;hazard=Math.floor(rng()*4)===0?'JOCKEY FALL':weather==='DRY DIRT'?['PUDDLE','LOOSE STONE','POTHOLE'][Math.floor(rng()*3)]:(Math.floor(rng()*4)===0?'SOFT BARRIER':'PUDDLE');}}
    else if((()=>{const rank=tipRankings(tips),key=pairKey(finish[0],finish[1]);return odds[key]>=250&&(rank.indexOf(finish[0])>=3||rank.indexOf(finish[1])>=3);})()) hazard=weather==='DRY DIRT'?['PUDDLE','LOOSE STONE','POTHOLE'][Math.floor(rng()*3)]:(Math.floor(rng()*4)===0?'SOFT BARRIER':'PUDDLE');
    else if(weather==='THUNDERSTORM'&&Math.floor(rng()*100)<35){hazard='THUNDER STARTLE';incidentOriginalRank=0;}
    else if(Math.floor(rng()*100)<2){hazard='PIT STOP';pitStopHorse=preIncidentOrder[0];}
    if(hazard!=='NONE')incidentHorse=bookie>=0?bookie:slipped>=0?slipped:pitStopHorse>=0?pitStopHorse:preIncidentOrder[0];
    const card={tips,weights,probabilities,baseOdds,odds,baseSingleOdds,singleOdds,finish,preIncidentOrder,weather,windStrength,headwind,windResistance,hazard,incidentHorse,collisionPartner,collisionRiders:[],pitStopHorse,bookie,slipped,incidentOriginalRank};
    if(Math.floor(rng()*100)<COLLISION_PERCENT)configureCollision(card,2+Math.floor(rng()*3));
    return card;
  }
  function createRace(rng=Math.random,pairHistory=null,historicalRaces=0){const card=makeCard(rng,pairHistory,historicalRaces);card.pairs=pairs().map(p=>({...p,odds:card.odds[p.key],chance:card.probabilities[p.key]}));card.tips={values:card.tips.values,starter:tipRankings(card.tips)[0],finisher:tipRankings(card.tips)[1],sprint:tipRankings(card.tips)[2]};return card;}
  function payout(stake,odds){return Math.floor(Math.max(0,stake)*Math.max(0,odds));}
  function collisionMultiplier(card){return card&&card.hazard==='BIKE COLLISION'?Math.max(2,Math.min(4,(card.collisionRiders||[]).length||2)):1;}
  function configureCollision(card,groupSize){if(!card||!Array.isArray(card.preIncidentOrder)||card.preIncidentOrder.length!==N)throw new TypeError('A complete six-rider card is required.');const size=clamp(Math.trunc(Number(groupSize)||2),2,4);card.collisionRiders=card.preIncidentOrder.slice(0,size);card.incidentHorse=card.collisionRiders[0];card.collisionPartner=card.collisionRiders[1];card.incidentOriginalRank=0;card.hazard='BIKE COLLISION';card.bookie=-1;card.slipped=-1;card.pitStopHorse=-1;card.baseOdds=card.baseOdds||{...card.odds};card.baseSingleOdds=card.baseSingleOdds||card.singleOdds.slice();card.odds=Object.fromEntries(Object.entries(card.baseOdds).map(([key,value])=>[key,value*size]));card.singleOdds=card.baseSingleOdds.map(value=>value*size);return card;}
  function collisionPairs(card){const riders=card&&card.collisionRiders||[];if(riders.length===3)return [[riders[1],riders[2]]];const out=[];for(let i=0;i+1<riders.length;i+=2)out.push([riders[i],riders[i+1]]);return out;}
  function disqualified(card,id){return card&&card.hazard==='BIKE COLLISION'&&(card.collisionRiders||[card.incidentHorse,card.collisionPartner]).includes(id);}
  function totalBets(bets,singleBets={}){return pairs().reduce((s,p)=>s+Math.max(0,Number(bets[p.key])||0),0)+Array.from({length:N},(_,i)=>Math.max(0,Number(singleBets[i+1])||0)).reduce((a,b)=>a+b,0);}
  function totalLiability(bets,odds){return pairs().reduce((s,p)=>s+(Number(bets[p.key])||0)*Math.max(0,(odds[p.key]||0)-1),0);}
  function totalSingleLiability(singleBets,odds){return Array.from({length:N},(_,i)=>Math.max(0,Number(singleBets[i+1])||0)*Math.max(0,(odds[i]||0)-1)).reduce((a,b)=>a+b,0);}
  function maximumPairStake(current,coins,odd,reserve){const already=clamp(current,0,MAX_BET),playerRoom=Math.min(MAX_BET-already,Math.max(0,coins));const houseRoom=odd<=1?MAX_BET:Math.floor(Math.max(0,reserve)/(odd-1));return already+Math.min(playerRoom,houseRoom);}
  function createPayoutWindow(rounds=[]){const data=rounds.slice(-WINDOW_SIZE).map(r=>[Math.max(0,+r[0]||0),Math.max(0,+r[1]||0)]);return data;}
  function windowTotals(window){return window.reduce((a,r)=>[a[0]+r[0],a[1]+r[1]],[0,0]);}
  function windowForNext(window){const rounds=window.slice(-WINDOW_SIZE),totals=windowTotals(rounds);if(rounds.length===WINDOW_SIZE){totals[0]-=rounds[0][0];totals[1]-=rounds[0][1];}return totals;}
  function expectedPayout(window,coinIn,target=70){if(coinIn<=0)return 0;const [ins,outs]=windowForNext(window),settled=window.length===WINDOW_SIZE?WINDOW_SIZE-1:window.length,remaining=Math.max(1,WINDOW_SIZE-settled),overshoot=outs-ins*target/100;return Math.max(0,Math.min(coinIn*.85,coinIn*target/100-overshoot/remaining));}
  function minPayout(window,coinIn){const [ins,outs]=windowForNext(window);return Math.max(0,Math.ceil((ins+coinIn)*.55-outs));}
  function maxPayout(window,coinIn){const [ins,outs]=windowForNext(window);return Math.max(0,Math.floor((ins+coinIn)*.85-outs));}
  function withIncidentOrder(order,card){if(card.hazard==='BIKE COLLISION'){const involved=card.collisionRiders||[card.incidentHorse,card.collisionPartner],set=new Set(involved);return [...involved,...order.filter(id=>!set.has(id))];}const affected=card.incidentHorse;if(affected<0||card.hazard==='NONE')return order.slice();return [affected,...order.filter(id=>id!==affected)];}
  function baseFinishTicks(order){const ticks=Array(N).fill(0);order.forEach((id,rank)=>{const factor=rank===0?.91:rank===1?1:1.035+(rank-2)*.035;ticks[id-1]=1000*factor;});return ticks;}
  function expectedPairPayout(card,bets,singleBets,pair){const pairPay=payout(bets[pair.key]||0,card.odds[pair.key]),a=pair.a-1,b=pair.b-1,total=Math.max(1,card.weights[a]+card.weights[b]);return pairPay+(card.weights[a]*payout(singleBets[pair.a]||0,card.singleOdds[a])+card.weights[b]*payout(singleBets[pair.b]||0,card.singleOdds[b]))/total;}
  function rollingControl(card,bets,window,target=70,rng=Math.random,singleBets={}){
    const original={...card.probabilities},base={...original},inAmount=totalBets(bets,singleBets),minimum=minPayout(window,inAmount),maximum=maxPayout(window,inAmount),expected=expectedPayout(window,inAmount,target);
    let minObserved=Infinity,maxObserved=0;
    for(const p of pairs()){const pay=expectedPairPayout(card,bets,singleBets,p);if(disqualified(card,p.a)||disqualified(card,p.b)||pay>maximum||pay<minimum)base[p.key]=0;else{minObserved=Math.min(minObserved,pay);maxObserved=Math.max(maxObserved,pay);}}
    const sum=()=>Object.values(base).reduce((a,b)=>a+b,0);let baseTotal=sum();
    if(baseTotal<=0&&minimum>0){for(const p of pairs()){const pay=expectedPairPayout(card,bets,singleBets,p);base[p.key]=disqualified(card,p.a)||disqualified(card,p.b)||pay>maximum?0:original[p.key];}baseTotal=sum();minObserved=Infinity;maxObserved=0;for(const p of pairs())if(base[p.key]>0){const pay=expectedPairPayout(card,bets,singleBets,p);minObserved=Math.min(minObserved,pay);maxObserved=Math.max(maxObserved,pay);}}
    if(baseTotal<=0)throw new Error('No finish pair fits the current rolling payout window.');
    for(const p of pairs())base[p.key]/=baseTotal;
    const targetPay=clamp(expected,minObserved===Infinity?0:minObserved,maxObserved);
    const mean=temp=>{let total=0,weighted=0,scale=Math.max(1,...pairs().map(p=>expectedPairPayout(card,bets,singleBets,p)));for(const p of pairs()){const pay=expectedPairPayout(card,bets,singleBets,p),w=base[p.key]*Math.exp(temp*pay/scale);total+=w;weighted+=w*pay;}return [weighted/total,total];};
    let low=-60,high=60;for(let i=0;i<90;i++){const mid=(low+high)/2;if(mean(mid)[0]<targetPay)low=mid;else high=mid;}
    const temp=(low+high)/2,weighted={};let total=0;for(const p of pairs()){const pay=expectedPairPayout(card,bets,singleBets,p);weighted[p.key]=base[p.key]*Math.exp(temp*pay/Math.max(1,...pairs().map(q=>expectedPairPayout(card,bets,singleBets,q))));total+=weighted[p.key];}for(const p of pairs())card.probabilities[p.key]=weighted[p.key]/total;
    const drawn=drawFinishOrderFromPairs(card.weights,card.probabilities,rng),pre=withIncidentOrder(drawn,card);card.preIncidentOrder=pre;
    const ticks=baseFinishTicks(pre),affected=card.incidentHorse;if(affected>=0&&card.hazard!=='NONE'){
      if(card.hazard==='PIT STOP'){card.incidentTimeLossTicks=130+Math.floor(rng()*31);ticks[affected-1]+=card.incidentTimeLossTicks;}else ticks[affected-1]=Number.MAX_VALUE;
      if(card.hazard==='BIKE COLLISION')for(const id of card.collisionRiders||[affected,card.collisionPartner])ticks[id-1]=Number.MAX_VALUE;
    }
    card.finish=ticks.map((t,i)=>({id:i+1,t})).sort((a,b)=>a.t-b.t||a.id-b.id).map(x=>x.id);
    return card;
  }
  function recordWindow(window,coinIn,coinOut){window.push([coinIn,coinOut]);while(window.length>WINDOW_SIZE)window.shift();return window;}
  function windAdjustedDuration(base,weather,strength,headwind,resistance,tuck){if(weather!=='STRONG WIND')return base;const intensity=clamp(strength,0,100)/100,exposed=1-clamp(resistance,0,100)/100,t=clamp(tuck,0,1);const factor=headwind?1+intensity*(.025+.075*exposed)*(1-.45*t):1-intensity*(.012+.035*exposed)*(1-.25*t);return base*clamp(factor,.94,1.10);}
  function raceDurationMilliseconds(rng=Math.random){return (455+Math.floor(rng()*303))*33+8000;}
  function progressAt(tick,duration,startingGap=0,surge=0,tipRank=3){const start=clamp(startingGap,0,.2),d=Math.max(1,duration);if(tick>=d)return 1;const time=clamp(tick/d,0,1),eased=time*time*(3-2*time),pulse=clamp(surge,-.04,.04)*16*time*time*(1-time)*(1-time);let tipPulse=0;if(tipRank===0){const launch=clamp(time/.34,0,1),taper=clamp((.58-time)/.24,0,1);tipPulse=.045*launch*launch*(3-2*launch)*taper;}else if(tipRank===1)tipPulse=.028*Math.sin(Math.PI*time);else if(tipRank===2){const sprint=clamp((time-.62)/.38,0,1);tipPulse=.07*sprint*sprint*(3-2*sprint);}return clamp(start+(1-start)*eased+pulse+tipPulse,start,.995);}
  function progressWithExtendedStraight(tick,mainTicks,straightTicks,surge,tipRank){const main=Math.max(1,mainTicks),straight=Math.max(1,straightTicks);if(tick<main)return progressAt(tick,main,0,surge,tipRank)*.72;const time=clamp((tick-main)/straight,0,1),eased=time*time*(3-2*time);return .72+.28*eased;}
  function prepareMotion(card,rng=Math.random,timerMs=33){const order=card.preIncidentOrder,tips=tipRankings(card.tips),ranks=Array(N);tips.forEach((id,i)=>ranks[id-1]=i);const full=Math.ceil(raceDurationMilliseconds(rng)/timerMs),straight=Math.ceil(8000/timerMs),course=Math.max(1,full-straight-2),pre=Array(N),duration=Array(N),surges=Array(N);
    order.forEach((id,rank)=>{const factor=rank===0?.91:rank===1?1:1.035+(rank-2)*.035,base=Math.max(1,course*factor+straight),tuck=rank<3?.75:.35;pre[id-1]=windAdjustedDuration(base,card.weather,card.windStrength,card.headwind,card.windResistance[id-1],tuck);duration[id-1]=pre[id-1];surges[id-1]=rng()*.08-.04;});
    const fallAt=Math.ceil(full*.55),affected=card.incidentHorse-1;if(affected>=0&&card.hazard!=='NONE'){if(card.hazard==='PIT STOP')duration[affected]+=card.incidentTimeLossTicks||130;else duration[affected]=Number.MAX_VALUE;if(card.hazard==='BIKE COLLISION')for(const id of card.collisionRiders||[card.incidentHorse,card.collisionPartner])duration[id-1]=Number.MAX_VALUE;}
    // This mobile port settles from the same finish schedule that drives the
    // crossing animation. Preserve the PC result contract after weather and
    // collision penalties have been applied, including ties with stable IDs.
    const scheduled=Array.isArray(card.finish)?card.finish.slice():duration.map((d,i)=>({id:i+1,d})).sort((a,b)=>a.d-b.d||a.id-b.id).map(x=>x.id);
    const actual=scheduled.filter(id=>duration[id-1]!==Number.MAX_VALUE).concat(scheduled.filter(id=>duration[id-1]===Number.MAX_VALUE));
    let last=0;actual.forEach((id,rank)=>{if(duration[id-1]===Number.MAX_VALUE)return;const predicted=duration[id-1],minimum=last+Math.max(1,timerMs?1:1);duration[id-1]=Math.max(minimum,predicted);last=duration[id-1];});
    return {fullTicks:full,straightTicks:straight,courseTicks:course,preDurations:pre,durations:duration,surges,tipRanks:ranks,incidentTick:fallAt,finishOrder:actual,finishTick:Math.ceil(duration[actual[1]-1]),scheduledOrder:scheduled};}
  function progressWithIncident(motion,card,id,tick,incidentTriggered=false){const i=id-1,d=Math.max(1,motion.preDurations[i]),main=Math.max(1,Math.ceil(d)-motion.straightTicks);let p=progressAt(tick,main,motion.straightTicks,motion.surges[i],motion.tipRanks[i]);if(card.incidentHorse===id&&!incidentTriggered&&card.hazard!=='NONE')p=Math.min(.55,p+.07*Math.pow(clamp(tick/d,0,1),2)*(3-2*clamp(tick/d,0,1)));return p;}
  function payoutForPair(bets,key,odds){return payout(bets[key]||0,odds[key]||0);}
  function pairHistoryIncrement(history,first,second){const h=history.map(row=>row.slice()),a=first-1,b=second-1;h[a][b]++;h[b][a]=h[a][b];return h;}
  function resolveOutcome(race,order,incident){const finishOrder=incident?normalizeIncidentOrder(order,incident):order.slice(),first=finishOrder[0],second=finishOrder[1],key=pairKey(first,second);return Object.freeze({finishOrder:Object.freeze(finishOrder),first,second,key,odds:race.odds[key]||0,withdrawn:Object.freeze(incident?(incident.type==='BIKE COLLISION'?order.slice(0,2):order.slice(0,1)):[]),incident});}
  function normalizeIncidentOrder(order,incident){if(!incident)return order.slice();return order.slice(incident.type==='BIKE COLLISION'?2:1).concat(order.slice(0,incident.type==='BIKE COLLISION'?2:1));}
  function startRaceAccounting(balance,totalStake){return {balance:Math.max(0,Math.trunc(Number(balance)||0)),totalInDelta:Math.max(0,Math.trunc(Number(totalStake)||0))};}
  function startingGrid(startX,laneYs){return laneYs.map(y=>({x:startX,y}));}
  function laneCenters(top,bottom,margin,count=N){const first=Number(top)+Math.max(0,Number(margin)||0),last=Number(bottom)-Math.max(0,Number(margin)||0);if(first>last||count<1)throw Error('Track must have room for every rider.');return Array.from({length:count},(_,i)=>count===1?(first+last)/2:first+(last-first)*i/(count-1));}
  function finishProgress(rank){return .82+Math.max(0,Number(rank)||0)*.045;}
  function riderRaceProgress(progress,rank){return clamp((Number(progress)||0)/finishProgress(rank),0,1);}
  function riderRaceProgressForOrder(order,id,progress){const rank=order.indexOf(id);return riderRaceProgress(progress,rank<0?order.length:rank);}
  function getPairOdds(race,a,b){return race.odds[pairKey(a,b)]||0;}
  root.RaceCore={N,START_COINS,MAX_BET,WINDOW_SIZE,COLLISION_PERCENT,PRICES,ORIGINAL_ODDS,pairKey,pairs,makeTips,strengthsFor,pairProbabilities,drawFinishOrder:drawFinishOrderFromPairs,drawFinishOrderFromPairs,pricesFor,adjustOddsByDigits,roundToEven,singleOddsForStrengths,tipRankings,createRace,makeCard,configureCollision,collisionMultiplier,collisionPairs,disqualified,payout,totalBets,totalLiability,totalSingleLiability,maximumPairStake,createPayoutWindow,windowTotals,expectedPayout,minPayout,maxPayout,rollingControl,recordWindow,windAdjustedDuration,raceDurationMilliseconds,progressAt,progressWithExtendedStraight,prepareMotion,progressWithIncident,payoutForPair,pairHistoryIncrement,normalizeIncidentOrder,resolveOutcome,getPairOdds,startRaceAccounting,startingGrid,laneCenters,finishProgress,riderRaceProgress,riderRaceProgressForOrder};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.RaceCore;
})(typeof globalThis!=='undefined'?globalThis:this);
