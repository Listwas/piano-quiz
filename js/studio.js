import {
  loadStudio,
  recommend,
  LESSONS,
  STUDIO_KEY as KEY,
  BACKUP_KEY as BACKUP,
} from './learning.js';
import { renderStaff } from './staff.js';
import { makeTone } from './notes.js';
import { poolFor } from './quiz.js';
import { saveTraining, slowerReplayTempo } from './training.js';
import { restoreState } from './storage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const DATA_KEYS = ['pianoQuiz.state.v1', 'pianoQuiz.training.v1', KEY];
function replaceProgress(storage, data) {
  const previous = DATA_KEYS.map((key) => [key, storage.getItem(key)]);
  const write = (key, value) =>
    value == null ? storage.removeItem(key) : storage.setItem(key, value);
  try {
    for (const key of DATA_KEYS) write(key, data[key]);
  } catch (error) {
    for (const [key, value] of previous) write(key, value);
    throw error;
  }
}

export function backupBeforeStudio(storage = localStorage) {
  try {
    if (!storage.getItem(BACKUP)) {
      const data = {};
      for (const key of ['pianoQuiz.state.v1', 'pianoQuiz.training.v1']) {
        const value = storage.getItem(key);
        if (value !== null) data[key] = value;
      }
      storage.setItem(
        BACKUP,
        JSON.stringify({ version: 1, at: Date.now(), data }),
      );
    }
    return true;
  } catch {
    return false;
  }
}
export class Studio {
  constructor({
    getState,
    getActivities,
    navigate,
    start,
    renderHome,
    onImport,
  }) {
    Object.assign(this, {
      getState,
      getActivities,
      navigate,
      start,
      renderHome,
      onImport,
    });
    this.tab = 'today';
    this.backedUp = backupBeforeStudio();
    this.state = loadStudio(localStorage, getState().settings.theme);
    this.install();
    this.appearance();
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
      return true;
    } catch {
      $('storage-notice').hidden = false;
      return false;
    }
  }
  appearance() {
    const dark =
      this.state.appearance === 'dark' ||
      (this.state.appearance === 'system' &&
        matchMedia('(prefers-color-scheme:dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = this.state.accent;
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--bg')
        .trim();
    document
      .querySelectorAll('[data-appearance]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.appearance === this.state.appearance),
        ),
      );
    document
      .querySelectorAll('button[data-accent]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.accent === this.state.accent),
        ),
      );
  }
  install() {
    // Legacy palette becomes a studio surface and an accent; older note data stays untouched.
    $('theme-options').innerHTML = [
      ['system', 'Device', '#89929d'],
      ['light', 'Light', '#f5f3ef'],
      ['dark', 'Dark', '#131b26'],
    ]
      .map(
        ([id, label, bg]) =>
          `<button data-appearance="${id}"><span class="theme-swatch" style="background:${bg}"></span>${label}</button>`,
      )
      .join('');
    $('accent-options').innerHTML = [
      ['brass', 'Brass', '#b18a4e'],
      ['blue', 'Blue', '#548cce'],
      ['violet', 'Violet', '#9066c3'],
      ['coral', 'Coral', '#c76b57'],
    ]
      .map(
        ([id, label, color]) =>
          `<button data-accent="${id}"><i style="background:${color}" aria-hidden="true"></i>${label}</button>`,
      )
      .join('');
    $('theme-options').onclick = (e) => {
      const b = e.target.closest('[data-appearance]');
      if (b) {
        this.state.appearance = b.dataset.appearance;
        this.save();
        this.appearance();
      }
    };
    $('accent-options').onclick = (e) => {
      const b = e.target.closest('[data-accent]');
      if (b) {
        this.state.accent = b.dataset.accent;
        this.save();
        this.appearance();
      }
    };
    matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () =>
      this.appearance(),
    );
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) => (b.onclick = () => this.open(b.dataset.tab)));
    $('recommendation-edit').onclick = () => this.open('home');
    $('recommendation-start').onclick = () => this.startRecommendation();
    $('setup-bpm').onchange = () => {
      const a = this.getActivities();
      a.state.settings.bpm = Math.max(
        40,
        Math.min(200, Number($('setup-bpm').value) || 60),
      );
      saveTraining(a.state);
      this.renderHome();
    };
    $('setup-behavior').onchange = () => {
      const a = this.getActivities();
      a.state.settings.behavior = $('setup-behavior').value;
      saveTraining(a.state);
      this.renderHome();
    };
    $('lesson-button').onclick = () => this.lesson();
    $('lesson-practise').onclick = () => {
      $('lesson-dialog').close();
      this.start();
    };
    $('data-export').onclick = () => this.exportData();
    $('data-import').onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 8e6)
          throw Error('Choose a progress export smaller than 8 MB.');
        const raw = JSON.parse(await file.text());
        if (
          raw?.version !== 1 ||
          !raw.data ||
          typeof raw.data['pianoQuiz.state.v1'] !== 'string'
        )
          throw Error('This is not a Piano Quiz progress export.');
        const quiz = JSON.parse(raw.data['pianoQuiz.state.v1']);
        if (quiz?.version !== 1) throw Error('Unsupported progress version.');
        restoreState(quiz);
        for (const k of ['pianoQuiz.training.v1', KEY])
          if (raw.data[k]) JSON.parse(raw.data[k]);
        this.exportData();
        replaceProgress(localStorage, raw.data);
        this.onImport();
      } catch (error) {
        $('data-status').textContent = error.message;
      } finally {
        e.target.value = '';
      }
    };
    $('data-restore-backup').onclick = () => {
      try {
        const backup = JSON.parse(localStorage.getItem(BACKUP));
        if (!backup?.data) throw Error('No saved copy is available.');
        this.exportData();
        replaceProgress(localStorage, backup.data);
        this.onImport();
      } catch (error) {
        $('data-status').textContent = error.message;
      }
    };
    let hasBackup = false;
    try {
      hasBackup = Boolean(JSON.parse(localStorage.getItem(BACKUP))?.data);
    } catch {}
    $('data-restore-backup').disabled = !this.backedUp || !hasBackup;
  }
  open(tab) {
    this.tab = tab;
    this.navigate(tab);
  }
  select(activity, mode) {
    const a = this.getActivities();
    a.stop();
    a.state.activity = activity;
    saveTraining(a.state);
    if (activity === 'quiz') this.getState().settings.mode = mode;
    this.renderHome();
  }
  render() {
    const state = this.getState(),
      a = this.getActivities();
    if (!a) return;
    const mode = state.settings.mode;
    const cards = [
      ['quiz', 'notes', '♩', 'Notes', 'Read and name each note'],
      ['quiz', 'chords', '♬', 'Chords', 'Recognise roots and shapes'],
      ['rhythm', '', '◷', 'Rhythm', 'Press, hold and release'],
      ['sight', '', '♫', 'Sight-reading', 'Bring pitch and pulse together'],
      ['metronome', '', '◴', 'Metronome', 'Find a steady pulse'],
    ];
    $('activity-cards').innerHTML = cards
      .map(
        ([id, m, icon, title, detail]) =>
          `<button class="activity-card" data-activity="${id}" data-quiz-mode="${m}" aria-pressed="${a.activity === id && (id !== 'quiz' || (m === 'notes' ? mode !== 'chords' : mode === 'chords'))}"><span class="activity-symbol" aria-hidden="true">${icon}</span><strong>${title}</strong><small>${detail}</small></button>`,
      )
      .join('');
    $('activity-cards').onclick = (e) => {
      const b = e.target.closest('[data-activity]');
      if (b) this.select(b.dataset.activity, b.dataset.quizMode);
    };
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) =>
        b.setAttribute(
          'aria-current',
          b.dataset.tab === this.tab ? 'page' : 'false',
        ),
      );
    const recommendation = recommend(state, a.state, Date.now(), this.state);
    this.recommendation = recommendation;
    $('recommendation-title').textContent = recommendation.title;
    $('recommendation-reason').textContent = recommendation.reason;
    $('recommendation-detail').textContent = recommendation.detail;
    $('recommendation-start').textContent = recommendation.action + ' →';
    $('recommendation-start').disabled =
      (recommendation.kind === 'practice' && !a.supported) ||
      (recommendation.result?.activity === 'sight' &&
        a.midi.status.state === 'unsupported');
    $('recommendation-tag').textContent =
      recommendation.kind === 'resume'
        ? 'Ready to resume'
        : recommendation.kind === 'review'
          ? 'Spaced review'
          : recommendation.kind === 'bar'
            ? 'Focus on one bar'
            : 'At your pace';
    const pool = poolFor(state.settings),
      item = pool[0] ?? { tones: [makeTone(2, 0, 4)], clef: 'treble' };
    const todayItem = state.active?.current ?? item;
    $('today-staff').innerHTML = renderStaff(todayItem, todayItem.clef);
    $('home-staff').innerHTML = renderStaff(item, item.clef);
    const recent = this.state.sessions.find(session => session.input === state.settings.inputMode);
    const facts = recent ? [[`${recent.correct}/${recent.total}`, 'First tries in your last quiz']] : [];
    if (a.state.history.length) facts.push([a.state.history.length, 'Timed sessions saved']);
    $('today-stats').hidden = facts.length === 0;
    $('today-stats').innerHTML = facts.map(([value,label]) => `<div class="mini-stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
    const training = a.activity !== 'quiz';
    $('setup-quick-controls').hidden = !training;
    $('setup-behavior-label').hidden = a.activity !== 'sight';
    $('setup-bpm').value = a.settings.bpm;
    $('setup-behavior').value = a.settings.behavior;
    const wantsMidi =
      a.activity === 'sight' ||
      (a.activity === 'rhythm' && a.settings.input === 'midi') ||
      (a.activity === 'quiz' && state.settings.inputMode === 'midi');
    $('home-staff').hidden = training && a.activity !== 'sight';
    $('setup-input-status').textContent = wantsMidi
      ? a.midi.status.connected
        ? `MIDI connected · ${a.midi.status.selectedName}`
        : a.midi.status.state === 'unsupported'
          ? 'MIDI unavailable · use a supported browser'
          : 'MIDI selected · connect your keyboard to start'
      : a.activity === 'metronome'
        ? 'Listen and follow the beat'
        : a.activity === 'rhythm'
          ? 'Touch pad · any MIDI key works when MIDI is selected'
          : 'Tap names · choose the written spelling, without octave numbers';
    this.progress();
    this.appearance();
  }
  startRecommendation() {
    const a = this.getActivities(),
      r = this.recommendation;
    if (r.kind === 'resume' || r.kind === 'review') {
      a.state.activity = 'quiz';
      if (r.kind === 'resume')
        this.getState().settings.mode = this.getState().active.settings.mode;
      saveTraining(a.state);
      this.start();
    } else if (r.kind === 'bar') {
      a.state.activity = r.result.activity;
      saveTraining(a.state);
      a.showReport(r.bar, r.result);
      a.startDrill(r.bar, slowerReplayTempo(r.result.replay.bpm));
    } else this.start();
  }
  lesson() {
    const a = this.getActivities();
    const lesson =
      LESSONS[
        a.activity === 'quiz'
          ? this.getState().settings.mode === 'chords'
            ? 'chords'
            : 'notes'
          : a.activity
      ];
    $('lesson-practise').textContent = 'Try it now →';
    $('lesson-title').textContent = lesson.title;
    $('lesson-text').textContent = lesson.text;
    $('lesson-example').textContent = lesson.example;
    $('lesson-staff').innerHTML = $('home-staff').innerHTML;
    $('lesson-dialog').showModal();
  }
  progress() {
    const state = this.getState(),
      a = this.getActivities(),
      sessions = this.state.sessions,
      training = a.state.history;
    const input = state.settings.inputMode;
    const filtered = sessions.filter((s) => s.input === input);
    const attempts = filtered.reduce((n, s) => n + s.total, 0),
      correct = filtered.reduce((n, s) => n + s.correct, 0);
    const due = poolFor(state.settings).filter(
      (i) => this.state.items[`${input}:${i.id}`]?.due <= Date.now(),
    ).length;
    const weak = Object.entries(this.state.items)
      .filter(([, v]) => v.attempts > 0 && v.correct < v.attempts)
      .sort(([, x], [, y]) => y.attempts - y.correct - (x.attempts - x.correct))
      .slice(0, 8);
    const date = (at) =>
      new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
        Math.min(8.64e15, at),
      );
    let html = `<div class="progress-summary"><div><strong>${sessions.length + training.length}</strong><span>Recorded sessions</span></div><div><strong>${attempts ? Math.round((100 * correct) / attempts) + '%' : '—'}</strong><span>First tries · ${input === 'midi' ? 'MIDI' : 'Touch'} · ${attempts} answers</span></div><div><strong>${due}</strong><span>Names ready for review · ${input === 'midi' ? 'MIDI' : 'Touch'}</span></div></div>`;
    if (!sessions.length && !training.length)
      html +=
        '<div class="empty-state"><h2>Your practice has a place here.</h2><p>Finish a session to see what is getting easier and what deserves another try. Your earlier note-learning schedule stays saved.</p></div>';
    if (weak.length)
      html += `<section class="progress-section"><h2>Names to revisit</h2><div class="skill-list">${weak.map(([id, v]) => `<span class="skill-chip">${esc(v.label)} · ${esc(v.clef)}<small> · ${id.startsWith('midi:') ? 'MIDI' : 'Touch'} · ${v.correct}/${v.attempts}</small></span>`).join('')}</div></section>`;
    if (sessions.length) {
      const last = sessions[0],
        matching = sessions
          .filter((s) => s.setup === last.setup && s.input === last.input)
          .slice(0, 5)
          .reverse();
      html += `<section class="progress-section"><h2>Note recall · ${last.input === 'midi' ? 'MIDI' : 'Touch'}</h2><p class="small muted">Same setup · ${matching.length} sessions · oldest first</p><div class="recall-trend">${matching.map((s) => `<div><span style="--score:${Math.round((s.correct / s.total) * 100)}%"></span><strong>${Math.round((s.correct / s.total) * 100)}%</strong><small>${date(s.at)}</small></div>`).join('')}</div></section>`;
      html += `<section class="progress-section"><h2>Notes & chords</h2><div class="session-list">${sessions
        .slice(0, 15)
        .map(
          (s, i) =>
            `<button class="session-row" data-quiz-report="${i}"><span><strong>${s.input === 'midi' ? 'MIDI keyboard' : s.input === 'mixed' ? 'Touch + MIDI' : 'Tap names'}</strong><small>${date(s.at)} · ${s.total} questions · ${s.meanMs === null ? '—' : (s.meanMs / 1000).toFixed(1) + 's'} per correct answer</small></span><span class="session-result">${s.correct}/${s.total}</span></button>`,
        )
        .join('')}</div></section>`;
    }
    html += `<section class="progress-section"><h2>Rhythm & sight-reading</h2><div class="session-list">${
      training
        .slice(0, 15)
        .map(
          (r, i) =>
            `<button class="session-row" data-training-report="${i}"><span><strong>${r.activity === 'sight' ? `Sight-reading · ${r.comparison?.behavior === 'continue' ? 'Flow' : 'Practice'}` : 'Rhythm'}</strong><small>${date(r.at)} · ${r.replay.bpm} BPM · ${r.replay.bars.length} bars</small></span><span class="session-result">${r.activity === 'sight' && r.comparison?.behavior !== 'continue' ? r.report.bars.filter((b) => !b.retries).length + '/' + r.report.bars.length : r.activity === 'sight' ? r.pitch + '%' : r.onset + '%'}</span></button>`,
        )
        .join('') ||
      '<p class="small muted">Complete a rhythm or sight-reading session to see it here.</p>'
    }</div><button class="text-button" id="progress-full-history">Compare training sessions ↗</button></section>`;
    $('progress-content').innerHTML = html;
    $('progress-content').onclick = (e) => {
      const t = e.target.closest('[data-training-report]');
      if (t) {
        const r = training[Number(t.dataset.trainingReport)];
        a.showReport(-1, r);
        return;
      }
      if (e.target.closest('#progress-full-history')) {
        a.showHistory(
          false,
          a.exercise ? a.activity : (training[0]?.activity ?? 'sight'),
        );
        return;
      }
      const q = e.target.closest('[data-quiz-report]');
      if (q) {
        const s = sessions[Number(q.dataset.quizReport)];
        $('lesson-title').textContent =
          `${s.correct}/${s.total} independent first tries`;
        $('lesson-staff').innerHTML = $('home-staff').innerHTML;
        $('lesson-text').textContent =
          `${date(s.at)} · ${s.input === 'midi' ? 'MIDI keyboard' : s.input === 'mixed' ? 'Touch + MIDI' : 'Tap names'}. Hints and revealed answers do not count as independent recall.`;
        $('lesson-example').textContent =
          s.items
            .filter((i) => !i.correct || i.assisted)
            .map(
              (i) => `${i.label} · ${i.clef}${i.assisted ? ' · assisted' : ''}`,
            )
            .join(' / ') || 'Every note answered correctly on the first try.';
        $('lesson-practise').textContent = 'Practise again →';
        $('lesson-dialog').showModal();
      }
    };
  }
  exportData() {
    const data = {};
    for (const k of ['pianoQuiz.state.v1', 'pianoQuiz.training.v1', KEY]) {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    }
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ version: 1, at: Date.now(), data }, null, 2)],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `piano-quiz-progress-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('data-status').textContent =
      'Progress export created. Keep it somewhere safe.';
  }
}
