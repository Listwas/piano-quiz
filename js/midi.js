import { PITCH_CLASSES, makeTone } from './notes.js';

export const midiNoteName = note => {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
};

export function tonesFromMidi(notes) {
  return [...new Set(notes)].sort((a, b) => a - b).map(note => {
    const [letter, alteration] = PITCH_CLASSES[note % 12].sharp;
    return makeTone(letter, alteration, Math.floor(note / 12) - 1);
  });
}

export function validMidiNotes(notes) {
  return Array.isArray(notes) && notes.length > 0 && notes.length <= 128 && notes.every(note => Number.isInteger(note) && note >= 0 && note <= 127);
}

export function matchesMidi(item, notes) {
  if (!validMidiNotes(notes)) return false;
  const played = [...new Set(notes)].sort((a, b) => a - b);
  const expected = [...new Set(item.tones.map(tone => tone.midi))].sort((a, b) => a - b);
  return played.length === expected.length && played.every((note, index) => note === expected[index]);
}

export class MidiPhrase {
  constructor(onPhrase) {
    this.onPhrase = onPhrase;
    this.held = new Map();
    this.played = new Set();
    this.active = false;
    this.armed = true;
  }

  setActive(active) {
    if (active !== this.active) {
      this.active = active;
      this.resetPhrase();
    }
  }

  resetPhrase() {
    this.played.clear();
    this.armed = this.held.size === 0;
  }

  clear() {
    this.held.clear();
    this.resetPhrase();
  }

  receive(data) {
    if (!data || data.length !== 3 || !Array.from(data).every(value => Number.isInteger(value) && value >= 0 && value <= 255)) return;
    const [status, note, velocity] = data;
    if (note > 127 || velocity > 127) return;
    const command = status & 0xf0, channel = status & 0x0f;
    if (command === 0xb0 && [120, 123].includes(note)) {
      for (const [key, held] of this.held) if (held.channel === channel) this.held.delete(key);
      this.resetPhrase();
      return;
    }
    if (command !== 0x80 && command !== 0x90) return;
    const key = `${channel}:${note}`;
    if (command === 0x90 && velocity > 0) {
      this.held.set(key, { channel, note });
      if (this.active && this.armed) this.played.add(note);
      return;
    }
    if (!this.held.delete(key) || this.held.size) return;
    const notes = [...this.played].sort((a, b) => a - b);
    const submit = this.active && this.armed && notes.length > 0;
    this.played.clear();
    this.armed = true;
    if (submit) this.onPhrase(notes);
  }
}

export class MidiKeyboard {
  constructor({ navigator = globalThis.navigator, onStatus = () => {}, onPhrase = () => {}, onNote = () => {} } = {}) {
    this.navigator = navigator;
    this.onStatus = onStatus;
    this.onNote = onNote;
    this.phrase = new MidiPhrase(onPhrase);
    this.access = null;
    this.input = null;
    this.preferredId = null;
    this.preferredName = '';
    this.generation = 0;
    this.wanted = false;
    this.failedId = null;
    this.preferredManufacturer = '';
    this.closing = Promise.resolve();
    this.binding = 0;
    this.status = { state: typeof navigator?.requestMIDIAccess === 'function' ? 'idle' : 'unsupported', inputs: [], selectedId: null, connected: false };
  }

  receive(data, timeStamp) {
    if (!data || data.length !== 3 || !Array.from(data).every(value => Number.isInteger(value) && value >= 0 && value <= 255) || data[1] > 127 || data[2] > 127) return;
    const [status, note, velocity] = data;
    const command = status & 0xf0, channel = status & 0x0f;
    const held = this.phrase.held.has(`${channel}:${note}`);
    const type = command === 0x90 && velocity > 0 ? 'on' : command === 0x80 || command === 0x90 ? 'off' : command === 0xb0 && [120, 123].includes(note) ? 'reset' : null;
    this.phrase.receive(data);
    if (!type || type === 'on' && held || type === 'off' && !held) return;
    this.onNote({ type, note, channel, velocity, timeStamp: Number.isFinite(timeStamp) && timeStamp >= 0 ? timeStamp : performance.now() });
  }

  notify(state, message = '') {
    this.status = { state, message, inputs: this.access ? [...this.access.inputs.values()].filter(input => input.state === 'connected').map(input => ({ id: input.id, name: input.name || 'MIDI keyboard' })) : [], selectedId: this.preferredId, selectedName: this.preferredName, connected: state === 'connected' };
    this.onStatus(this.status);
  }

  async connect(force = false) {
    if (this.status.state === 'unsupported' || this.status.state === 'requesting' && !force) return;
    this.wanted = false;
    if (this.access) this.access.onstatechange = null;
    this.detach();
    this.access = null;
    this.failedId = null;
    const generation = ++this.generation;
    this.wanted = true;
    this.notify('requesting');
    try {
      const access = await this.navigator.requestMIDIAccess({ sysex: false });
      if (generation !== this.generation || !this.wanted) return;
      this.access = access;
      access.onstatechange = event => {
        if (event.port?.id === this.failedId && event.port.state === 'disconnected') this.failedId = null;
        this.sync();
      };
      this.sync();
    } catch (error) {
      if (generation !== this.generation) return;
      this.wanted = false;
      this.notify('error', error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'MIDI permission was denied. Allow MIDI for this site in your browser settings, then retry.' : 'MIDI could not start. Check your keyboard connection, then retry.');
    }
  }

  recheck() { return this.connect(true); }

  detach() {
    ++this.binding;
    const input = this.input;
    this.input = null;
    this.phrase.clear();
    if (input) {
      input.onmidimessage = null;
      try { this.closing = Promise.allSettled([this.closing, input.close()]).then(() => {}); } catch {}
    }
    return this.closing;
  }

  sync() {
    if (!this.wanted || !this.access) return;
    const inputs = [...this.access.inputs.values()].filter(input => input.state === 'connected');
    if (!this.preferredId && inputs.length) this.preferredId = inputs[0].id;
    let input = inputs.find(input => input.id === this.preferredId);
    if (!input && this.preferredName) {
      const matches = inputs.filter(port => (port.name || 'MIDI keyboard') === this.preferredName && (port.manufacturer || '') === this.preferredManufacturer);
      if (matches.length === 1) { input = matches[0]; this.preferredId = input.id; }
    }
    if (!input) {
      this.detach();
      this.notify('waiting');
      return;
    }
    this.preferredName = input.name || 'MIDI keyboard';
    this.preferredManufacturer = input.manufacturer || '';
    if (input.id === this.failedId) { this.notify('error', this.status.message); return; }
    if (this.input === input && !(this.status.connected && input.connection === 'closed')) { this.notify(this.status.state); return; }
    this.detach();
    this.input = input;
    const generation = this.generation;
    const binding = this.binding;
    this.notify('opening');
    this.closing.then(async () => {
      if (!this.wanted || this.generation !== generation || this.binding !== binding || this.input !== input) return;
      input.onmidimessage = event => {
        if (this.wanted && this.generation === generation && this.binding === binding && this.input === input) this.receive(event.data, event.timeStamp);
      };
      await input.open();
      if (this.wanted && this.generation === generation && this.binding === binding && this.input === input && input.state === 'connected') this.notify('connected');
    }).catch(() => this.openFailed(input, generation, binding));
  }

  openFailed(input, generation, binding = this.binding) {
    if (!this.wanted || this.generation !== generation || this.binding !== binding || this.input !== input) return;
    this.failedId = input.id;
    this.detach();
    this.notify('error', 'This MIDI input could not open. Reconnect it, choose another input, or retry.');
  }

  select(id) {
    if (id === this.preferredId && this.input) return;
    this.preferredId = id;
    this.failedId = null;
    this.detach();
    this.sync();
  }

  disconnect() {
    this.wanted = false;
    ++this.generation;
    if (this.access) this.access.onstatechange = null;
    this.detach();
    this.access = null;
    this.notify('idle');
  }
}
