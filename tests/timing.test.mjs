import test from 'node:test';
import assert from 'node:assert/strict';
import { BeatClock, outputTime } from '../js/timing.js';
import { normalizeTraining, loadTraining } from '../js/training.js';

test('audio output timestamps and fallback latency map beats into the input time domain', () => {
  assert.equal(outputTime({ currentTime:2, getOutputTimestamp:()=>({contextTime:1.98,performanceTime:4980}) }, 3, 5000), 6000);
  assert.equal(outputTime({ currentTime:2, baseLatency:.01, outputLatency:.04 },3,5000),6050);
});
test('clock schedules clicks in audio time, accents new meters, and cancels pending clicks', async () => {
  const oldRAF = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  const nodes=[], scheduled=[];
  class Node {
    frequency={value:0};gain={setValueAtTime(){},exponentialRampToValueAtTime(){}};
    connect(){}disconnect(){}start(time){this.startAt=time;}stop(time){if(time===undefined)this.cancelled=true;}
  }
  const context={ state:'running',currentTime:0,destination:{},createOscillator(){const node=new Node();nodes.push(node);return node;},createGain(){return new Node();} };
  const clock=new BeatClock({prepare:async()=>context,now:()=>1000,onScheduled:event=>scheduled.push(event)});
  try {
    assert.equal(await clock.start({bpm:120,meter:4}),true);
    for (const time of [.03,.53,1.03,1.53]) {context.currentTime=time;clock.schedule();}
    assert.deepEqual(scheduled.map(e=>Number(e.time.toFixed(3))),[.12,.62,1.12,1.62]);
    assert.deepEqual(scheduled.map(e=>e.accent),[true,false,false,false]);
    clock.change(60,3); context.currentTime=2.03;clock.schedule();
    assert.equal(scheduled.at(-1).accent,true);assert.equal(clock.step,1);assert.equal(clock.meter,3);
    context.currentTime=3.03;clock.schedule();assert.equal(Number(scheduled.at(-1).time.toFixed(2)),3.12);
    clock.stop();assert.ok(nodes.every(n=>n.cancelled));
    const count=scheduled.length;context.currentTime=20;clock.schedule();assert.equal(scheduled.length,count);
  } finally {clock.stop();globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
test('a stopped clock cannot resume after a delayed audio unlock resolves', async () => {
  const old=globalThis.cancelAnimationFrame;globalThis.cancelAnimationFrame=()=>{};
  let unlock;const clock=new BeatClock({prepare:()=>new Promise(resolve=>{unlock=resolve;})});
  try {const start=clock.start();clock.stop();unlock({state:'running'});assert.equal(await start,false);assert.equal(clock.running,false);}
  finally {globalThis.cancelAnimationFrame=old;}
});
test('training settings reject corrupt options and inaccessible storage', () => {
  const settings=normalizeTraining({bpm:999,meter:7,bars:3,offset:-900,volume:9,style:'other'});
  assert.equal(settings.bpm,200);assert.equal(settings.meter,4);assert.equal(settings.bars,4);assert.equal(settings.offset,-250);assert.equal(settings.volume,1);assert.equal(settings.style,'guided');
  assert.equal(loadTraining({getItem(){throw Error('blocked');}}).activity,'quiz');
});

test('count-in settles the audio mapping, then scoring targets stop moving', async()=>{
 const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 let now=1000,estimate=1000;
 const context={state:'running',currentTime:0,getOutputTimestamp:()=>({contextTime:0,performanceTime:estimate})};
 const clock=new BeatClock({prepare:async()=>context,now:()=>now});
 try{
  clock.muted=true;await clock.start({bpm:200,meter:4,countIn:4});assert.equal(clock.exerciseStart,2320);
  now=2200;estimate=1500;assert.equal(clock.exerciseStart,2320);
  now=2500;estimate=1800;assert.equal(clock.exerciseStart,2320);
 }finally{clock.stop();globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});

test('retry downbeats stay aligned to the running metronome in 3/4 and 4/4',()=>{
 for(const meter of [3,4]){
  const clock=new BeatClock({now:()=>1000});Object.assign(clock,{context:null,anchor:1000,performanceAnchor:1000,step:.5,countIn:meter,meter});
  const start=clock.exerciseStart;
  assert.equal(clock.nextDownbeat(start+750),start+meter*500);
  assert.equal(clock.nextDownbeat(start+meter*500),start+meter*1000);
  assert.equal(clock.nextDownbeat(start+meter*1000+10),start+meter*1500);
 }
});
