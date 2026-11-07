export const TRAINING_KEY = 'pianoQuiz.training.v1';
export const TRAINING_DEFAULTS = { bpm: 60, meter: 4, bars: 4, complexity: 'simple', style: 'guided', input: 'touch', volume: .3, muted: false, offset: 0 };
export function normalizeTraining(raw) {
  const settings = { ...TRAINING_DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const [key, min, max] of [['bpm',40,200],['offset',-250,250],['volume',0,1]]) if (Number.isFinite(raw[key])) settings[key] = Math.max(min, Math.min(max, key === 'volume' ? raw[key] : Math.round(raw[key])));
    for (const [key, values] of Object.entries({ meter:[3,4], bars:[2,4,8], complexity:['simple','mixed'], style:['guided','continuous'], input:['touch','midi'] })) if (values.includes(raw[key])) settings[key] = raw[key];
    if (typeof raw.muted === 'boolean') settings.muted = raw.muted;
  }
  return settings;
}
export function loadTraining(storage) {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(TRAINING_KEY));
    return { activity: ['quiz','metronome','rhythm','sight'].includes(raw?.activity) ? raw.activity : 'quiz', settings: normalizeTraining(raw?.settings), lastResult: raw?.lastResult?.version === 1 ? raw.lastResult : null };
  } catch { return { activity: 'quiz', settings: normalizeTraining(), lastResult: null }; }
}
export function saveTraining(state) {
  try { localStorage.setItem(TRAINING_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
