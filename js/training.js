import { poolFor, selectedNamesFor, octavesFor, NOTE_OPTIONS } from './quiz.js';
import { makeTone } from './notes.js';

export const TRAINING_KEY = 'pianoQuiz.training.v1';
export const TRAINING_DEFAULTS = { bpm: 60, meter: 4, bars: 4, complexity: 'simple', style: 'guided', input: 'touch', pace: 'practice', accuracy: 'beginner', volume: .3, muted: false, offset: 0 };
export function normalizeTraining(raw) {
  const settings = { ...TRAINING_DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const [key, min, max] of [['bpm',40,200],['offset',-250,250],['volume',0,1]]) if (Number.isFinite(raw[key])) settings[key] = Math.max(min, Math.min(max, key === 'volume' ? raw[key] : Math.round(raw[key])));
    for (const [key, values] of Object.entries({ meter:[3,4], bars:[2,4,8], complexity:['simple','steady','eighths','mixed'], style:['guided','continuous'], input:['touch','midi'], pace:['practice','flow'], accuracy:['beginner','strict'] })) if (values.includes(raw[key])) settings[key] = raw[key];
    if (typeof raw.muted === 'boolean') settings.muted = raw.muted;
  }
  return settings;
}
const issueReasons = { pitch:'Wrong note', missed:'Missed note', offBeat:'Off the beat', short:'Too short', long:'Too long', rest:'Played during a rest' };
const issueKeys = Object.keys(issueReasons);
const timingKeys = ['early','centered','late','absoluteMs'];
const freshBar = () => ({ retries:0, issues:Object.fromEntries(issueKeys.map(key=>[key,0])), timing:{early:0,centered:0,late:0,absoluteMs:0} });
const nonnegative = n => Number.isFinite(n) && n >= 0;
const count = n => Number.isSafeInteger(n) && n >= 0;
export const totalIssues = bar => issueKeys.reduce((sum,key)=>sum+bar.issues[key],0);
export function hardestBar(result) {
  const bars = result.report.bars;
  const scores = bars.map(bar=>result.activity === 'sight' ? bar.retries : totalIssues(bar));
  const max = Math.max(0,...scores);
  return max ? scores.indexOf(max) : -1;
}

export function saveReplay(phrase, {bpm,input,accuracy,offset}) {
  return { meter:phrase.meter, clef:phrase.clef, bpm,input,accuracy,offset,
    bars:Array.from({length:phrase.bars},(_,bar)=>phrase.events.filter(e=>e.bar===bar).map(e=>({
      beats:e.durationBeats, rest:e.rest, tone:e.tone ? [e.tone.letter,e.tone.alteration,e.tone.octave] : null,
    }))) };
}
const validTone = tone => Array.isArray(tone) && tone.length===3 && count(tone[0]) && tone[0]<=6 && [-1,0,1].includes(tone[1]) && [1,2,3,4,5,6].includes(tone[2]);
function validReplay(replay, result) {
  return replay && [3,4].includes(replay.meter) && ['treble','bass'].includes(replay.clef) &&
    count(replay.bpm) && replay.bpm>=40 && replay.bpm<=200 && ['midi','touch'].includes(replay.input) &&
    ['beginner','strict'].includes(replay.accuracy) && Number.isInteger(replay.offset) && Math.abs(replay.offset)<=250 &&
    Array.isArray(replay.bars) && replay.bars.length===result.report.bars.length && replay.bars.every(bar =>
      Array.isArray(bar) && bar.length<=8 && bar.some(e=>e?.rest===false) &&
      bar.every(e=>e && [.5,1,1.5,2,3,4].includes(e.beats) && typeof e.rest==='boolean' &&
        (e.rest || result.activity==='rhythm' ? e.tone===null : validTone(e.tone))) &&
      bar.reduce((sum,e)=>sum+e.beats,0)===replay.meter);
}
export function replayPhrase(result, bar) {
  const {meter,clef,bars} = result.replay;
  let beat = 0;
  const events = bars[bar].map(({beats,rest,tone},id)=>{
    const event = {id,bar:0,beat,durationBeats:beats,rest,clef,tone:tone ? makeTone(...tone) : null};
    beat += beats;
    return event;
  });
  return {meter,clef,bars:1,totalBeats:meter,rhythm:result.activity==='rhythm',sourceBar:bar+1,events};
}
export const slowerReplayTempo = bpm => Math.max(40,Math.round(bpm*.8));
const HISTORY_LIMIT = 60;
export function comparisonSetup(phrase, settings, quizSettings) {
  return {level:settings.complexity,pace:settings.pace,
    notes:phrase.rhythm ? [] : [...selectedNamesFor(quizSettings)].sort(),
    octaves:phrase.rhythm ? [] : [...octavesFor(quizSettings,phrase.clef)].sort()};
}
function validComparison(value) {
  return value && Object.hasOwn(RHYTHM_LEVELS,value.level) && ['practice','flow'].includes(value.pace) &&
    Array.isArray(value.notes) && value.notes.length<=NOTE_OPTIONS.length && value.notes.every(name=>NOTE_OPTIONS.some(note=>note.name===name)) &&
    Array.isArray(value.octaves) && value.octaves.length<=4 && value.octaves.every(octave=>[1,2,3,4,5,6].includes(octave));
}
export function rememberTrainingResult(state, result) {
  state.lastResult = result;
  state.history = [result,...state.history].slice(0,HISTORY_LIMIT);
}

function restoreTrainingResult(result) {
  if (result?.version !== 1 || !['rhythm','sight'].includes(result.activity) || !['guided','continuous'].includes(result.style) || !['pitch','onset','holds'].every(key => result[key] === null || nonnegative(result[key]) && result[key] <= 100) || !['total','extras','retries','missed','restTotal','restErrors','at'].every(key => nonnegative(result[key]))) return null;
  const { report, replay, comparison, ...legacy } = result;
  if (!report || !nonnegative(report.elapsedMs) || !Array.isArray(report.bars) || ![2,4,8].includes(report.bars.length) || !report.bars.every(bar => count(bar?.retries) && issueKeys.every(key=>count(bar.issues?.[key])) && timingKeys.every(key=>(key==='absoluteMs'?nonnegative:count)(bar.timing?.[key])))) return legacy;
  const restored = { ...legacy, report };
  if (validReplay(replay,result)) {
    restored.replay = replay;
    if (validComparison(comparison)) restored.comparison = comparison;
  }
  return restored;
}
export function loadTraining(storage) {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(TRAINING_KEY));
    const history = Array.isArray(raw?.history) ? raw.history.slice(0,HISTORY_LIMIT).map(restoreTrainingResult).filter(result=>result?.comparison) : [];
    return { activity: ['quiz','metronome','rhythm','sight'].includes(raw?.activity) ? raw.activity : 'quiz', settings: normalizeTraining(raw?.settings), lastResult: restoreTrainingResult(raw?.lastResult), history };
  } catch { return { activity: 'quiz', settings: normalizeTraining(), lastResult: null, history:[] }; }
}
export function saveTraining(state) {
  try { localStorage.setItem(TRAINING_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const RHYTHM_LEVELS = {
  simple: { name:'Starter', values:[2,1], restChance:0, paired:false },
  steady: { name:'Steady', values:[4,2,1], restChance:.3, paired:false },
  eighths: { name:'Moving', values:[2,1,.5], restChance:.3, paired:true },
  mixed: { name:'Challenge', values:[4,3,2,1.5,1,.5], restChance:.4, paired:false },
};
const patternCache = new Map();
function rhythmPatterns(level, meter) {
  const key = `${level}:${meter}`;
  if (!patternCache.has(key)) {
    const config = RHYTHM_LEVELS[level], patterns = [];
    function fill(position, values) {
      if (position === meter) { patterns.push(values); return; }
      for (const value of config.values) {
        if (value > meter-position || config.paired && position % 1 !== 0 && value !== .5) continue;
        fill(position+value,[...values,value]);
      }
    }
    fill(0,[]); patternCache.set(key,patterns);
  }
  return patternCache.get(key);
}
const patternKey = values => values.join(',');

export function generatePhrase(settings, quizSettings, { rhythm = false, clefIndex = 0, random = Math.random, previousPhrase = null } = {}) {
  const clef = quizSettings.clef === 'mixed' ? clefIndex % 2 ? 'bass' : 'treble' : quizSettings.clef;
  const pool = rhythm ? [] : poolFor({ ...quizSettings, mode:'notes', clef });
  if (!rhythm && !pool.length) throw new Error('Choose at least one note and octave first.');
  const level = RHYTHM_LEVELS[settings.complexity] ? settings.complexity : 'simple';
  const config = RHYTHM_LEVELS[level], patterns = rhythmPatterns(level,settings.meter);
  const pick = items => items[Math.min(items.length-1,Math.floor(random()*items.length))];
  const usage = new Map(), pitchUsage = new Map(), events = [];
  const history = previousPhrase?.complexity === level && previousPhrase.meter === settings.meter && previousPhrase.rhythm === rhythm
    ? previousPhrase.patterns?.slice(-2) || [] : [];
  const chosen = [];
  let previous, beforePrevious, previousStart;
  for (let bar = 0; bar < settings.bars; bar++) {
    const least = Math.min(...patterns.map(values=>usage.get(patternKey(values)) || 0));
    let candidates = patterns.filter(values=>(usage.get(patternKey(values)) || 0) === least);
    const fresh = candidates.filter(values=>!history.includes(patternKey(values)));
    if (fresh.length) candidates = fresh;
    if (bar === 0) {
      const featured = candidates.filter(values=>level === 'steady' ? values.length > 1 : level === 'eighths' ? values.includes(.5) : level === 'mixed' ? values.some(value=>[1.5,3].includes(value)) : true);
      if (featured.length) candidates = featured;
    }
    const values = pick(candidates), signature = patternKey(values);
    usage.set(signature,(usage.get(signature) || 0)+1);
    history.push(signature); if (history.length > 2) history.shift();
    chosen.push(signature);
    const rests = new Set();
    if (values.length > 1 && (level === 'steady' && bar === 0 || random() < config.restChance)) {
      const places = values.map((_,i)=>i).filter(i=>level === 'mixed' || i > 0);
      rests.add(pick(places));
      if (level === 'mixed' && values.length > 3 && random() < .25) {
        const extra = places.filter(i=>!rests.has(i) && !rests.has(i-1) && !rests.has(i+1));
        if (extra.length) rests.add(pick(extra));
      }
    }
    let position = 0, barStart;
    for (let index = 0; index < values.length; index++) {
      const durationBeats = values[index], rest = rests.has(index);
      let tone = null;
      if (!rest && !rhythm) {
        const different = previous ? pool.filter(item=>item.tones[0].midi !== previous.midi) : pool;
        const nearby = previous ? different.filter(item=>Math.abs(item.tones[0].midi-previous.midi) <= 7) : different;
        let choices = nearby.length ? nearby : different.length ? different : pool;
        const varied = choices.filter(item=>item.tones[0].midi !== (barStart ? beforePrevious?.midi : previousStart?.midi));
        if (varied.length) choices = varied;
        const leastPlayed = Math.min(...choices.map(item=>pitchUsage.get(item.tones[0].midi) || 0));
        choices = choices.filter(item=>(pitchUsage.get(item.tones[0].midi) || 0) === leastPlayed);
        tone = pick(choices).tones[0];
        pitchUsage.set(tone.midi,(pitchUsage.get(tone.midi) || 0)+1);
        beforePrevious = previous; previous = tone; barStart ??= tone;
      }
      events.push({ id:events.length, bar, beat:bar*settings.meter+position, durationBeats, rest, tone, clef });
      position += durationBeats;
    }
    previousStart = barStart;
  }
  return { events, meter:settings.meter, bars:settings.bars, clef, rhythm, complexity:level, patterns:chosen, totalBeats:settings.meter*settings.bars };
}

export const holdTolerance = (milliseconds, accuracy = 'strict') => accuracy === 'beginner' ? Math.min(milliseconds * .4, Math.max(140, milliseconds * .3)) : Math.max(60, milliseconds * .15);
export const heldCorrectly = (actual, expected, accuracy) => Math.abs(actual - expected) <= holdTolerance(expected, accuracy);

export class ExerciseSession {
  constructor(phrase, { bpm = 60, offset = 0, guided = false, pace = 'flow', accuracy = 'strict', retryOnError = false } = {}) {
    Object.assign(this, { phrase, bpm, offset, guided, accuracy, retryOnError, gapBeats:!guided && pace === 'practice' ? phrase.meter : 0, beatMs:60000 / bpm, startTime:0, startBar:0, currentIndex:0, done:false, feedback:'', guidedRestStart:null, failure:null, retryReason:'', barFailures:0, lastHold:null });
    this.extraBars = []; this.retryBars = [];
    this.results = new Map();
    this.attempts = new Map();
    this.keys = new Map();
    this.holding = new Map();
    this.presses = [];
    this.pastRests = new Map();
    this.barStats = Array.from({length:phrase.bars},freshBar);
    this.elapsedMs = 0;
    this.runStart = null;
  }
  get extras() { return this.extraBars.length; }
  get retries() { return this.retryBars.length + this.barFailures; }
  fail(type, time, bar) {
    if (this.retryOnError && !this.failure) {
      this.failure = { reason:issueReasons[type], time, bar };
      this.barStats[bar].issues[type]++;
      this.barStats[bar].retries++;
    }
  }
  trackTiming(bar, error) {
    const timing = bar.timing;
    timing[error < -20 ? 'early' : error > 20 ? 'late' : 'centered']++;
    timing.absoluteMs += Math.abs(error);
  }
  beginRun(now) {
    if (this.runStart === null && now >= this.startTime) this.runStart = this.startTime;
  }
  pauseRun(now) {
    this.beginRun(now);
    if (this.runStart !== null) this.elapsedMs += Math.max(0, now-this.runStart);
    this.runStart = null;
  }
  retryBar(now, startTime) {
    const failure = this.failure;
    if (!failure) return;
    this.runStart ??= Math.min(failure.time,now);
    this.restartBar(now, failure.bar);
    this.barFailures++;
    this.startTime = startTime;
    this.retryReason = failure.reason;
  }
  holdDisplay(now) {
    const held = [...this.holding.values()][0];
    const target = held?.target ?? this.current;
    if (!held && this.lastHold && now - this.lastHold.at < 200) return { value:1, label:'Good release ✓', releasing:false };
    const elapsed = held ? (now-this.offset-held.result.on)/this.beatMs : target?.rest ? this.progress(now)-target.beat : 0;
    const rhythmWindow = held && this.phrase.rhythm && this.accuracy === 'beginner' && !this.guided;
    const fillBeats = rhythmWindow ? (this.releaseBounds(held).start-held.result.on)/this.beatMs : target?.durationBeats;
    const releasing = Boolean(held && elapsed >= fillBeats);
    return { value:target ? Math.min(1,Math.max(0,elapsed)/fillBeats) : 0, releasing,
      label:releasing ? rhythmWindow ? 'Release now · next press on the beat' : 'Release now' : target?.rest ? `Rest for ${target.durationBeats} beats` : `Hold for ${target?.durationBeats ?? 1} beat${target?.durationBeats === 1 ? '' : 's'}` };
  }
  releaseBounds({ target, result }) {
    const length = target.durationBeats*this.beatMs, tolerance = holdTolerance(length,this.accuracy);
    let minimum = length-tolerance;
    if (this.phrase.rhythm && this.accuracy === 'beginner' && !this.guided) {
      // Leave room to re-articulate a valid late attack before the next beat.
      const gridEnd = this.expected(target)+length;
      minimum = Math.min(minimum,Math.max(length*.5,gridEnd-tolerance-result.on));
    }
    return { start:result.on+minimum, end:result.on+length+tolerance };
  }
  extraAt(time, rest = null) { this.extraBars.push({bar:this.guided ? this.current?.bar ?? this.phrase.bars-1 : this.position(time).bar,rest}); }
  expected(event) { return this.startTime + (event.beat - this.startBar * this.phrase.meter + (event.bar - this.startBar) * this.gapBeats) * this.beatMs; }
  position(now) {
    const elapsed = Math.max(0, (now - this.startTime) / this.beatMs);
    const end = this.phrase.totalBeats - this.startBar * this.phrase.meter + (this.phrase.bars-1-this.startBar) * this.gapBeats;
    if (elapsed >= end) return { bar:this.phrase.bars-1, preparing:false, remaining:0, beat:this.phrase.totalBeats };
    const cycle = this.phrase.meter + this.gapBeats;
    const completed = Math.floor(elapsed / cycle), within = elapsed % cycle;
    const preparing = this.gapBeats > 0 && within >= this.phrase.meter && this.startBar + completed + 1 < this.phrase.bars;
    const bar = Math.min(this.phrase.bars - 1, this.startBar + completed + (preparing ? 1 : 0));
    return { bar, preparing, remaining:preparing ? cycle - within : 0, beat:bar * this.phrase.meter + (preparing ? 0 : Math.min(this.phrase.meter,within)) };
  }
  get current() { return this.phrase.events[this.currentIndex]; }
  window(event) {
    const notes = this.phrase.events.filter(e => !e.rest);
    const index = notes.indexOf(event);
    const gaps = [notes[index - 1], notes[index + 1]].filter(Boolean).map(e => Math.abs(e.beat - event.beat) * this.beatMs);
    return Math.min(this.accuracy === 'beginner' ? 220 : 100, ...gaps.map(gap => gap * .45));
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
    if (this.done || this.failure || event.type === 'reset') return;
    const time = event.timeStamp - this.offset, key = `${event.channel}:${event.note}`;
    this.beginRun(event.timeStamp);
    if (event.type === 'on') {
      if (this.keys.has(key)) return;
      const press = { key, on:time, off:null };
      this.keys.set(key, press); this.presses.push(press);
    } else {
      if (!this.keys.has(key)) return;
      this.keys.get(key).off = time; this.keys.delete(key);
    }
    const first = this.phrase.events.find(e => e.bar === this.startBar && !e.rest);
    if (this.retryReason && time < this.startTime) return;
    if (time >= this.startTime) this.retryReason = '';
    if (time < this.startTime - (this.guided || !first ? 0 : this.window(first))) return;
    if (this.guided) { this.guidedInput(event, key, time); return; }
    if (event.type === 'on') {
      this.lastHold = null;
      const candidates = this.phrase.events.filter(e => !e.rest && e.bar >= this.startBar && (!this.results.has(e.id) || this.results.get(e.id).status === 'missed') && Math.abs(time - this.expected(e)) <= this.window(e));
      candidates.sort((a,b) => Math.abs(time - this.expected(a)) - Math.abs(time - this.expected(b)) || a.beat - b.beat);
      const target = candidates[0];
      if (!target) {
        const {bar,preparing} = this.position(time);
        if (preparing) return;
        const rest = this.phrase.events.find(e => e.rest && e.bar >= this.startBar && time >= this.expected(e) && time < this.expected(e) + e.durationBeats * this.beatMs);
        this.extraAt(time,rest?.id ?? null);
        this.feedback = rest ? 'Rest here — let the keys go.' : 'Between notes — follow the beat.';
        this.fail(rest ? 'rest' : 'offBeat',event.timeStamp,bar);
        return;
      }
      const error = time - this.expected(target), pitch = this.phrase.rhythm || event.note === target.tone.midi;
      if (this.retryOnError) this.trackTiming(this.barStats[target.bar],error);
      if (!pitch && this.retryOnError) { this.fail('pitch',event.timeStamp,target.bar); return; }
      const result = { pitch, onset:true, duration:null, error, on:time, status:pitch ? 'holding' : 'wrong' };
      this.results.set(target.id, result); this.holding.set(key, { target, result });
      this.feedback = !pitch ? 'Different note — keep following the beat.' : `Key received · hold for ${target.durationBeats} beat${target.durationBeats === 1 ? '' : 's'}.`;
    } else {
      const held = this.holding.get(key);
      if (!held) return;
      const { target, result } = held;
      const bounds = this.releaseBounds(held);
      result.duration = time >= bounds.start && time <= bounds.end;
      result.status = result.pitch && result.duration ? 'correct' : 'wrong';
      if (!result.duration) this.feedback = this.durationFeedback(time - result.on, target.durationBeats * this.beatMs);
      else if (result.pitch) this.feedback = 'Good hold ✓';
      this.holding.delete(key);
      if (result.pitch && result.duration) this.lastHold = { at:event.timeStamp };
      if (!result.duration) {
        result.lengthIssue = time-result.on < target.durationBeats*this.beatMs ? 'short' : 'long';
        this.fail(result.lengthIssue,event.timeStamp,target.bar);
      }
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
      this.feedback = `Pitch matched · hold for ${target.durationBeats} beat${target.durationBeats === 1 ? '' : 's'}…`;
      return;
    }
    const held = this.holding.get(key);
    if (!held) return;
    this.holding.delete(key);
    const actual = time - held.result.on, expected = target.durationBeats * this.beatMs;
    if (!heldCorrectly(actual, expected, this.accuracy)) {
      attempt.duration = false; this.retryBars.push(target.bar);
      this.feedback = `${this.durationFeedback(actual, expected)} Try this note again.`;
      return;
    }
    this.results.set(target.id, { ...attempt, onset:null, status:'correct' });
    this.feedback = 'Good hold ✓';
    this.currentIndex++; this.guidedRestStart = null;
    if (this.current?.rest) this.feedback = 'Rest — keep the keys released.';
    this.done = !this.current;
  }
  durationFeedback(actual, expected) {
    return `${actual < expected ? 'Too short' : 'Too long'} · held ${(actual / this.beatMs).toFixed(1)} of ${(expected / this.beatMs).toFixed(1)} beats.`;
  }
  tick(now) {
    if (this.done || this.failure || now < this.startTime) return;
    this.beginRun(now);
    this.retryReason = '';
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
        if (held && now - this.offset - held.result.on >= target.durationBeats * this.beatMs) this.feedback = 'Release now.';
      }
      return;
    }
    for (const event of this.phrase.events) {
      if (event.bar < this.startBar) continue;
      if (event.rest) {
        if (this.retryOnError && now > this.expected(event)+Math.min(100,event.durationBeats*this.beatMs/4) && this.restFailed(event,now-this.offset)) { this.fail('rest',now,event.bar); return; }
        continue;
      }
      if (this.retryOnError && !this.results.has(event.id) && now > this.expected(event)+this.window(event)+Math.max(0,this.offset)+35) { this.fail('missed',now,event.bar); return; }
      if (!this.results.has(event.id) && now > this.expected(event) + this.window(event) + Math.max(0,this.offset)) this.results.set(event.id, { pitch:false, onset:false, duration:false, status:'missed' });
      const result = this.results.get(event.id);
      if (this.retryOnError && result?.status === 'missed' && now > this.expected(event)+this.window(event)+Math.max(0,this.offset)+35) { this.fail('missed',now,event.bar); return; }
      if (this.retryOnError && result?.duration === null && now-this.offset-result.on > event.durationBeats*this.beatMs+holdTolerance(event.durationBeats*this.beatMs,this.accuracy)) { this.fail('long',now,event.bar); return; }
      if (result?.duration === null && result.pitch && now - this.offset - result.on >= event.durationBeats * this.beatMs) this.feedback = 'Release now.';
    }
    const { beat } = this.position(now);
    this.currentIndex = this.phrase.events.findIndex(e => e.beat + e.durationBeats > beat);
    const tail = holdTolerance(4 * this.beatMs,this.accuracy) + Math.max(0,this.offset);
    const end = this.startTime + (this.phrase.totalBeats - this.startBar * this.phrase.meter + (this.phrase.bars-1-this.startBar) * this.gapBeats) * this.beatMs;
    if (now >= end + tail) {
      for (const {result} of this.holding.values()) { result.duration = false; result.status = 'wrong'; result.lengthIssue = 'long'; }
      this.done = true;
    }
  }
  progress(now) {
    if (!this.guided) return this.position(now).beat;
    const target = this.current;
    if (!target) return this.phrase.totalBeats;
    const began = target.rest ? this.guidedRestStart : [...this.holding.values()][0]?.result.on;
    return target.beat + (began === null || began === undefined ? 0 : Math.min(target.durationBeats, Math.max(0,now - (target.rest ? 0 : this.offset) - began) / this.beatMs));
  }
  restartBar(now, failedBar) {
    let bar = failedBar ?? (this.guided ? this.current?.bar ?? this.phrase.bars - 1 : Math.floor(Math.max(0,this.progress(now)) / this.phrase.meter));
    if (failedBar === undefined) for (const {target} of this.holding.values()) bar = Math.min(bar, target.bar);
    bar = Math.min(this.phrase.bars - 1,bar);
    if (!this.retryOnError && !this.guided) this.addPassStats(this.barStats,now,bar,true);
    for (const event of this.phrase.events) {
      if (event.bar >= bar) { this.results.delete(event.id); this.attempts.delete(event.id); }
      else if (event.rest) this.pastRests.set(event.id, this.restFailed(event,now-this.offset));
    }
    this.extraBars = this.extraBars.filter(value=>value.bar<bar); this.retryBars = this.retryBars.filter(value=>value<bar);
    this.keys.clear(); this.holding.clear(); this.presses = []; this.startBar = bar;
    this.currentIndex = this.phrase.events.findIndex(e => e.bar === bar); this.guidedRestStart = null; this.done = false;
    this.failure = null; this.retryReason = ''; this.feedback = ''; this.lastHold = null;
    return bar;
  }
  // Keep judged mistakes from an interrupted pass without treating future or held notes as misses.
  addPassStats(bars, now, firstBar = 0, interrupted = false) {
    const restPresses = new Set();
    for (const {bar,rest} of this.extraBars) {
      if (bar < firstBar) continue;
      if (rest === null) bars[bar].issues.offBeat++;
      else restPresses.add(rest);
    }
    for (const event of this.phrase.events) {
      if (event.bar < firstBar) continue;
      const bar = bars[event.bar], result = this.results.get(event.id);
      if (event.rest) {
        const failed = this.guided ? result?.duration !== true : this.restFailed(event,now-this.offset);
        if (failed || restPresses.has(event.id)) bar.issues.rest++;
        continue;
      }
      if (!result || result.status === 'missed') {
        if (!interrupted || result && now > this.expected(event)+this.window(event)+Math.max(0,this.offset)+35) bar.issues.missed++;
        continue;
      }
      if (result.pitch === false) bar.issues.pitch++;
      if (result.lengthIssue) bar.issues[result.lengthIssue]++;
      if (Number.isFinite(result.error)) this.trackTiming(bar,result.error);
    }
  }
  summary(now = performance.now()) {
    const notes = this.phrase.events.filter(e => !e.rest), rests = this.phrase.events.filter(e => e.rest);
    const values = notes.map(e => this.results.get(e.id));
    const percent = key => Math.round(100 * values.filter(r => r?.[key]).length / Math.max(1,notes.length));
    const errors = values.filter(r => Number.isFinite(r?.error)).map(r => r.error);
    const failedRests = rests.filter(e => this.guided ? this.results.get(e.id)?.duration !== true : this.restFailed(e,now-this.offset));
    const bars = structuredClone(this.barStats);
    if (!this.retryOnError) this.addPassStats(bars,now);
    const report = { bars, elapsedMs:Math.round(this.elapsedMs+(this.runStart === null ? 0 : Math.max(0,now-this.runStart))) };
    return { version:1, at:Date.now(), activity:this.phrase.rhythm ? 'rhythm' : 'sight', style:this.guided ? 'guided' : 'continuous', total:notes.length, pitch:this.phrase.rhythm ? null : percent('pitch'), onset:this.guided ? null : percent('onset'), holds:percent('duration'), extras:this.extras, retries:this.retries, missed:values.filter(r => !r || r.status === 'missed').length, restTotal:rests.length, restErrors:failedRests.length, meanError:errors.length ? Math.round(errors.reduce((a,b)=>a+b,0) / errors.length) : null, report };
  }
}
