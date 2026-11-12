import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePhrase, ExerciseSession, heldCorrectly, normalizeTraining, loadTraining, hardestBar, saveReplay, replayPhrase, slowerReplayTempo, comparisonSetup, rememberTrainingResult, RHYTHM_LEVELS } from '../js/training.js';
import { groupSessions } from '../js/training-history.js';
import { copyDefaults } from '../js/quiz.js';
import { makeTone } from '../js/notes.js';
import { renderScore } from '../js/score.js';
const C=makeTone(0,0,4), D=makeTone(1,0,4);
const phrase=(rhythm=false)=>({events:[{id:0,bar:0,beat:0,durationBeats:2,tone:C,rest:false,clef:'treble'},{id:1,bar:0,beat:2,durationBeats:1,tone:D,rest:false,clef:'treble'},{id:2,bar:0,beat:3,durationBeats:1,tone:null,rest:true,clef:'treble'}],meter:4,bars:1,totalBeats:4,clef:'treble',rhythm});
const note=(session,type,n,timeStamp)=>session.input({type,note:n,channel:0,timeStamp});

test('generated rhythms fill every bar and melodies contain only selected pitches and spellings',()=>{
 let seed=42;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(const meter of [3,4])for(const complexity of Object.keys(RHYTHM_LEVELS))for(const clef of ['treble','bass','mixed']){
  const settings=normalizeTraining({meter,complexity,bars:8});const q={...copyDefaults(),clef,noteNames:['D♭'],octaves:{treble:[5],bass:[2]}};
  const p=generatePhrase(settings,q,{random,clefIndex:1});
  for(let bar=0;bar<8;bar++){const events=p.events.filter(e=>e.bar===bar);assert.equal(events.reduce((sum,e)=>sum+e.durationBeats,0),meter);assert.ok(events.some(e=>!e.rest));}
  assert.ok(p.events.filter(e=>!e.rest).every(e=>e.tone.name==='D♭'&&e.tone.octave===(p.clef==='treble'?5:2)));
  assert.equal(p.clef,clef==='mixed'?'bass':clef);
 }
});
test('half notes require two beats, not one, and hold tolerance is independent of tempo',()=>{
 assert.equal(heldCorrectly(1000,2000),false);assert.equal(heldCorrectly(2000,2000),true);assert.equal(heldCorrectly(2900,2000),false);assert.equal(heldCorrectly(1900,2000),true);
});
test('continuous practice scores pitch, onset and duration separately and detects missed notes',()=>{
 const s=new ExerciseSession(phrase(),{bpm:60});s.startTime=1000;
 note(s,'on',60,1040);note(s,'off',60,3040);note(s,'on',63,3000);note(s,'off',63,3500);s.tick(6000);
 const r=s.summary(6000);assert.equal(r.pitch,50);assert.equal(r.onset,100);assert.equal(r.holds,50);assert.equal(r.missed,0);
 const missed=new ExerciseSession(phrase());missed.startTime=1000;missed.tick(6000);assert.equal(missed.summary().missed,2);
});
test('late delivery uses event timestamps and can replace a provisional missed marker',()=>{
 const s=new ExerciseSession(phrase(),{bpm:60,offset:80});s.startTime=1000;s.tick(1300);
 note(s,'on',60,1110);note(s,'off',60,3110);assert.equal(s.results.get(0).onset,true);assert.equal(s.results.get(0).error,30);assert.equal(s.results.get(0).duration,true);
});
test('rhythm accepts any pitch but counts extra attacks and held keys through rests',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',90,1000);note(s,'off',90,3000);note(s,'on',10,3000);note(s,'off',10,4000);note(s,'on',60,4300);note(s,'off',60,4400);s.tick(6000);
 const r=s.summary(6000);assert.equal(r.pitch,null);assert.equal(r.holds,100);assert.equal(r.onset,100);assert.equal(r.extras,1);assert.equal(r.restErrors,1);
});
test('guided practice retries wrong pitches and one-beat C, then advances after a two-beat C',()=>{
 const s=new ExerciseSession(phrase(),{guided:true});s.startTime=1000;
 note(s,'on',61,1000);note(s,'off',61,1050);assert.equal(s.current.id,0);
 note(s,'on',60,1100);note(s,'off',60,2100);assert.equal(s.current.id,0);assert.match(s.feedback,/Too short/);
 note(s,'on',60,2200);s.tick(4200);assert.equal(s.feedback,'Release now.');note(s,'off',60,4200);assert.equal(s.current.id,1);
 note(s,'on',62,4300);note(s,'off',62,5300);assert.equal(s.current.rest,true);s.tick(5300);s.tick(6300);assert.equal(s.done,true);
 const r=s.summary();assert.equal(r.retries,2);assert.equal(r.pitch,50);assert.equal(r.holds,50);assert.equal(r.onset,null);
});
test('pause restarts the interrupted bar while preserving completed bars',()=>{
 const p=phrase();p.bars=2;p.totalBeats=8;p.events.push(...p.events.map(e=>({...e,id:e.id+3,bar:1,beat:e.beat+4})));
 const s=new ExerciseSession(p);s.startTime=1000;note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',62,3000);note(s,'off',62,4000);s.tick(5500);assert.equal(s.restartBar(5500),1);assert.equal(s.results.get(0).duration,true);assert.equal(s.results.has(3),false);assert.equal(s.keys.size,0);
});
test('score renders distinct note values, rests and accidental cancellation without Unicode music glyphs',()=>{
 const p=phrase();p.events[0].tone=makeTone(0,1,4);p.events[1].tone=C;
 const svg=renderScore(p,0,new Map(),0);assert.match(svg,/score-head-open/);assert.match(svg,/♯/);assert.match(svg,/♮/);assert.match(svg,/Bar 1 of 1/);assert.match(svg,/data-cursor/);assert.ok(!/[\u{1D100}-\u{1D1FF}]/u.test(svg));
});

test('count-in presses cannot claim a note and restarting a bar clears its extra attacks',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,800);note(s,'off',60,1000);assert.equal(s.results.size,0);
 note(s,'on',60,1500);note(s,'off',60,1600);assert.equal(s.extras,1);
 assert.equal(s.restartBar(1700),0);assert.equal(s.extras,0);
});

test('beginner timing accepts a small human delay but still rejects half-length holds',()=>{
 const s=new ExerciseSession(phrase(true),{accuracy:'beginner'});s.startTime=1000;
 note(s,'on',60,1180);note(s,'off',60,2820);
 assert.equal(s.results.get(0).duration,true);assert.equal(s.results.get(0).status,'correct');
 assert.equal(heldCorrectly(1000,2000,'beginner'),false);
 assert.equal(heldCorrectly(75,150,'beginner'),false);
 const strict=new ExerciseSession(phrase(true));strict.startTime=1000;note(strict,'on',60,1180);assert.equal(strict.results.size,0);
});
test('an accepted attack remains pending until release and reports actual hold length',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,1000);s.tick(3500);
 assert.equal(s.results.get(0).status,'holding');assert.equal(s.results.get(0).duration,null);
 assert.equal(s.feedback,'Release now.');
 note(s,'off',60,3600);assert.equal(s.results.get(0).status,'wrong');assert.match(s.feedback,/held 2.6 of 2.0 beats/);
});
test('slightly early first notes use the same timing window as later notes',()=>{
 const s=new ExerciseSession(phrase(true),{accuracy:'beginner'});s.startTime=1000;
 note(s,'on',60,850);note(s,'off',60,2850);
 assert.equal(s.results.get(0).status,'correct');assert.equal(s.results.get(0).error,-150);
});
test('practice pacing previews each new bar for a full count-in without marking it missed',()=>{
 const p=phrase(true);p.bars=2;p.totalBeats=8;p.events.push(...p.events.map(e=>({...e,id:e.id+3,bar:1,beat:e.beat+4})));
 const s=new ExerciseSession(p,{pace:'practice',accuracy:'beginner'});s.startTime=1000;
 note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',60,3000);note(s,'off',60,4000);
 s.tick(5000);assert.equal(s.position(5000).preparing,true);assert.equal(s.position(5000).bar,1);assert.equal(s.position(5000).remaining,4);
 assert.equal(s.current.id,3);assert.equal(s.results.has(3),false);assert.equal(s.expected(p.events[3]),9000);
 note(s,'on',60,6000);note(s,'off',60,6050);assert.equal(s.extras,0);
 s.tick(8999);assert.equal(s.results.has(3),false);
 note(s,'on',60,9000);note(s,'off',60,11000);assert.equal(s.results.get(3).status,'correct');
 assert.equal(s.restartBar(11500),1);s.startTime=15000;assert.equal(s.expected(p.events[3]),15000);
});

test('only unreleased final notes fail at the end; valid releases stay correct',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',62,3000);
 s.tick(7000);assert.equal(s.done,true);assert.equal(s.results.get(0).status,'correct');assert.equal(s.results.get(1).status,'wrong');
 assert.equal(s.position(5500).beat,4);assert.equal(s.position(5500).preparing,false);
});

test('sight-reading rolls back the entire failed bar and ignores keys during its retry count-in',()=>{
 const p=phrase();p.bars=2;p.totalBeats=8;p.events.push(...p.events.map(e=>({...e,id:e.id+3,bar:1,beat:e.beat+4})));
 const s=new ExerciseSession(p,{retryOnError:true});s.startTime=1000;
 note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',62,3000);note(s,'off',62,4000);
 s.tick(5100);note(s,'on',60,5000);note(s,'off',60,7000);note(s,'on',63,7000);
 assert.equal(s.failure.reason,'Wrong note');assert.equal(s.failure.bar,1);
 s.retryBar(7000,9000);assert.equal(s.startBar,1);assert.equal(s.current.id,3);assert.equal(s.results.has(3),false);assert.equal(s.results.get(0).status,'correct');assert.equal(s.barFailures,1);
 note(s,'off',63,7100);note(s,'on',60,8500);note(s,'off',60,8600);s.tick(8900);
 assert.equal(s.results.has(3),false);assert.equal(s.failure,null);assert.equal(s.startTime,9000);
 note(s,'on',60,9000);note(s,'off',60,11000);assert.equal(s.results.get(3).status,'correct');
});
test('timed sight-reading rejects off-beat, missed, too-short and too-long notes',()=>{
 for(const scenario of ['offbeat','missed','short','long']){
  const s=new ExerciseSession(phrase(),{retryOnError:true});s.startTime=1000;
  if(scenario==='offbeat')note(s,'on',60,1400);
  if(scenario==='missed')s.tick(1140);
  if(scenario==='short'){note(s,'on',60,1000);note(s,'off',60,2000);}
  if(scenario==='long'){note(s,'on',60,1000);s.tick(3350);}
  assert.ok(s.failure,scenario);assert.equal(s.failure.bar,0);s.retryBar(3400,5000);assert.equal(s.current.id,0);assert.equal(s.results.size,0);assert.equal(s.holding.size,0);
 }
});
test('sight-reading detects both attacks and held keys during rests',()=>{
 for(const held of [false,true]){
  const s=new ExerciseSession(phrase(),{retryOnError:true});s.startTime=1000;
  note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',62,3000);
  if(!held){note(s,'off',62,4000);note(s,'on',60,4200);}else s.tick(4120);
  assert.equal(s.failure.reason,'Played during a rest');
 }
});
test('a previous-bar release mistake restarts that bar even after the cursor crosses the barline',()=>{
 const p=phrase();p.events=p.events.filter(e=>!e.rest);p.events[1].durationBeats=2;p.bars=2;p.totalBeats=8;p.events.push(...p.events.map(e=>({...e,id:e.id+2,bar:1,beat:e.beat+4})));
 const s=new ExerciseSession(p,{retryOnError:true});s.startTime=1000;
 note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',62,3000);s.tick(5020);note(s,'off',62,5350);
 assert.equal(s.failure.bar,0);s.retryBar(5350,9000);assert.equal(s.current.id,0);assert.equal(s.results.size,0);
});
test('session report retains earlier pitch, timing and missed-note failures after a clean replay',()=>{
 const p=phrase();p.bars=2;p.totalBeats=8;p.events.push(...p.events.map(e=>({...e,id:e.id+3,bar:1,beat:e.beat+4})));
 const s=new ExerciseSession(p,{retryOnError:true});s.startTime=1000;
 note(s,'on',63,950);s.retryBar(950,5000);
 s.tick(5150);s.retryBar(5150,9000);
 note(s,'on',60,9400);s.retryBar(9400,13000);
 for(const [at,pitch,length] of [[13050,60,2000],[15000,62,1000],[17000,60,2000],[19000,62,1000]]){
  note(s,'on',pitch,at);note(s,'off',pitch,at+length);
 }
 s.tick(21600);
 const result=s.summary(21600),[first,second]=result.report.bars;
 assert.equal(result.retries,3);assert.equal(result.pitch,100);assert.equal(result.holds,100);
 assert.deepEqual(first.issues,{pitch:1,missed:1,offBeat:1,short:0,long:0,rest:0});
 assert.deepEqual(first.timing,{early:1,centered:1,late:1,absoluteMs:100});
 assert.equal(first.retries,3);assert.equal(second.retries,0);
 assert.equal(result.report.elapsedMs,20650);
 const storage = value => ({getItem:()=>JSON.stringify({activity:'sight',lastResult:value})});
 assert.deepEqual(loadTraining(storage(result)).lastResult.report,result.report);
 const {report,...legacy}=result;
 assert.deepEqual(loadTraining(storage(legacy)).lastResult,legacy);
 assert.deepEqual(loadTraining(storage({...legacy,report:{...report,bars:[null,null]}})).lastResult,legacy);
});
test('pauses preserve sight-reading failures and exclude paused time and the resume count-in',()=>{
 const s=new ExerciseSession(phrase(),{retryOnError:true});s.startTime=1000;
 note(s,'on',63,1050);s.retryBar(1050,5000);
 s.pauseRun(1600);s.restartBar(1600);
 s.startTime=10000;s.tick(9950);s.tick(10000);note(s,'on',60,10000);note(s,'off',60,12000);
 assert.equal(s.summary(12000).report.elapsedMs,2600);
 assert.equal(s.summary(12000).report.bars[0].issues.pitch,1);
 assert.equal(s.retries,1);
});
test('saved drills reconstruct the original bar, including spelling, register, rests and durations',()=>{
 const settings=normalizeTraining({bars:2,meter:3,bpm:90,complexity:'steady',offset:30,input:'midi'});
 const p=generatePhrase(settings,{...copyDefaults(),clef:'bass',noteNames:['D♭'],octaves:{bass:[2]}},{random:()=>0});
 const s=new ExerciseSession(p,{retryOnError:true});s.startTime=1000;
 s.input({type:'on',note:60,timeStamp:1000,channel:0});
 s.retryBar(1000,4000);
 const result={...s.summary(1100),replay:saveReplay(p,settings)};
 const load=lastResult=>loadTraining({getItem:()=>JSON.stringify({activity:'sight',lastResult})}).lastResult;
 const saved=load(result);
 assert.equal(hardestBar(saved),0);
 assert.equal(slowerReplayTempo(saved.replay.bpm),72);assert.equal(slowerReplayTempo(40),40);
 const bar=replayPhrase(saved,0);
 assert.equal(bar.clef,'bass');assert.equal(bar.bars,1);assert.equal(bar.totalBeats,3);
 assert.deepEqual(bar.events,p.events.filter(e=>e.bar===0));
 assert.deepEqual(replayPhrase(saved,1).events,p.events.filter(e=>e.bar===1).map((e,id)=>({...e,id,bar:0,beat:e.beat-3})));
 assert.ok(bar.events.some(e=>e.rest));assert.ok(bar.events.some(e=>e.tone?.name==='D♭'&&e.tone.octave===2));
 const invalid=structuredClone(result);invalid.replay.bars[0][0].beats=99;
 assert.equal(load(invalid).replay,undefined);assert.deepEqual(load(invalid).report,result.report);
});
test('training history keeps the latest 60 sessions and compares only matching setups',()=>{
 const settings=normalizeTraining({bars:2,bpm:80});
 const q={...copyDefaults(),noteNames:['C','D♭']};
 const p=generatePhrase(settings,q,{random:()=>0});
 const result={...new ExerciseSession(p).summary(0),replay:saveReplay(p,settings),comparison:comparisonSetup(p,settings,q)};
 const same={...result,comparison:comparisonSetup(p,settings,{...q,noteNames:['D♭','C']})};
 const variants=[{...result,replay:{...result.replay,bpm:81}},{...result,replay:{...result.replay,offset:12}},
  {...result,comparison:{...result.comparison,level:'mixed'}},{...result,comparison:{...result.comparison,octaves:[5]}},
  {...result,comparison:{...result.comparison,notes:['C']}}];
 assert.deepEqual(groupSessions([result,same,...variants],'sight').map(group=>group.length),[2,1,1,1,1,1]);
 const state={history:[]};
 for(let i=0;i<64;i++)rememberTrainingResult(state,{...result,at:i});
 assert.equal(state.lastResult.at,63);assert.equal(state.history.length,60);assert.equal(state.history.at(-1).at,4);
 const restored=loadTraining({getItem:()=>JSON.stringify(state)});
 assert.deepEqual(restored.history,state.history);
 assert.equal(groupSessions(restored.history,'rhythm').length,0);
});
test('rhythm remembers judged holds across a pause without adding misses for interrupted notes',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,1000);note(s,'off',60,2000);s.tick(3130);
 s.pauseRun(3130);s.restartBar(3130);
 s.startTime=10000;
 note(s,'on',60,10000);note(s,'off',60,12000);note(s,'on',60,12000);note(s,'off',60,13000);s.tick(14700);
 const result=s.summary(14700), [bar]=result.report.bars;
 assert.equal(result.holds,100);assert.equal(bar.issues.short,1);assert.equal(bar.issues.missed,0);
 assert.equal(bar.timing.centered,3);
});
test('a rhythm rest with multiple unwanted presses counts once, including a quick tap inside its grace period',()=>{
 for (const releases of [[4010],[4010,4500]]) {
  const s=new ExerciseSession(phrase(true));s.startTime=1000;
  note(s,'on',60,1000);note(s,'off',60,3000);note(s,'on',60,3000);note(s,'off',60,4000);
  for(const at of releases){note(s,'on',60,at-5);note(s,'off',60,at);}
  s.tick(5650);
  const {issues}=s.summary(5650).report.bars[0];
  assert.equal(issues.rest,1);assert.equal(issues.offBeat,0);
 }
});
test('valid releases show a fully filled hold meter briefly without delaying the next attack',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,1000);assert.ok(s.holdDisplay(2980).value<1);note(s,'off',60,2990);
 assert.equal(s.holdDisplay(2990).value,1);assert.equal(s.holdDisplay(3100).label,'Good release ✓');
 note(s,'on',61,3020);assert.equal(s.holdDisplay(3020).value,0);assert.equal(s.holding.size,1);
});

test('beginner rhythm accepts articulated eighths with a valid late attack and an on-grid release',()=>{
 for(const bpm of [60,90,120,160,200])for(const offset of [-100,0,100]){
  const p={...phrase(true),events:Array.from({length:8},(_,id)=>({id,bar:0,beat:id/2,durationBeats:.5,tone:C,rest:false,clef:'treble'}))};
  const s=new ExerciseSession(p,{bpm,offset,accuracy:'beginner'});s.startTime=1000;
  const length=s.beatMs/2,late=Math.min(55,length*.35),gap=Math.min(20,length*.1);
  for(const e of p.events){
   const at=s.expected(e)+offset;
   note(s,'on',60,at+late);note(s,'off',60,at+length-gap);
   assert.equal(s.results.get(e.id)?.status,'correct',JSON.stringify({bpm,offset,id:e.id}));
   assert.equal(s.holdDisplay(at+length-gap).value,1);
  }
  s.tick(s.expected(p.events.at(-1))+length+2000);
  assert.equal(s.summary().holds,100);assert.equal(s.summary().onset,100);
 }
});

test('beginner rhythm hold meter reaches its release cue before the next eighth attack',()=>{
 const p={...phrase(true),events:[{...phrase(true).events[0],durationBeats:.5}]};
 const s=new ExerciseSession(p,{bpm:200,accuracy:'beginner'});s.startTime=1000;
 note(s,'on',60,1055);
 assert.ok(s.holdDisplay(1120).value<1);assert.equal(s.holdDisplay(1120).releasing,false);
 assert.equal(s.holdDisplay(1130).value,1);assert.equal(s.holdDisplay(1130).releasing,true);
 assert.match(s.holdDisplay(1130).label,/next press on the beat/);
 note(s,'off',60,1130);assert.equal(s.results.get(0).status,'correct');
});

test('rhythm release grace still rejects taps, half-length long notes, late releases and offbeat attacks',()=>{
 const eighth={...phrase(true),events:[{...phrase(true).events[0],durationBeats:.5}]};
 for(const accuracy of ['beginner','strict']){
  for(const [on,off] of [[1055,1080],[1000,1250]]){
   const s=new ExerciseSession(eighth,{bpm:200,accuracy});s.startTime=1000;
   note(s,'on',60,on);note(s,'off',60,off);assert.equal(s.results.get(0).duration,false);
  }
  const s=new ExerciseSession(phrase(true),{accuracy});s.startTime=1000;
  note(s,'on',60,1100);note(s,'off',60,2000);assert.equal(s.results.get(0).duration,false);
 }
 const strict=new ExerciseSession(eighth,{bpm:200,accuracy:'strict'});strict.startTime=1000;
 note(strict,'on',60,1055);note(strict,'off',60,1130);assert.equal(strict.results.get(0).duration,false);
 const sight=new ExerciseSession({...eighth,rhythm:false},{bpm:200,accuracy:'beginner',retryOnError:true});sight.startTime=1000;
 note(sight,'on',60,1055);note(sight,'off',60,1130);assert.equal(sight.failure.reason,'Too short');
 const offbeat=new ExerciseSession(eighth,{bpm:200,accuracy:'beginner'});offbeat.startTime=1000;
 note(offbeat,'on',60,1400);assert.equal(offbeat.results.size,0);assert.equal(offbeat.extras,1);
});

test('pattern bags spread repeats evenly and avoid adjacent duplicate bars, even with a constant random source',()=>{
 for(const meter of [3,4])for(const complexity of Object.keys(RHYTHM_LEVELS))for(const value of [0,.49,.999999]){
  const p=generatePhrase(normalizeTraining({meter,complexity,bars:8}),copyDefaults(),{rhythm:true,random:()=>value});
  assert.ok(p.patterns.every((pattern,i)=>i===0||pattern!==p.patterns[i-1]),`${meter} ${complexity}`);
  if(['simple','steady'].includes(complexity)){
   const available=meter===3?3:complexity==='simple'?5:6;
   assert.equal(new Set(p.patterns.slice(0,available)).size,available);
   const counts=[...new Set(p.patterns)].map(pattern=>p.patterns.filter(item=>item===pattern).length);
   assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
  }else assert.equal(new Set(p.patterns).size,8);
 }
});
test('levels introduce rests, paired eighths and dotted values without exceeding a bar',()=>{
 for(const meter of [3,4])for(const complexity of Object.keys(RHYTHM_LEVELS)){
  const p=generatePhrase(normalizeTraining({meter,complexity,bars:8}),copyDefaults(),{rhythm:true,random:()=>0});
  const first=p.events.filter(e=>e.bar===0);
  assert.ok(p.events.every(e=>RHYTHM_LEVELS[complexity].values.includes(e.durationBeats)));
  if(complexity==='simple')assert.equal(p.events.some(e=>e.rest),false);
  if(complexity==='steady')assert.ok(first.some(e=>e.rest));
  if(complexity==='eighths'){
   assert.ok(first.some(e=>e.durationBeats===.5));
   assert.ok(p.events.every(e=>e.beat%1===0||e.durationBeats===.5));
  }
  if(complexity==='mixed')assert.ok(first.some(e=>[1.5,3].includes(e.durationBeats)));
 }
});
test('selected naturals and a single selected pitch still get varied rhythms and preserved spellings',()=>{
 const settings=normalizeTraining({bars:8});
 const naturals=generatePhrase(settings,copyDefaults(),{random:()=>0});
 assert.equal(new Set(naturals.events.map(e=>e.tone.midi)).size,7);
 assert.ok(naturals.events.every(e=>e.tone.alteration===0));
 const one=generatePhrase(settings,{...copyDefaults(),noteNames:['D♭']},{random:()=>0});
 assert.ok(one.events.every(e=>e.tone.name==='D♭'));
 assert.equal(new Set(one.patterns).size,5);assert.deepEqual(one.patterns,naturals.patterns);
 const wide=generatePhrase(settings,{...copyDefaults(),noteNames:['C'],octaves:{treble:[3,6],bass:[3]}},{random:()=>0});
 assert.equal(new Set(wide.events.map(e=>e.tone.midi)).size,2);assert.ok(wide.events.every((e,i)=>i===0||e.tone.midi!==wide.events[i-1].tone.midi));
});
test('new phrases avoid the last two rhythm patterns from the preceding matching exercise',()=>{
 for(const complexity of Object.keys(RHYTHM_LEVELS)){
  const settings=normalizeTraining({bars:8,complexity});
  const first=generatePhrase(settings,copyDefaults(),{rhythm:true,random:()=>0});
  const second=generatePhrase(settings,copyDefaults(),{rhythm:true,random:()=>0,previousPhrase:first});
  assert.ok(!first.patterns.slice(-2).includes(second.patterns[0]));
  assert.equal(normalizeTraining({complexity}).complexity,complexity);
 }
});
test('dotted notes and rests render their dots with the correct open or filled heads',()=>{
 const p=phrase();p.events=[{...p.events[0],durationBeats:1.5},{...p.events[1],beat:1.5,durationBeats:.5},{...p.events[2],beat:2,durationBeats:1.5}];
 let svg=renderScore(p,0,new Map(),0);assert.equal((svg.match(/class="score-dot"/g)||[]).length,2);assert.ok(!svg.includes('score-head-open'));
 p.events=[{...p.events[0],durationBeats:3},{...p.events[1],beat:3,durationBeats:1}];svg=renderScore(p,0,new Map(),0);assert.match(svg,/score-head-open/);assert.match(svg,/score-dot/);
});
