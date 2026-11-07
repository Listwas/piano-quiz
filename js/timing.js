import { prepareAudio } from './audio.js';

export function outputTime(context, audioTime, now = performance.now()) {
  const stamp = context.getOutputTimestamp?.();
  if (stamp && stamp.performanceTime > 0 && Number.isFinite(stamp.contextTime)) return stamp.performanceTime + (audioTime - stamp.contextTime) * 1000;
  return now + (audioTime - context.currentTime + (context.baseLatency || 0) + (context.outputLatency || 0)) * 1000;
}

export class BeatClock {
  constructor({ prepare = prepareAudio, now = () => performance.now(), onFrame = () => {}, onScheduled = () => {}, onSuspended = () => {} } = {}) {
    Object.assign(this, { prepare, now, onFrame, onScheduled, onSuspended });
    this.nodes = new Set();
    this.epoch = 0;
    this.volume = .3;
    this.muted = false;
    this.running = false;
  }

  async start({ bpm = 60, meter = 4, countIn = 0, visualOnly = false } = {}) {
    this.stop();
    const epoch = this.epoch;
    const context = visualOnly ? null : await this.prepare();
    if (epoch !== this.epoch) return false;
    if (!visualOnly && !context) return false;
    Object.assign(this, { context, bpm, meter, countIn, step: 60 / bpm, nextTick: 0, running: true });
    this.barOrigin = countIn;
    this.anchor = context ? context.currentTime + .12 : this.now() + 120;
    this.pending = null;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    const frame = () => {
      if (!this.running) return;
      const beat = this.beatAt(this.now());
      this.onFrame({ time: this.now(), beat, meterBeat: ((beat + this.countIn - this.barOrigin) % this.meter + this.meter) % this.meter, startTime: this.exerciseStart });
      if (this.running) this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
    return true;
  }

  get startTime() { return this.context ? outputTime(this.context, this.anchor, this.now()) : this.anchor; }
  get exerciseStart() { return this.startTime + this.countIn * this.step * 1000; }
  beatAt(time) { return (time - this.startTime) / (this.step * 1000) - this.countIn; }

  change(bpm, meter) {
    if (!this.running) { this.bpm = bpm; this.meter = meter; return; }
    this.pending = { bpm, meter };
  }

  schedule() {
    if (!this.running) return;
    if (this.context && this.context.state !== 'running') { this.stop(); this.onSuspended(); return; }
    const now = this.context ? this.context.currentTime : this.now();
    const unit = this.context ? 1 : 1000;
    while (this.anchor + this.nextTick * this.step * unit < now + .1 * unit) {
      if (this.pending && this.nextTick > this.countIn && (this.nextTick - this.barOrigin) % this.meter === 0) {
        const boundary = this.anchor + this.nextTick * this.step * unit;
        Object.assign(this, this.pending);
        this.pending = null;
        this.step = 60 / this.bpm;
        this.anchor = boundary - this.nextTick * this.step * unit;
        this.barOrigin = this.nextTick;
      }
      const time = this.anchor + this.nextTick * this.step * unit;
      const beat = this.nextTick - this.countIn;
      if (time >= now - .02 * unit) {
        const accent = (this.nextTick - this.barOrigin) % this.meter === 0;
        this.onScheduled({ beat, time, accent });
        if (this.context && !this.muted) this.click(time, accent);
      }
      this.nextTick++;
    }
  }

  click(time, accent) {
    const source = this.context.createOscillator(), gain = this.context.createGain();
    source.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(Math.max(.0001, this.volume * (accent ? .45 : .28)), time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .035);
    source.connect(gain); gain.connect(this.context.destination);
    this.nodes.add(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + .04);
  }

  stop() {
    ++this.epoch;
    this.running = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.frame);
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear();
  }
}
