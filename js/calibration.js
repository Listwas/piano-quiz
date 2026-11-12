import { BeatClock } from './timing.js';

export const CALIBRATION_TAPS = 12;
const BPM = 100, STEP = 60000/BPM;
const median = values => {
  const ordered = [...values].sort((a,b)=>a-b), middle = Math.floor(ordered.length/2);
  return ordered.length%2 ? ordered[middle] : (ordered[middle-1]+ordered[middle])/2;
};

export class CalibrationCapture {
  constructor() { this.errors = new Map(); }
  accept(time,start) {
    const beat = Math.round((time-start)/STEP);
    const error = time-start-beat*STEP;
    if (!Number.isFinite(error) || beat<0 || beat>=CALIBRATION_TAPS || Math.abs(error)>STEP*.45 || this.errors.has(beat)) return false;
    this.errors.set(beat,error);
    return true;
  }
  result() {
    const errors = [...this.errors.values()];
    if (errors.length<8) return {used:errors.length,offset:null};
    const center = median(errors), deviation = median(errors.map(error=>Math.abs(error-center)));
    const inliers = errors.filter(error=>Math.abs(error-center)<=Math.max(35,3*deviation));
    const offset = Math.round(median(inliers));
    return {used:inliers.length,spread:Math.round(deviation),offset:inliers.length>=8 && deviation<=45 && Math.abs(offset)<=250 ? offset || 0 : null};
  }
}

const $ = id => document.getElementById(id);
const signed = value => `${value>0?'+':''}${value} ms`;

export class MidiCalibration {
  constructor({midi,openDialog,getOffset,applyOffset}) {
    Object.assign(this,{midi,openDialog,getOffset,applyOffset});
    this.dialog = $('calibration-dialog');
    this.clock = new BeatClock({onFrame:frame=>this.frame(frame),onSuspended:()=>this.interrupt('Audio stopped. Start again when ready.')});
    $('calibration-connect').onclick = () => void (midi.wanted ? midi.recheck() : midi.connect());
    $('calibration-start').onclick = () => this.measuring ? this.interrupt('Measurement stopped. Start again when ready.') : void this.start();
    $('calibration-apply').onclick = () => {
      if (this.suggestion == null || this.measuring) return;
      const saved = this.applyOffset(this.suggestion);
      $('calibration-result').textContent = saved ? `Saved ${signed(this.suggestion)} for new exercises.` : `Using ${signed(this.suggestion)} for this visit. Storage is unavailable.`;
      this.suggestion = null;
      this.sync();
    };
    this.dialog.addEventListener('close',()=>{
      this.stop();
      if (this.parent) this.openDialog(this.parent);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.interrupt('Measurement stopped while the app was in the background.');});
    window.addEventListener('pagehide',()=>this.interrupt('Measurement stopped when the app was left.'));
  }
  open(parent) {
    this.parent = parent;
    $(parent).close();
    this.suggestion = null;
    $('calibration-progress').value = 0;
    $('calibration-result').textContent = '';
    this.message('Listen to four clicks, then play one key on each of the next twelve clicks.');
    this.sync();
    this.openDialog('calibration-dialog');
  }
  message(text) {
    if ($('calibration-status').textContent!==text) $('calibration-status').textContent = text;
  }
  sync() {
    const status = this.midi.status;
    const changed = !status.connected || status.selectedId !== this.device;
    if (this.measuring && changed) { this.interrupt('Keyboard disconnected or changed. Reconnect it and start again.'); return; }
    if (this.suggestion != null && changed) {
      this.suggestion = null;
      $('calibration-result').textContent = '';
      this.message('MIDI input changed. Run calibration with the current keyboard.');
    }
    $('calibration-device').textContent = status.connected ? `Connected · ${status.selectedName}` : status.state==='unsupported' ? 'MIDI is unavailable in this browser.' : 'Connect your MIDI keyboard to begin.';
    $('calibration-current').textContent = `Current correction: ${signed(this.getOffset())}`;
    $('midi-timing-summary').textContent = `For Rhythm and Sight-reading · current correction: ${signed(this.getOffset())}`;
    $('calibration-connect').hidden = status.connected || status.state==='unsupported';
    $('calibration-connect').disabled = ['requesting','opening'].includes(status.state);
    $('calibration-start').disabled = !status.connected;
    $('calibration-start').textContent = this.measuring ? 'Stop measurement' : 'Start calibration';
    $('calibration-apply').hidden = this.suggestion == null;
    $('calibration-apply').textContent = this.suggestion == null ? 'Apply correction' : `Use ${signed(this.suggestion)}`;
  }
  async start() {
    if (!this.dialog.open || !this.midi.status.connected || this.measuring) return;
    const capture = this.capture = new CalibrationCapture();
    this.device = this.midi.status.selectedId;
    this.suggestion = null;
    this.measuring = true;
    $('calibration-progress').value = 0;
    $('calibration-result').textContent = '';
    this.message('Getting the clicks ready…');
    this.sync();
    const running = await this.clock.start({bpm:BPM,meter:4,countIn:4});
    if (this.capture!==capture) return;
    if (!running) { this.interrupt('Audio could not start. Check your sound and try again.'); return; }
    this.watchdog = setTimeout(()=>this.interrupt('The audio clock did not advance. Check your sound and try again.'),14000);
  }
  frame({time,startTime}) {
    if (!this.measuring) return;
    if (time < startTime) this.message('Listen to the count-in…');
    else this.message('Play one key on each click.');
    if (time < startTime+(CALIBRATION_TAPS-1+.45)*STEP+50) return;
    const {used,spread,offset} = this.capture.result();
    this.stop();
    this.suggestion = offset;
    this.message(offset===null ? 'No reliable correction. Try again and follow the clicks.' : `Suggested correction: ${signed(offset)}`);
    $('calibration-result').textContent = offset===null ? `${used} usable taps; at least 8 consistent taps are needed.` : `${used} of ${CALIBRATION_TAPS} taps used · typical spread ${spread} ms.`;
    this.sync();
  }
  receive(event) {
    if (!this.dialog.open) return false;
    if (event.type==='reset' && this.measuring) this.interrupt('MIDI input changed. Start the measurement again.');
    if (event.type==='on' && this.measuring && this.clock.running && this.capture.accept(event.timeStamp,this.clock.exerciseStart)) {
      $('calibration-progress').value = this.capture.errors.size;
    }
    return true;
  }
  stop() {
    this.clock.stop();
    clearTimeout(this.watchdog);
    this.measuring = false;
    this.capture = null;
  }
  interrupt(text) {
    if (!this.measuring) return;
    this.stop();
    this.message(text);
    this.sync();
  }
}
