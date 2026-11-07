import test from 'node:test';
import assert from 'node:assert/strict';
import { copyDefaults, normalizeSettings, poolFor, createRound, recordAnswer, retryQuestion, advance, grade, answerName, summarize, localDay, DAY, INTERVAL_DAYS, THEMES, NOTE_OPTIONS, selectedNamesFor, OCTAVE_OPTIONS } from '../js/quiz.js';
import { makeTone } from '../js/notes.js';
import { QUALITIES, buildChord } from '../js/chords.js';
import { renderStaff } from '../js/staff.js';
import { freshState, restoreState, saveState, loadState, completeRound, STORAGE_KEY } from '../js/storage.js';

const exact = item => ({ letter: item.tones[0].letter, alteration: item.tones[0].alteration, qualityId: item.qualityId });
const now = 1800000000000;

test('defaults contain seven natural notes and valid independent setting arrays', () => {
  const a = copyDefaults(), b = copyDefaults();
  a.enabled[0] = false;
  assert.equal(b.enabled[0], true);
  assert.equal(poolFor(b).length, 7);
  assert.equal(normalizeSettings({ enabled: Array(12).fill(false), length: -5, qualities: ['bad'], clef: 'alto' }).clef, 'treble');
  assert.equal(poolFor(normalizeSettings({ enabled: Array(12).fill(false) })).length, 7);
});

test('all fourteen palettes and Device preference survive settings and storage restoration', () => {
  assert.equal(THEMES.length, 15);
  for (const { id } of THEMES) {
    assert.equal(normalizeSettings({ theme: id }).theme, id);
    const state = freshState();
    state.settings.theme = id;
    assert.equal(restoreState(JSON.parse(JSON.stringify(state))).settings.theme, id);
  }
  assert.equal(normalizeSettings({ theme: 'unknown' }).theme, 'system');
});

test('every note spelling and clef has a stable independent identity', () => {
  const pool = poolFor({ ...copyDefaults(), enabled: Array(12).fill(true), clef: 'mixed' });
  assert.equal(pool.length, 34);
  assert.equal(new Set(pool.map(i => i.id)).size, 34);
  assert.equal(pool.find(i => i.clef === 'treble' && i.label === 'C').tones[0].midi, 60);
  assert.equal(pool.find(i => i.clef === 'bass' && i.label === 'C').tones[0].midi, 48);
});

test('explicitly selected spellings are the entire note and chord-root pool', () => {
  const settings = { ...copyDefaults(), mode: 'mixed', clef: 'mixed', noteNames: ['C♯', 'E♭', 'G'], qualities: QUALITIES.map(q => q.id) };
  const pool = poolFor(settings);
  assert.equal(pool.length, 3 * 2 * (1 + QUALITIES.length));
  assert.ok(pool.every(item => settings.noteNames.includes(item.tones[0].name)));
  assert.ok(!pool.some(item => ['D♭', 'D♯'].includes(item.tones[0].name)));
  const sharpOnly = poolFor({ ...settings, noteNames: ['C♯'] });
  assert.ok(sharpOnly.every(item => item.tones[0].name === 'C♯'));
  assert.equal(NOTE_OPTIONS.length, 17);
});

test('explicit chord roots preserve their selected spelling and interval structure', () => {
  for (const note of NOTE_OPTIONS) for (const quality of QUALITIES) {
    const chord = buildChord(note.pitchClass, quality.id, 4, () => 1, [note.letter, note.alteration]);
    assert.equal(chord.tones[0].name, note.name);
    chord.tones.forEach((tone, index) => {
      assert.equal(tone.midi - chord.tones[0].midi, quality.tones[index][0]);
      assert.equal(tone.staffStep - chord.tones[0].staffStep, quality.tones[index][1]);
    });
  }
});

test('legacy pitch selections and active rounds remain restorable', () => {
  const state = freshState();
  state.settings.enabled = Array.from({ length: 12 }, (_, pc) => pc === 1);
  state.active = createRound(state.settings, state.history, now, () => 0);
  delete state.settings.octaves;
  delete state.active.settings.octaves;
  const restored = restoreState(JSON.parse(JSON.stringify(state)));
  assert.ok(restored.active);
  assert.equal(restored.active.current.id, state.active.current.id);
  assert.deepEqual(selectedNamesFor(restored.settings).sort(), ['C♯', 'D♭'].sort());
  restored.settings.noteNames = ['C♯'];
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(restored))).settings.noteNames, ['C♯']);
});

test('all 11 chord qualities preserve intervals and written letter spacing in every key', () => {
  for (const quality of QUALITIES) for (let pc = 0; pc < 12; pc++) for (const octave of [3, 4]) {
    const chord = buildChord(pc, quality.id, octave, () => 1);
    const root = chord.tones[0];
    assert.equal(root.pitchClass, pc);
    chord.tones.forEach((tone, index) => {
      assert.equal(tone.midi - root.midi, quality.tones[index][0]);
      assert.equal(tone.staffStep - root.staffStep, quality.tones[index][1]);
      assert.ok(Math.abs(tone.alteration) <= 2);
    });
    assert.deepEqual(chord, buildChord(pc, quality.id, octave, () => 1));
  }
});

test('mixed content includes only selected roots and chord qualities', () => {
  const settings = { ...copyDefaults(), mode: 'mixed', clef: 'mixed', enabled: Array.from({ length: 12 }, (_, i) => i === 1), qualities: ['min', 'dom7'] };
  const pool = poolFor(settings);
  assert.equal(pool.length, 8);
  assert.ok(pool.every(item => item.pitchClass === 1));
  assert.ok(pool.filter(item => item.kind === 'chord').every(item => ['min', 'dom7'].includes(item.qualityId)));
});

test('grade requires the written note spelling rather than sounding equivalence', () => {
  const item = { kind: 'note', tones: [makeTone(0, 1, 4)] };
  assert.equal(grade(item, { letter: 1, alteration: -1 }), false);
  assert.equal(grade(item, { letter: 0, alteration: 1 }), true);
  assert.equal(grade(item, null), false);
  assert.equal(answerName({ letter: 1, alteration: -1 }, 'note'), 'D♭');
  assert.equal(answerName({ letter: 99, alteration: 0 }, 'note'), '');
});

test('chords require root and quality; incomplete answers cannot be named', () => {
  const item = buildChord(0, 'min', 4, () => 1);
  assert.equal(grade(item, { letter: 0, alteration: 0, qualityId: 'maj' }), false);
  assert.equal(grade(item, { letter: 0, alteration: 0, qualityId: 'min' }), true);
  assert.equal(answerName({ letter: 0, alteration: 0, qualityId: null }, 'chord'), '');
  assert.equal(answerName({ letter: 0, alteration: 0, qualityId: 'min' }, 'chord'), 'Cm');
});

test('question and revealed staff labels do not leak names before grading', () => {
  const item = { tones: [makeTone(0, 1, 4)] };
  assert.match(renderStaff(item), /aria-label="Identify the notation on the treble staff"/);
  assert.doesNotMatch(renderStaff(item), /C♯/);
  assert.match(renderStaff(item, 'bass', true), /C♯ on the bass staff/);
});

test('correct answers progress review intervals and misses reset them', () => {
  const h = {}, r = createRound(copyDefaults(), h, now, () => 0);
  const item = r.current;
  let reviewTime = now;
  for (const [i, days] of INTERVAL_DAYS.entries()) {
    r.feedback = null;
    recordAnswer(r, h, exact(item), 1100, reviewTime);
    assert.equal(h[item.id].due, reviewTime + days * DAY);
    assert.equal(h[item.id].stage, i + 1);
    reviewTime = h[item.id].due;
  }
  r.feedback = null;
  recordAnswer(r, h, null, 1400, now + 10);
  assert.equal(h[item.id].stage, 0);
  assert.equal(h[item.id].due, now + 10);
  assert.equal(h[item.id].attempts, 6);
  assert.equal(h[item.id].correct, 5);
  assert.equal(h[item.id].correctMs, 5500);
});

test('early repetitions do not inflate spaced-review stages or postpone due dates', () => {
  const h = {}, r = createRound(copyDefaults(), h, now, () => 0);
  const id = r.current.id;
  recordAnswer(r, h, exact(r.current), 500, now);
  r.feedback = null;
  recordAnswer(r, h, exact(r.current), 500, now + 1000);
  assert.equal(h[id].stage, 1);
  assert.equal(h[id].due, now + DAY);
});

test('misses return after three intervening questions, while feedback grades only once', () => {
  const history = {}, round = createRound(copyDefaults(), history, now, () => 0);
  const missed = round.current;
  recordAnswer(round, history, null, 500, now);
  assert.equal(recordAnswer(round, history, null, 500, now), null);
  for (let i = 0; i < 3; i++) {
    assert.equal(advance(round, history, now + i, () => 0), true);
    assert.notEqual(round.current.id, missed.id);
    recordAnswer(round, history, exact(round.current), 500, now + i);
  }
  advance(round, history, now + 5, () => 0);
  assert.equal(round.current.id, missed.id);
});

test('small pools always remain playable without consecutive repeats where possible', () => {
  for (const roots of [[0], [0, 2]]) {
    const settings = { ...copyDefaults(), enabled: Array.from({ length: 12 }, (_, i) => roots.includes(i)) };
    const h = {}, r = createRound(settings, h, now, () => 0);
    let last;
    do {
      if (roots.length > 1) assert.notEqual(r.current.id, last);
      last = r.current.id;
      recordAnswer(r, h, null, 200, now);
    } while (advance(r, h, now, () => 0));
    assert.equal(r.answers.length, 10);
    assert.equal(r.current, null);
  }
});

test('due items precede unseen items, then least recently practised items cycle', () => {
  const settings = copyDefaults(), pool = poolFor(settings), h = {};
  h[pool[2].id] = { attempts: 1, correct: 0, stage: 0, due: now - 1, lastSeen: now - 10, totalMs: 0, correctMs: 0 };
  const r = createRound(settings, h, now, () => 0);
  assert.equal(r.current.id, pool[2].id);
  recordAnswer(r, h, exact(r.current), 500, now);
  advance(r, h, now, () => 0);
  assert.equal(r.current.id, pool[0].id);
});

test('round summary counts misses and correct-answer time without retry inflation', () => {
  const h = {}, r = createRound(copyDefaults(), h, now, () => 0);
  recordAnswer(r, h, null, 9000, now);
  advance(r, h, now, () => 0);
  recordAnswer(r, h, exact(r.current), 1000, now);
  assert.equal(summarize(r).accuracy, 50);
  assert.equal(summarize(r).meanMs, 1000);
  assert.equal(summarize(r).difficult.length, 1);
});

test('unfinished and graded rounds restore without repeating a recorded answer', () => {
  const s = freshState();
  s.active = createRound(s.settings, s.history, now, () => 0);
  recordAnswer(s.active, s.history, null, 500, now);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.active.feedback.correct, false);
  assert.equal(restored.history[s.active.current.id].attempts, 1);
  assert.equal(advance(restored.active, restored.history, now, () => 0), true);
});

test('corrupt state is repaired and inaccessible storage fails without throwing', () => {
  assert.equal(restoreState(null).version, 1);
  assert.equal(restoreState({ version: 99 }).active, null);
  const s = freshState();
  s.history.bad = { attempts: 12 };
  s.active = { current: { id: '<script>' } };
  assert.deepEqual(restoreState(s).history, {});
  assert.equal(restoreState(s).active, null);
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.equal(loadState(storage).available, false);
  assert.equal(saveState(s, storage), false);
  assert.equal(loadState({ getItem: () => '{invalid' }).available, true);
  assert.equal(loadState({ getItem: () => '{invalid' }).state.active, null);
});

test('storage uses its own versioned key and daily completion increments once', () => {
  const state = freshState(), memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  state.active = createRound(state.settings, state.history, now, () => 0);
  do { recordAnswer(state.active, state.history, exact(state.active.current), 500, now); } while (advance(state.active, state.history, now, () => 0));
  const completed = structuredClone(state.active);
  assert.equal(completeRound(state, now).correct, 10);
  assert.equal(state.daily[localDay(now)], 1);
  state.active = completed;
  completeRound(state, now);
  assert.equal(state.daily[localDay(now)], 1);
  assert.equal(saveState(state, storage), true);
  assert.ok(memory.has(STORAGE_KEY));
  assert.equal(loadState(storage).state.daily[localDay(now)], 1);
});

test('improvement compares rounds with matching practice content', () => {
  const s = freshState();
  const run = misses => {
    s.active = createRound(s.settings, s.history, now, () => 0);
    do {
      recordAnswer(s.active, s.history, s.active.answers.length < misses ? null : exact(s.active.current), 500, now);
    } while (advance(s.active, s.history, now, () => 0));
    return completeRound(s, now);
  };
  assert.equal(run(3).accuracy, 70);
  assert.equal(run(1).improvement, 20);
  s.settings.clef = 'bass';
  assert.equal(run(0).improvement, 0);
});


test('selected octaves multiply only selected spellings and keep each staff position independent', () => {
  const settings = { ...copyDefaults(), noteNames: ['C', 'C♯'], clef: 'mixed', octaves: { treble: [4, 5, 6], bass: [1, 3] } };
  const pool = poolFor(settings);
  assert.equal(pool.length, 10);
  assert.equal(new Set(pool.map(item => item.id)).size, 10);
  assert.ok(pool.every(item => settings.noteNames.includes(item.tones[0].name) && settings.octaves[item.clef].includes(item.tones[0].octave)));
  assert.deepEqual(pool.filter(item => item.label === 'C' && item.clef === 'treble').map(item => item.tones[0].midi), [60, 72, 84]);
  for (const item of pool) assert.equal(grade(item, exact(item)), true);
});

test('octave settings reject unsupported, fractional, empty and duplicate values', () => {
  assert.deepEqual(normalizeSettings({ octaves: { treble: [5, 5, 3, 99, '4', 4.5], bass: [] } }).octaves, { treble: [3, 5], bass: [3] });
  const a = copyDefaults(), b = copyDefaults();
  a.octaves.treble.push(5);
  assert.deepEqual(b.octaves.treble, [4]);
  assert.deepEqual(normalizeSettings({ octaves: null }).octaves, b.octaves);
});

test('higher C5 sits in the third treble space and extreme chords fit the generated staff viewBox', () => {
  const c5 = poolFor({ ...copyDefaults(), noteNames: ['C'], octaves: { treble: [5] } })[0];
  assert.equal(c5.tones[0].midi, 72);
  assert.match(renderStaff(c5), /cy="42"/);
  for (const clef of ['treble', 'bass']) {
    const pool = poolFor({ ...copyDefaults(), clef, mode: 'mixed', noteNames: NOTE_OPTIONS.map(note => note.name), qualities: QUALITIES.map(quality => quality.id), octaves: OCTAVE_OPTIONS });
    for (const item of pool) {
      const svg = renderStaff(item, clef);
      const [, top, , height] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      for (const match of svg.matchAll(/cy="(-?[0-9.]+)"/g)) assert.ok(Number(match[1]) >= top && Number(match[1]) <= top + height, item.id);
      if (item.kind === 'chord') item.tones.forEach((tone, index) => assert.equal(tone.midi - item.tones[0].midi, item.quality.tones[index][0]));
    }
  }
});

test('wide-range rounds and per-octave histories survive storage without merging C4 and C5', () => {
  const state = freshState();
  state.settings = { ...state.settings, noteNames: ['C'], octaves: { treble: [4, 5, 6], bass: [1, 2, 3, 4] } };
  state.active = createRound(state.settings, state.history, now, () => 0);
  recordAnswer(state.active, state.history, exact(state.active.current), 500, now);
  advance(state.active, state.history, now, () => 0);
  assert.equal(state.active.current.tones[0].octave, 5);
  recordAnswer(state.active, state.history, null, 800, now);
  const restored = restoreState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.active.current.tones[0].octave, 5);
  assert.equal(restored.history['note:treble:0:0:4'].correct, 1);
  assert.equal(restored.history['note:treble:0:0:5'].correct, 0);
  for (const clef of ['treble', 'bass']) for (const octave of OCTAVE_OPTIONS[clef]) {
    state.settings.clef = clef;
    state.settings.octaves[clef] = [octave];
    state.active = createRound(state.settings, state.history, now, () => 0);
    recordAnswer(state.active, state.history, null, 100, now);
    assert.ok(restoreState(JSON.parse(JSON.stringify(state))).history[state.active.current.id]);
  }
});

test('round improvement comparisons include the selected staff range', () => {
  const state = freshState();
  const run = misses => {
    state.active = createRound(state.settings, state.history, now, () => 0);
    do { recordAnswer(state.active, state.history, state.active.answers.length < misses ? null : exact(state.active.current), 500, now); } while (advance(state.active, state.history, now, () => 0));
    return completeRound(state, now);
  };
  run(3);
  state.settings.octaves.treble = [5];
  assert.equal(run(0).improvement, 0);
});


test('input mode is validated and saved independently of note content', () => {
  assert.equal(copyDefaults().inputMode, 'touch');
  assert.equal(normalizeSettings({ inputMode: 'midi' }).inputMode, 'midi');
  assert.equal(normalizeSettings({ inputMode: 'bad' }).inputMode, 'touch');
  const state = freshState();
  state.settings.inputMode = 'midi';
  state.active = createRound(state.settings, state.history, now, () => 0);
  assert.equal(restoreState(JSON.parse(JSON.stringify(state))).active.settings.inputMode, 'midi');
});

test('wrong answers can retry the same question without inflating round or review statistics', () => {
  const history = {}, round = createRound(copyDefaults(), history, now, () => 0);
  const item = round.current;
  recordAnswer(round, history, { letter: 1, alteration: 0 }, 500, now);
  assert.equal(retryQuestion(round), true);
  assert.equal(round.current.id, item.id);
  recordAnswer(round, history, null, 500, now + 1000);
  retryQuestion(round);
  const feedback = recordAnswer(round, history, exact(item), 500, now + 2000);
  assert.equal(feedback.correct, true);
  assert.equal(round.answers.length, 1);
  assert.equal(round.answers[0].correct, false);
  assert.equal(history[item.id].attempts, 1);
  assert.equal(history[item.id].stage, 0);
  advance(round, history, now + 3000, () => 0);
  assert.equal(round.retrying, false);
  assert.notEqual(round.current.id, item.id);
});

test('retry state and a successful retry restore, including the final question of a round', () => {
  const state = freshState();
  state.active = createRound(state.settings, state.history, now, () => 0);
  while (state.active.answers.length < state.settings.length - 1) {
    recordAnswer(state.active, state.history, exact(state.active.current), 500, now);
    advance(state.active, state.history, now, () => 0);
  }
  recordAnswer(state.active, state.history, null, 500, now);
  retryQuestion(state.active);
  let restored = restoreState(JSON.parse(JSON.stringify(state)));
  assert.ok(restored.active?.retrying);
  assert.equal(restored.active.feedback, null);
  assert.equal(completeRound(restored, now), null);
  recordAnswer(restored.active, restored.history, exact(restored.active.current), 500, now);
  restored = restoreState(JSON.parse(JSON.stringify(restored)));
  assert.equal(restored.active.feedback.correct, true);
  assert.equal(restored.active.answers.at(-1).correct, false);
  advance(restored.active, restored.history, now, () => 0);
  assert.equal(completeRound(restored, now).correct, 9);
});

test('staff feedback marks notation without coloring clefs or leaking names before an answer', () => {
  const item = { tones: [makeTone(0, 0, 5)] };
  const svg = renderStaff(item, 'treble', true, 'wrong');
  assert.match(svg, /class="staff staff--wrong"/);
  assert.match(svg, /<g class="staff__notation"><ellipse/);
  assert.match(renderStaff(item, 'treble', true, 'correct'), /staff--correct/);
  assert.doesNotMatch(renderStaff(item), /staff--correct|staff--wrong|C5/);
});


test('malformed saved MIDI answers cannot crash the staff feedback renderer', () => {
  const state = freshState();
  state.active = createRound(state.settings, state.history, now, () => 0);
  recordAnswer(state.active, state.history, { source: 'midi', notes: [61] }, 500, now);
  state.active.feedback.answer.notes = null;
  assert.equal(restoreState(JSON.parse(JSON.stringify(state))).active, null);
});
