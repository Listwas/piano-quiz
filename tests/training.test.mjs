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
