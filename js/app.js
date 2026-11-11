import { LETTERS, makeTone } from './notes.js';
import { QUALITIES, buildChord } from './chords.js';
import { poolFor, createRound, recordAnswer, retryQuestion, advance, answerName, localDay, THEMES, NOTE_OPTIONS, selectedNamesFor, OCTAVE_OPTIONS, octavesFor, rangeKey } from './quiz.js';
import { loadState, saveState, completeRound } from './storage.js';
import { renderStaff } from './staff.js';
import { playItem, stopAudio, suspendAudio } from './audio.js';
import { MidiKeyboard, tonesFromMidi } from './midi.js';
import { fitViewport } from './viewport.js';
import { Activities } from './activities.js';
import { PracticeDisplay } from './display.js';

fitViewport();

const $ = id => document.getElementById(id);
const loaded = loadState();
let state = loaded.state;
let screen = 'home';
let paused = true;
let clockStart = null;
let nextTimer;
let answer = blankAnswer();
let draft;
let registration;
let updating = false;
let pendingWorker;
let persistTimer;
let midiCueTimer;
let activities;
const display = new PracticeDisplay({ onChange:renderDisplay });
display.setEnabled(state.settings.keepAwake);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clefName = clef => ({ treble: 'Treble clef', bass: 'Bass clef', mixed: 'Mixed clefs' })[clef];
const modeName = mode => ({ notes: 'Note names', chords: 'Chord names', mixed: 'Notes & chords' })[mode];
function blankAnswer() { return { letter: null, alteration: 0, qualityId: null }; }

const isMidiMode = () => state.settings.inputMode === 'midi';
function renderInputMode() {
  document.querySelector('.app-shell').dataset.inputMode = state.settings.inputMode;
  document.querySelectorAll('[data-input-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inputMode === state.settings.inputMode)));
}
function setInputMode(inputMode) {
  captureTime();
  clearTimeout(nextTimer);
  state.settings.inputMode = inputMode;
  if (state.active) state.active.settings.inputMode = inputMode;
  renderInputMode();
  if (screen === 'quiz') { renderQuestion(); startClock(); }
  else renderHome();
  persist();
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  $('storage-notice').hidden = saveState(state);
}
function queuePersist() { if (!persistTimer) persistTimer = setTimeout(persist, 80); }
function theme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}
function captureTime() {
  if (clockStart !== null && state.active && !state.active.feedback) state.active.elapsed += performance.now() - clockStart;
  clockStart = null;
}
function startClock() {
  if (clockStart === null && screen === 'quiz' && !paused && !document.hidden && !state.active?.feedback && state.active?.current && (!isMidiMode() || midi.status.connected)) clockStart = performance.now();
}
function showScreen(name) {
  screen = name;
  document.querySelector('.app-shell').dataset.screen = name;
  for (const id of ['home', 'quiz', 'result', 'training']) $(`${id}-screen`).hidden = name !== id;
  display.setActive(name === 'quiz' || name === 'training');
  window.scrollTo(0, 0);
}

function renderDisplay() {
  const supported = display.fullscreenSupported;
  const active = display.fullscreen;
  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  $('fullscreen-button').hidden = !supported && !active;
  $('fullscreen-button').setAttribute('aria-label', label);
  $('fullscreen-button').setAttribute('aria-pressed', String(active));
  $('fullscreen-button').title = label;
  $('fullscreen-setting').textContent = label;
  $('fullscreen-setting').disabled = !supported && !active;
  $('fullscreen-status').textContent = display.fullscreenError ? 'Fullscreen was blocked. Tap Enter fullscreen to try again.' : active ? 'Fullscreen is on. Use the arrows above or your device’s Back gesture to leave.' : supported ? 'Hide browser controls and system bars while you practise.' : 'This browser does not offer fullscreen for the app. Installed apps use the screen mode allowed by your browser.';
  $('wake-setting').checked = state.settings.keepAwake;
  $('wake-setting').disabled = !display.wakeSupported;
  const messages = { active:'Screen stays awake during practice.', requesting:'Keeping the screen awake…', denied:'Your device declined to keep the screen awake. Battery saver can prevent it.', released:'Your device released the screen lock. Retry to keep it awake.', idle:state.settings.keepAwake ? 'Automatically keeps the screen awake while a quiz or exercise is open.' : 'Your usual screen timeout applies.' };
  $('wake-status').textContent = display.wakeSupported ? messages[display.wakeState] : 'Keeping the screen awake is unavailable in this browser.';
  $('wake-retry').hidden = !display.wanted || !['denied','released'].includes(display.wakeState);
}

function renderHome() {
  renderInputMode();
  const settings = state.settings;
  $('practice-title').textContent = modeName(settings.mode);
  const roots = selectedNamesFor(settings).length;
  const types = settings.mode === 'notes' ? '' : ` · ${settings.qualities.length} chord types`;
  const selection = roots <= 3 ? selectedNamesFor(settings).join(' · ') : `${roots} ${settings.mode === 'chords' ? 'roots' : 'notes'}`;
  const ranges = rangeKey(settings).map(([clef, octaves]) => {
    const spans = [];
    for (const octave of octaves) {
      if (spans.at(-1)?.[1] === octave - 1) spans.at(-1)[1] = octave;
      else spans.push([octave, octave]);
    }
    return `${settings.clef === 'mixed' ? clef === 'treble' ? 'Treble ' : 'Bass ' : ''}${spans.map(([first, last]) => `C${first}–B${last}`).join(', ')}`;
  }).join(' / ');
  $('practice-detail').textContent = `${clefName(settings.clef)} · ${selection}${types} · ${settings.length} questions · ${ranges}`;
  $('start-button').innerHTML = `${state.active ? 'Resume practice' : 'Let’s practise'} <span aria-hidden="true">→</span>`;
  $('resume-note').hidden = !state.active;
  const done = state.daily[localDay()] || 0;
  $('daily-title').textContent = done ? 'A little practice, already done.' : 'Your daily little practice';
  $('daily-description').textContent = done ? `${done} round${done > 1 ? 's' : ''} today. Anything extra is a bonus.` : `${settings.length === 10 ? 'Ten' : 'Twenty'} questions. A little more fluent.`;
  $('daily-check').textContent = done ? '✓' : '○';
  const history = Object.values(state.history);
  const attempts = history.reduce((n, h) => n + h.attempts, 0);
  const correct = history.reduce((n, h) => n + h.correct, 0);
  const due = poolFor(settings).filter(item => state.history[item.id]?.due <= Date.now()).length;
  const stats = attempts ? [[attempts, 'answers practised'], [`${Math.round(correct / attempts * 100)}%`, 'all-time accuracy'], [due, 'ready for review']] : [['01', 'small daily habit'], ['10', 'questions to begin'], ['∞', 'room to grow']];
  $('progress-overview').innerHTML = stats.map(([value, label]) => `<div class="mini-stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  activities?.home();
}

function goHome() {
  activities?.stop();
  pause(false);
  showScreen('home');
  renderHome();
}
function start() {
  if (activities.activity !== 'quiz') { pause(false); showScreen('training'); void activities.start(); return; }
  if (!state.active) state.active = createRound(state.settings, state.history);
  paused = false;
  showScreen('quiz');
  renderQuestion();
  persist();
  startClock();
  if (isMidiMode() && !midi.status.connected && !midi.wanted) void midi.connect();
}
function pause(render = true) {
  if (screen === 'training') activities?.pause();
  midi.phrase.setActive(false);
  captureTime();
  clearTimeout(nextTimer);
  paused = true;
  suspendAudio();
  persist();
  if (render && screen === 'quiz') renderQuestion();
  if (render && screen === 'quiz') $('resume-button').focus({ preventScroll: true });
}
function resume() {
  paused = false;
  renderQuestion();
  startClock();
}

function renderQuestion() {
  clearTimeout(nextTimer);
  midi.phrase.resetPhrase();
  const round = state.active;
  if (isMidiMode() && round?.feedback?.answer) {
    if (round.feedback.correct) advance(round, state.history);
    else retryQuestion(round);
    queuePersist();
  }
  if (!round?.current) { finish(); return; }
  midi.phrase.setActive(canAcceptMidi());
  clearTimeout(midiCueTimer);
  document.querySelector('.score-card').classList.remove('midi-correct', 'midi-wrong');
  $('midi-action-hint').classList.remove('midi-mistake');
  renderInputMode();
  const feedback = round.feedback;
  const item = round.current;
  $('answer-status').textContent = feedback && !paused ? feedback.correct ? 'Correct. Next question.' : feedback.answer ? 'Incorrect. Try the same question again.' : `The answer is ${item.label}. Moving to the next question.` : '';
  $('paused-panel').hidden = !paused;
  $('quiz-content').hidden = paused;
  $('pause-actions').hidden = !paused;
  document.querySelector('.score-card').hidden = paused;
  $('answer-controls').hidden = paused || isMidiMode();
  $('answer-controls').inert = Boolean(feedback);
  $('answer-actions').hidden = paused || isMidiMode() || Boolean(feedback);
  $('feedback-actions').hidden = paused || isMidiMode() || !feedback;
  $('midi-actions').hidden = paused || !isMidiMode();
  $('quiz-midi-panel').hidden = paused || !isMidiMode();
  $('pause-button').hidden = paused;
  const index = round.answers.length + (feedback || round.retrying ? 0 : 1);
  $('question-count').textContent = `Question ${Math.min(index, round.settings.length)} of ${round.settings.length}`;
  $('round-score').textContent = `${round.answers.filter(a => a.correct).length} first try`;
  $('round-progress').setAttribute('aria-valuemax', round.settings.length);
  $('round-progress').setAttribute('aria-valuenow', round.answers.length);
  $('round-progress').firstElementChild.style.width = `${round.answers.length / round.settings.length * 100}%`;
  $('prompt-title').textContent = isMidiMode() ? item.kind === 'note' ? 'Play this note' : 'Play this chord' : item.kind === 'note' ? 'Name this note' : 'Name this chord';
  $('prompt-eyebrow').textContent = 'ONE NOTE AT A TIME';
  $('clef-label').textContent = clefName(item.clef);
  let displayed = item;
  if (feedback && !feedback.correct && feedback.answer) {
    if (feedback.answer.source === 'midi') displayed = { tones: tonesFromMidi(feedback.answer.notes).slice(0, 8) };
    else {
      const root = makeTone(feedback.answer.letter, feedback.answer.alteration, item.tones[0].octave);
      displayed = item.kind === 'chord' ? buildChord(root.pitchClass, feedback.answer.qualityId, root.octave, () => 1, [root.letter, root.alteration]) : { tones: [root] };
    }
  }
  $('quiz-staff').innerHTML = renderStaff(displayed, item.clef, Boolean(feedback), feedback ? feedback.correct ? 'correct' : 'wrong' : '');
  $('staff-caption').textContent = isMidiMode() ? item.kind === 'note' ? 'Play the key. You can retry straight away.' : 'Hold the chord together, then release to check.' : item.kind === 'chord' ? 'Find the root, then the chord type.' : 'Read the staff. Choose the written name.';
  if (feedback) {
    const given = answerName(feedback.answer, item.kind);
    $('staff-caption').textContent = feedback.correct ? `${item.label} · Correct` : feedback.answer ? `${given} · Try again` : `${item.label} · ${item.tones[0].name}${item.tones[0].octave} · Moving on`;
    $('next-button').innerHTML = `${feedback.correct ? 'Next question' : 'Skip question'} <span aria-hidden="true">→</span>`;
    if (!paused) nextTimer = setTimeout(() => {
      if (feedback.correct || !feedback.answer) next();
      else if (retryQuestion(round)) { persist(); renderQuestion(); startClock(); }
    }, feedback.correct ? isMidiMode() ? 450 : 900 : 2000);
  } else if (!paused && !isMidiMode()) {
    answer = blankAnswer();
    $('quality-answer-section').hidden = item.kind !== 'chord';
    $('answer-qualities').innerHTML = round.settings.qualities.map(id => {
      const q = QUALITIES.find(q => q.id === id);
      return `<button data-quality="${q.id}" aria-pressed="false">${q.name}<small>${q.suffix || 'major'}</small></button>`;
    }).join('');
    $('answer-quality-picker').innerHTML = '<option value="">Choose chord type</option>' + round.settings.qualities.map(id => {
      const q = QUALITIES.find(q => q.id === id);
      return `<option value="${q.id}">${q.name}${q.suffix ? ` (${q.suffix})` : ''}</option>`;
    }).join('');
    renderAnswer();
  }
  renderMidiQuiz();
  if (!paused && !feedback) $('prompt-title').focus({ preventScroll: true });
}

function renderAnswer() {
  for (const button of $('letters').children) button.setAttribute('aria-pressed', String(Number(button.dataset.letter) === answer.letter));
  for (const button of $('accidentals').children) button.setAttribute('aria-pressed', String(Number(button.dataset.alteration) === answer.alteration));
  for (const button of $('answer-qualities').children) button.setAttribute('aria-pressed', String(button.dataset.quality === answer.qualityId));
  $('answer-quality-picker').value = answer.qualityId || '';
  const name = answerName(answer, state.active.current.kind);
  $('answer-preview').textContent = name || (answer.letter === null ? 'Choose a letter' : 'Choose a chord type');
  $('check-button').disabled = !name;
}


function submit(value) {
  if (paused || screen !== 'quiz' || state.active?.feedback) return;
  captureTime();
  const feedback = recordAnswer(state.active, state.history, value, state.active.elapsed);
  if (!feedback) return;
  persist();
  renderQuestion();
  if (state.settings.sound) void playItem(feedback.item).catch(() => {});
}

function submitMidi(notes) {
  if (!canAcceptMidi()) return;
  captureTime();
  const round = state.active;
  const feedback = recordAnswer(round, state.history, { source: 'midi', notes }, round.elapsed);
  if (!feedback) return;
  if (feedback.correct) advance(round, state.history);
  else retryQuestion(round);
  renderQuestion();
  startClock();
  queuePersist();
  if (screen !== 'quiz') return;
  const card = document.querySelector('.score-card');
  card.classList.add(feedback.correct ? 'midi-correct' : 'midi-wrong');
  const message = feedback.correct ? 'Correct ✓' : `Played ${answerName(feedback.answer, feedback.item.kind)} · Try again`;
  $('midi-action-hint').textContent = message;
  $('midi-action-hint').classList.toggle('midi-mistake', !feedback.correct);
  $('answer-status').textContent = message;
  midiCueTimer = setTimeout(() => { card.classList.remove('midi-correct', 'midi-wrong'); $('midi-action-hint').classList.remove('midi-mistake'); renderMidiQuiz(); }, feedback.correct ? 120 : 180);
  if (state.settings.sound) setTimeout(() => { void playItem(feedback.item).catch(() => {}); }, 0);
}

function next() {
  clearTimeout(nextTimer);
  stopAudio();
  if (paused || !state.active?.feedback) return;
  if (!advance(state.active, state.history)) { finish(); return; }
  persist();
  renderQuestion();
  startClock();
}

function finish() {
  midi.phrase.setActive(false);
  captureTime();
  clearTimeout(nextTimer);
  suspendAudio();
  const result = completeRound(state) || state.lastResult;
  persist();
  if (!result) { goHome(); return; }
  showScreen('result');
  $('result-title').textContent = result.accuracy === 100 ? 'Look at you grow.' : result.accuracy >= 60 ? 'A little more fluent.' : 'Every try plants a seed.';
  $('result-message').textContent = `${result.correct} of ${result.total} correct. ${result.improvement > 0 ? `Up ${result.improvement} percentage points from your last round with these notes.` : result.accuracy === 100 ? 'Let those connections settle. Come back tomorrow.' : 'The tricky ones are another chance to learn.'}`;
  $('result-metrics').innerHTML = `<div><strong>${result.accuracy}%</strong><span>accuracy this round</span></div><div><strong>${result.meanMs === null ? '—' : (result.meanMs / 1000).toFixed(1) + 's'}</strong><span>average correct answer</span></div>`;
  $('difficult-section').hidden = !result.difficult.length;
  $('difficult-items').innerHTML = result.difficult.slice(0, 3).map(item => `<span>${escape(item.label)}<small>${escape(clefName(item.clef))}</small></span>`).join('') + (result.difficult.length > 3 ? `<span class="more-reviews">+${result.difficult.length - 3} more to review</span>` : '');
  $('result-title').focus({ preventScroll: true });
}

function openDialog(id) {
  if (screen === 'quiz' && !paused) pause();
  if (screen === 'training') pause(false);
  $(id).showModal();
}
function openCustomize() {
  draft = structuredClone(state.settings);
  draft.noteNames = [...selectedNamesFor(draft)];
  draft.octaves = Object.fromEntries(['treble', 'bass'].map(clef => [clef, [...octavesFor(draft, clef)]]));
  $('setup-round-note').hidden = !state.active;
  renderDraft();
  openDialog('customize-dialog');
}
function renderDraft() {
  for (const [group, key] of [['mode-options', 'mode'], ['clef-options', 'clef'], ['length-options', 'length']]) for (const button of $(group).children) button.setAttribute('aria-pressed', String(String(draft[key]) === button.dataset[key]));
  for (const button of $('pitch-options').querySelectorAll('[data-note]')) button.setAttribute('aria-pressed', String(draft.noteNames.includes(button.dataset.note)));
  for (const button of $('quality-options').children) button.setAttribute('aria-pressed', String(draft.qualities.includes(button.dataset.quality)));
  for (const clef of ['treble', 'bass']) {
    $(`${clef}-octaves`).hidden = draft.clef !== 'mixed' && draft.clef !== clef;
    for (const button of $(`${clef}-octaves`).querySelectorAll('[data-octave]')) button.setAttribute('aria-pressed', String(draft.octaves[clef].includes(Number(button.dataset.octave))));
  }
  $('chord-settings').hidden = draft.mode === 'notes';
  $('pitch-legend').textContent = draft.mode === 'chords' ? 'Chord roots to practise' : draft.mode === 'mixed' ? 'Notes & chord roots to practise' : 'Notes to practise';
  $('selection-summary').textContent = `${draft.noteNames.length} selected. Only these written spellings will appear.`;
  $('setup-error').hidden = true;
}

function canAcceptMidi() {
  return isMidiMode() && midi.status.connected && screen === 'quiz' && !paused && !document.hidden && Boolean(state.active?.current) && !state.active?.feedback && !document.querySelector('dialog[open]');
}
function renderMidiQuiz() {
  const status = midi.status;
  $('quiz-midi-status').textContent = status.connected ? `Connected · ${status.selectedName}` : status.state === 'unsupported' ? 'MIDI is unavailable in this browser. Switch to tap answers.' : status.state === 'requesting' || status.state === 'opening' ? 'Connecting your keyboard…' : 'Keyboard not connected. Reconnect it, then tap Recheck MIDI.';
  const unavailable = status.state === 'unsupported' || status.state === 'requesting';
  $('midi-recheck-quiz').disabled = unavailable;
  $('midi-action-hint').textContent = state.active?.feedback ? 'Moving to the next note' : state.active?.current?.kind === 'chord' ? 'Hold together, then release' : 'Play a key · instant retry';
}
function renderMidi(status) {
  const messages = {
    unsupported: 'MIDI is unavailable in this browser. Safari on iPhone/iPad and Firefox on Android do not support it. Try Chrome on Android or a supported desktop browser.',
    idle: 'Connect a USB MIDI keyboard, then enable MIDI here.',
    requesting: 'Waiting for browser MIDI permission…',
    opening: 'Opening your MIDI keyboard…',
    waiting: status.selectedId ? 'Keyboard disconnected. Reconnect it or use Recheck MIDI.' : 'No MIDI inputs found. Connect a keyboard, then use Recheck MIDI.',
    connected: `Connected to ${status.selectedName}. Notes answer on key press; release chords to check.`,
    error: status.message,
  };
  $('midi-status').textContent = messages[status.state];
  $('midi-connect').disabled = status.state === 'unsupported' || status.state === 'requesting' || status.state === 'opening';
  $('midi-connect').hidden = status.connected || status.state === 'waiting' || status.state === 'opening';
  $('midi-connect').textContent = status.state === 'error' ? 'Retry MIDI' : status.state === 'requesting' ? 'Connecting…' : 'Connect MIDI keyboard';
  $('midi-recheck').disabled = status.state === 'unsupported' || status.state === 'requesting';
  $('midi-disconnect').hidden = !midi.wanted;
  $('midi-disconnect').textContent = status.state === 'requesting' ? 'Cancel connection' : 'Disconnect MIDI';
  $('midi-device').hidden = !midi.wanted || !status.inputs.length && !status.selectedId;
  const selected = status.inputs.find(input => input.id === status.selectedId);
  const options = (!selected && status.selectedId ? `<option value="${escape(status.selectedId)}">${escape(status.selectedName || 'Selected keyboard')} (disconnected)</option>` : '') + status.inputs.map(input => `<option value="${escape(input.id)}">${escape(input.name)}</option>`).join('');
  if ($('midi-input').innerHTML !== options) $('midi-input').innerHTML = options;
  $('midi-input').value = status.selectedId || '';
  midi.phrase.setActive(canAcceptMidi());
  if (isMidiMode() && !status.connected) captureTime();
  else startClock();
  renderMidiQuiz();
  activities?.midiChanged(status);
}
const midi = new MidiKeyboard({ onStatus: renderMidi, onPhrase: notes => { if (canAcceptMidi() && state.active.current.kind === 'chord') submitMidi(notes); }, onNote: event => { if (activities?.calibration.receive(event)) return; if (screen === 'training') { activities?.receive(event); return; } if (event.type === 'on' && canAcceptMidi() && state.active.current.kind === 'note') submitMidi([event.note]); } });
activities = new Activities({ goHome, showTraining:() => showScreen('training'), openDialog, openNotes:openCustomize, renderHome, getQuizSettings: () => state.settings, midi });
document.querySelectorAll('[data-input-mode]').forEach(button => { button.onclick = () => setInputMode(button.dataset.inputMode); });
$('midi-use-touch').onclick = () => setInputMode('touch');
$('midi-connect').onclick = () => { setInputMode('midi'); void midi.connect(); };
$('midi-recheck').onclick = $('midi-recheck-quiz').onclick = () => { void midi.recheck(); };
$('midi-skip-button').onclick = () => { if (state.active?.feedback) next(); else submit(null); };
$('midi-disconnect').onclick = () => midi.disconnect();
$('midi-input').onchange = () => midi.select($('midi-input').value);
renderMidi(midi.status);

$('home-staff').innerHTML = renderStaff({ tones: [makeTone(2, 0, 4)] }, 'treble');
$('letters').innerHTML = LETTERS.map((letter, i) => `<button data-letter="${i}" aria-label="${letter}" aria-pressed="false">${letter}</button>`).join('');
$('pitch-options').innerHTML = [[0, 'Naturals'], [1, 'Sharps'], [-1, 'Flats']].map(([alteration, title]) => `<div class="note-group"><p class="eyebrow">${title}</p><div class="note-grid">${NOTE_OPTIONS.filter(note => note.alteration === alteration).map(note => `<button type="button" data-note="${note.name}" aria-pressed="false">${note.name}</button>`).join('')}</div></div>`).join('');
$('octave-options').innerHTML = ['treble', 'bass'].map(clef => `<div id="${clef}-octaves" class="note-group"><p class="eyebrow">${clefName(clef)}</p><div class="octave-grid">${OCTAVE_OPTIONS[clef].map(octave => `<button type="button" data-range-clef="${clef}" data-octave="${octave}" aria-label="${clefName(clef)} octave ${octave}, C${octave} to B${octave}" aria-pressed="false">C${octave}–B${octave}</button>`).join('')}</div></div>`).join('');
$('quality-options').innerHTML = QUALITIES.map(q => `<button type="button" data-quality="${q.id}" aria-pressed="false">${q.name}<small>${q.suffix || 'major'}</small></button>`).join('');
$('theme-options').innerHTML = THEMES.map(t => `<button data-theme="${t.id}" aria-pressed="false"><span class="theme-swatch" aria-hidden="true" style="--swatch-bg:${t.background};--swatch-accent:${t.accent}"></span><span>${t.name}<small>${t.detail}</small></span></button>`).join('');

$('letters').onclick = event => { const button = event.target.closest('[data-letter]'); if (button) { answer.letter = Number(button.dataset.letter); renderAnswer(); } };
$('accidentals').onclick = event => { const button = event.target.closest('[data-alteration]'); if (button) { answer.alteration = Number(button.dataset.alteration); renderAnswer(); } };
$('answer-qualities').onclick = event => { const button = event.target.closest('[data-quality]'); if (button) { answer.qualityId = button.dataset.quality; renderAnswer(); } };
$('answer-quality-picker').onchange = () => { answer.qualityId = $('answer-quality-picker').value || null; renderAnswer(); };
$('check-button').onclick = () => submit(answer);
$('unknown-button').onclick = () => submit(null);
$('next-button').onclick = next;
$('hear-button').onclick = () => { void playItem(state.active.current).then(ok => { if (!ok) $('hear-button').textContent = 'Audio unavailable'; }); };
$('start-button').onclick = start;
$('pause-button').onclick = () => pause();
$('resume-button').onclick = resume;
for (const id of ['home-button', 'pause-home-button', 'result-home-button']) $(id).onclick = goHome;
$('again-button').onclick = start;
$('customize-button').onclick = () => activities.activity === 'quiz' ? openCustomize() : activities.configure();
$('practice-settings-button').onclick = () => { $('settings-dialog').close(); openCustomize(); };
$('about-button').onclick = () => openDialog('about-dialog');
$('settings-button').onclick = () => {
  for (const button of $('theme-options').children) button.setAttribute('aria-pressed', String(button.dataset.theme === state.settings.theme));
  $('sound-setting').checked = state.settings.sound;
  openDialog('settings-dialog');
};
async function toggleFullscreen() { if (!await display.toggleFullscreen()) openDialog('settings-dialog'); }
$('fullscreen-button').onclick = toggleFullscreen;
$('fullscreen-setting').onclick = () => { $('settings-dialog').close(); void toggleFullscreen(); };
$('wake-setting').onchange = () => { state.settings.keepAwake = $('wake-setting').checked; persist(); display.setEnabled(state.settings.keepAwake); };
$('wake-retry').onclick = () => display.sync();
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
for (const [group, key] of [['mode-options', 'mode'], ['clef-options', 'clef'], ['length-options', 'length']]) $(group).onclick = event => {
  const button = event.target.closest(`[data-${key}]`);
  if (button) { draft[key] = key === 'length' ? Number(button.dataset[key]) : button.dataset[key]; renderDraft(); }
};
$('pitch-options').onclick = event => { const button = event.target.closest('[data-note]'); if (button) { const name = button.dataset.note; draft.noteNames = draft.noteNames.includes(name) ? draft.noteNames.filter(value => value !== name) : [...draft.noteNames, name]; renderDraft(); } };
document.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => {
  const preset = button.dataset.preset;
  draft.noteNames = NOTE_OPTIONS.filter(note => preset === 'all' || preset === 'naturals' && note.alteration === 0 || preset === 'sharps' && note.alteration === 1 || preset === 'flats' && note.alteration === -1).map(note => note.name);
  renderDraft();
}; });
$('octave-options').onclick = event => {
  const button = event.target.closest('[data-octave]');
  if (!button) return;
  const { rangeClef: clef, octave: value } = button.dataset;
  const octave = Number(value);
  draft.octaves[clef] = draft.octaves[clef].includes(octave) ? draft.octaves[clef].filter(n => n !== octave) : [...draft.octaves[clef], octave].sort((a, b) => a - b);
  renderDraft();
};
document.querySelectorAll('[data-range]').forEach(button => { button.onclick = () => {
  const ranges = { standard: { treble: [4], bass: [3] }, wider: { treble: [4, 5], bass: [2, 3] }, all: OCTAVE_OPTIONS };
  draft.octaves = structuredClone(ranges[button.dataset.range]);
  renderDraft();
}; });
$('quality-options').onclick = event => { const button = event.target.closest('[data-quality]'); if (button) { const id = button.dataset.quality; draft.qualities = draft.qualities.includes(id) ? draft.qualities.filter(q => q !== id) : [...draft.qualities, id]; renderDraft(); } };
$('customize-form').onsubmit = event => {
  event.preventDefault();
  if (!draft.noteNames.length || draft.mode !== 'notes' && !draft.qualities.length) {
    $('setup-error').textContent = !draft.noteNames.length ? 'Choose at least one note or root.' : 'Choose at least one chord type.';
    $('setup-error').hidden = false;
    return;
  }
  if ((draft.clef === 'mixed' ? ['treble', 'bass'] : [draft.clef]).some(clef => !draft.octaves[clef].length)) {
    $('setup-error').textContent = 'Choose at least one octave for each selected clef.';
    $('setup-error').hidden = false;
    return;
  }
  draft.enabled = Array.from({ length: 12 }, (_, pc) => NOTE_OPTIONS.some(note => note.pitchClass === pc && draft.noteNames.includes(note.name)));
  const oldContent = JSON.stringify([state.settings.mode, state.settings.clef, [...selectedNamesFor(state.settings)].sort(), state.settings.qualities, state.settings.length, rangeKey(state.settings)]);
  const newContent = JSON.stringify([draft.mode, draft.clef, [...draft.noteNames].sort(), draft.qualities, draft.length, rangeKey(draft)]);
  state.settings = { ...state.settings, ...draft };
  if (oldContent !== newContent) state.active = null;
  persist();
  $('customize-dialog').close();
  goHome();
};
$('theme-options').onclick = event => { const button = event.target.closest('[data-theme]'); if (button) { state.settings.theme = button.dataset.theme; theme(); for (const b of $('theme-options').children) b.setAttribute('aria-pressed', String(b === button)); persist(); } };
$('sound-setting').onchange = () => { state.settings.sound = $('sound-setting').checked; if (!state.settings.sound) suspendAudio(); persist(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(screen === 'quiz'); else if (screen === 'home') renderHome(); });
window.addEventListener('pagehide', () => pause(false));
window.addEventListener('pageshow', () => { if (midi.wanted) midi.sync(); if (screen === 'quiz' && paused) renderQuestion(); });
window.addEventListener('focus', () => { if (midi.wanted) midi.sync(); });

function network() { $('network-status').hidden = navigator.onLine; }
window.addEventListener('online', network);
window.addEventListener('offline', network);

function announceUpdate() {
  const worker = registration?.waiting;
  pendingWorker = navigator.serviceWorker.controller && worker?.state === 'installed' && worker !== navigator.serviceWorker.controller ? worker : null;
  $('update-notice').hidden = !pendingWorker;
}
async function offlineStatus() {
  if (!registration?.active) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = event => { $('offline-status').textContent = event.data.audioReady ? 'Ready for offline practice, piano included.' : 'Ready for offline practice.'; channel.port1.close(); };
  registration.active.postMessage('status', [channel.port2]);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async reg => {
    registration = reg;
    announceUpdate();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', announceUpdate));
    await navigator.serviceWorker.ready;
    void offlineStatus();
  }).catch(() => { $('offline-status').textContent = 'Offline setup unavailable. Online practice still works.'; });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); else { announceUpdate(); void offlineStatus(); } });
} else $('offline-status').textContent = 'Offline installation isn’t supported in this browser.';
$('update-button').onclick = () => { announceUpdate(); if (pendingWorker) { pause(); updating = true; pendingWorker.postMessage('activate'); } };

theme();
network();
$('storage-notice').hidden = loaded.available;
renderHome();

for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
  document.addEventListener(name, event => event.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1 || !event.target.closest?.('dialog[open]')) event.preventDefault();
}, { passive: false });
