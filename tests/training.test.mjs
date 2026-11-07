import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePhrase, ExerciseSession, heldCorrectly, normalizeTraining } from '../js/training.js';
import { copyDefaults } from '../js/quiz.js';
import { makeTone } from '../js/notes.js';
import { renderScore } from '../js/score.js';
const C=makeTone(0,0,4), D=makeTone(1,0,4);
const phrase=(rhythm=false)=>({events:[{id:0,bar:0,beat:0,durationBeats:2,tone:C,rest:false,clef:'treble'},{id:1,bar:0,beat:2,durationBeats:1,tone:D,rest:false,clef:'treble'},{id:2,bar:0,beat:3,durationBeats:1,tone:null,rest:true,clef:'treble'}],meter:4,bars:1,totalBeats:4,clef:'treble',rhythm});
const note=(session,type,n,timeStamp)=>session.input({type,note:n,channel:0,timeStamp});

test('generated rhythms fill every bar and melodies contain only selected pitches and spellings',()=>{
 let seed=42;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(const meter of [3,4])for(const complexity of ['simple','mixed'])for(const clef of ['treble','bass','mixed']){
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
test('valid releases show a fully filled hold meter briefly without delaying the next attack',()=>{
 const s=new ExerciseSession(phrase(true));s.startTime=1000;
 note(s,'on',60,1000);assert.ok(s.holdDisplay(2980).value<1);note(s,'off',60,2990);
 assert.equal(s.holdDisplay(2990).value,1);assert.equal(s.holdDisplay(3100).label,'Good release ✓');
 note(s,'on',61,3020);assert.equal(s.holdDisplay(3020).value,0);assert.equal(s.holding.size,1);
});
