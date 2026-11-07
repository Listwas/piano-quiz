import { BeatClock } from './timing.js';
import { loadTraining, saveTraining } from './training.js';

const $ = id => document.getElementById(id);
const labels = { quiz:'Quiz', metronome:'Metronome', rhythm:'Rhythm', sight:'Sight-reading' };

export class Activities {
  constructor({ goHome, openDialog, renderHome, getQuizSettings, midi }) {
    Object.assign(this, { goHome, openDialog, renderHome, getQuizSettings, midi });
    this.state = loadTraining();
    this.clock = new BeatClock({ onFrame: frame => this.frame(frame), onSuspended: () => this.pause('Audio stopped. Tap Resume when ready.') });
    this.active = false;
    this.starting = false;
    this.lastBeat = null;
    this.request = 0;
    $('activity-select').value = this.state.activity;
    $('activity-select').onchange = event => {
      this.stop(); this.state.activity = event.target.value; saveTraining(this.state); renderHome();
    };
    $('training-back').onclick = goHome;
    $('training-configure').onclick = () => this.configure();
    $('training-toggle').onclick = () => this.clock.running || this.starting ? this.pause() : void this.start(this.active);
    $('training-sound').onclick = () => { this.state.settings.muted = !this.state.settings.muted; this.sound(); saveTraining(this.state); };
    $('training-visual').onclick = () => { this.visualOnly = true; void this.start(this.active); };
    const tempo = value => {
      this.settings.bpm = Math.max(40, Math.min(200, Number(value) || 60));
      this.clock.change(this.settings.bpm, this.settings.meter); saveTraining(this.state); this.refresh();
    };
    $('live-bpm').onchange = event => tempo(event.target.value);
    document.querySelectorAll('[data-tempo-step]').forEach(button => { button.onclick = () => tempo(this.settings.bpm + Number(button.dataset.tempoStep)); });
    $('live-meter').onchange = event => { this.settings.meter = Number(event.target.value); this.clock.change(this.settings.bpm, this.settings.meter); saveTraining(this.state); this.refresh(); };
    $('training-form').onsubmit = event => {
      event.preventDefault();
      const old = this.state.settings;
      this.state.settings = { ...old, bpm:Number($('training-bpm').value), meter:Number($('training-meter').value), volume:Number($('training-volume').value), offset:Number($('training-offset').value) };
      $('training-dialog').close(); saveTraining(this.state); renderHome();
      if (this.active) { this.paused = true; this.refresh(); }
    };
  }

  get activity() { return this.state.activity; }
  get settings() { return this.state.settings; }
  home() {
    const quiz = this.activity === 'quiz';
    $('activity-select').value = this.activity;
    document.querySelector('.practice-card .input-mode-options').hidden = !quiz;
    if (quiz) { $('customize-button').innerHTML = 'Choose notes <span aria-hidden="true">↗</span>'; return; }
    $('practice-title').textContent = labels[this.activity];
    $('practice-detail').textContent = `${this.settings.bpm} BPM · ${this.settings.meter}/4 · A steady beat, your own pace`;
    $('customize-button').textContent = 'Set up ↗';
    $('start-button').innerHTML = `Start ${labels[this.activity].toLowerCase()} <span aria-hidden="true">→</span>`;
    $('resume-note').hidden = true;
  }

  configure() {
    this.pause();
    $('training-setup-title').textContent = `${labels[this.activity]} setup`;
    for (const key of ['bpm','meter','volume','offset']) $(`training-${key}`).value = this.settings[key];
    this.openDialog('training-dialog');
  }

  sound() {
    this.clock.volume = this.settings.volume;
    this.clock.muted = this.settings.muted;
    $('training-sound').textContent = this.settings.muted ? 'Unmute clicks' : 'Mute clicks';
    $('training-sound').setAttribute('aria-pressed', String(this.settings.muted));
  }

  refresh() {
    $('training-screen').dataset.activity = this.activity;
    $('training-screen').dataset.running = String(this.clock.running);
    $('training-title').textContent = labels[this.activity];
    $('training-progress').textContent = `${this.settings.bpm} BPM · ${this.settings.meter}/4`;
    $('metronome-tempo').textContent = `${this.settings.bpm} BPM`;
    $('live-bpm').value = this.settings.bpm;
    $('live-meter').value = this.settings.meter;
    $('training-beats').innerHTML = Array.from({ length:this.settings.meter }, (_,i) => `<span data-beat="${i}" aria-hidden="true"></span>`).join('');
    $('training-toggle').textContent = this.starting ? 'Starting…' : this.clock.running ? 'Pause' : this.paused ? 'Resume' : 'Start';
    $('training-toggle').disabled = this.starting;
    this.sound();
  }

  async start(resume = false) {
    const request = ++this.request;
    this.active = true; this.paused = false; this.starting = true; this.lastBeat = null;
    this.refresh();
    $('training-live-status').textContent = 'Getting your beat ready…';
    const running = await this.clock.start({ ...this.settings, visualOnly: this.visualOnly });
    if (request !== this.request) return;
    this.starting = false;
    this.refresh();
    if (!this.active) return;
    $('training-visual').hidden = Boolean(running);
    $('training-live-status').textContent = running ? this.visualOnly ? 'Visual beat · audio unavailable' : 'Find your beat. Take your time.' : 'Audio could not start. Try Start again, or use the visual beat.';
  }

  frame({ beat, meterBeat = beat }) {
    const index = Math.max(0, Math.floor(meterBeat)) % this.clock.meter;
    if (this.lastBeat !== index) {
      this.lastBeat = index;
      $('metronome-number').textContent = index + 1;
      for (const dot of $('training-beats').children) dot.classList.toggle('active', Number(dot.dataset.beat) === index);
    }
  }

  pause(message = 'Paused. Your beat is ready when you are.') {
    ++this.request;
    this.clock.stop(); this.starting = false;
    if (!this.active) return;
    this.paused = true; this.refresh();
    $('training-live-status').textContent = message;
  }
  stop() { ++this.request; this.clock.stop(); this.active = false; this.starting = false; this.paused = false; }
  receive() {}
  midiChanged() {}
}
