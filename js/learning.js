import {
  poolFor,
  selectedNamesFor,
  rangeKey,
  DAY,
  INTERVAL_DAYS,
} from './quiz.js';
import { hardestBar } from './training.js';
import { canSaveProgress } from './storage.js';

export const STUDIO_KEY = 'pianoQuiz.studio.v2';
export const BACKUP_KEY = 'pianoQuiz.backup.preStudio.v1';
export const ACCENTS = ['brass', 'blue', 'violet', 'coral'];
export const legacyAppearance = (theme) => ({
  appearance: [
    'dark',
    'midnight',
    'plum',
    'ember',
    'graphite',
    'nocturne',
    'amoled',
  ].includes(theme)
    ? 'dark'
    : theme === 'system'
      ? 'system'
      : 'light',
  accent: ['ocean', 'arctic', 'midnight'].includes(theme)
    ? 'blue'
    : ['lavender', 'plum'].includes(theme)
      ? 'violet'
      : ['peach', 'rose', 'pulse', 'ember'].includes(theme)
        ? 'coral'
        : 'brass',
});
export const emptyStudio = (theme) => ({
  version: 2,
  ...legacyAppearance(theme),
  sessions: [],
  items: {},
});
export function loadStudio(storage, theme) {
  try {
    const raw = JSON.parse(storage.getItem(STUDIO_KEY));
    if (raw?.version !== 2) {
      const state = emptyStudio(theme);
      if (canSaveProgress()) storage.setItem(STUDIO_KEY, JSON.stringify(state));
      return state;
    }
    const state = emptyStudio(theme);
    if (['system', 'light', 'dark'].includes(raw.appearance))
      state.appearance = raw.appearance;
    if (ACCENTS.includes(raw.accent)) state.accent = raw.accent;
    if (Array.isArray(raw.sessions))
      state.sessions = raw.sessions
        .filter(
          (s) =>
            s?.version === 2 &&
            typeof s.id === 'string' &&
            Number.isFinite(s.at) &&
            ['touch', 'midi', 'mixed'].includes(s.input) &&
            Number.isFinite(s.total) &&
            s.total > 0 &&
            s.total <= 20 &&
            Number.isFinite(s.correct) &&
            s.correct >= 0 &&
            s.correct <= s.total &&
            typeof s.setup === 'string' &&
            Array.isArray(s.items),
        )
        .slice(0, 60);
    if (raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items))
      state.items = Object.fromEntries(
        Object.entries(raw.items).filter(
          ([key, s]) =>
            /^(touch|midi):/.test(key) &&
            s &&
            ['attempts', 'correct', 'due', 'stage', 'lastSeen'].every(
              (k) => Number.isFinite(s[k]) && s[k] >= 0,
            ) &&
            s.correct <= s.attempts &&
            s.stage <= 5,
        ),
      );
    return state;
  } catch {
    return emptyStudio(theme);
  }
}
export function recordLearningAnswer(studio, feedback, input) {
  const key = `${input}:${feedback.item.id}`;
  const old = studio.items[key] || {
    attempts: 0,
    correct: 0,
    stage: 0,
    due: 0,
  };
  const independent = feedback.correct && !feedback.assisted;
  const due = old.stage === 0 || old.due <= feedback.at;
  const stage = independent
    ? Math.min(INTERVAL_DAYS.length, old.stage + Number(due))
    : 0;
  studio.items[key] = {
    label: feedback.item.label,
    clef: feedback.item.clef,
    attempts: old.attempts + 1,
    correct: old.correct + Number(independent),
    stage,
    lastSeen: feedback.at,
    due: independent
      ? due
        ? feedback.at + INTERVAL_DAYS[stage - 1] * DAY
        : old.due
      : feedback.at,
  };
}

export function recordQuizSession(studio, round, result, now = Date.now()) {
  if (studio.sessions.some((s) => s.id === round.id)) return;
  const inputs = new Set(round.answers.map((a) => a.input ?? 'unknown'));
  if (inputs.has('unknown')) return; // An unfinished legacy round has no per-answer input record.
  const input = inputs.size === 1 ? [...inputs][0] : 'mixed';
  studio.sessions.unshift({
    version: 2,
    id: round.id,
    at: now,
    input,
    total: result.total,
    correct: result.correct,
    meanMs: result.meanMs,
    setup: JSON.stringify([
      round.settings.mode,
      round.settings.clef,
      selectedNamesFor(round.settings).sort(),
      rangeKey(round.settings),
      round.settings.qualities,
    ]),
    items: round.answers.map((a) => ({
      id: a.item.id,
      label: a.item.label,
      clef: a.item.clef,
      correct: a.correct,
      assisted: Boolean(a.assisted),
    })),
  });
  studio.sessions = studio.sessions.slice(0, 60);
}
export function recommend(state, training, now = Date.now(), studio = null) {
  if (state.active)
    return {
      kind: 'resume',
      title: 'Pick up where you left off',
      reason: 'Your unfinished round is saved.',
      detail: `${state.active.answers.length}/${state.active.settings.length} questions completed`,
      action: 'Resume session',
    };
  const input = state.settings.inputMode;
  const due = poolFor(state.settings).filter(
    (item) =>
      (studio?.items[`${input}:${item.id}`]?.due ??
        state.history[item.id]?.due ??
        Infinity) <= now,
  ).length;
  if (due)
    return {
      kind: 'review',
      title: 'Make these notes stick',
      reason: `${due} note${due === 1 ? ' is' : 's are'} ready for another recall.`,
      detail: `${input === 'midi' ? 'MIDI keyboard' : 'Tap names'} · ${state.settings.length} questions`,
      action: 'Start review',
    };
  const last = training.lastResult,
    bar = last?.report && last.replay ? hardestBar(last) : -1;
  if (bar >= 0)
    return {
      kind: 'bar',
      title: `Give bar ${bar + 1} another go`,
      reason:
        'A slower replay can help with the trickiest part of your last session.',
      detail: `${last.activity === 'sight' ? 'Sight-reading' : 'Rhythm'} · ${Math.max(40, Math.round(last.replay.bpm * 0.8))} BPM`,
      action: 'Practise this bar',
      bar,
      result: last,
    };
  const activity = training.activity;
  return {
    kind: 'practice',
    title:
      activity === 'quiz'
        ? 'Read and name notes'
        : activity === 'rhythm'
          ? 'Find your rhythm'
          : activity === 'sight'
            ? 'Read it. Play it.'
            : 'Make room for a steady beat',
    reason:
      activity === 'quiz'
        ? 'A short recall session with the notes you chose.'
        : 'Continue at your own pace with your saved setup.',
    detail:
      activity === 'quiz'
        ? `${state.settings.clef === 'mixed' ? 'Treble + bass' : state.settings.clef === 'bass' ? 'Bass' : 'Treble'} · ${state.settings.length} questions · ${state.settings.inputMode === 'midi' ? 'MIDI keyboard' : 'Tap names'}`
        : `${training.settings.bpm} BPM · ${training.settings.bars} bars`,
    action: 'Start session',
  };
}
export function noteHint(item) {
  const tone = item.tones[0];
  const bottom = item.clef === 'bass' ? 18 : 30;
  const position = tone.staffStep - bottom;
  if (position >= 0 && position <= 8)
    return `${position % 2 === 0 ? 'Line' : 'Space'} ${Math.floor(position / 2) + 1} from the bottom · ${item.clef} clef. ${tone.alteration === 1 ? 'The sharp raises the written note by a semitone.' : tone.alteration === -1 ? 'The flat lowers the written note by a semitone.' : 'Count lines and spaces from a note you know.'}`;
  return `${position < 0 ? 'Below' : 'Above'} the staff · ${item.clef} clef. Ledger lines continue the same line–space pattern. ${item.kind === 'chord' ? 'Start with the lowest written note.' : ''}`;
}
export const LESSONS = {
  notes: {
    title: 'Find your way around the staff',
    text: 'Read from the clef first. In treble clef, the second line is G4; in bass clef, the fourth line is F3. Each neighbouring line or space moves one letter: C D E F G A B. Start from a note you know and count up or down.',
    example:
      'Treble: E4 · G4 · B4 · D5 · F5 are the five lines. C5 is the third space.',
  },
  chords: {
    title: 'Read a chord from its root',
    text: 'Find the root name, then recognise the chord quality. Major and minor thirds differ by one semitone. Accidentals belong to the written spelling; C♯ and D♭ share a piano key but have different written names.',
    example: 'C major: C · E · G. C minor: C · E♭ · G.',
  },
  rhythm: {
    title: 'Press. Hold. Release.',
    text: 'A quarter note lasts one beat, a half note two. Two eighth notes share one beat: count “1 and, 2 and”. Press each note on its start and release at its end. A rest means silence for its full value.',
    example:
      'At 60 BPM: a quarter lasts 1 second; an eighth lasts half a second.',
  },
  sight: {
    title: 'Read before you play',
    text: 'Check the clef, meter and starting note. Choose a tempo slow enough to read ahead. Practice lets you repair each bar. Flow keeps the pulse moving through mistakes; find your place and join in again.',
    example:
      'Look for repeated notes, steps and skips. Read the next note while holding the current one.',
  },
  metronome: {
    title: 'Hear the pulse',
    text: 'The first click in each bar is accented. In 4/4, count 1–2–3–4; in 3/4, count 1–2–3. Tap along or play one familiar note. Keep a relaxed, steady pulse before increasing the tempo.',
    example: 'Start at 60 BPM. Count one complete bar before joining in.',
  },
};
