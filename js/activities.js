import { BeatClock } from './timing.js';
import { loadTraining, saveTraining, normalizeTraining, generatePhrase, ExerciseSession } from './training.js';
import { renderScore, scoreX } from './score.js';

const $ = id => document.getElementById(id);
const labels = { quiz:'Quiz', metronome:'Metronome', rhythm:'Rhythm', sight:'Sight-reading' };

export class Activities {
  constructor({ goHome, openDialog, openNotes, renderHome, getQuizSettings, midi }) {
    Object.assign(this, { goHome, openDialog, openNotes, renderHome, getQuizSettings, midi });
    this.state = loadTraining();
    this.clock = new BeatClock({ onFrame: frame => this.frame(frame), onSuspended: () => this.pause('Audio stopped. Tap Resume when ready.') });
    this.active = false;
    this.starting = false;
    this.lastBeat = null;
    this.request = 0;
    this.phraseIndex = 0;
    $('activity-select').value = this.state.activity;
    $('activity-select').onchange = event => {
      this.stop(); this.state.activity = event.target.value; saveTraining(this.state); renderHome();
    };
    $('training-back').onclick = goHome;
    $('training-configure').onclick = () => this.configure();
    $('training-toggle').onclick = () => this.clock.running || this.starting ? this.pause() : void this.start(this.active && !this.completed);
    $('training-sound').onclick = () => { this.settings.muted = !this.settings.muted; this.sound(); saveTraining(this.state); };
    $('training-visual').onclick = () => { this.visualOnly = true; void this.start(this.active && !this.completed); };
    $('training-recheck').onclick = () => { this.pause('Rechecking your keyboard…'); void midi.recheck(); };
    $('training-notes').onclick = () => { $('training-dialog').close(); openNotes(); };
    $('home-training-notes').onclick = openNotes;
    $('live-training-notes').onclick = () => { this.pause(); openNotes(); };
    document.querySelectorAll('[data-training-input]').forEach(button => {
      button.onclick = () => this.changeInput(button.dataset.trainingInput);
    });
    const tempo = value => {
      this.settings.bpm = Math.max(40, Math.min(200, Math.round(Number(value)) || 60));
      this.clock.change(this.settings.bpm, this.settings.meter); saveTraining(this.state); this.refresh();
    };
    $('live-bpm').onchange = event => tempo(event.target.value);
    document.querySelectorAll('[data-tempo-step]').forEach(button => { button.onclick = () => tempo(this.settings.bpm + Number(button.dataset.tempoStep)); });
    $('live-meter').onchange = event => { this.settings.meter = Number(event.target.value); this.clock.change(this.settings.bpm, this.settings.meter); saveTraining(this.state); this.refresh(); };
    $('training-form').onsubmit = event => {
      event.preventDefault();
      const old = this.settings;
      this.state.settings = normalizeTraining({ ...old, ...Object.fromEntries(['bpm','meter','volume','offset','bars'].map(key => [key,Number($(`training-${key}`).value)])), ...Object.fromEntries(['complexity','input','pace','accuracy'].map(key => [key,$(`training-${key}`).value])) });
      $('training-dialog').close(); saveTraining(this.state); renderHome();
      if (this.active) { this.session = null; this.paused = true; this.completed = false; this.refresh(); this.message('Setup saved. Start a new exercise when ready.'); }
    };
    $('training-touchpad').onpointerdown = event => {
      if (event.button !== 0 || this.pointer !== undefined || !this.clock.running) return;
      event.preventDefault(); this.pointer = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('pressed');
      this.receive({ type:'on', note:60, channel:16, timeStamp:event.timeStamp }, 'touch');
    };
    $('training-touchpad').onpointerup = event => {
      if (this.pointer !== event.pointerId) return;
      this.pointer = undefined; event.currentTarget.classList.remove('pressed');
      this.receive({ type:'off', note:60, channel:16, timeStamp:event.timeStamp }, 'touch');
    };
    $('training-touchpad').onpointercancel = () => this.pause('Touch was interrupted. Resume to retry this bar.');
    $('training-touchpad').onlostpointercapture = () => { if (this.pointer !== undefined) this.pause('Touch was interrupted. Resume to retry this bar.'); };
    $('training-touchpad').oncontextmenu = event => event.preventDefault();
    $('training-touchpad').onselectstart = event => event.preventDefault();
    // Android can start its long-press gesture independently of Pointer Events.
    // Keep the pointer stream for grading while cancelling the native gesture.
    $('training-touchpad').addEventListener('touchstart', event => event.preventDefault(), { passive:false });
  }

  get activity() { return this.state.activity; }
  get settings() { return this.state.settings; }
  get exercise() { return this.activity === 'rhythm' || this.activity === 'sight'; }
  get requiresMidi() { return this.activity === 'sight' || this.activity === 'rhythm' && this.settings.input === 'midi'; }
  get supported() { return !this.requiresMidi || this.midi.status.state !== 'unsupported'; }

  inputStatus() {
    const status = this.midi.status;
    if (!this.requiresMidi) return status.connected ? 'Touch mode · MIDI is connected; select MIDI keyboard to use it.' : 'Touch mode · press and hold the pad below.';
    return status.connected ? `MIDI mode · connected to ${status.selectedName}` : status.state === 'unsupported' ? 'MIDI unavailable in this browser.' : 'MIDI mode · keyboard not connected.';
  }
  inputControls() {
    $('home-training-input').hidden = this.activity !== 'rhythm';
    $('home-sight-tools').hidden = this.activity !== 'sight';
    $('training-input-row').hidden = this.activity !== 'sight';
    $('training-sight-tools').hidden = this.activity !== 'sight';
    $('training-input-status').textContent = this.inputStatus();
    document.querySelectorAll('[data-training-input]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.trainingInput === this.settings.input)));
  }
  changeInput(input) {
    if (input === this.settings.input) return;
    const wasRunning = this.clock.running;
    if (this.active) this.pause();
    this.settings.input = input; saveTraining(this.state);
    if (this.active) {
      this.refresh();
      this.message(`${input === 'midi' ? 'MIDI keyboard' : 'Touch pad'} selected. Tap Resume for a fresh count-in.`);
      if (input === 'midi' && !this.midi.status.connected && this.supported) void this.midi.connect();
      else if (wasRunning) void this.start(true);
    } else this.renderHome();
  }

  home() {
    const quiz = this.activity === 'quiz';
    $('activity-select').value = this.activity;
    $('start-button').disabled = !this.supported;
    document.querySelector('.practice-card .input-mode-options').hidden = !quiz;
    this.inputControls();
    $('resume-note').textContent = 'Your unfinished round is ready when you are.';
    if (quiz) { $('customize-button').innerHTML = 'Choose notes <span aria-hidden="true">↗</span>'; return; }
    $('practice-title').textContent = labels[this.activity];
    const detail = this.activity === 'metronome' ? 'A steady beat, your own pace' : `${this.settings.bars} bars · ${this.activity === 'sight' ? 'MIDI keyboard · retry each bar' : this.settings.input === 'midi' ? 'MIDI key holds' : 'Touch and hold'}`;
    $('practice-detail').textContent = this.supported ? `${this.settings.bpm} BPM · ${this.settings.meter}/4 · ${detail}` : 'This activity needs Web MIDI. Use a compatible browser, or choose Rhythm with touch input.';
    $('customize-button').textContent = 'Set up ↗';
    $('start-button').innerHTML = `Start ${labels[this.activity].toLowerCase()} <span aria-hidden="true">→</span>`;
    const recent = this.state.lastResult;
    $('resume-note').hidden = recent?.activity !== this.activity;
    if (recent?.activity === this.activity) $('resume-note').textContent = `Last practice: ${recent.onset === null ? `${recent.pitch}% pitch` : `${recent.onset}% on the beat`} · ${recent.holds}% note lengths`;
  }

  configure() {
    this.pause();
    $('training-setup-title').textContent = `${labels[this.activity]} setup`;
    for (const key of ['bpm','meter','volume','offset','bars','complexity','input','pace','accuracy']) $(`training-${key}`).value = this.settings[key];
    document.querySelectorAll('[data-exercise-setting]').forEach(element => { element.hidden = !this.exercise; });
    document.querySelectorAll('[data-sight-setting]').forEach(element => { element.hidden = this.activity !== 'sight'; });
    document.querySelectorAll('[data-rhythm-setting]').forEach(element => { element.hidden = this.activity !== 'rhythm'; });
    $('training-setup-help').textContent = this.activity === 'sight' ? 'Play your selected notes on the beat. A wrong pitch, missed beat, bad hold or rest mistake restarts the whole bar on the next downbeat. Watch the countdown and release cue.' : this.activity === 'rhythm' ? 'Choose Touch pad or MIDI keyboard on Home. A half note lasts two beats. Green means the timing and release are both correct. Count in gives you a full bar to read ahead.' : 'The first beat is accented. Changes during playback start at the next bar.';
    this.openDialog('training-dialog');
  }

  message(text, wrong = false) {
    if ($('training-live-status').textContent !== text) $('training-live-status').textContent = text;
    $('training-live-status').classList.toggle('mistake',wrong);
  }

  sound() {
    this.clock.volume = this.settings.volume;
    this.clock.muted = this.settings.muted;
    $('training-sound').textContent = this.settings.muted ? 'Unmute clicks' : 'Mute clicks';
    $('training-sound').setAttribute('aria-pressed', String(this.settings.muted));
  }

  refresh() {
    const exercise = this.exercise;
    $('training-screen').dataset.activity = this.activity;
    $('training-screen').dataset.running = String(this.clock.running);
    $('training-screen').dataset.complete = String(Boolean(this.completed));
    $('training-title').textContent = this.completed ? 'A little more fluent.' : labels[this.activity];
    $('training-progress').textContent = this.completed ? 'Practice complete' : `${this.settings.bpm} BPM · ${this.settings.meter}/4`;
    $('metronome-tempo').textContent = `${this.settings.bpm} BPM`;
    $('live-bpm').value = this.settings.bpm;
    $('live-meter').value = this.settings.meter;
    this.renderedMeter = this.clock.running ? this.clock.meter : this.settings.meter;
    $('training-beats').innerHTML = Array.from({ length:this.renderedMeter }, (_,i) => `<span data-beat="${i}" class="${this.lastBeat === i ? 'active' : ''}" aria-hidden="true"></span>`).join('');
    $('training-toggle').textContent = this.starting ? 'Starting…' : this.clock.running ? 'Pause' : this.completed ? 'Try another' : this.requiresMidi && !this.midi.status.connected ? 'Connect MIDI' : this.paused ? 'Resume' : 'Start';
    $('training-toggle').disabled = this.starting || !this.supported;
    $('metronome-display').hidden = exercise;
    $('training-beats').hidden = Boolean(this.completed);
    $('training-summary').hidden = !this.completed;
    $('exercise-score').hidden = !exercise || Boolean(this.completed);
    $('hold-coach').hidden = !exercise || Boolean(this.completed);
    $('training-touchpad').hidden = this.activity !== 'rhythm' || this.settings.input !== 'touch' || Boolean(this.completed);
    $('training-touchpad').disabled = !this.clock.running;
    $('training-recheck').hidden = !this.requiresMidi || !this.supported;
    $('training-sound').hidden = Boolean(this.completed);
    $('training-footnote').textContent = this.activity === 'metronome' ? 'Tempo changes start at the next bar.' : this.requiresMidi ? 'Physical key holds · keyboard supplies piano sound' : 'Press on the beat. Hold for the full note value.';
    this.sound();
    this.inputControls();
  }

  async start(resume = false) {
    const request = ++this.request;
    this.sessionOffset = 0;
    this.active = true; this.paused = false; this.starting = true; this.completed = false; this.lastBeat = null;
    if (this.exercise && (!resume || !this.session)) {
      try {
        this.phrase = generatePhrase(this.settings,this.getQuizSettings(),{rhythm:this.activity==='rhythm',clefIndex:this.phraseIndex++});
        this.session = new ExerciseSession(this.phrase,{...this.settings,retryOnError:this.activity==='sight'});
      } catch (error) { this.starting = false; this.refresh(); this.message(error.message,true); return; }
    }
    this.drawSignature = null;
    this.refresh();
    if (this.exercise) {
      this.session.startTime = Infinity;
      delete $('exercise-score').dataset.startTime;
      this.draw(performance.now());
    }
    if (this.requiresMidi && !this.midi.status.connected) {
      this.starting = false; this.paused = true; this.refresh();
      this.message(this.supported ? 'Connect your keyboard, then tap Resume to begin.' : 'Web MIDI is unavailable in this browser. Rhythm can use touch input.',true);
      if (this.supported && !this.midi.wanted) void this.midi.connect();
      return;
    }
    this.message('Getting your beat ready…');
    const running = await this.clock.start({ ...this.settings, countIn:this.exercise ? this.settings.meter : 0, visualOnly:this.visualOnly });
    if (request !== this.request) return;
    this.starting = false;
    if (this.session && running) {
      this.session.startTime = this.clock.exerciseStart;
      $('exercise-score').dataset.startTime = this.session.startTime;
    }
    this.refresh();
    if (!this.active) return;
    $('training-visual').hidden = Boolean(running);
    this.message(running ? this.exercise ? 'Count in, then follow the score.' : this.visualOnly ? 'Visual beat · audio unavailable' : 'Find your beat. Take your time.' : 'Audio could not start. Try Start again, or use the visual beat.');
  }

  frame({ time, beat, meterBeat = beat, startTime }) {
    if (this.renderedMeter !== this.clock.meter) this.refresh();
    const index = Math.max(0, Math.floor(meterBeat)) % this.clock.meter;
    if (this.lastBeat !== index) {
      this.lastBeat = index;
      $('metronome-number').textContent = index + 1;
      for (const dot of $('training-beats').children) dot.classList.toggle('active', Number(dot.dataset.beat) === index);
    }
    if (!this.exercise || !this.session || this.completed) return;
    this.session.startTime = startTime + this.sessionOffset;
    $('exercise-score').dataset.startTime = this.session.startTime;
    if (time < this.session.startTime) { this.draw(time); this.countdown(time); return; }
    this.session.tick(time);
    if (this.retryFailure(time)) return;
    if (this.session.done) { this.finish(); return; }
    this.draw(time);
    const position = this.session.position(time);
    if (!this.session.guided && position.preparing) {
      this.message(`Read bar ${position.bar+1} · count in ${Math.ceil(position.remaining)}`);
      return;
    }
    this.message(this.session.feedback || (this.session.current?.rest ? 'Rest — release the keys.' : this.session.guided ? 'Read the note, then hold for its full value.' : this.activity === 'sight' ? 'Follow the beat. Complete this bar to move on.' : 'Follow the cursor. Keep going through mistakes.'), /Too |Different|Try |Between|Rest here|Rest means/.test(this.session.feedback));
  }

  draw(time) {
    if (!this.session || !this.phrase) return;
    const progress = this.session.progress(time);
    const bar = this.session.guided ? this.session.current?.bar ?? this.phrase.bars-1 : Math.max(this.session.startBar, Math.min(this.phrase.bars-1, Math.floor(Math.max(0,progress)/this.phrase.meter)));
    const current = this.session.current?.id ?? -1;
    const signature = `${bar}:${current}:` + [...this.session.results.entries()].map(([id,result])=>`${id}${result.status}`).join(',');
    if (signature !== this.drawSignature) {
      this.drawSignature = signature;
      $('exercise-score').innerHTML = renderScore(this.phrase,bar,this.session.results,current);
    }
    for (const measure of $('exercise-score').children) {
      const cursor = measure.querySelector('[data-cursor]');
      const visible = Number(measure.dataset.bar) === bar;
      cursor.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) cursor.setAttribute('transform',`translate(${scoreX(Math.max(0,Math.min(this.phrase.meter,progress-bar*this.phrase.meter)),this.phrase.meter)} 0)`);
    }
    const held = [...this.session.holding.values()][0];
    const coach = this.session.holdDisplay(time);
    $('hold-progress').value = coach.value;
    $('hold-label').textContent = coach.label;
    $('training-touchpad').textContent = held ? coach.releasing ? 'Release now' : 'Keep holding…' : 'Press and hold';
    for (const measure of $('exercise-score').children) {
      for (const note of measure.querySelectorAll('[data-event]')) {
        const holding = [...this.session.holding.values()].some(value => value.target.id === Number(note.dataset.event));
        note.classList.toggle('holding',holding);
      }
    }
    if (this.clock.running) $('training-progress').textContent = `${this.settings.bpm} BPM · Bar ${bar+1}/${this.phrase.bars}`;
  }

  receive(event, source = 'midi') {
    if (!this.active || !this.exercise || !this.clock.running || document.hidden || document.querySelector('dialog[open]') || source === 'midi' && !this.requiresMidi) return;
    if (event.type === 'reset') { this.pause('Keyboard notes reset. Resume to retry this bar.'); return; }
    this.session.startTime = this.clock.exerciseStart + this.sessionOffset;
    this.session.input(event);
    if (this.retryFailure(performance.now())) return;
    if (performance.now() < this.session.startTime) { this.draw(performance.now()); this.countdown(performance.now()); return; }
    if (this.session.done) this.finish();
    else { this.draw(performance.now()); if (this.session.feedback) this.message(this.session.feedback); }
  }

  countdown(time) {
    const count = Math.max(1, Math.ceil((this.session.startTime-time)/this.session.beatMs));
    const retry = this.session.retryReason;
    this.message(retry ? `${retry} · get ready to play in ${count} beat${count === 1 ? '' : 's'}` : `Get ready · ${count}`, Boolean(retry));
    if (retry) $('training-progress').textContent = `${this.settings.bpm} BPM · Retry in ${count}`;
  }
  retryFailure(time) {
    if (!this.session?.failure) return false;
    const start = this.clock.nextDownbeat(time + this.session.beatMs);
    this.session.retryBar(time,start);
    this.sessionOffset = start-this.clock.exerciseStart;
    $('exercise-score').dataset.startTime = start;
    this.drawSignature = null;
    this.draw(time); this.countdown(time);
    return true;
  }

  pause(message = 'Paused. Resume starts this bar with a count-in.') {
    ++this.request;
    if (this.exercise && this.session && this.clock.running && !this.completed) this.session.restartBar(performance.now());
    this.clock.stop(); this.starting = false;
    this.pointer = undefined; $('training-touchpad').classList.remove('pressed');
    if (!this.active) return;
    this.paused = true; this.refresh(); this.message(message);
  }
  stop() { ++this.request; this.clock.stop(); this.active = false; this.starting = false; this.paused = false; this.session = null; this.completed = false; this.pointer = undefined; $('training-touchpad').classList.remove('pressed'); }
  midiChanged(status) {
    this.inputControls();
    if (!this.active || !this.requiresMidi) return;
    if (!status.connected && this.clock.running) this.pause('Keyboard disconnected. Recheck MIDI, then Resume.');
    else if (status.connected && !this.clock.running) { this.refresh(); this.message('Keyboard connected. Tap Resume when ready.'); }
  }
  finish() {
    const result = this.session.summary();
    this.clock.stop(); this.completed = true; this.paused = false;
    this.state.lastResult = result; saveTraining(this.state); this.refresh();
    const metrics = [[result.pitch,'Pitch'],[result.onset,'On the beat'],[result.holds,'Note lengths']].filter(([value])=>value!==null);
    $('training-summary').innerHTML = `<div class="training-metrics">${metrics.map(([value,label])=>`<div><strong>${value}%</strong><span>${label}</span></div>`).join('')}</div><p class="muted">${result.total} notes · ${result.missed} missed · ${result.extras} extra</p><p class="small muted">${result.style==='guided'?`${result.retries} retries · first-try pitch and note lengths`:`${this.activity==='sight'?`${result.retries} bar retries · `:''}${result.restErrors} rest mistakes${result.meanError===null?'':` · average ${Math.abs(result.meanError)} ms ${result.meanError<0?'early':'late'}`}`}</p>`;
    this.message('Every little practice counts. Try again at your own pace.');
  }
}
