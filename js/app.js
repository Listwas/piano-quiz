import { Studio, backupBeforeStudio } from './studio.js';
import { noteHint, recordQuizSession, recordLearningAnswer, loadStudio } from './learning.js';
import { LETTERS, makeTone } from './notes.js';
import { QUALITIES } from './chords.js';
import { poolFor, createRound, recordAnswer, retryQuestion, advance, answerName, localDay, NOTE_OPTIONS, selectedNamesFor, OCTAVE_OPTIONS, octavesFor, rangeKey } from './quiz.js';
import { loadState, saveState, completeRound, observeProgressReset, RESET_KEY } from './storage.js';
import { renderStaff } from './staff.js';
import { playItem, stopAudio, suspendAudio } from './audio.js';
import { MidiKeyboard } from './midi.js';
import { fitViewport } from './viewport.js';
import { Activities } from './activities.js';
import { loadTraining, saveTraining } from './training.js';
import { PracticeDisplay } from './display.js';

fitViewport();

const $ = id => document.getElementById(id);
backupBeforeStudio();
const loaded = loadState();
let state = loaded.state;
if (new URLSearchParams(location.search).get('theme') === 'nocturne') state.settings.theme = 'nocturne';
let screen = 'home';
let paused = true;
let clockStart = null;
let nextTimer;
let checkPress = null;
let suppressCheckClick = false;
let answer = blankAnswer();
let draft;
let sightNoteSetup = false;
let notationEditor = 'range';
let registration;
let updating = false;
let pendingWorker;
let persistTimer;
let learningDirty = false;
let midiCueTimer;
let activities;
let studio;
let questionCueTimer;
const display = new PracticeDisplay({ onChange:renderDisplay });
display.setEnabled(state.settings.keepAwake);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clefName = clef => ({ treble: 'Treble clef', bass: 'Bass clef', mixed: 'Mixed clefs' })[clef];
const modeName = mode => ({ notes: 'Note names', chords: 'Chord names', mixed: 'Notes & chords' })[mode];
function blankAnswer() { return { letter: null, alteration: 0, qualityId: null }; }
const hasAnswerSelection = () => answer.letter !== null || answer.alteration !== 0 || answer.qualityId !== null;
const quizSetupKey = settings => JSON.stringify([
  settings.mode, settings.clef, [...selectedNamesFor(settings)].sort(),
  settings.mode === 'notes' ? [] : [...settings.qualities].sort(),
  settings.length, rangeKey(settings),
]);
const matchesSavedRound = settings => state.active && quizSetupKey(state.active.settings) === quizSetupKey(settings);

const isMidiMode = () => (screen==='quiz' ? state.active?.settings.inputMode ?? state.settings.inputMode : state.settings.inputMode) === 'midi';
function renderInputMode() {
  document.querySelector('.app-shell').dataset.inputMode = state.settings.inputMode;
  document.querySelectorAll('[data-input-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inputMode === state.settings.inputMode)));
}
function setInputMode(inputMode) {
  captureTime();
  clearTimeout(nextTimer);
  state.settings.inputMode = inputMode;
  if (screen==='quiz' && state.active) state.active.settings.inputMode = inputMode;
  renderInputMode();
  if (screen === 'quiz') { renderQuestion(); startClock(); }
  else renderHome();
  persist();
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  const saved = saveState(state);
  if (learningDirty && studio) {
    learningDirty = !studio.save();
  }
  $('storage-notice').hidden = saved && !learningDirty;
}
function queuePersist() { if (!persistTimer) persistTimer = setTimeout(persist, 80); }
function theme() {
  if(studio){studio.appearance();return;}
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
  for (const id of ['today','home','progress', 'quiz', 'result', 'training']) $(`${id}-screen`).hidden = name !== id;
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
  const canResume = matchesSavedRound(settings);
  $('start-button').innerHTML = `${canResume ? 'Resume practice' : 'Start session'} <span aria-hidden="true">→</span>`;
  $('resume-note').hidden = !state.active || canResume;
  $('resume-note').textContent='Starting this exercise replaces the unfinished quiz.';
  const done = state.daily[localDay()] || 0;
  $('daily-title').textContent = done ? 'Daily practice complete' : 'Your daily practice';
  $('daily-description').textContent = done ? `${done} round${done > 1 ? 's' : ''} today. Anything extra is a bonus.` : `One short session is a good start.`;
  $('daily-check').textContent = done ? '✓' : '○';
  activities?.home();
  studio?.render();
}

function goHome() {
  activities?.stop();
  pause(false);
  showScreen(studio?.tab || 'today');
  renderHome();
}
function reviewHistory(input, settings = state.active?.settings ?? state.settings) {
  return Object.fromEntries(poolFor(settings).flatMap(({id}) => {
    const items = studio.state.items;
    const record = items[`${input}:${id}`] ?? (!items[`touch:${id}`] && !items[`midi:${id}`] ? state.history[id] : null);
    return record ? [[id, record]] : [];
  }));
}
function start({ resumeSaved = false } = {}) {
  if (activities.activity !== 'quiz') { pause(false); showScreen('training'); void activities.start(); return; }
  if (!state.active || (!resumeSaved && !matchesSavedRound(state.settings))) {
    state.active = createRound(state.settings, reviewHistory(state.settings.inputMode, state.settings));
  } else if (!resumeSaved) {
    state.active.settings.inputMode = state.settings.inputMode;
  }
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
    if (round.feedback.correct) advance(round, reviewHistory(round.settings.inputMode));
    else retryQuestion(round);
    queuePersist();
  }
  if (!round?.current) { finish(); return; }
  midi.phrase.setActive(canAcceptMidi());
  clearTimeout(midiCueTimer);
  document.querySelector('.score-card').classList.remove('midi-correct', 'midi-wrong');
  $('midi-action-hint').classList.remove('midi-mistake');
  renderInputMode();
  document.querySelector('.app-shell').dataset.inputMode = isMidiMode() ? 'midi' : 'touch';
  const feedback = round.feedback;
  const item = round.current;
  $('quiz-hint').disabled=Boolean(feedback);$('quiz-reveal').disabled=Boolean(feedback);
  $('quiz-assistance').textContent=round.assisted?'Hint used':'';
  $('answer-status').textContent = feedback && !paused ? feedback.correct ? 'Correct. Next question.' : feedback.answer ? 'Incorrect. Try the same question again.' : `The answer is ${item.label}.` : '';
  $('paused-panel').hidden = !paused;
  $('quiz-content').hidden = paused;
  $('pause-actions').hidden = !paused;
  document.querySelector('.score-card').hidden = paused;
  $('answer-controls').hidden = paused || isMidiMode();
  $('answer-controls').inert = Boolean(feedback);
  $('answer-actions').hidden = paused || isMidiMode() || Boolean(feedback);
  $('feedback-actions').hidden = paused || !feedback || isMidiMode() && !feedback.revealed;
  $('midi-actions').hidden = paused || !isMidiMode() || Boolean(feedback?.revealed);
  $('quiz-midi-panel').hidden = paused || !isMidiMode();
  $('pause-button').hidden = paused;
  $('quiz-content').dataset.kind = item.kind;
  const index = round.answers.length + (feedback || round.retrying ? 0 : 1);
  $('question-count').textContent = `Question ${Math.min(index, round.settings.length)} of ${round.settings.length}`;
  $('round-score').textContent = `${round.answers.filter(a => a.correct && !a.assisted).length} first try`;
  $('round-progress').setAttribute('aria-valuemax', round.settings.length);
  $('round-progress').setAttribute('aria-valuenow', round.answers.length);
  $('round-progress').firstElementChild.style.width = `${round.answers.length / round.settings.length * 100}%`;
  $('prompt-title').textContent = isMidiMode() ? item.kind === 'note' ? 'Play this note' : 'Play this chord' : item.kind === 'note' ? 'Name this note' : 'Name this chord';
  $('prompt-eyebrow').textContent = 'ONE NOTE AT A TIME';
  $('clef-label').textContent = clefName(item.clef);
  $('quiz-staff').innerHTML = renderStaff(item, item.clef, Boolean(feedback), feedback?.answer ? feedback.correct ? 'correct' : 'wrong' : '');
  delete $('staff-caption').dataset.outcome;
  $('staff-caption').textContent = isMidiMode() ? item.kind === 'note' ? 'Play the key. You can retry straight away.' : 'Hold the chord together, then release to check.' : item.kind === 'chord' ? 'Find the root, then the chord type.' : 'Read the staff. Choose the written name.';
  if (feedback) {
    const given = answerName(feedback.answer, item.kind);
    const revealedName = item.kind === 'note' ? `${item.tones[0].name}${item.tones[0].octave}` : `${item.label} · root ${item.tones[0].name}${item.tones[0].octave}`;
    $('staff-caption').textContent = feedback.correct ? `${item.label} · Correct` : feedback.answer ? `${given} · Try again` : `Skipped · Answer: ${revealedName}`;
    if (feedback.revealed) $('staff-caption').textContent = `Answer: ${revealedName}`;
    $('next-button').innerHTML = `${feedback.correct || feedback.revealed ? 'Next question' : 'Skip question'} <span aria-hidden="true">→</span>`;
    if (!paused) nextTimer = setTimeout(() => {
      if (feedback.correct || !feedback.answer) next();
      else if (retryQuestion(round)) { persist(); renderQuestion(); startClock(); }
    }, feedback.correct ? 900 : 2000);
    if(feedback.revealed)clearTimeout(nextTimer);
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
  $('unknown-button').textContent = hasAnswerSelection() ? 'Clear answer' : 'I don’t know yet';
}


function submit(value, revealed = false) {
  if (paused || screen !== 'quiz' || state.active?.feedback) return;
  captureTime();
  const roundWasRetrying=state.active.retrying;
  const feedback = recordAnswer(state.active, state.history, value, state.active.elapsed);
  if (!feedback) return;
  if (revealed) feedback.revealed = true;
  if (!roundWasRetrying) {
    recordLearningAnswer(studio.state, feedback, state.active.settings.inputMode);
    learningDirty = true;
  }
  if(feedback.answer&&!feedback.correct){
    retryQuestion(state.active);persist();renderQuestion();startClock();
    $('staff-caption').textContent=`You chose ${answerName(feedback.answer,feedback.item.kind)} · Try again`;
    const wrong=$('letters').querySelector(`[data-letter="${feedback.answer.letter}"]`);wrong?.classList.add('answer-wrong');
    clearTimeout(questionCueTimer);questionCueTimer=setTimeout(()=>wrong?.classList.remove('answer-wrong'),2000);
  }else{persist();renderQuestion();}
  if (state.settings.sound) void playItem(feedback.item).catch(() => {});
}

function submitMidi(notes) {
  if (!canAcceptMidi()) return;
  captureTime();
  const round = state.active;
  const roundWasRetrying=round.retrying;
  const feedback = recordAnswer(round, state.history, { source: 'midi', notes }, round.elapsed);
  if (feedback && !roundWasRetrying) {
    recordLearningAnswer(studio.state, feedback, 'midi');
    learningDirty = true;
  }
  if (!feedback) return;
  if (feedback.correct) advance(round, reviewHistory(round.settings.inputMode));
  else retryQuestion(round);
  renderQuestion();
  startClock();
  queuePersist();
  if (screen !== 'quiz') return;
  const card = document.querySelector('.score-card');
  card.classList.add(feedback.correct ? 'midi-correct' : 'midi-wrong');
  const message = feedback.correct ? 'Correct ✓' : `Played ${answerName(feedback.answer, feedback.item.kind)} · Try again`;
  $('staff-caption').textContent = feedback.correct ? `Last answer: ${feedback.item.label} ✓` : message;
  $('staff-caption').dataset.outcome = feedback.correct ? 'correct' : 'wrong';
  $('answer-status').textContent = message;
  midiCueTimer = setTimeout(() => { card.classList.remove('midi-correct', 'midi-wrong'); $('midi-action-hint').classList.remove('midi-mistake'); renderMidiQuiz(); }, feedback.correct ? 120 : 180);
  if (state.settings.sound) setTimeout(() => { void playItem(feedback.item).catch(() => {}); }, 0);
}

function next() {
  clearTimeout(nextTimer);
  stopAudio();
  if (paused || !state.active?.feedback) return;
  if (!advance(state.active, reviewHistory(state.active.settings.inputMode))) { finish(); return; }
  persist();
  renderQuestion();
  startClock();
}

function finish() {
  midi.phrase.setActive(false);
  captureTime();
  clearTimeout(nextTimer);
  suspendAudio();
  const completedRound=state.active;
  const result = completeRound(state) || state.lastResult;
  if(completedRound&&result){recordQuizSession(studio.state,completedRound,result);studio.save();}
  persist();
  if (!result) { goHome(); return; }
  showScreen('result');
  $('result-title').textContent = 'Session complete';
  $('result-message').textContent = `${result.correct} of ${result.total} correct on the first try. ${result.improvement > 0 ? `Up ${result.improvement} percentage points from your last round with these notes.` : result.accuracy === 100 ? 'Let those connections settle. Come back tomorrow.' : 'The tricky ones are another chance to learn.'}`;
  $('result-metrics').innerHTML = `<div><strong>${result.accuracy}%</strong><span>independent first tries</span></div><div><strong>${result.meanMs === null ? '—' : (result.meanMs / 1000).toFixed(1) + 's'}</strong><span>average correct answer</span></div>`;
  $('difficult-section').hidden = !result.difficult.length;
  $('difficult-items').innerHTML = result.difficult.slice(0, 3).map(item => `<span>${escape(item.label)}<small>${escape(clefName(item.clef))}</small></span>`).join('') + (result.difficult.length > 3 ? `<span class="more-reviews">+${result.difficult.length - 3} more to review</span>` : '');
  $('result-title').focus({ preventScroll: true });
}

function openDialog(id) {
  if (screen === 'quiz' && !paused) pause();
  if (screen === 'training') pause(false);
  $(id).showModal();
}
function openCustomize(forSight = activities?.activity === 'sight', editor = 'range') {
  sightNoteSetup = forSight;
  notationEditor = editor;
  const qualitiesOnly = editor === 'qualities';
  $('customize-title').textContent = qualitiesOnly ? 'Chord types' : 'Notes & octaves';
  for (const field of document.querySelectorAll('[data-notation-quick]')) {
    field.hidden = editor !== 'full' || forSight && field !== $('clef-options').closest('fieldset');
  }
  $('range-preview').hidden = qualitiesOnly;
  $('range-settings').hidden = qualitiesOnly;
  document.querySelector('[data-pitch-editor]').hidden = qualitiesOnly;
  draft = structuredClone(state.settings);
  draft.noteNames = [...selectedNamesFor(draft)];
  draft.octaves = Object.fromEntries(['treble', 'bass'].map(clef => [clef, [...octavesFor(draft, clef)]]));
  $('setup-round-note').hidden = !state.active || forSight;
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
  $('chord-settings').hidden = sightNoteSetup || draft.mode === 'notes' || notationEditor === 'range';
  $('pitch-legend').textContent = sightNoteSetup ? 'Notes to practise' : draft.mode === 'chords' ? 'Chord roots to practise' : draft.mode === 'mixed' ? 'Notes & chord roots to practise' : 'Notes to practise';
  $('selection-summary').textContent = `${draft.noteNames.length} selected. Only these written spellings will appear.`;
  $('setup-error').hidden = true;
  const previewPool=poolFor({...draft,noteNames:draft.noteNames.length?draft.noteNames:['C']});
  const clefs=draft.clef==='mixed'?['treble','bass']:[draft.clef];
  $('range-preview').innerHTML=clefs.map(clef=>{const items=previewPool.filter(i=>i.clef===clef);return items.length?renderStaff({tones:[items[0].tones[0],items.at(-1).tones[0]]},clef):'';}).join('')+`<small>${draft.noteNames.length} written names · ${draft.clef} clef<br>Only your selection will appear.</small>`;
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
  if (studio && ['home','today','progress'].includes(screen)) studio.render();
}
const midi = new MidiKeyboard({ onStatus: renderMidi, onPhrase: notes => { if (canAcceptMidi() && state.active.current.kind === 'chord') submitMidi(notes); }, onNote: event => { if (activities?.calibration.receive(event)) return; if (screen === 'training') { activities?.receive(event); return; } if (event.type === 'on' && canAcceptMidi() && state.active.current.kind === 'note') submitMidi([event.note]); } });
activities = new Activities({ goHome, showTraining:() => showScreen('training'), openDialog, openNotes: () => openCustomize(true, screen === 'training' ? 'full' : 'range'), renderHome, getQuizSettings: () => state.settings, midi });
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


$('letters').onclick = event => { const button = event.target.closest('[data-letter]'); if (button) { answer.letter = Number(button.dataset.letter); renderAnswer(); } };
$('accidentals').onclick = event => { const button = event.target.closest('[data-alteration]'); if (button) { answer.alteration = Number(button.dataset.alteration); renderAnswer(); } };
$('answer-qualities').onclick = event => { const button = event.target.closest('[data-quality]'); if (button) { answer.qualityId = button.dataset.quality; renderAnswer(); } };
$('answer-quality-picker').onchange = () => { answer.qualityId = $('answer-quality-picker').value || null; renderAnswer(); };
$('check-button').onclick = event => { if (event.detail === 0) submit(answer); };
$('check-button').onpointerdown = event => {
  if (event.button !== 0 || event.currentTarget.disabled || checkPress) return;
  checkPress = {pointer:event.pointerId,x:event.clientX,y:event.clientY,item:state.active?.current?.id,answer:structuredClone(answer)};
  event.currentTarget.setPointerCapture(event.pointerId);
};
$('check-button').onpointerup = event => {
  if (checkPress?.pointer !== event.pointerId) return;
  const press = checkPress; checkPress = null;
  suppressCheckClick = true;
  const box = event.currentTarget.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  if (press.item === state.active?.current?.id && (inside || Math.hypot(event.clientX-press.x,event.clientY-press.y)<=12)) submit(press.answer);
};
$('check-button').onpointercancel = $('check-button').onlostpointercapture = () => { checkPress = null; };
document.addEventListener('pointerdown', () => { suppressCheckClick = false; }, true);
document.addEventListener('click', event => {
  if (!suppressCheckClick || event.detail === 0) return;
  suppressCheckClick = false;
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
$('unknown-button').onclick = () => {
  if (hasAnswerSelection()) { answer = blankAnswer(); renderAnswer(); }
  else submit(null);
};
$('next-button').onclick = next;
$('hear-button').onclick = () => { void playItem(state.active.current).then(ok => { if (!ok) $('hear-button').textContent = 'Audio unavailable'; }); };
$('start-button').onclick = start;
$('pause-button').onclick = () => pause();
$('resume-button').onclick = resume;
for (const id of ['home-button', 'pause-home-button', 'result-home-button']) $(id).onclick = goHome;
$('again-button').onclick = start;
$('customize-button').onclick = () => activities.activity === 'quiz' ? openCustomize() : activities.configure({ quickOnPractice: true });
$('setup-chord-types').onclick = () => openCustomize(false, 'qualities');
for (const [id, key] of [['setup-clef', 'clef'], ['setup-questions', 'length'], ['setup-content', 'mode']]) {
  $(id).onchange = event => {
    state.settings[key] = key === 'length' ? Number(event.target.value) : event.target.value;
    persist();
    renderHome();
  };
}
$('practice-settings-button').onclick = () => { $('settings-dialog').close(); openCustomize(false, 'full'); };
$('about-button').onclick = () => { $('settings-dialog').close(); openDialog('about-dialog'); };
$('settings-button').onclick = () => {
  activities.calibration.sync();
  studio.appearance();
  studio.syncDataActions();
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
  if (oldContent !== newContent && !sightNoteSetup) state.active = null;
  persist();
  $('customize-dialog').close();
  goHome();
};

$('sound-setting').onchange = () => { state.settings.sound = $('sound-setting').checked; if (!state.settings.sound) suspendAudio(); persist(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(screen === 'quiz'); else if (['home','today','progress'].includes(screen)) renderHome(); });
window.addEventListener('pagehide', () => pause(false));
window.addEventListener('pageshow', () => {
  if (observeProgressReset()) reloadProgress(true);
  if (midi.wanted) midi.sync();
  if (screen === 'quiz' && paused) renderQuestion();
});
window.addEventListener('storage', event => {
  if (event.key === RESET_KEY && observeProgressReset()) reloadProgress(true);
});
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

function reloadProgress(deleted = false) {
  for (const timer of [nextTimer, persistTimer, midiCueTimer, questionCueTimer]) clearTimeout(timer);
  persistTimer = null;
  learningDirty = false;
  clockStart = null;
  paused = true;
  answer = blankAnswer();
  checkPress = null;
  draft = null;
  suspendAudio();
  activities.stop();
  if (deleted) {
    activities.calibration.parent = null;
    activities.calibration.stop();
    activities.calibration.suggestion = null;
    activities.phraseHistory.clear();
    activities.reportResult = null;
    activities.historyGroups = [];
    midi.disconnect();
  }
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  state = loadState().state;
  activities.state = loadTraining();
  studio.state = loadStudio(localStorage, state.settings.theme);
  display.setEnabled(state.settings.keepAwake);
  studio.syncDataActions();
  $('data-status').textContent = '';
  studio.open('today');
  if (deleted) {
    const status = $('data-deleted-status');
    status.textContent = 'Your saved data was deleted.';
    status.hidden = false;
    status.focus({ preventScroll: true });
  }
}

studio = new Studio({
  getState: () => state,
  getActivities: () => activities,
  navigate: tab => {
    $('data-deleted-status').hidden = true;
    activities.stop();
    pause(false);
    showScreen(tab);
    renderHome();
  },
  start,
  renderHome,
  onImport: () => reloadProgress(),
  onDelete: () => {
    observeProgressReset();
    reloadProgress(true);
  },
});
$('quiz-hint').onclick=()=>{const round=state.active;if(!round?.current||round.feedback)return;round.assisted=true;$('staff-caption').textContent=noteHint(round.current);$('quiz-assistance').textContent='Hint used · practice answer';persist();};
$('quiz-reveal').onclick=()=>submit(null,true);
if(new URLSearchParams(location.search).get('theme')==='nocturne'){studio.state.appearance='dark';studio.state.accent='brass';}
showScreen('today');

theme();
network();
$('storage-notice').hidden = loaded.available;
renderHome();

for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
  document.addEventListener(name, event => event.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1 || !event.target.closest?.('dialog[open], .scroll-region')) event.preventDefault();
}, { passive: false });
