// Notes are modelled as a letter plus an alteration rather than a bare pitch
// class, because spelling matters everywhere downstream: C♯ and D♭ sound
// identical but sit on different lines of the staff, and a chord has to be
// spelled by stacking letters (C♯-E♯-G♯, never C♯-F-G♯) to look right.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

const ACCIDENTALS = { '-2': '♭♭', '-1': '♭', 0: '', 1: '♯', 2: '♯♯' };

// Both spellings of every pitch class, as [letterIndex, alteration].
export const PITCH_CLASSES = [
  { sharp: [0, 0],  flat: [0, 0],  accidental: false }, // C
  { sharp: [0, 1],  flat: [1, -1], accidental: true  }, // C♯ / D♭
  { sharp: [1, 0],  flat: [1, 0],  accidental: false }, // D
  { sharp: [1, 1],  flat: [2, -1], accidental: true  }, // D♯ / E♭
  { sharp: [2, 0],  flat: [2, 0],  accidental: false }, // E
  { sharp: [3, 0],  flat: [3, 0],  accidental: false }, // F
  { sharp: [3, 1],  flat: [4, -1], accidental: true  }, // F♯ / G♭
  { sharp: [4, 0],  flat: [4, 0],  accidental: false }, // G
  { sharp: [4, 1],  flat: [5, -1], accidental: true  }, // G♯ / A♭
  { sharp: [5, 0],  flat: [5, 0],  accidental: false }, // A
  { sharp: [5, 1],  flat: [6, -1], accidental: true  }, // A♯ / B♭
  { sharp: [6, 0],  flat: [6, 0],  accidental: false }, // B
];

export function toneName(letter, alteration) {
  return LETTERS[letter] + (ACCIDENTALS[alteration] ?? '');
}

// A sounding note: everything the audio, the label and the staff each need.
export function makeTone(letter, alteration, octave) {
  const midi = 12 * (octave + 1) + NATURAL_PC[letter] + alteration;
  return {
    letter,
    alteration,
    octave,
    midi,
    pitchClass: ((midi % 12) + 12) % 12,
    name: toneName(letter, alteration),
    frequency: 440 * Math.pow(2, (midi - 69) / 12),
    // Position on a staff, counting letters: every step is one line-or-space.
    staffStep: octave * 7 + letter,
  };
}

// Which octave a given letter belongs to so the note lands in the octave-4
// register, B♯ sounds like C but is still written in the octave below.
export function toneInOctave(letter, alteration, octave = 4) {
  return makeTone(letter, alteration, octave);
}

export function chipLabel(pitchClass) {
  const entry = PITCH_CLASSES[pitchClass];
  const sharp = toneName(...entry.sharp);
  return entry.accidental ? `${sharp}/${toneName(...entry.flat)}` : sharp;
}

export function spellingsOf(pitchClass) {
  const entry = PITCH_CLASSES[pitchClass];
  return entry.accidental ? [entry.sharp, entry.flat] : [entry.sharp];
}
