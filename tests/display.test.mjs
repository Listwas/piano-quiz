import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeDisplay } from '../js/display.js';
import { normalizeSettings } from '../js/quiz.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(request) {
  const doc = new EventTarget();
  Object.assign(doc,{hidden:false,defaultView:new EventTarget(),documentElement:{},fullscreenEnabled:true});
  const locks=[], calls=[];
  const nav = {wakeLock:{async request(type){
    calls.push(type);
    if (request) return request();
    const lock=new EventTarget();lock.released=false;
    lock.release=async()=>{lock.released=true;lock.dispatchEvent(new Event('release'));};
    locks.push(lock);return lock;
  }}};
  const display=new PracticeDisplay({document:doc,navigator:nav});
  return {doc,nav,display,locks,calls};
}
test('old settings enable keeping the display awake and explicit opt-out survives normalization',()=>{
  assert.equal(normalizeSettings({}).keepAwake,true);
  assert.equal(normalizeSettings({keepAwake:false}).keepAwake,false);
  assert.equal(normalizeSettings({keepAwake:'false'}).keepAwake,true);
});
test('practice acquires one screen lock and home releases it',async()=>{
  const {display,calls,locks}=setup();
  display.sync();assert.equal(calls.length,0);
  display.setActive(true);display.sync();display.sync();await settle();
  assert.deepEqual(calls,['screen']);assert.equal(display.wakeState,'active');
  display.setActive(false);await settle();assert.equal(locks[0].released,true);assert.equal(display.wakeState,'idle');
});
test('hidden documents release locks and reacquire when visible, including paused practice',async()=>{
  const {display,doc,calls,locks}=setup();display.setActive(true);await settle();
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(locks[0].released,true);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(calls.length,2);assert.equal(display.wakeState,'active');
  display.setEnabled(false);await settle();assert.equal(locks[1].released,true);
});
test('leaving practice before a pending request resolves releases the late lock',async()=>{
  let resolve;const {display}=setup(()=>new Promise(r=>{resolve=r;}));display.setActive(true);display.setActive(false);
  let released=false;resolve({async release(){released=true;}});await settle();
  assert.equal(released,true);assert.equal(display.lock,null);assert.equal(display.wakeState,'idle');
});
test('a pagehide cannot reacquire a late lock before pageshow',async()=>{
  let resolve;const {display,doc,calls}=setup(()=>new Promise(r=>{resolve=r;}));display.setActive(true);
  doc.defaultView.dispatchEvent(new Event('pagehide'));resolve({async release(){}});await settle();
  assert.equal(calls.length,1);assert.equal(display.lock,null);
  doc.defaultView.dispatchEvent(new Event('pageshow'));assert.equal(calls.length,2);
  display.setActive(false);resolve({async release(){}});await settle();
});
test('an OS release is reported without an infinite retry loop, and can be retried',async()=>{
  const {display,calls,locks}=setup();display.setActive(true);await settle();await locks[0].release();await settle();
  assert.equal(display.wakeState,'released');assert.equal(calls.length,1);
  display.sync();await settle();assert.equal(calls.length,2);assert.equal(display.wakeState,'active');
  display.setActive(false);
});
test('unsupported and refused wake locks leave practice usable',async()=>{
  const missing=setup();delete missing.nav.wakeLock;missing.display.setActive(true);assert.equal(missing.display.wakeState,'unsupported');
  const denied=setup(async()=>{throw new Error('Battery saver');});denied.display.setActive(true);await settle();assert.equal(denied.display.wakeState,'denied');
});
test('fullscreen requests hide browser controls and follow native exit events',async()=>{
  const {display,doc}=setup();let options;
  doc.documentElement.requestFullscreen=async value=>{options=value;doc.fullscreenElement=doc.documentElement;doc.dispatchEvent(new Event('fullscreenchange'));};
  doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));};
  assert.equal(await display.toggleFullscreen(),true);assert.deepEqual(options,{navigationUI:'hide'});assert.equal(display.fullscreen,true);
  assert.equal(await display.toggleFullscreen(),true);assert.equal(display.fullscreen,false);
});
test('fullscreen rejection is handled and a second user gesture can retry',async()=>{
  const {display,doc}=setup();doc.documentElement.requestFullscreen=async()=>{throw new Error('Denied');};
  assert.equal(await display.toggleFullscreen(),false);assert.equal(display.fullscreenError,true);
  doc.documentElement.requestFullscreen=async()=>{doc.fullscreenElement=doc.documentElement;};
  assert.equal(await display.toggleFullscreen(),true);assert.equal(display.fullscreenError,false);
});
test('unsupported fullscreen and prefixed fullscreen paths work without unhandled errors',async()=>{
  const {display,doc}=setup();assert.equal(await display.toggleFullscreen(),false);
  doc.documentElement.webkitRequestFullscreen=()=>{doc.webkitFullscreenElement=doc.documentElement;};
  doc.webkitExitFullscreen=()=>{doc.webkitFullscreenElement=null;};
  assert.equal(await display.toggleFullscreen(),true);assert.equal(display.fullscreen,true);
  assert.equal(await display.toggleFullscreen(),true);assert.equal(display.fullscreen,false);
});
