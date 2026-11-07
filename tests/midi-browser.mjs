import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.BROWSER || 'chromium';
const base = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const key = 'pianoQuiz.state.v1';
const report = { engine, origin: base, build: JSON.parse(await readFile('dist/version.json', 'utf8')).version, testedAt: new Date().toISOString(), checks: [], errors: [], limits: ['Six device/message scenarios use a simulated Web MIDI API. Chromium also checks native MIDI with a virtual loopback when available. No physical MIDI keyboard is attached.'] };
const browser = await { chromium, firefox, webkit }[engine].launch({ headless: true, ...(engine === 'chromium' ? { executablePath: '/usr/bin/chromium', args: ['--mute-audio'] } : {}) });
const contexts = [];
async function setup(mode = 'ready') {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: 'reduce' });
  contexts.push(context);
  await context.addInitScript(mode => {
    let access = { inputs: new Map(), onstatechange: null };
    const test = window.midiTest = {
      calls: [],
      fresh() { access = { inputs: new Map(), onstatechange: null }; },
      add(id, name = `Test keyboard ${id}`) {
        const owner = access;
        const port = { id, name, state: 'connected', connection: 'closed', type: 'input', onmidimessage: null, async open() { this.connection = 'open'; owner.onstatechange?.({ port: this }); }, async close() { await new Promise(resolve => setTimeout(resolve, 60)); this.connection = 'closed'; owner.onstatechange?.({ port: this }); } };
        access.inputs.set(id, port);
        access.onstatechange?.({ port });
      },
      remove(id) { const port = access.inputs.get(id); port.state = 'disconnected'; access.onstatechange?.({ port }); },
      send(id, data) { access.inputs.get(id).onmidimessage?.({ data: new Uint8Array(data) }); },
      attached(id) { return Boolean(access.inputs.get(id).onmidimessage); },
    };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: mode === 'unsupported' ? undefined : async options => {
      test.calls.push(options);
      if (mode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
      return access;
    } });
    if (mode === 'ready') test.add('a');
  }, mode);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base);
  return page;
}
const state = async page => { await page.waitForTimeout(100); return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); };
const send = (page, data, id = 'a') => page.evaluate(({ id, data }) => window.midiTest.send(id, data), { id, data });
async function play(page, notes, id = 'a') {
  for (const note of notes) await send(page, [0x90, note, 100], id);
  for (const note of notes) await send(page, [0x80, note, 0], id);
}
async function connect(page) {
  await page.locator('#settings-button').click();
  assert.equal(await page.evaluate(() => window.midiTest.calls.length), 0);
  await page.locator('#midi-connect').click();
  await page.waitForFunction(() => document.getElementById('midi-status').textContent.startsWith('Connected'));
  assert.deepEqual(await page.evaluate(() => window.midiTest.calls), [{ sysex: false }]);
  await page.locator('[data-close="settings-dialog"]').click();
}
async function check(label, run) { await run(); report.checks.push(label); console.log(`PASS ${label}`); }

const ready = page => page.waitForFunction(() => document.getElementById('midi-status').textContent.startsWith('Connected'));
const settled = page => page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).active?.feedback === null, key);
try {
  await mkdir('docs/images', { recursive: true });
  await check('unsupported or denied MIDI can switch to saved tap mode without blocking practice', async () => {
    const absent = await setup('unsupported');
    await absent.locator('#settings-button').click();
    assert.equal(await absent.locator('#midi-connect').isDisabled(), true);
    assert.match(await absent.locator('#midi-status').innerText(), /unavailable/);
    const denied = await setup('denied');
    await denied.locator('#settings-button').click();
    await denied.locator('#midi-connect').click();
    await denied.waitForFunction(() => document.getElementById('midi-status').textContent.includes('denied'));
    await denied.locator('[data-close="settings-dialog"]').click();
    await denied.locator('.practice-card [data-input-mode="touch"]').click();
    await denied.locator('#start-button').click();
    await denied.locator('#unknown-button').click();
    assert.equal((await state(denied)).active.answers.length, 1);
  });
  await check('MIDI mode hides tap controls, and hotplug, device selection and disconnect work', async () => {
    const page = await setup('empty');
    await page.locator('#settings-button').click();
    await page.locator('#midi-connect').click();
    await page.waitForFunction(() => document.getElementById('midi-status').textContent.includes('No MIDI inputs'));
    await page.evaluate(() => window.midiTest.add('a'));
    await ready(page);
    await page.locator('#midi-status').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/images/midi-settings.png' });
    await page.evaluate(() => window.midiTest.add('b'));
    assert.equal(await page.locator('#midi-input option').count(), 2);
    await page.locator('#midi-input').selectOption('b');
    await ready(page);
    assert.equal(await page.evaluate(() => window.midiTest.attached('a')), false);
    await page.evaluate(() => window.midiTest.remove('b'));
    assert.match(await page.locator('#midi-status').innerText(), /disconnected/);
    await page.locator('#midi-input').selectOption('a');
    await ready(page);
    await page.locator('#midi-disconnect').click();
    assert.equal(await page.evaluate(() => window.midiTest.attached('a')), false);
    await page.locator('[data-close="settings-dialog"]').click();
    assert.equal((await state(page)).settings.inputMode, 'midi');
    await page.locator('#start-button').click();
    await ready(page);
    assert.equal(await page.locator('#letters').isVisible(), false);
    assert.equal(await page.locator('#check-button').isVisible(), false);
    assert.match(await page.locator('#prompt-title').innerText(), /Play this/);
    assert.equal(await page.locator('#feedback').count(), 0);
    await page.screenshot({ path: 'docs/images/midi-mode.png' });
  });
  await check('recheck restores input after same-device reopen, changed id, and a stale device list', async () => {
    const page = await setup();
    await connect(page);
    await page.locator('#customize-button').click();
    await page.locator('[data-preset="none"]').click();
    await page.locator('[data-note="C"]').click();
    await page.locator('#apply-button').click();
    await page.locator('#start-button').click();
    await play(page, [60]);
    assert.equal((await state(page)).active.answers.at(-1).correct, true);
    await settled(page);
    await page.locator('#midi-recheck-quiz').click();
    await ready(page);
    await play(page, [60]);
    assert.equal((await state(page)).active.answers.length, 2);
    await settled(page);
    await page.evaluate(() => { window.midiTest.remove('a'); window.midiTest.add('new-id', 'Test keyboard a'); });
    await ready(page);
    assert.equal(await page.locator('#midi-input').inputValue(), 'new-id');
    await play(page, [60], 'new-id');
    assert.equal((await state(page)).active.answers.length, 3);
    await settled(page);
    await page.evaluate(() => { window.midiTest.fresh(); window.midiTest.add('fresh-id', 'Test keyboard a'); });
    await page.locator('#midi-recheck-quiz').click();
    await ready(page);
    await play(page, [60], 'fresh-id');
    assert.equal((await state(page)).active.answers.length, 4);
    assert.equal((await state(page)).active.answers.at(-1).correct, true);
  });
  await check('note presses retry and advance immediately, including legato, without duplicate grading', async () => {
    const page = await setup();
    await connect(page);
    await page.locator('#customize-button').click();
    await page.locator('[data-preset="none"]').click();
    await page.locator('[data-note="D♭"]').click();
    await page.locator('[data-range-clef="treble"][data-octave="4"]').click();
    await page.locator('[data-range-clef="treble"][data-octave="5"]').click();
    await page.locator('#apply-button').click();
    await page.locator('#start-button').click();
    const id = (await state(page)).active.current.id;
    const immediate = await page.evaluate(() => {
      window.midiTest.send('a', [0x90,61,100]);
      const wrong = document.querySelector('.score-card').classList.contains('midi-wrong');
      const targetStayed = document.querySelector('#quiz-staff ellipse').getAttribute('cy') === '36';
      window.midiTest.send('a', [0x90,73,100]);
      const advanced = document.getElementById('question-count').textContent.includes('Question 2');
      window.midiTest.send('a', [0x90,73,100]);
      window.midiTest.send('a', [0x80,73,0]);
      window.midiTest.send('a', [0x90,73,100]);
      const legato = document.getElementById('question-count').textContent.includes('Question 3');
      return {wrong,targetStayed,advanced,legato};
    });
    assert.deepEqual(immediate, {wrong:true,targetStayed:true,advanced:true,legato:true});
    const saved = await state(page);
    assert.equal(saved.active.answers.length, 2);
    assert.equal(saved.active.answers[0].correct, false);
    assert.equal(saved.active.answers[1].correct, true);
    assert.equal(saved.history[id].attempts, 2);
    await send(page, [0x80,61,0]);
    await send(page, [0x80,73,0]);
    await page.reload();
    assert.equal(await page.evaluate(() => window.midiTest.calls.length), 0);
    await page.locator('#start-button').click();
    await ready(page);
    assert.equal((await state(page)).active.answers.length, 2);
    await page.locator('#midi-use-touch').click();
    await play(page, [73]);
    assert.equal((await state(page)).active.answers.length, 2);
    await page.locator('#letters [data-letter="0"]').click();
    await page.locator('#accidentals [data-alteration="1"]').click();
    await page.locator('#check-button').click();
    assert.equal((await state(page)).active.feedback.correct, false, 'Touch still distinguishes C-sharp from D-flat');
  });
  await check('MIDI chords grade full overlapping phrases and ignore paused, feedback and held keys', async () => {
    const page = await setup();
    await connect(page);
    await page.locator('#customize-button').click();
    await page.locator('[data-mode="chords"]').click();
    await page.locator('[data-preset="none"]').click();
    await page.locator('[data-note="C"]').click();
    await page.locator('#quality-options [data-quality="maj"]').click();
    await page.locator('#quality-options [data-quality="min"]').click();
    await page.locator('#quality-options [data-quality="dom7"]').click();
    await page.locator('#apply-button').click();
    await page.locator('#start-button').click();
    let notes = (await state(page)).active.current.tones.map(tone => tone.midi);
    await send(page, [0x90, notes[0], 100]);
    await send(page, [0x90, notes[1], 100]);
    await send(page, [0x80, notes[0], 0]);
    for (const note of notes.slice(2)) await send(page, [0x90, note, 100]);
    await send(page, [0xb0, 64, 127]);
    await send(page, [0x80, notes[1], 0]);
    for (const note of notes.slice(2, -1)) await send(page, [0x80, note, 0]);
    assert.equal((await state(page)).active.feedback, null);
    await send(page, [0x80, notes.at(-1), 0]);
    assert.equal((await state(page)).active.answers.at(-1).correct, true);
    await settled(page);
    assert.equal((await state(page)).active.feedback, null);
    notes = (await state(page)).active.current.tones.map(tone => tone.midi);
    await send(page, [0x90, notes[0], 100]);
    await page.locator('#pause-button').click();
    await play(page, [96]);
    await page.locator('#resume-button').click();
    await send(page, [0x80, notes[0], 0]);
    assert.equal((await state(page)).active.answers.length, 1);
    await page.locator('#settings-button').click();
    await play(page, notes);
    assert.equal((await state(page)).active.answers.length, 1);
    await page.locator('[data-close="settings-dialog"]').click();
    await page.locator('#resume-button').click();
    await play(page, notes);
    assert.equal((await state(page)).active.answers.at(-1).correct, true);
    await settled(page);
    await play(page, [60]);
    assert.equal((await state(page)).active.retrying, true, 'A partial chord must not pass');
    await settled(page);
    await page.evaluate(() => window.midiTest.remove('a'));
    assert.match(await page.locator('#quiz-midi-status').innerText(), /not connected/);
    assert.equal(await page.locator('#midi-recheck-quiz').isVisible(), true);
  });
  await check('MIDI staff, instant feedback, pause and dock fit phone, tablet and desktop sizes', async () => {
    const page = await setup();
    await connect(page);
    await page.locator('#start-button').click();
    await play(page, [61, 66, 70, 75]);
    for (const viewport of [{ width: 430, height: 932 }, { width: 932, height: 430 }, { width: 320, height: 568 }, { width: 800, height: 1280 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1024, height: 600 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(height => document.body.getBoundingClientRect().height === height, viewport.height);
      const layout = await page.locator('#quiz-content').evaluate(panel => ({ content: panel.clientHeight, scroll: panel.scrollHeight, document: document.documentElement.scrollHeight, viewport: innerHeight }));
      assert.ok(layout.scroll <= layout.content + 1 && layout.document <= layout.viewport + 1, `${JSON.stringify(viewport)}: ${JSON.stringify(layout)}`);
      assert.equal(await page.locator('#letters').isVisible(), false);
      const dock = await page.locator('#midi-recheck-quiz').boundingBox();
      assert.ok(dock.y + dock.height <= viewport.height);
      await page.locator('#pause-button').click();
      const resume = await page.locator('#resume-button').boundingBox();
      assert.ok(Math.abs(resume.y - dock.y) <= 1, 'Pause must share the MIDI action dock');
      await page.locator('#resume-button').click();
    }
  });
  if (engine === 'chromium') {
    const context = await browser.newContext();
    contexts.push(context);
    await context.grantPermissions(['midi', 'midi-sysex'], { origin: base });
    const page = await context.newPage();
    await page.goto(base);
    report.nativeApi = await page.evaluate(async () => {
      if (!navigator.requestMIDIAccess) return { available: false };
      try {
        const access = window.nativeMidiAccess = await navigator.requestMIDIAccess({ sysex: false });
        const input = [...access.inputs.values()].find(port => port.name === 'Midi Through Port-0');
        const output = [...access.outputs.values()].find(port => port.name === 'Midi Through Port-0');
        return { available: true, result: 'granted', inputCount: access.inputs.size, virtualInputId: input?.id, virtualOutputId: output?.id };
      } catch (error) { return { available: true, result: 'host unavailable', error: error.name, message: error.message }; }
    });
    if (report.nativeApi.virtualInputId && report.nativeApi.virtualOutputId) {
      await page.locator('#customize-button').click();
      await page.locator('[data-preset="none"]').click();
      await page.locator('[data-note="C"]').click();
      await page.locator('#apply-button').click();
      await page.locator('#settings-button').click();
      await page.locator('#midi-connect').click();
      await page.waitForFunction(() => document.getElementById('midi-status').textContent.startsWith('Connected'));
      await page.locator('#midi-input').selectOption(report.nativeApi.virtualInputId);
      await page.locator('[data-close="settings-dialog"]').click();
      await page.locator('#start-button').click();
      await page.evaluate(async outputId => {
        const output = window.nativeMidiAccess.outputs.get(outputId);
        await output.open();
        output.send([0x90, 60, 100]);
        output.send([0x80, 60, 0], performance.now() + 100);
      }, report.nativeApi.virtualOutputId);
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).active?.answers?.at(-1)?.answer?.source === 'midi', key);
      assert.equal((await state(page)).active.answers.at(-1).correct, true);
      await page.evaluate(outputId => window.nativeMidiAccess.outputs.get(outputId).close(), report.nativeApi.virtualOutputId);
      await settled(page);
      await page.locator('#midi-recheck-quiz').click();
      await ready(page);
      await page.evaluate(async outputId => {
        const output = window.nativeMidiAccess.outputs.get(outputId);
        await output.open();
        output.send([0x90, 60, 100]);
        output.send([0x80, 60, 0], performance.now() + 100);
      }, report.nativeApi.virtualOutputId);
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).active?.answers?.length === 2, key);
      assert.equal((await state(page)).active.answers.at(-1).correct, true);
      assert.equal((await state(page)).active.answers.length, 2);
      await page.evaluate(outputId => window.nativeMidiAccess.outputs.get(outputId).close(), report.nativeApi.virtualOutputId);
      report.nativeApi.virtualLoopback = 'passed: native Web MIDI through ALSA Midi Through grades C4 before and after Recheck';
      console.log('PASS native Chromium Web MIDI virtual loopback grades C4');
    }

  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await writeFile(`docs/${process.env.PIANO_URL ? 'live-' : ''}midi-${engine}.json`, JSON.stringify(report, null, 2) + '\n');
}
