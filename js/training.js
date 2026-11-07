import { poolFor } from './quiz.js';

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
function validTrainingResult(result) {
  return result?.version === 1 && ['rhythm','sight'].includes(result.activity) && ['guided','continuous'].includes(result.style) && ['pitch','onset','holds'].every(key => result[key] === null || Number.isFinite(result[key]) && result[key] >= 0 && result[key] <= 100) && ['total','extras','retries','missed','restTotal','restErrors','at'].every(key => Number.isFinite(result[key]) && result[key] >= 0);
}
export function loadTraining(storage) {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(TRAINING_KEY));
    return { activity: ['quiz','metronome','rhythm','sight'].includes(raw?.activity) ? raw.activity : 'quiz', settings: normalizeTraining(raw?.settings), lastResult: validTrainingResult(raw?.lastResult) ? raw.lastResult : null };
  } catch { return { activity: 'quiz', settings: normalizeTraining(), lastResult: null }; }
}
export function saveTraining(state) {
  try { localStorage.setItem(TRAINING_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function generatePhrase(settings, quizSettings, { rhythm = false, clefIndex = 0, random = Math.random } = {}) {
  const clef = quizSettings.clef === 'mixed' ? clefIndex % 2 ? 'bass' : 'treble' : quizSettings.clef;
  const pool = rhythm ? [] : poolFor({ ...quizSettings, mode:'notes', clef });
  if (!rhythm && !pool.length) throw new Error('Choose at least one note and octave first.');
  const events = [];
  let previous;
  for (let bar = 0; bar < settings.bars; bar++) {
    let position = 0, sounded = false;
    while (position < settings.meter) {
      const values = (settings.complexity === 'mixed' ? [4,2,1,.5] : [2,1]).filter(value => value <= settings.meter - position);
      const durationBeats = values[Math.min(values.length - 1, Math.floor(random() * values.length))];
      const rest = settings.complexity === 'mixed' && sounded && random() < .22;
      let tone = null;
      if (!rest) {
        if (!rhythm) {
          const nearby = previous ? pool.filter(item => Math.abs(item.tones[0].midi - previous.midi) <= 7 && item.tones[0].midi !== previous.midi) : pool;
          const choices = nearby.length ? nearby : pool;
          tone = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))].tones[0];
          previous = tone;
        }
        sounded = true;
      }
      events.push({ id:events.length, bar, beat:bar * settings.meter + position, durationBeats, rest, tone, clef });
      position += durationBeats;
    }
  }
  return { events, meter:settings.meter, bars:settings.bars, clef, rhythm, totalBeats:settings.meter * settings.bars };
}

export const holdTolerance = milliseconds => Math.max(60, milliseconds * .15);
export const heldCorrectly = (actual, expected) => Math.abs(actual - expected) <= holdTolerance(expected);

export class ExerciseSession {
  constructor(phrase, { bpm = 60, offset = 0, guided = false } = {}) {
    Object.assign(this, { phrase, bpm, offset, guided, beatMs:60000 / bpm, startTime:0, startBar:0, currentIndex:0, done:false, feedback:'', guidedRestStart:null });
    this.extraBars = []; this.retryBars = [];
    this.results = new Map();
    this.attempts = new Map();
    this.keys = new Map();
    this.holding = new Map();
    this.presses = [];
    this.pastRests = new Map();
  }
  get extras() { return this.extraBars.length; }
  get retries() { return this.retryBars.length; }
  extraAt(time) { this.extraBars.push(this.guided ? this.current?.bar ?? this.phrase.bars-1 : Math.min(this.phrase.bars-1,Math.max(0,Math.floor((this.startBar*this.phrase.meter+(time-this.startTime)/this.beatMs)/this.phrase.meter)))); }
  expected(event) { return this.startTime + (event.beat - this.startBar * this.phrase.meter) * this.beatMs; }
  get current() { return this.phrase.events[this.currentIndex]; }
  window(event) {
    const notes = this.phrase.events.filter(e => !e.rest);
    const index = notes.indexOf(event);
    const gaps = [notes[index - 1], notes[index + 1]].filter(Boolean).map(e => Math.abs(e.beat - event.beat) * this.beatMs);
    return Math.min(100, ...gaps.map(gap => gap * .45));
  }
  attempt(event) {
    if (!this.attempts.has(event.id)) this.attempts.set(event.id, { pitch:true, duration:true });
    return this.attempts.get(event.id);
  }
  restFailed(event, now) {
    if (this.pastRests.has(event.id)) return this.pastRests.get(event.id);
    const start = this.expected(event), length = event.durationBeats * this.beatMs;
    const grace = Math.min(100, length / 4);
    return this.presses.some(press => press.on < start + length - grace && (press.off ?? now) > start + grace);
  }
  input(event) {
    if (this.done || event.type === 'reset') return;
    const time = event.timeStamp - this.offset, key = `${event.channel}:${event.note}`;
    if (event.type === 'on') {
      if (this.keys.has(key)) return;
      const press = { key, on:time, off:null };
      this.keys.set(key, press); this.presses.push(press);
    } else {
      if (!this.keys.has(key)) return;
      this.keys.get(key).off = time; this.keys.delete(key);
    }
    if (time < this.startTime) return;
    if (this.guided) { this.guidedInput(event, key, time); return; }
    if (event.type === 'on') {
      const candidates = this.phrase.events.filter(e => !e.rest && e.bar >= this.startBar && (!this.results.has(e.id) || this.results.get(e.id).status === 'missed') && Math.abs(time - this.expected(e)) <= this.window(e));
      candidates.sort((a,b) => Math.abs(time - this.expected(a)) - Math.abs(time - this.expected(b)) || a.beat - b.beat);
      const target = candidates[0];
      if (!target) { this.extraAt(time); this.feedback = this.phrase.events.some(e => e.rest && time >= this.expected(e) && time < this.expected(e) + e.durationBeats * this.beatMs) ? 'Rest here — let the keys go.' : 'Between notes — follow the beat.'; return; }
      const error = time - this.expected(target), pitch = this.phrase.rhythm || event.note === target.tone.midi;
      const result = { pitch, onset:true, duration:null, error, on:time, status:pitch ? 'holding' : 'wrong' };
      this.results.set(target.id, result); this.holding.set(key, { target, result });
      this.feedback = !pitch ? 'Different note — keep following the beat.' : Math.abs(error) < 30 ? 'On the beat. Hold…' : `${error < 0 ? 'Early' : 'Late'} by ${Math.round(Math.abs(error))} ms. Hold…`;
    } else {
      const held = this.holding.get(key);
      if (!held) return;
      const { target, result } = held;
      result.duration = heldCorrectly(time - result.on, target.durationBeats * this.beatMs);
      result.status = result.pitch && result.duration ? 'correct' : 'wrong';
      if (!result.duration) this.feedback = time - result.on < target.durationBeats * this.beatMs ? 'Too short — hold for the full note value.' : 'Too long — release at the end of the note.';
      else if (result.pitch) this.feedback = 'Good hold ✓';
      this.holding.delete(key);
    }
  }
  guidedInput(event, key, time) {
    const target = this.current;
    if (!target) return;
    const attempt = this.attempt(target);
    if (target.rest) {
      if (event.type === 'on') { attempt.duration = false; this.retryBars.push(target.bar); this.guidedRestStart = null; this.feedback = 'Rest means silence. Release, then try this rest again.'; }
      return;
    }
    if (event.type === 'on') {
      if (this.holding.size) { this.extraAt(time); this.feedback = 'One note at a time. Finish the held note.'; return; }
      if (event.note !== target.tone.midi) { attempt.pitch = false; this.retryBars.push(target.bar); this.feedback = 'Try the displayed note. You can play it now.'; return; }
      this.holding.set(key, { target, result:{ on:time } });
      this.feedback = `Hold for ${target.durationBeats} beat${target.durationBeats === 1 ? '' : 's'}…`;
      return;
    }
    const held = this.holding.get(key);
    if (!held) return;
    this.holding.delete(key);
    const actual = time - held.result.on, expected = target.durationBeats * this.beatMs;
    if (!heldCorrectly(actual, expected)) {
      attempt.duration = false; this.retryBars.push(target.bar);
      this.feedback = `${actual < expected ? 'Too short' : 'Too long'} — try this note for ${target.durationBeats} beats.`;
      return;
    }
    this.results.set(target.id, { ...attempt, onset:null, status:'correct' });
    this.feedback = 'Good hold ✓';
    this.currentIndex++; this.guidedRestStart = null;
    if (this.current?.rest) this.feedback = 'Rest — keep the keys released.';
    this.done = !this.current;
  }
  tick(now) {
    if (this.done || now < this.startTime) return;
    if (this.guided) {
      const target = this.current;
      if (!target) { this.done = true; return; }
      if (target.rest) {
        if (this.keys.size) this.guidedRestStart = null;
        else if (this.guidedRestStart === null) this.guidedRestStart = now;
        if (this.guidedRestStart !== null && now - this.guidedRestStart >= target.durationBeats * this.beatMs) {
          this.results.set(target.id, { ...this.attempt(target), status:'correct' });
          this.currentIndex++; this.guidedRestStart = null; this.done = !this.current;
        }
      } else {
        const held = [...this.holding.values()][0];
        if (held && now - held.result.on >= target.durationBeats * this.beatMs) this.feedback = 'Release now.';
      }
      return;
    }
    for (const event of this.phrase.events) {
      if (event.rest || event.bar < this.startBar) continue;
      if (!this.results.has(event.id) && now > this.expected(event) + this.window(event) + Math.max(0,this.offset)) this.results.set(event.id, { pitch:false, onset:false, duration:false, status:'missed' });
      const result = this.results.get(event.id);
      if (result?.duration === null && now - result.on > event.durationBeats * this.beatMs + holdTolerance(event.durationBeats * this.beatMs)) { result.duration = false; result.status = 'wrong'; }
    }
    const beat = this.startBar * this.phrase.meter + (now - this.startTime) / this.beatMs;
    this.currentIndex = this.phrase.events.findIndex(e => e.beat + e.durationBeats > beat);
    const tail = holdTolerance(4 * this.beatMs) + Math.max(0,this.offset);
    if (now >= this.startTime + (this.phrase.totalBeats - this.startBar * this.phrase.meter) * this.beatMs + tail) this.done = true;
  }
  progress(now) {
    if (!this.guided) return this.startBar * this.phrase.meter + (now - this.startTime) / this.beatMs;
    const target = this.current;
    if (!target) return this.phrase.totalBeats;
    const began = target.rest ? this.guidedRestStart : [...this.holding.values()][0]?.result.on;
    return target.beat + (began === null || began === undefined ? 0 : Math.min(target.durationBeats, Math.max(0,now - began) / this.beatMs));
  }
  restartBar(now) {
    let bar = this.guided ? this.current?.bar ?? this.phrase.bars - 1 : Math.floor(Math.max(0,this.progress(now)) / this.phrase.meter);
    for (const {target} of this.holding.values()) bar = Math.min(bar, target.bar);
    bar = Math.min(this.phrase.bars - 1,bar);
    for (const event of this.phrase.events) {
      if (event.bar >= bar) { this.results.delete(event.id); this.attempts.delete(event.id); }
      else if (event.rest) this.pastRests.set(event.id, this.restFailed(event,now));
    }
    this.extraBars = this.extraBars.filter(value=>value<bar); this.retryBars = this.retryBars.filter(value=>value<bar);
    this.keys.clear(); this.holding.clear(); this.presses = []; this.startBar = bar;
    this.currentIndex = this.phrase.events.findIndex(e => e.bar === bar); this.guidedRestStart = null; this.done = false;
    return bar;
  }
  summary(now = performance.now()) {
    const notes = this.phrase.events.filter(e => !e.rest), rests = this.phrase.events.filter(e => e.rest);
    const values = notes.map(e => this.results.get(e.id));
    const percent = key => Math.round(100 * values.filter(r => r?.[key]).length / Math.max(1,notes.length));
    const errors = values.filter(r => Number.isFinite(r?.error)).map(r => r.error);
    return { version:1, at:Date.now(), activity:this.phrase.rhythm ? 'rhythm' : 'sight', style:this.guided ? 'guided' : 'continuous', total:notes.length, pitch:this.phrase.rhythm ? null : percent('pitch'), onset:this.guided ? null : percent('onset'), holds:percent('duration'), extras:this.extras, retries:this.retries, missed:values.filter(r => !r || r.status === 'missed').length, restTotal:rests.length, restErrors:rests.filter(e => this.guided ? this.results.get(e.id)?.duration !== true : this.restFailed(e,now)).length, meanError:errors.length ? Math.round(errors.reduce((a,b)=>a+b,0) / errors.length) : null };
  }
}
