import { CLEFS, clefMarkup, staffY } from './staff.js';

const width = 380;
export const scoreX = (beat, meter) => 93 + beat / meter * 270;

function rest(x, duration) {
  if (duration >= 2) return `<rect x="${x-6}" y="${duration === 4 ? 36 : 42}" width="13" height="6" fill="currentColor"/>`;
  if (duration === .5) return `<circle cx="${x-3}" cy="37" r="3" fill="currentColor"/><path d="M${x-1} 38q9 -5 7 -9l-7 30" fill="none" stroke="currentColor" stroke-width="2"/>`;
  return `<path d="M${x-5} 28l9 12 -6 7 7 10q-13 -7 -10 6q-10 -9 2 -13l-7 -10 7 -7z" fill="currentColor"/>`;
}

export function renderMeasure(phrase, bar, results = new Map(), current = -1) {
  const events = phrase.events.filter(event => event.bar === bar);
  const ys = events.filter(e => e.tone).map(e => staffY(e.tone.staffStep, phrase.clef));
  const top = phrase.rhythm ? 16 : Math.min(-3,...ys.map(y=>y-40));
  const bottom = phrase.rhythm ? 80 : Math.max(94,...ys.map(y=>y+40));
  const lines = phrase.rhythm ? [48] : [24,36,48,60,72];
  const alterations = new Map();
  const notes = events.map(event => {
    const x = scoreX(event.beat % phrase.meter,phrase.meter);
    let drawing;
    if (event.rest) drawing = rest(x,event.durationBeats);
    else {
      const y = phrase.rhythm ? 48 : staffY(event.tone.staffStep,phrase.clef);
      const whole = event.durationBeats === 4;
      drawing = `<ellipse cx="${x}" cy="${y}" rx="${whole?8:6.5}" ry="4.7" transform="rotate(${whole?0:-20} ${x} ${y})" class="${event.durationBeats>=2?'score-head-open':'score-head'}"/>`;
      const up = y >= 48, stemX = x + (up ? 6 : -6), end = y + (up ? -31 : 31);
      if (!whole) drawing += `<path d="M${stemX} ${y}V${end}" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
      if (event.durationBeats === .5) drawing += up ? `<path d="M${stemX} ${end}c0 9 15 10 5 25c4 -14 -5 -10 -5 -17z" fill="currentColor"/>` : `<path d="M${stemX} ${end}c0 -9 -15 -10 -5 -25c-4 14 5 10 5 17z" fill="currentColor"/>`;
      if (!phrase.rhythm) {
        const base = CLEFS[phrase.clef].bottomStep, step = event.tone.staffStep;
        for (let ledger = base - 2; ledger >= step; ledger -= 2) drawing += `<path d="M${x-11} ${staffY(ledger,phrase.clef)}h22" class="staff__line"/>`;
        for (let ledger = base + 10; ledger <= step; ledger += 2) drawing += `<path d="M${x-11} ${staffY(ledger,phrase.clef)}h22" class="staff__line"/>`;
        const key = `${event.tone.letter}:${event.tone.octave}`, alteration = event.tone.alteration;
        if ((alterations.get(key) || 0) !== alteration) drawing += `<text x="${x-12}" y="${y+5}" text-anchor="end" class="staff__accidental">${alteration === 0 ? '♮' : alteration > 0 ? '♯' : '♭'}</text>`;
        alterations.set(key,alteration);
      }
    }
    const status = results.get(event.id)?.status || '';
    return `<g data-event="${event.id}" data-beat="${event.beat}" data-duration="${event.durationBeats}" data-midi="${event.tone?.midi ?? ''}" data-rest="${event.rest}" class="score-event ${status} ${current === event.id ? 'current' : ''}">${drawing}</g>`;
  }).join('');
  return `<div class="measure" data-bar="${bar}"><span class="measure-label">Bar ${bar+1} of ${phrase.bars}</span><svg class="exercise-staff" viewBox="0 ${top} ${width} ${bottom-top}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${phrase.rhythm?'Rhythm':phrase.clef+' clef'} bar ${bar+1}">${lines.map(y=>`<path d="M8 ${y}H374" class="staff__line"/>`).join('')}${phrase.rhythm?'':clefMarkup(phrase.clef)}<text x="${phrase.rhythm?36:65}" y="45" text-anchor="middle" class="score-meter">${phrase.meter}</text><text x="${phrase.rhythm?36:65}" y="65" text-anchor="middle" class="score-meter">4</text>${notes}<path d="M374 ${phrase.rhythm?36:lines[0]}V${phrase.rhythm?60:lines.at(-1)}" class="staff__line"/><path data-cursor d="M0 ${top+4}V${bottom-4}" class="score-cursor" transform="translate(93 0)"/></svg></div>`;
}

export function renderScore(phrase, bar, results, current) {
  return [bar,bar+1].filter(index=>index<phrase.bars).map(index=>renderMeasure(phrase,index,results,current)).join('');
}
