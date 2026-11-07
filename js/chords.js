import { PITCH_CLASSES, makeTone, toneName } from './notes.js';

const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

// Each tone is [semitones above the root, letters above the root]. The second
// number is what makes the spelling come out right: a third is always two
// letters up, so C♯ + a major third is E♯, never F, even though they sound
// the same.
export const QUALITIES = [
  { id: 'maj',  suffix: '',      name: 'Major',            blurb: 'Bright and settled. The plain one.',
    tones: [[0, 0], [4, 2], [7, 4]] },
  { id: 'min',  suffix: 'm',     name: 'Minor',            blurb: 'Darker. One note lower than major.',
    tones: [[0, 0], [3, 2], [7, 4]] },
  { id: 'dom7', suffix: '7',     name: 'Dominant 7th',     blurb: 'Bluesy and restless. Wants to resolve.',
    tones: [[0, 0], [4, 2], [7, 4], [10, 6]] },
  { id: 'maj7', suffix: 'maj7',  name: 'Major 7th',        blurb: 'Soft and jazzy.',
    tones: [[0, 0], [4, 2], [7, 4], [11, 6]] },
  { id: 'min7', suffix: 'm7',    name: 'Minor 7th',        blurb: 'Mellow and warm.',
    tones: [[0, 0], [3, 2], [7, 4], [10, 6]] },
  { id: 'dim',  suffix: 'dim',   name: 'Diminished',       blurb: 'Tense and unstable.',
    tones: [[0, 0], [3, 2], [6, 4]] },
  { id: 'aug',  suffix: 'aug',   name: 'Augmented',        blurb: 'Dreamlike, unresolved.',
    tones: [[0, 0], [4, 2], [8, 4]] },
  { id: 'sus2', suffix: 'sus2',  name: 'Suspended 2nd',    blurb: 'Open. Neither major nor minor.',
    tones: [[0, 0], [2, 1], [7, 4]] },
  { id: 'sus4', suffix: 'sus4',  name: 'Suspended 4th',    blurb: 'Hanging, waiting to resolve.',
    tones: [[0, 0], [5, 3], [7, 4]] },
  { id: 'six',  suffix: '6',     name: 'Sixth',            blurb: 'Sweet and vintage.',
    tones: [[0, 0], [4, 2], [7, 4], [9, 5]] },
  { id: 'm7b5', suffix: 'm7♭5',  name: 'Half-diminished',  blurb: 'Moody. A jazz staple.',
    tones: [[0, 0], [3, 2], [6, 4], [10, 6]] },
];

export const DEFAULT_QUALITIES = ['maj', 'min', 'dom7', 'maj7', 'min7'];

export function qualityById(id) {
  return QUALITIES.find((q) => q.id === id) || QUALITIES[0];
}

function spellChord(rootLetter, rootAlteration, quality, octave) {
  const rootMidi = 12 * (octave + 1) + NATURAL_PC[rootLetter] + rootAlteration;

  return quality.tones.map(([semitones, letterOffset]) => {
    const absoluteLetter = rootLetter + letterOffset;
    const letter = absoluteLetter % 7;
    const octaveBump = Math.floor(absoluteLetter / 7);
    const toneOctave = octave + octaveBump;
    // Whatever accidental it takes to make that letter sound at the right pitch.
    const naturalMidi = 12 * (toneOctave + 1) + NATURAL_PC[letter];
    return makeTone(letter, rootMidi + semitones - naturalMidi, toneOctave);
  });
}

// Enharmonic roots aren't equally good: G♯maj7 needs a double sharp (F♯♯)
// where A♭maj7 needs none. Score both spellings and take the tidier one,
// leaving the coin-flip only for genuine ties.
export function buildChord(pitchClass, qualityId, octave = 4, random = Math.random, writtenRoot = null) {
  const quality = qualityById(qualityId);
  const entry = PITCH_CLASSES[pitchClass];
  const candidates = writtenRoot ? [writtenRoot] : entry.accidental ? [entry.sharp, entry.flat] : [entry.sharp];

  let best = null;
  let bestScore = Infinity;
  for (const [letter, alteration] of candidates) {
    const tones = spellChord(letter, alteration, quality, octave);
    const score = tones.reduce((sum, t) => sum + Math.abs(t.alteration), 0);
    const better = score < bestScore || (score === bestScore && random() < 0.5);
    if (better) { best = { letter, alteration, tones }; bestScore = score; }
  }

  return {
    kind: 'chord',
    pitchClass,
    qualityId: quality.id,
    label: toneName(best.letter, best.alteration) + quality.suffix,
    tones: best.tones,
    quality,
  };
}
