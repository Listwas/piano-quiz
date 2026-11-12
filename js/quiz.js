import { PITCH_CLASSES, makeTone, spellingsOf, toneName } from './notes.js';
import { QUALITIES, buildChord } from './chords.js';
import { matchesMidi, midiNoteName, validMidiNotes } from './midi.js';

export const DEFAULTS = {
  mode: 'notes', clef: 'treble', inputMode: 'touch', enabled: [true, false, true, false, true, true, false, true, false, true, false, true],
  qualities: ['maj', 'min'], length: 10, theme: 'system', sound: false, keepAwake: true, noteNames: null, octaves: { treble: [4], bass: [3] },
};
export const NOTE_OPTIONS = Array.from({ length: 12 }, (_, pc) => spellingsOf(pc).map(([letter, alteration]) => ({ name: toneName(letter, alteration), letter, alteration, pitchClass: pc }))).flat().sort((a, b) => {
  const group = alteration => alteration === 0 ? 0 : alteration === 1 ? 1 : 2;
  return group(a.alteration) - group(b.alteration) || a.letter - b.letter;
});
export const selectedNamesFor = settings => Array.isArray(settings.noteNames) ? settings.noteNames : NOTE_OPTIONS.filter(note => settings.enabled[note.pitchClass]).map(note => note.name);
export const OCTAVE_OPTIONS = { treble: [3, 4, 5, 6], bass: [1, 2, 3, 4] };
export const octavesFor = (settings, clef) => settings.octaves?.[clef] || DEFAULTS.octaves[clef];
export const rangeKey = settings => (settings.clef === 'mixed' ? ['treble', 'bass'] : [settings.clef]).map(clef => [clef, [...octavesFor(settings, clef)].sort((a, b) => a - b)]);
export const INTERVAL_DAYS = [1, 3, 7, 14, 30];
export const THEMES = [
  { id: 'system', name: 'Device', detail: 'Follow your device', background: '#f7f6ef', accent: '#236b52' },
  { id: 'light', name: 'Paper', detail: 'Warm & light', background: '#f7f6ef', accent: '#236b52' },
  { id: 'dark', name: 'Forest', detail: 'Soft & dark', background: '#182820', accent: '#a3d2ab' },
  { id: 'ocean', name: 'Ocean', detail: 'Cool & clear', background: '#edf5f8', accent: '#236a89' },
  { id: 'lavender', name: 'Lavender', detail: 'Quiet & dreamy', background: '#f3eff8', accent: '#73549b' },
  { id: 'peach', name: 'Peach', detail: 'Warm & gentle', background: '#fff2e8', accent: '#a25336' },
  { id: 'midnight', name: 'Midnight', detail: 'Deep & calm', background: '#172330', accent: '#a5c7f0' },
  { id: 'sunflower', name: 'Sunflower', detail: 'Golden & bright', background: '#fff8df', accent: '#805700' },
  { id: 'rose', name: 'Rose', detail: 'Soft & rosy', background: '#fff0f4', accent: '#a33965' },
  { id: 'mint', name: 'Mint', detail: 'Fresh & airy', background: '#eaf8f0', accent: '#216951' },
  { id: 'arctic', name: 'Arctic', detail: 'Crisp & blue', background: '#eef6ff', accent: '#285ca4' },
  { id: 'plum', name: 'Plum', detail: 'Velvet & violet', background: '#281d31', accent: '#ddbbf3' },
  { id: 'ember', name: 'Ember', detail: 'Amber after dark', background: '#2b211b', accent: '#f0bc86' },
  { id: 'graphite', name: 'Graphite', detail: 'Quiet & neutral', background: '#242628', accent: '#d6dce0' },
  { id: 'nocturne', name: 'Nocturne', detail: 'Brass & ivory after dark', background: '#11151f', accent: '#e9c58b' },
  { id: 'amoled', name: 'AMOLED', detail: 'Pure black & lime', background: '#000000', accent: '#c2ee83' },
  { id: 'pulse', name: 'Pulse', detail: 'Coral & ready to play', background: '#fff5eb', accent: '#b63720' },
];
export const DAY = 86400000;
export const copyDefaults = () => structuredClone(DEFAULTS);
export const localDay = (time = Date.now()) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function normalizeSettings(value) {
  const result = copyDefaults();
  if (!value || typeof value !== 'object') return result;
  for (const [key, options] of Object.entries({ inputMode: ['touch', 'midi'], mode: ['notes', 'chords', 'mixed'], clef: ['treble', 'bass', 'mixed'], theme: THEMES.map(theme => theme.id), length: [10, 20] })) {
    if (options.includes(value[key])) result[key] = value[key];
  }
  if (Array.isArray(value.enabled) && value.enabled.length === 12 && value.enabled.every(v => typeof v === 'boolean') && value.enabled.some(Boolean)) result.enabled = [...value.enabled];
  if (Array.isArray(value.qualities)) {
    const qualities = [...new Set(value.qualities.filter(id => QUALITIES.some(q => q.id === id)))];
    if (qualities.length) result.qualities = qualities;
  }
  if (typeof value.sound === 'boolean') result.sound = value.sound;
  if (typeof value.keepAwake === 'boolean') result.keepAwake = value.keepAwake;
  if (Array.isArray(value.noteNames)) {
    const names = [...new Set(value.noteNames.filter(name => NOTE_OPTIONS.some(note => note.name === name)))];
    if (names.length) result.noteNames = names;
  }
  for (const clef of ['treble', 'bass']) {
    if (Array.isArray(value.octaves?.[clef])) {
      const octaves = [...new Set(value.octaves[clef].filter(octave => OCTAVE_OPTIONS[clef].includes(octave)))].sort((a, b) => a - b);
      if (octaves.length) result.octaves[clef] = octaves;
    }
  }
  return result;
}

export function poolFor(settings) {
  const clefs = settings.clef === 'mixed' ? ['treble', 'bass'] : [settings.clef];
  const result = [];
  for (const clef of clefs) for (const octave of octavesFor(settings, clef)) {
    if (Array.isArray(settings.noteNames)) {
      for (const note of NOTE_OPTIONS.filter(note => settings.noteNames.includes(note.name))) {
        const tone = makeTone(note.letter, note.alteration, octave);
        if (settings.mode !== 'chords') result.push({ id: `note:${clef}:${note.letter}:${note.alteration}:${octave}`, kind: 'note', clef, pitchClass: note.pitchClass, label: note.name, tones: [tone], qualityId: null });
        if (settings.mode !== 'notes') for (const qualityId of settings.qualities) {
          const item = buildChord(note.pitchClass, qualityId, octave, () => 1, [note.letter, note.alteration]);
          result.push({ ...item, clef, id: `chord:${clef}:${note.letter}:${note.alteration}:${octave}:${qualityId}` });
        }
      }
      continue;
    }
    settings.enabled.forEach((enabled, pc) => {
      if (!enabled || !PITCH_CLASSES[pc]) return;
      if (settings.mode !== 'chords') {
        for (const [letter, alteration] of spellingsOf(pc)) {
          const tone = makeTone(letter, alteration, octave);
          result.push({ id: `note:${clef}:${letter}:${alteration}:${octave}`, kind: 'note', clef, pitchClass: pc, label: tone.name, tones: [tone], qualityId: null });
        }
      }
      if (settings.mode !== 'notes') {
        for (const qualityId of settings.qualities) {
          const item = buildChord(pc, qualityId, octave, () => 1);
          result.push({ ...item, clef, id: `chord:${clef}:${item.tones[0].letter}:${item.tones[0].alteration}:${octave}:${qualityId}` });
        }
      }
    });
  }
  return result;
}

export function answerName(answer, kind) {
  if (answer?.source === 'midi') return validMidiNotes(answer.notes) ? [...new Set(answer.notes)].sort((a, b) => a - b).map(midiNoteName).join(' · ') : '';
  if (!answer || !Number.isInteger(answer.letter) || answer.letter < 0 || answer.letter > 6 || ![-1, 0, 1].includes(answer.alteration)) return '';
  const root = toneName(answer.letter, answer.alteration);
  if (kind === 'note') return root;
  const quality = QUALITIES.find(q => q.id === answer.qualityId);
  return quality ? root + quality.suffix : '';
}

export function grade(item, answer) {
  if (answer?.source === 'midi') return matchesMidi(item, answer.notes);
  const root = item.tones[0];
  return Boolean(answer && answer.letter === root.letter && answer.alteration === root.alteration && (item.kind === 'note' || answer.qualityId === item.qualityId));
}

export function selectItem(pool, history, round, now = Date.now(), random = Math.random) {
  if (!pool.length) throw new Error('Choose at least one note and an applicable chord type.');
  const index = round.answers.length;
  const previous = round.answers.at(-1)?.item.id;
  const allowed = pool.filter(item => item.id !== previous && !(round.retryAfter[item.id] > index));
  const eligible = allowed.length ? allowed : pool.filter(item => item.id !== previous);
  const candidates = eligible.length ? eligible : pool;
  const readyRetry = candidates.filter(item => round.retryAfter[item.id] !== undefined && round.retryAfter[item.id] <= index);
  const overdue = candidates.filter(item => history[item.id] && history[item.id].due <= now && round.retryAfter[item.id] === undefined);
  const unseen = candidates.filter(item => !history[item.id]);
  const group = readyRetry.length ? readyRetry : overdue.length ? overdue : unseen.length ? unseen : candidates;
  // Among practised items, cover the least recently seen before cycling.
  const oldest = group === candidates || group === overdue ? Math.min(...group.map(item => history[item.id]?.lastSeen || 0)) : null;
  const options = oldest === null ? group : group.filter(item => (history[item.id]?.lastSeen || 0) === oldest);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

export function createRound(settings, history, now = Date.now(), random = Math.random) {
  const round = { id: `${now}-${Math.floor(random() * 1e9)}`, settings: structuredClone(settings), answers: [], retryAfter: {}, current: null, feedback: null, retrying: false, elapsed: 0, startedAt: now };
  round.current = selectItem(poolFor(settings), history, round, now, random);
  return round;
}

export function recordAnswer(round, history, answer, elapsed, now = Date.now()) {
  if (round.feedback || !round.current) return null;
  const item = round.current;
  const correct = grade(item, answer);
  const time = Math.max(0, Math.min(Number.isFinite(elapsed) ? elapsed : 0, 3600000));
  const feedback = { item, correct, answer: answer ? structuredClone(answer) : null, elapsed: time, at: now };
  if (round.retrying) { round.feedback = feedback; round.elapsed = 0; return feedback; }
  const old = history[item.id] || { attempts: 0, correct: 0, stage: 0, totalMs: 0, correctMs: 0, due: 0, lastSeen: 0 };
  const reviewDue = old.stage === 0 || old.due <= now;
  const stage = correct ? Math.min(old.stage + Number(reviewDue), INTERVAL_DAYS.length) : 0;
  const due = correct ? (reviewDue ? now + INTERVAL_DAYS[stage - 1] * DAY : old.due) : now;
  history[item.id] = { attempts: old.attempts + 1, correct: old.correct + Number(correct), stage, totalMs: old.totalMs + time, correctMs: old.correctMs + (correct ? time : 0), due, lastSeen: now };
  if (correct) delete round.retryAfter[item.id];
  else round.retryAfter[item.id] = round.answers.length + 4;
  round.answers.push(feedback);
  round.feedback = feedback;
  round.elapsed = 0;
  return feedback;
}

export function retryQuestion(round) {
  if (!round.feedback || round.feedback.correct || round.answers.at(-1)?.correct || round.answers.at(-1)?.item.id !== round.current?.id) return false;
  round.retrying = true;
  round.feedback = null;
  round.elapsed = 0;
  return true;
}

export function advance(round, history, now = Date.now(), random = Math.random) {
  if (!round.feedback) return false;
  round.feedback = null;
  round.retrying = false;
  if (round.answers.length >= round.settings.length) { round.current = null; return false; }
  round.current = selectItem(poolFor(round.settings), history, round, now, random);
  round.elapsed = 0;
  return true;
}

export function summarize(round) {
  const correct = round.answers.filter(a => a.correct);
  return { id: round.id, total: round.answers.length, correct: correct.length, accuracy: Math.round(correct.length / Math.max(1, round.answers.length) * 100), meanMs: correct.length ? Math.round(correct.reduce((sum, a) => sum + a.elapsed, 0) / correct.length) : null, difficult: [...new Map(round.answers.filter(a => !a.correct).map(a => [a.item.id, a.item])).values()] };
}
