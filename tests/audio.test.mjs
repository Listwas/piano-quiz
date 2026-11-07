import test from 'node:test';
import assert from 'node:assert/strict';

test('audio uses tuning-corrected samples and can stop or cancel pending playback', async () => {
  const created = [];
  let decode;
  class Node {
    gain = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    playbackRate = { value: 1 };
    frequency = { value: 0 };
    connect() {}
    disconnect() {}
    start() { this.started = true; }
    stop(time) { if (time === undefined) this.stopped = true; }
  }
  class Context {
    state = 'running'; currentTime = 0; destination = {};
    createGain() { return new Node(); }
    createBufferSource() { const node = new Node(); created.push(node); return node; }
    createOscillator() { const node = new Node(); created.push(node); return node; }
    async decodeAudioData() { return decode ? await decode : { duration: 3.5 }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
  }
  const old = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = { AudioContext: Context };
  globalThis.document = { hidden: false };
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  try {
    const audio = await import('../js/audio.js?unit');
    assert.equal(await audio.playItem({ tones: [{ midi: 63, frequency: 311.126984 }] }), true);
    assert.ok(Math.abs(created[0].playbackRate.value - 311.126984 / 312.11) < 1e-8);
    audio.stopAudio();
    assert.equal(created[0].stopped, true);
    let release;
    decode = new Promise(resolve => release = resolve);
    const pending = audio.playItem({ tones: [{ midi: 60, frequency: 261.625565 }] });
    await new Promise(resolve => setImmediate(resolve));
    audio.stopAudio();
    release({ duration: 3.5 });
    assert.equal(await pending, false);
    assert.equal(created.length, 1);
    globalThis.fetch = async () => new Response('', { status: 404 });
    assert.equal(await audio.playItem({ tones: [{ midi: 69, frequency: 440 }] }), true);
    assert.equal(created.at(-1).type, 'triangle');
    audio.suspendAudio();
    assert.equal(created.at(-1).stopped, true);
  } finally {
    Object.assign(globalThis, old);
  }
});

test('playback waits for a delayed audio-context resume instead of dropping the first tap', async () => {
  let started = false;
  class Node {
    gain = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    frequency = { value: 0 };
    connect() {}
    disconnect() {}
    start() { started = true; }
    stop() {}
  }
  class Context {
    state = 'suspended'; currentTime = 0; destination = {};
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    async resume() { await new Promise(resolve => setTimeout(resolve, 20)); this.state = 'running'; }
  }
  const old = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = { AudioContext: Context };
  globalThis.document = { hidden: false };
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    const audio = await import('../js/audio.js?delayed-resume');
    assert.equal(await audio.playItem({ tones: [{ midi: 60, frequency: 261.625565 }] }), true);
    assert.equal(started, true);
  } finally { Object.assign(globalThis, old); }
});
