import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiPhrase, MidiKeyboard, matchesMidi, midiNoteName } from '../js/midi.js';
import { copyDefaults, poolFor, grade, answerName, createRound, recordAnswer } from '../js/quiz.js';
import { freshState, restoreState } from '../js/storage.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const on = (note, channel = 0) => [0x90 | channel, note, 100];
const off = (note, channel = 0) => [0x80 | channel, note, 0];

test('MIDI phrases wait for all keys to release, handle channels and velocity-zero note-offs', () => {
  const answers = [], phrase = new MidiPhrase(notes => answers.push(notes));
  phrase.setActive(true);
  phrase.receive(on(60)); phrase.receive(on(64, 2)); phrase.receive(on(67));
  phrase.receive(off(60)); phrase.receive([0x92, 64, 0]);
  assert.deepEqual(answers, []);
  phrase.receive(off(67));
  assert.deepEqual(answers, [[60, 64, 67]]);
  phrase.receive(off(67)); phrase.receive(on(60)); phrase.receive(on(60, 3)); phrase.receive(off(60));
  assert.equal(answers.length, 1);
  phrase.receive(off(60, 3));
  assert.deepEqual(answers[1], [60]);
});

test('pauses, new questions and held feedback notes cannot submit a stale phrase', () => {
  const answers = [], phrase = new MidiPhrase(notes => answers.push(notes));
  phrase.receive(on(60)); phrase.setActive(true); phrase.receive(off(60));
  assert.deepEqual(answers, []);
  phrase.receive(on(64)); phrase.setActive(false); phrase.setActive(true);
  phrase.receive(on(67)); phrase.receive(off(64)); phrase.receive(off(67));
  assert.deepEqual(answers, []);
  phrase.receive(on(72)); phrase.resetPhrase(); phrase.receive(off(72));
  assert.deepEqual(answers, []);
  phrase.receive(on(72)); phrase.receive(off(72));
  assert.deepEqual(answers, [[72]]);
});

test('MIDI controls, malformed data, clocks and panic messages never grade an answer', () => {
  const answers = [], phrase = new MidiPhrase(notes => answers.push(notes));
  phrase.setActive(true);
  for (const data of [[], [0x90, 60], [0xf8], [0x90, 128, 40], [0x90, 60, 128], [0x190, 60, 50], [0x90, 60, -1], [0xf0, 60, 50]]) phrase.receive(data);
  phrase.receive(on(60)); phrase.receive([0xb0, 64, 127]); phrase.receive(off(60));
  assert.deepEqual(answers, [[60]], 'Sustain must not hold physical keys down');
  phrase.receive(on(64)); phrase.receive([0xb0, 123, 0]); phrase.receive(off(64));
  phrase.receive(on(67)); phrase.receive([0xb0, 120, 0]); phrase.receive(off(67));
  assert.equal(answers.length, 1);
});

test('MIDI grading matches exact octave and full chord pitches without pretending to know spelling', () => {
  const note = poolFor({ ...copyDefaults(), noteNames: ['D♭'], octaves: { treble: [5] } })[0];
  assert.equal(grade(note, { source: 'midi', notes: [73] }), true);
  assert.equal(grade(note, { source: 'midi', notes: [61] }), false);
  assert.equal(grade(note, { source: 'midi', notes: [73, 76] }), false);
  assert.equal(grade(note, { letter: 0, alteration: 1 }), false);
  const chord = poolFor({ ...copyDefaults(), mode: 'chords', noteNames: ['C'], qualities: ['maj7'] })[0];
  assert.equal(matchesMidi(chord, [71, 67, 64, 60]), true);
  for (const notes of [[], [60, 64, 67], [60, 64, 67, 72], [60, 64, 67, 71, 74], [60, NaN], ['60'], [128]]) assert.equal(grade(chord, { source: 'midi', notes }), false);
  assert.equal(midiNoteName(60), 'C4'); assert.equal(midiNoteName(72), 'C5');
  assert.equal(answerName({ source: 'midi', notes: [67, 60, 64] }, 'chord'), 'C4 · E4 · G4');
});

test('MIDI answers and their progress restore through the ordinary quiz storage', () => {
  const state = freshState(); state.active = createRound(state.settings, state.history, 1000, () => 0);
  recordAnswer(state.active, state.history, { source: 'midi', notes: [60] }, 500, 1500);
  const restored = restoreState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.active.feedback.correct, true);
  assert.deepEqual(restored.active.feedback.answer, { source: 'midi', notes: [60] });
  assert.equal(restored.history['note:treble:0:0:4'].correct, 1);
});

function rig() {
  const access = { inputs: new Map(), onstatechange: null }, calls = [], statuses = [], answers = [];
  const navigator = { async requestMIDIAccess(options) { calls.push(options); return access; } };
  const midi = new MidiKeyboard({ navigator, onStatus: status => statuses.push(status), onPhrase: notes => answers.push(notes) });
  function port(id, open = async () => {}) {
    const input = { id, name: `Keyboard ${id}`, state: 'connected', type: 'input', onmidimessage: null, opened: 0, closed: 0,
      async open() { this.opened++; await open(); access.onstatechange?.({ port: this }); },
      async close() { this.closed++; await turn(); access.onstatechange?.({ port: this }); },
    };
    access.inputs.set(id, input); return input;
  }
  return { access, calls, statuses, answers, midi, port };
}

test('MIDI opens only after connecting, handles hotplug and selected input changes, then releases ports', async () => {
  const r = rig(); assert.equal(r.calls.length, 0);
  await r.midi.connect(); assert.equal(r.midi.status.state, 'waiting'); assert.deepEqual(r.calls, [{ sysex: false }]);
  const a = r.port('a'); r.access.onstatechange({ port: a }); await turn();
  assert.equal(r.midi.status.connected, true);
  r.midi.phrase.setActive(true); a.onmidimessage({ data: on(60) }); a.onmidimessage({ data: off(60) });
  assert.deepEqual(r.answers, [[60]]);
  const b = r.port('b'); r.access.onstatechange({ port: b }); assert.equal(r.midi.status.inputs.length, 2);
  r.midi.select('b'); await turn(); await turn();
  assert.equal(a.onmidimessage, null); assert.equal(r.midi.input, b);
  b.state = 'disconnected'; r.access.onstatechange({ port: b }); await turn();
  assert.equal(r.midi.status.state, 'waiting'); assert.equal(r.midi.input, null);
  b.state = 'connected'; r.access.onstatechange({ port: b }); await turn(); await turn();
  assert.equal(r.midi.input, b);
  r.midi.disconnect(); await turn();
  assert.equal(b.onmidimessage, null); assert.equal(r.access.onstatechange, null); assert.equal(r.midi.status.state, 'idle');
});

test('unsupported, denied and failed-open MIDI remain retryable without reconnect loops', async () => {
  const absent = new MidiKeyboard({ navigator: {} }); await absent.connect(); assert.equal(absent.status.state, 'unsupported');
  const denied = new MidiKeyboard({ navigator: { requestMIDIAccess: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } } });
  await denied.connect(); assert.match(denied.status.message, /permission was denied/);
  const r = rig(), input = r.port('broken', async () => { throw new Error('Unavailable'); });
  await r.midi.connect(); await turn(); await turn();
  assert.equal(r.midi.status.state, 'error'); assert.equal(input.opened, 1);
  input.open = async function () { this.opened++; };
  await r.midi.connect(); await turn(); await turn();
  assert.equal(r.midi.status.connected, true); r.midi.disconnect();
});

test('cancelled MIDI permission requests and stale port opens cannot reconnect later', async () => {
  let allow; const r = rig();
  r.midi.navigator.requestMIDIAccess = () => new Promise(resolve => { allow = resolve; });
  const pending = r.midi.connect(); r.midi.disconnect(); allow(r.access); await pending;
  assert.equal(r.midi.status.state, 'idle'); assert.equal(r.access.onstatechange, null);
  const s = rig(); let opened;
  s.port('slow', () => new Promise(resolve => { opened = resolve; }));
  await s.midi.connect(); await turn(); s.midi.disconnect(); opened(); await turn();
  assert.equal(s.midi.status.state, 'idle');
});
test('recheck waits for the old port to close before reopening the same keyboard', async () => {
  const r = rig(), input = r.port('a');
  await r.midi.connect(); await turn();
  let finishClose;
  input.close = () => new Promise(resolve => { finishClose = resolve; });
  const recheck = r.midi.recheck();
  await recheck; await turn();
  assert.equal(input.opened, 1, 'Do not open before the asynchronous close finishes');
  finishClose(); await turn();
  assert.equal(input.opened, 2);
  assert.equal(r.midi.status.connected, true);
  r.midi.phrase.setActive(true);
  input.onmidimessage({ data: on(72) }); input.onmidimessage({ data: off(72) });
  assert.deepEqual(r.answers, [[72]]);
  input.close = async () => {};
  r.midi.disconnect();
});

test('replug adopts a unique matching keyboard with a changed id and recheck refreshes stale access', async () => {
  const r = rig(), old = r.port('old');
  await r.midi.connect(); await turn();
  old.state = 'disconnected'; r.access.onstatechange({ port: old }); await turn();
  const replacement = r.port('new'); replacement.name = old.name;
  r.access.onstatechange({ port: replacement }); await turn();
  assert.equal(r.midi.status.connected, true);
  assert.equal(r.midi.preferredId, 'new');
  assert.equal(old.onmidimessage, null);
  const fresh = rig(), port = fresh.port('fresh'); port.name = old.name;
  r.midi.navigator.requestMIDIAccess = async () => fresh.access;
  await r.midi.recheck(); await turn(); await turn();
  assert.equal(r.midi.preferredId, 'fresh');
  assert.equal(r.midi.input, port);
  r.midi.phrase.setActive(true);
  port.onmidimessage({ data: on(60) }); port.onmidimessage({ data: off(60) });
  assert.deepEqual(r.answers, [[60]]);
  assert.equal(r.access.onstatechange, null);
  r.midi.disconnect();
});
