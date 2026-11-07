import { normalizeSettings, poolFor, localDay, summarize, selectedNamesFor, rangeKey, answerName } from './quiz.js';

export const STORAGE_KEY = 'pianoQuiz.state.v1';
export const freshState = () => ({ version: 1, settings: normalizeSettings(), history: {}, daily: {}, active: null, lastResult: null });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = value => Number.isFinite(value) && value >= 0;

export function restoreState(raw) {
  const state = freshState();
  if (!object(raw) || raw.version !== 1) return state;
  state.settings = normalizeSettings(raw.settings);
  if (object(raw.history)) {
    for (const [key, h] of Object.entries(raw.history)) {
      if (/^(note|chord):(treble|bass):[0-6]:-?[01]:[1-6](?::[a-z0-9]+)?$/.test(key) && object(h) && ['attempts', 'correct', 'stage', 'totalMs', 'correctMs', 'due', 'lastSeen'].every(k => nonnegative(h[k])) && Number.isInteger(h.stage) && h.stage <= 5 && Number.isInteger(h.attempts) && Number.isInteger(h.correct) && h.correct <= h.attempts) state.history[key] = h;
    }
  }
  if (object(raw.daily)) {
    for (const [date, count] of Object.entries(raw.daily).slice(-90)) if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(count) && count > 0) state.daily[date] = count;
  }
  if (object(raw.active)) {
    const a = raw.active;
    const settings = normalizeSettings(a.settings);
    const pool = new Map(poolFor(settings).map(item => [item.id, item]));
    const validAnswer = entry => object(entry) && object(entry.item) && pool.has(entry.item.id) && typeof entry.correct === 'boolean' && nonnegative(entry.elapsed) && nonnegative(entry.at) && (entry.answer === null || Boolean(answerName(entry.answer, pool.get(entry.item.id).kind)));
    if (typeof a.id === 'string' && a.id.length < 100 && nonnegative(a.startedAt) && Array.isArray(a.answers) && a.answers.length <= settings.length && a.answers.every(validAnswer) && object(a.retryAfter) && nonnegative(a.elapsed) && ((object(a.current) && pool.has(a.current.id) && (a.answers.length < settings.length || a.feedback !== null || a.retrying === true)) || (a.current === null && a.answers.length === settings.length && a.feedback === null)) && (a.feedback === null || validAnswer(a.feedback))) {
      const answers = a.answers.map(entry => ({ ...entry, item: pool.get(entry.item.id) }));
      const retrying = a.retrying === true;
      const last = answers.at(-1);
      const feedback = a.feedback ? { ...a.feedback, item: pool.get(a.feedback.item.id) } : null;
      if ((!retrying || last && !last.correct && last.item.id === a.current?.id) && (!feedback || last && feedback.item.id === a.current?.id && feedback.item.id === last.item.id && (retrying || feedback.correct === last.correct))) {
        state.active = { id: a.id, settings, answers, retryAfter: Object.fromEntries(Object.entries(a.retryAfter).filter(([id, index]) => pool.has(id) && Number.isInteger(index) && index >= 0 && index <= settings.length + 4)), current: a.current ? pool.get(a.current.id) : null, feedback, retrying, elapsed: Math.min(a.elapsed, 3600000), startedAt: a.startedAt };
      }
    }
  }
  if (object(raw.lastResult) && typeof raw.lastResult.id === 'string' && nonnegative(raw.lastResult.total) && nonnegative(raw.lastResult.correct) && raw.lastResult.correct <= raw.lastResult.total && raw.lastResult.total <= 20) {
    const r = raw.lastResult;
    state.lastResult = { id: r.id, total: r.total, correct: r.correct, accuracy: Math.round(r.correct / Math.max(1, r.total) * 100), meanMs: nonnegative(r.meanMs) ? r.meanMs : null, difficult: [], practiceKey: typeof r.practiceKey === 'string' ? r.practiceKey : '' };
  }
  return state;
}

export function loadState(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    try { return { state: restoreState(JSON.parse(raw)), available: true }; }
    catch { return { state: freshState(), available: true }; }
  } catch { return { state: freshState(), available: false }; }
}

export function saveState(state, storage) {
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function completeRound(state, now = Date.now()) {
  const round = state.active;
  if (!round || round.current || round.answers.length < round.settings.length) return null;
  const result = summarize(round);
  result.practiceKey = JSON.stringify([round.settings.mode, round.settings.clef, [...selectedNamesFor(round.settings)].sort(), round.settings.qualities, rangeKey(round.settings), round.settings.inputMode]);
  const previous = state.lastResult;
  result.improvement = previous?.practiceKey === result.practiceKey ? Math.max(0, result.accuracy - previous.accuracy) : 0;
  if (state.lastResult?.id !== round.id) {
    const day = localDay(now);
    state.daily[day] = (state.daily[day] || 0) + 1;
    state.daily = Object.fromEntries(Object.entries(state.daily).sort(([a], [b]) => a.localeCompare(b)).slice(-90));
  }
  state.lastResult = result;
  state.active = null;
  return result;
}
