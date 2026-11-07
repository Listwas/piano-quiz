const SAMPLES = [
  ['A2', 45, 110.15], ['C3', 48, 130.75], ['Ds3', 51, 155.61], ['Fs3', 54, 185.04],
  ['A3', 57, 220.7], ['C4', 60, 262.14], ['Ds4', 63, 312.11], ['Fs4', 66, 370.06],
  ['A4', 69, 441.71], ['C5', 72, 525.33], ['Ds5', 75, 624.29], ['Fs5', 78, 742.06],
  ['A5', 81, 883.74], ['C6', 84, 1054.38],
];
let context;
let master;
let generation = 0;
const decoded = new Map();
const sources = new Set();

function unlock() {
  const Constructor = window.AudioContext || window.webkitAudioContext;
  if (!Constructor) return false;
  if (!context || context.state === 'closed') {
    context = new Constructor();
    master = context.createGain();
    master.gain.value = 0.3;
    master.connect(context.destination);
  }
  if (context.state !== 'running') return context.resume().then(() => context.state === 'running', () => false);
  return Promise.resolve(true);
}

export function stopAudio() {
  generation++;
  for (const source of sources) { try { source.stop(); } catch {} }
  sources.clear();
}

export function suspendAudio() {
  stopAudio();
  if (context && context.state !== 'closed') void context.suspend().catch(() => {});
}

export async function playItem(item) {
  stopAudio();
  let ready;
  try { ready = unlock(); if (!ready) return false; } catch { return false; }
  const epoch = generation;
  const samples = item.tones.map(tone => SAMPLES.reduce((a, b) => Math.abs(b[1] - tone.midi) < Math.abs(a[1] - tone.midi) ? b : a));
  const buffers = await Promise.all(samples.map(async sample => {
    try {
      if (!decoded.has(sample[0])) {
        const response = await fetch(`./audio/${sample[0]}.mp3`);
        if (!response.ok) return null;
        decoded.set(sample[0], await context.decodeAudioData(await response.arrayBuffer()));
      }
      return decoded.get(sample[0]);
    } catch { return null; }
  }));
  let timeout;
  const running = await Promise.race([ready, new Promise(resolve => { timeout = setTimeout(() => resolve(false), 1800); })]);
  clearTimeout(timeout);
  if (!running || epoch !== generation || document.hidden || context.state !== 'running') return false;
  item.tones.forEach((tone, i) => {
    const gain = context.createGain();
    gain.gain.value = 1 / Math.max(1, Math.sqrt(item.tones.length));
    gain.connect(master);
    const source = buffers[i] ? context.createBufferSource() : context.createOscillator();
    if (buffers[i]) { source.buffer = buffers[i]; source.playbackRate.value = tone.frequency / samples[i][2]; }
    else {
      source.type = 'triangle';
      source.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8);
    }
    source.connect(gain);
    sources.add(source);
    source.start();
    source.stop(context.currentTime + (buffers[i] ? Math.min(2.5, buffers[i].duration) : 0.85));
    source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
  });
  return true;
}
