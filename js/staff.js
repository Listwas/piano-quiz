import { G_CLEF } from './clef-paths.js';

// Staff notation drawn as SVG. The clef is a real outline rather than the
// Unicode musical glyph (U+1D11E), which lives in the Supplementary Plane and
// isn't reliably present on iOS, it would render as a tofu box on the one
// device this app is actually for.

const SPACING = 12;              // distance between staff lines
const HALF = SPACING / 2;        // one staff step: line to neighbouring space
const TOP_LINE_Y = 24;
const BOTTOM_LINE_Y = TOP_LINE_Y + SPACING * 4;

export const CLEFS = {
  // staffStep sitting on the bottom line of each clef
  treble: { id: 'treble', label: 'Treble', bottomStep: 4 * 7 + 2 }, // E4
  bass:   { id: 'bass',   label: 'Bass',   bottomStep: 2 * 7 + 4 }, // G2
};

function yForStep(step, clef) {
  return BOTTOM_LINE_Y - (step - CLEFS[clef].bottomStep) * HALF;
}

/* ── Clef shapes ────────────────────────────────────────────────────────── */

// A treble clef is 7 staff spaces tall by convention, positioned so its spiral
// centre lands exactly on the G line, that is the entire meaning of a G clef.
const CLEF_SPACES = 7;

function trebleClefGroup() {
  const gY = yForStep(4 * 7 + 4, 'treble'); // G4
  const height = CLEF_SPACES * SPACING;
  const scale = height / G_CLEF.height;
  const top = gY - G_CLEF.gLineFraction * height;
  const left = 14;
  return `<g transform="translate(${left} ${top.toFixed(2)}) scale(${scale.toFixed(4)})">`
    + `<path d="${G_CLEF.d}" class="staff__clef--filled"/></g>`;
}

function bassClefPath() {
  const fLine = yForStep(3 * 7 + 3, 'bass'); // F3, the line the clef names
  const cx = 26;
  return {
    // comma-shaped body starting at the F line
    body: `M ${cx - 2} ${fLine - 9}
           c 7 0 12 5 12 12
           c 0 12 -12 20 -22 24
           c 10 -7 16 -15 16 -24
           c 0 -6 -3 -10 -7 -10
           c -4 0 -6 3 -6 6
           c 0 4 3 6 6 5
           c -1 4 -5 6 -9 4
           c -4 -2 -6 -7 -5 -11
           c 1 -4 6 -6 15 -6 z`,
    dots: [[cx + 16, fLine - 6], [cx + 16, fLine + 6]],
  };
}

export function clefMarkup(clef) {
  if (clef === 'treble') return trebleClefGroup();
  const { body, dots } = bassClefPath();
  return `<path d="${body}" class="staff__clef--filled"/>` + dots.map(([cx,cy]) => `<circle cx="${cx}" cy="${cy}" r="2.2" class="staff__dot"/>`).join('');
}
export const staffY = yForStep;

/* ── Rendering ─────────────────────────────────────────────────────────── */

const ACCIDENTAL_TEXT = { '-2': '♭♭', '-1': '♭', 1: '♯', 2: '♯♯' };

function svg(tag, attrs, children = '') {
  const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  return `<${tag} ${a}>${children}</${tag}>`;
}

function ledgerLines(step, clef) {
  const { bottomStep } = CLEFS[clef];
  const topStep = bottomStep + 8;
  const out = [];
  // Ledger lines only exist where a staff line would be, i.e. same parity.
  for (let s = bottomStep - 2; s >= step; s -= 2) out.push(s);
  for (let s = topStep + 2; s <= step; s += 2) out.push(s);
  return out;
}

export function renderStaff(item, clefId = 'treble', revealed = false, feedback = '') {
  if (!item || !item.tones.length) return '';
  const clef = CLEFS[clefId] ? clefId : 'treble';

  const parts = [];
  const staffLineYs = [];

  // staff lines, emitted at the end once the horizontal extent is known
  for (let i = 0; i < 5; i += 1) {
    staffLineYs.push(TOP_LINE_Y + i * SPACING);
  }

  // clef
  if (clef === 'treble') {
    parts.push(trebleClefGroup());
  } else {
    const { body, dots } = bassClefPath();
    parts.push(svg('path', { d: body.replace(/\s+/g, ' '), class: 'staff__clef staff__clef--filled' }));
    dots.forEach(([cx, cy]) => parts.push(svg('circle', { cx, cy, r: 2.2, class: 'staff__dot' })));
  }

  const clefParts = parts.length;

  // Lay the noteheads out lowest-first so seconds can be nudged sideways.
  const sorted = [...item.tones].sort((a, b) => a.staffStep - b.staffStep);
  const baseX = 96;
  const placed = [];
  let previousOffset = false;
  for (const tone of sorted) {
    const isSecond = placed.length > 0
      && tone.staffStep - placed[placed.length - 1].tone.staffStep === 1
      && !previousOffset;
    previousOffset = isSecond;
    placed.push({ tone, x: baseX + (isSecond ? 9 : 0), y: yForStep(tone.staffStep, clef) });
  }

  // ledger lines, de-duplicated across the whole chord
  const ledgers = new Set();
  placed.forEach(({ tone }) => ledgerLines(tone.staffStep, clef).forEach((s) => ledgers.add(s)));
  ledgers.forEach((step) => {
    const y = yForStep(step, clef);
    parts.push(svg('line', { x1: baseX - 13, y1: y, x2: baseX + 13, y2: y, class: 'staff__line' }));
  });

  // accidentals, stacked leftwards so they never collide
  let accidentalX = baseX - 15;
  let leftmostAccidental = baseX;
  [...placed].reverse().forEach(({ tone, y }) => {
    const glyph = ACCIDENTAL_TEXT[tone.alteration];
    if (!glyph) return;
    parts.push(svg('text', {
      x: accidentalX, y: y + 4.5, class: 'staff__accidental', 'text-anchor': 'end',
    }, glyph));
    leftmostAccidental = accidentalX - glyph.length * 11;
    accidentalX -= 10;
  });

  const HEAD_RX = 6.6;
  const HEAD_RY = 4.9;

  placed.forEach(({ x, y }) => {
    parts.push(svg('ellipse', {
      cx: x, cy: y, rx: HEAD_RX, ry: HEAD_RY,
      transform: `rotate(-20 ${x} ${y})`, class: 'staff__head',
    }));
  });

  // One stem for the whole chord, pointing away from the middle line and
  // reaching past the far notehead, measured in staff spaces so a wide chord
  // doesn't end up with an absurdly long tail.
  const middleY = TOP_LINE_Y + SPACING * 2;
  const lowest = placed[0];                          // lowest pitch = largest y
  const highest = placed[placed.length - 1];
  const averageY = placed.reduce((s, p) => s + p.y, 0) / placed.length;
  const stemUp = averageY >= middleY;
  const overhang = SPACING * 2.5;
  const stemX = stemUp ? lowest.x + HEAD_RX * 0.96 : highest.x - HEAD_RX * 0.96;
  const stemY1 = stemUp ? lowest.y : highest.y;
  const stemY2 = stemUp ? highest.y - overhang : lowest.y + overhang;
  parts.push(svg('line', { x1: stemX, y1: stemY1, x2: stemX, y2: stemY2, class: 'staff__stem' }));

  // The viewBox is fitted to whatever was actually drawn. A fixed box clipped
  // wide chords and tall ledger stacks, this way the drawing is always framed
  // no matter the clef, chord width or how far the notes stray off the staff.
  const ys = [TOP_LINE_Y, BOTTOM_LINE_Y, stemY1, stemY2];
  if (clef === 'treble') {
    const gY = yForStep(4 * 7 + 4, 'treble');
    const h = CLEF_SPACES * SPACING;
    ys.push(gY - G_CLEF.gLineFraction * h, gY + (1 - G_CLEF.gLineFraction) * h);
  } else {
    const fY = yForStep(3 * 7 + 3, 'bass');
    ys.push(fY - 14, fY + 22);
  }
  placed.forEach(({ y }) => ys.push(y - HEAD_RY, y + HEAD_RY));
  ledgers.forEach((step) => ys.push(yForStep(step, clef)));

  // Fit horizontally too. A fixed 150-wide box left a single note floating in
  // empty space, and because the SVG scales on width that capped how tall the
  // staff could ever render. Tightening the box is what lets it fill the screen.
  const clefRight = clef === 'treble' ? 14 + G_CLEF.width * (CLEF_SPACES * SPACING / G_CLEF.height) : 48;
  const rightmost = Math.max(
    clefRight,
    ...placed.map((p) => p.x + HEAD_RX),
    baseX + 13,                       // ledger lines
    stemX,
  );
  const leftmost = Math.min(10, leftmostAccidental);

  const padX = 8;
  const padY = 7;
  const left = leftmost - padX;
  const width = rightmost + padX - left;
  const top = Math.min(...ys) - padY;
  const height = Math.max(...ys) + padY - top;

  const lines = staffLineYs
    .map((y) => svg('line', { x1: left + 2, y1: y, x2: left + width - 2, y2: y, class: 'staff__line' }))
    .join('');

  return `<svg viewBox="${left.toFixed(1)} ${top.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}"`
    + ` class="staff${['correct', 'wrong'].includes(feedback) ? ` staff--${feedback}` : ''}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${
      revealed ? item.tones.map((t) => t.name).join(', ') : 'Identify the notation'
    } on the ${CLEFS[clef].label.toLowerCase()} staff">${lines}${parts.slice(0, clefParts).join('')}<g class="staff__notation">${parts.slice(clefParts).join('')}</g></svg>`;
}

