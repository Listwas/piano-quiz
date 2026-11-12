import { BeatClock } from './timing.js';
import { loadTraining, saveTraining, normalizeTraining, generatePhrase, ExerciseSession, hardestBar, saveReplay, replayPhrase, slowerReplayTempo, comparisonSetup, rememberTrainingResult } from './training.js';
import { renderScore, scoreX } from './score.js';
import { firstTryBars, renderTrainingDetails, renderTrainingReport } from './training-report.js';
import { groupSessions, historyLabel, renderHistoryGroup } from './training-history.js';
import { MidiCalibration } from './calibration.js';

const $ = id => document.getElementById(id);
const labels = { quiz:'Quiz', metronome:'Metronome', rhythm:'Rhythm', sight:'Sight-reading' };

export class Activities {
  constructor({ goHome, showTraining, openDialog, openNotes, renderHome, getQuizSettings, midi }) {
    Object.assign(this, { goHome, showTraining, openDialog, openNotes, renderHome, getQuizSettings, midi });
    this.state = loadTraining();
    this.calibration = new MidiCalibration({midi,openDialog,getOffset:()=>this.state.settings.offset,applyOffset:offset=>{
      this.state.settings.offset = offset;
      $('training-offset').value = offset;
      return saveTraining(this.state);
    }});
    $('midi-calibrate').onclick = () => this.calibration.open('settings-dialog');
    $('training-calibrate').onclick = () => this.calibration.open('training-dialog');
    this.clock = new BeatClock({ onFrame: frame => this.frame(frame), onSuspended: () => this.pause('Audio stopped. Tap Resume when ready.',true) });
    this.active = false;
    this.starting = false;
    this.lastBeat = null;
    this.request = 0;
    this.phraseIndex = 0;
    this.phraseHistory = new Map();
    $('activity-select').value = this.state.activity;
    $('activity-select').onchange = event => {
      this.stop(); this.state.activity = event.target.value; saveTraining(this.state); renderHome();
    };
    $('training-back').onclick = () => this.drill ? this.backFromDrill() : goHome();
    $('training-configure').onclick = () => this.configure();
    $('training-toggle').onclick = () => this.clock.running || this.starting ? this.pause() : void this.start(this.active && !this.completed);
    $('training-sound').onclick = () => { this.settings.muted = !this.settings.muted; this.sound(); if (!this.drill) saveTraining(this.state); };
    $('training-visual').onclick = () => { this.visualOnly = true; void this.start(this.active && !this.completed); };
    $('training-details').onclick = () => this.drill ? this.backFromDrill() : this.showReport(this.recommendedBar());
    $('last-session-button').onclick = () => this.showReport(-1,this.latestForActivity());
    $('training-history-button').onclick = () => this.showHistory();
    $('report-back-history').onclick = () => { $('training-report-dialog').close(); this.showHistory(true); };
    $('history-group-select').onchange = event => this.renderHistory(Number(event.target.value));
    $('training-history-content').onclick = event => {
      const button = event.target.closest('[data-history-result]');
      if (!button) return;
      const result = this.state.history[Number(button.dataset.historyResult)];
      if (!result) return;
      $('training-history-dialog').close();
      this.showReport(-1,result,true);
    };
    $('training-summary').onclick = event => {
      if (event.target.closest('[data-all-details]')) { this.showReport(); return; }
      const bar = event.target.closest('[data-report-bar]');
      if (bar) this.showReport(Number(bar.dataset.reportBar));
    };
    $('report-bar-select').onchange = event => this.renderReportDetails(Number(event.target.value));
    $('report-practise-form').onsubmit = event => {
      event.preventDefault();
      this.startDrill(Number($('report-bar-select').value),Number($('report-practise-tempo').value));
    };
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
  get settings() { return this.drill?.settings ?? this.state.settings; }
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
    $('training-input-row').hidden = this.activity !== 'sight' || Boolean(this.completed);
    $('training-sight-tools').hidden = this.activity !== 'sight' || Boolean(this.drill);
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
    $('last-session-button').hidden = true;
    $('training-history-button').hidden = !this.exercise;
    if (quiz) { $('customize-button').innerHTML = 'Choose notes <span aria-hidden="true">↗</span>'; return; }
    $('practice-title').textContent = labels[this.activity];
    const detail = this.activity === 'metronome' ? 'A steady beat, your own pace' : `${this.settings.bars} bars · ${this.activity === 'sight' ? 'MIDI keyboard · retry each bar' : this.settings.input === 'midi' ? 'MIDI key holds' : 'Touch and hold'}`;
    $('practice-detail').textContent = this.supported ? `${this.settings.bpm} BPM · ${this.settings.meter}/4 · ${detail}` : 'This activity needs Web MIDI. Use a compatible browser, or choose Rhythm with touch input.';
    $('customize-button').textContent = 'Set up ↗';
    $('start-button').innerHTML = `Start ${labels[this.activity].toLowerCase()} <span aria-hidden="true">→</span>`;
    const recent = this.latestForActivity();
    $('resume-note').hidden = recent?.activity !== this.activity || Boolean(recent?.report);
    if (recent?.activity === this.activity) {
      if (recent.report) {
        $('last-session-button').hidden = false;
        $('last-session-button').textContent = `Last session · ${this.activity==='sight' ? `${firstTryBars(recent)}/${recent.report.bars.length} bars first try` : `${recent.onset}% on the beat`} ↗`;
      } else $('resume-note').textContent = this.activity === 'sight' ? `Last practice: ${recent.retries} retries` : `Last practice: ${recent.onset}% on the beat · ${recent.holds}% note lengths`;
    }
  }

  latestForActivity() {
    return this.state.lastResult?.activity === this.activity ? this.state.lastResult : this.state.history.find(result=>result.activity===this.activity);
  }

  configure() {
    this.pause();
    $('training-setup-title').textContent = `${labels[this.activity]} setup`;
    for (const key of ['bpm','meter','volume','offset','bars','complexity','input','pace','accuracy']) $(`training-${key}`).value = this.settings[key];
    document.querySelectorAll('[data-exercise-setting]').forEach(element => { element.hidden = !this.exercise; });
    document.querySelectorAll('[data-sight-setting]').forEach(element => { element.hidden = this.activity !== 'sight'; });
    document.querySelectorAll('[data-rhythm-setting]').forEach(element => { element.hidden = this.activity !== 'rhythm'; });
    $('training-setup-help').textContent = this.activity === 'sight' ? 'Play your selected notes on the beat. A wrong pitch, missed beat, bad hold or rest mistake restarts the whole bar on the next downbeat. Watch the countdown and release cue.' : this.activity === 'rhythm' ? 'Choose Touch pad or MIDI keyboard on Home. A half note lasts two beats. With Beginner tolerance, the full meter means you can release; keep your next press on the beat. Count in gives you a full bar to read ahead.' : 'The first beat is accented. Changes during playback start at the next bar.';
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
    $('training-back').textContent = this.drill ? '‹ Report' : '‹ Home';
    $('training-configure').hidden = Boolean(this.drill);
    $('training-title').textContent = this.drill ? this.completed ? 'Bar practised' : `Practise bar ${this.drill.bar+1}` : this.completed ? 'Session complete' : labels[this.activity];
    $('training-progress').textContent = this.drill ? `Bar ${this.drill.bar+1} · ${this.settings.bpm} BPM` : this.completed ? 'Practice complete' : `${this.settings.bpm} BPM · ${this.settings.meter}/4`;
    $('metronome-tempo').textContent = `${this.settings.bpm} BPM`;
    $('live-bpm').value = this.settings.bpm;
    $('live-meter').value = this.settings.meter;
    this.renderedMeter = this.clock.running ? this.clock.meter : this.settings.meter;
    $('training-beats').innerHTML = Array.from({ length:this.renderedMeter }, (_,i) => `<span data-beat="${i}" class="${this.lastBeat === i ? 'active' : ''}" aria-hidden="true"></span>`).join('');
    $('training-toggle').textContent = this.starting ? 'Starting…' : this.clock.running ? 'Pause' : this.completed ? this.drill ? 'Play again' : 'Try another' : this.requiresMidi && !this.midi.status.connected ? 'Connect MIDI' : this.paused ? 'Resume' : 'Start';
    $('training-toggle').disabled = this.starting || !this.supported;
    $('metronome-display').hidden = exercise;
    $('training-beats').hidden = Boolean(this.completed);
    $('training-summary').hidden = !this.completed;
    $('exercise-score').hidden = !exercise || Boolean(this.completed);
    $('hold-coach').hidden = !exercise || Boolean(this.completed);
    $('training-touchpad').hidden = this.activity !== 'rhythm' || this.settings.input !== 'touch' || Boolean(this.completed);
    $('training-touchpad').disabled = !this.clock.running;
    $('training-recheck').hidden = !this.requiresMidi || !this.supported || Boolean(this.completed);
    $('training-sound').hidden = Boolean(this.completed);
    $('training-details').hidden = !this.completed;
    $('training-details').textContent = this.drill ? 'Back to report' : this.recommendedBar() >= 0 ? 'Practise hardest bar' : 'Session details';
    $('training-live-status').hidden = Boolean(this.completed);
    $('training-footnote').hidden = Boolean(this.completed);
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
        if (this.drill) this.phrase = this.drill.phrase;
        else {
          const key = `${this.activity}:${this.settings.complexity}:${this.settings.meter}`;
          const quizSettings = this.getQuizSettings();
          this.phrase = generatePhrase(this.settings,quizSettings,{rhythm:this.activity==='rhythm',clefIndex:this.phraseIndex++,previousPhrase:this.phraseHistory.get(key)});
          this.sessionComparison = comparisonSetup(this.phrase,this.settings,quizSettings);
          this.phraseHistory.set(key,this.phrase);
        }
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
    const index = time < this.clock.startTime ? -1 : Math.max(0, Math.floor(meterBeat)) % this.clock.meter;
    if (this.lastBeat !== index) {
      this.lastBeat = index;
      if (index >= 0) $('metronome-number').textContent = index + 1;
      for (const dot of $('training-beats').children) dot.classList.toggle('active', Number(dot.dataset.beat) === index);
    }
    if (!this.exercise || !this.session || this.completed) return;
    this.session.startTime = startTime + this.sessionOffset;
    $('exercise-score').dataset.startTime = this.session.startTime;
    if (time < this.session.startTime) { this.draw(time); this.countdown(time); return; }
    this.session.tick(time);
    if (this.retryFailure(time)) return;
    if (this.session.done) { this.finish(time); return; }
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
    if (this.clock.running) $('training-progress').textContent = this.drill ? `Bar ${this.drill.bar+1} · ${this.settings.bpm} BPM` : `${this.settings.bpm} BPM · Bar ${bar+1}/${this.phrase.bars}`;
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
    const retry = this.session.retryReason;
    const remaining = Math.max(1, Math.ceil((this.session.startTime-time)/this.session.beatMs));
    const count = retry ? remaining : Math.min(this.clock.countIn, remaining);
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

  pause(message = 'Paused. Resume starts this bar with a count-in.', wasRunning = this.clock.running) {
    ++this.request;
    if (this.exercise && this.session && wasRunning && !this.completed) {
      const now = performance.now();
      this.session.pauseRun(now);
      this.session.restartBar(now);
    }
    this.clock.stop(); this.starting = false;
    this.pointer = undefined; $('training-touchpad').classList.remove('pressed');
    if (!this.active || this.completed) return;
    this.paused = true; this.refresh(); this.message(message);
  }
  stop() { ++this.request; this.clock.stop(); this.active = false; this.starting = false; this.paused = false; this.session = null; this.drill = null; this.completed = false; this.pointer = undefined; $('training-touchpad').classList.remove('pressed'); }
  midiChanged(status) {
    this.calibration.sync();
    this.inputControls();
    if (!this.active || this.completed || !this.requiresMidi) return;
    if (!status.connected && this.clock.running) this.pause('Keyboard disconnected. Recheck MIDI, then Resume.');
    else if (status.connected && !this.clock.running) { this.refresh(); this.message('Keyboard connected. Tap Resume when ready.'); }
  }
  showHistory(preserve = false) {
    this.historyGroups = groupSessions(this.state.history,this.activity);
    const select = $('history-group-select');
    select.replaceChildren(...this.historyGroups.map((group,i)=>{
      const option = document.createElement('option');
      const {bpm,meter} = group[0].result.replay;
      option.value = i; option.textContent = `Setup ${i+1} · ${bpm} BPM · ${meter}/4 · ${group.length} ${group.length===1?'session':'sessions'}`;
      return option;
    }));
    $('history-group-control').hidden = !this.historyGroups.length;
    const group = preserve && this.historyGroups[this.historyGroup] ? this.historyGroup : 0;
    select.value = group;
    this.renderHistory(group);
    this.openDialog('training-history-dialog');
  }
  renderHistory(index) {
    this.historyGroup = index;
    const group = this.historyGroups[index];
    $('history-setup').textContent = group ? historyLabel(group[0].result) : '';
    $('training-history-content').innerHTML = group ? renderHistoryGroup(group) : '<p class="muted">Finish a session to start your history. Older results without setup data are available under Last session.</p>';
  }
  showReport(bar = -1,result = this.state.lastResult,fromHistory = false) {
    if (!result?.report) return;
    this.reportResult = result;
    this.reportFromHistory = fromHistory;
    $('report-back-history').hidden = !fromHistory;
    $('report-bar-select').innerHTML = '<option value="-1">All bars</option>' + result.report.bars.map((_,i)=>`<option value="${i}">Bar ${i+1}</option>`).join('');
    $('report-bar-select').value = bar;
    this.renderReportDetails(bar);
    this.openDialog('training-report-dialog');
  }
  recommendedBar() {
    const result = this.state.lastResult;
    return result?.activity === this.activity && result.replay ? hardestBar(result) : -1;
  }
  renderReportDetails(bar) {
    const result = this.reportResult;
    if (result?.report) $('training-report-details').innerHTML = renderTrainingDetails(result,bar);
    const replay = result?.replay;
    const show = Boolean(replay && bar >= 0 && bar < replay.bars.length);
    $('report-practise-form').hidden = !show;
    if (!show) return;
    const bpm = replay.bpm, slower = slowerReplayTempo(bpm);
    $('report-practise-tempo').innerHTML = `<option value="${bpm}">Original · ${bpm} BPM</option>` +
      (slower < bpm ? `<option value="${slower}" selected>Slower · ${slower} BPM</option>` : '');
    $('report-practise').textContent = `Practise bar ${bar+1}`;
    const unsupported = this.midi.status.state === 'unsupported';
    $('report-practise').disabled = unsupported && result.activity === 'sight';
    $('report-practise-hint').textContent = $('report-practise').disabled ? 'This bar needs a browser with MIDI support.'
      : unsupported && replay.input === 'midi' ? 'This browser will use the touch pad.'
      : 'A separate drill. Your full-session result stays saved.';
  }
  startDrill(bar,bpm) {
    const result = this.reportResult, replay = result?.replay;
    if (result?.activity !== this.activity || !replay?.bars[bar] || ![replay.bpm,slowerReplayTempo(replay.bpm)].includes(bpm) || $('report-practise').disabled) return;
    const fromSummary = this.active && this.completed && result === this.state.lastResult;
    const input = this.midi.status.state === 'unsupported' ? 'touch' : replay.input;
    this.drill = {bar,fromSummary,result,fromHistory:this.reportFromHistory,phrase:replayPhrase(result,bar),
      settings:{...this.state.settings,bpm,meter:replay.meter,input,accuracy:replay.accuracy}};
    $('training-report-dialog').close();
    this.showTraining();
    void this.start();
  }
  backFromDrill() {
    const {bar,fromSummary,result,fromHistory} = this.drill;
    this.stop();
    if (fromSummary) {
      this.active = this.completed = true;
      this.refresh();
      $('training-summary').innerHTML = renderTrainingReport(this.state.lastResult);
      $('training-summary').focus({preventScroll:true});
    } else {
      this.goHome();
      this.showReport(bar,result,fromHistory);
    }
  }
  finish(time = performance.now()) {
    const result = this.session.summary(time);
    this.clock.stop(); this.completed = true; this.paused = false;
    if (!this.drill) {
      result.replay = saveReplay(this.phrase,{...this.settings,offset:this.session.offset});
      result.comparison = this.sessionComparison;
      rememberTrainingResult(this.state,result); saveTraining(this.state);
    }
    this.refresh();
    $('training-summary').innerHTML = renderTrainingReport(result,Boolean(this.drill));
    $('training-summary').focus({preventScroll:true});
  }
}
