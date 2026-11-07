import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { THEMES } from '../js/quiz.js';

const engine = process.env.BROWSER || 'chromium';
const inMemory = process.env.PIANO_IN_MEMORY === '1';
const base = inMemory ? 'https://piano-quiz.test/' : (process.env.PIANO_URL || 'http://127.0.0.1:8421/');
const root = resolve('dist');
const report = { engine, origin: base, inMemory, checks: [], errors: [] };
report.limits = [];
report.build = JSON.parse(await readFile(resolve('dist/version.json'), 'utf8')).version;
report.testedAt = new Date().toISOString();
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const key = 'pianoQuiz.state.v1';
const browser = await { chromium, firefox, webkit }[engine].launch({
  headless: true,
  ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--mute-audio'] } : {}),
  ...(engine === 'firefox' ? { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } : {}),
});

async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: 'light', reducedMotion: 'reduce', ...options });
  ctx.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
  ctx.setDefaultTimeout(10000);
  if (inMemory) {
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) { await route.abort(); return; }
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) { await route.fulfill({ status: 403, body: '' }); return; }
      try { await route.fulfill({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
      catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
  }
  return ctx;
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function check(label, action) { await action(); report.checks.push(label); console.log(`PASS ${label}`); }
async function chooseExact(page) {
  const item = (await state(page)).active.current;
  const root = item.tones[0];
  await page.locator(`#letters [data-letter="${root.letter}"]`).click();
  await page.locator(`#accidentals [data-alteration="${root.alteration}"]`).click();
  if (item.kind === 'chord') {
    if (await page.locator('#answer-quality-picker').isVisible()) await page.locator('#answer-quality-picker').selectOption(item.qualityId);
    else await page.locator(`#answer-qualities [data-quality="${item.qualityId}"]`).click();
  }
  return item;
}

try {
  await mkdir('docs/images', { recursive: true });
  const ctx = await context();
  const page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base);
  await check('home loads with default practice and no horizontal overflow', async () => {
    await page.locator('#start-button').waitFor();
    assert.match(await page.locator('#practice-detail').innerText(), /Treble clef · 7 notes · 10 questions/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'docs/images/home.png', fullPage: true });
  });
  await check('practice labels cannot be selected by double-clicking or dragging', async () => {
    await page.locator('.home-heading h1').dblclick();
    assert.equal(await page.evaluate(() => getSelection().toString()), '');
    assert.equal(await page.locator('.home-heading h1').evaluate(element => getComputedStyle(element).userSelect), 'none');
  });
  await page.locator('#start-button').click();
  await check('fixed answer controls and unanswered staff do not reveal the name', async () => {
    assert.equal(await page.locator('#letters button').count(), 7);
    assert.match(await page.locator('#quiz-staff svg').getAttribute('aria-label'), /Identify the notation/);
    assert.equal(await page.locator('#check-button').isDisabled(), true);
    const all = await page.locator('#letters button, #accidentals button, #check-button').evaluateAll(elements => elements.map(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })));
    assert.ok(all.every(rect => rect.w >= 48 && rect.h >= 48), JSON.stringify(all));
    await page.screenshot({ path: 'docs/images/gameplay.png', fullPage: true });
  });
  await check('correct answer grades once and advances automatically', async () => {
    await chooseExact(page);
    await page.locator('#check-button').click();
    assert.equal((await state(page)).active.answers[0].correct, true);
    assert.equal(await page.locator('#quiz-staff .staff--correct').count(), 1);
    assert.equal(await page.locator('#feedback').count(), 0, 'No feedback panel should replace the quiz');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).active.feedback === null, key);
    assert.match(await page.locator('#question-count').innerText(), /Question 2 of 10/);
  });
  await check('wrong note turns red, retries after two seconds, and reload preserves first-try grading', async () => {
    const item = (await state(page)).active.current;
    await page.locator(`#letters [data-letter="${(item.tones[0].letter + 1) % 7}"]`).click();
    await page.locator('#check-button').click();
    assert.equal(await page.locator('#quiz-staff .staff--wrong').count(), 1);
    assert.match(await page.locator('#staff-caption').innerText(), /Try again/);
    await page.screenshot({ path: 'docs/images/correction.png', fullPage: true });
    await page.reload();
    await page.locator('#start-button').click();
    assert.equal((await state(page)).active.answers.length, 2);
    const began = Date.now();
    await page.waitForFunction(key => { const active = JSON.parse(localStorage.getItem(key)).active; return active.retrying && !active.feedback; }, key);
    assert.ok(Date.now() - began >= 1600, 'Red feedback should last about two seconds');
    assert.equal((await state(page)).active.current.id, item.id);
    assert.equal(await page.locator('#quiz-staff .staff--wrong').count(), 0);
    await chooseExact(page);
    await page.locator('#check-button').click();
    assert.equal((await state(page)).active.feedback.correct, true);
    assert.equal((await state(page)).history[item.id].attempts, 1);
    await page.locator('#next-button').click();
  });
  await check('pausing excludes elapsed time and resumes explicitly', async () => {
    await page.locator('#pause-button').click();
    const elapsed = (await state(page)).active.elapsed;
    await page.waitForTimeout(350);
    assert.equal((await state(page)).active.elapsed, elapsed);
    assert.equal(await page.locator('#answer-controls').isVisible(), false);
    await page.locator('#resume-button').click();
    assert.equal(await page.locator('#answer-controls').isVisible(), true);
  });
  await check('complete ten-question round updates daily goal and displays difficult items', async () => {
    while ((await state(page)).active) {
      const active = (await state(page)).active;
      if (active.feedback) await page.locator('#next-button').click();
      else { await chooseExact(page); await page.locator('#check-button').click(); }
    }
    await page.locator('#result-screen').waitFor({ state: 'visible' });
    assert.equal((await state(page)).lastResult.total, 10);
    assert.equal((await state(page)).lastResult.correct, 9);
    assert.equal(await page.locator('#difficult-section').isVisible(), true);
    await page.screenshot({ path: 'docs/images/results.png', fullPage: true });
    await page.locator('#result-home-button').click();
    assert.match(await page.locator('#daily-title').innerText(), /already done/);
  });
  await check('customization rejects empty pools and cancellation preserves settings', async () => {
    const before = (await state(page)).settings;
    await page.locator('#customize-button').click();
    await page.locator('[data-preset="none"]').click();
    await page.locator('#apply-button').click();
    assert.match(await page.locator('#setup-error').innerText(), /at least one/);
    await page.keyboard.press('Escape');
    assert.deepEqual((await state(page)).settings, before);
  });
  await check('chord quiz requires root plus quality, and Skip briefly reveals the bass chord', async () => {
    await page.locator('#customize-button').click();
    await page.locator('[data-mode="chords"]').click();
    await page.locator('[data-clef="bass"]').click();
    await page.locator('#apply-button').click();
    await page.locator('#start-button').click();
    const item = (await state(page)).active.current;
    await page.locator(`#letters [data-letter="${item.tones[0].letter}"]`).click();
    assert.equal(await page.locator('#check-button').isDisabled(), true);
    await chooseExact(page);
    await page.locator('#unknown-button').click();
    assert.equal(await page.locator('#hear-button').isVisible(), true);
    assert.ok((await page.locator('#staff-caption').innerText()).includes(item.label));
    assert.equal(await page.locator('#quiz-staff ellipse').count(), item.tones.length);
    assert.match(await page.locator('#clef-label').innerText(), /Bass/);
    await page.screenshot({ path: 'docs/images/chord.png', fullPage: true });
  });
  await check('theme changes pause practice and persist across reload', async () => {
    await page.locator('#settings-button').click();
    await page.locator('[data-theme="dark"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('[data-close="settings-dialog"]').click();
    assert.equal(await page.locator('#paused-panel').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: 'docs/images/dark.png', fullPage: true });
  });
  await check('320px phone, landscape, and tablet layouts avoid horizontal overflow', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      await page.locator('#start-button').click();
      if (await page.locator('#pause-button').isVisible()) await page.locator('#pause-button').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(viewport));
      await page.locator('#pause-home-button').click();
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.screenshot({ path: 'docs/images/small-phone.png', fullPage: true });
  });
  await check('backgrounding pauses a question without counting hidden time', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#start-button').click();
    if ((await state(page)).active.feedback) await page.locator('#next-button').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = (await state(page)).active.elapsed;
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal((await state(page)).active.elapsed, before);
    assert.equal(await page.locator('#paused-panel').isVisible(), true);
  });
  await ctx.close();

  await check('Check, Next, and Resume stay aligned at the bottom on small phones and landscape', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      for (const mode of ['notes', 'chords']) {
        const c = await context({ viewport });
        const p = await c.newPage();
        await p.goto(base);
        if (mode === 'chords') {
          await p.locator('#customize-button').click();
          await p.locator('[data-mode="chords"]').click();
          while (await p.locator('#quality-options button[aria-pressed="false"]').count()) await p.locator('#quality-options button[aria-pressed="false"]').first().click();
          await p.locator('#apply-button').click();
        }
        await p.locator('#start-button').click();
        const before = await p.locator('#check-button').boundingBox();
        const aligned = async selector => {
          const rect = await p.locator(selector).boundingBox();
          assert.ok(Math.abs(rect.y - before.y) <= 1, `${mode} ${JSON.stringify(viewport)} ${selector}: ${rect.y} vs ${before.y}`);
          assert.ok(rect.y + rect.height <= viewport.height);
        };
        await p.locator('#unknown-button').click();
        await aligned('#next-button');
        await p.locator('#next-button').click();
        await aligned('#check-button');
        await p.locator('#pause-button').click();
        await aligned('#resume-button');
        if (viewport.width === 390 && mode === 'notes') await p.screenshot({ path: 'docs/images/pause.png', fullPage: true });
        await p.locator('#resume-button').click();
        await aligned('#check-button');
        await chooseExact(p);
        await p.locator('#check-button').click();
        await aligned('#next-button');
        assert.equal(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
        await c.close();
      }
    }
  });

  await check('every palette applies and persists, including light palettes on a dark device', async () => {
    const c = await context({ colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto(base);
    const backgrounds = Object.fromEntries(THEMES.filter(theme => theme.id !== 'system').map(theme => [theme.id, theme.background]));
    for (const [theme, background] of Object.entries(backgrounds)) {
      await p.locator('#settings-button').click();
      await p.locator(`#theme-options [data-theme="${theme}"]`).click();
      assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), background);
      await p.locator('[data-close="settings-dialog"]').click();
      await p.reload();
      assert.equal((await state(p)).settings.theme, theme);
      assert.equal(await p.locator('html').getAttribute('data-theme'), theme);
      const contrast = await p.locator('#start-button').evaluate(button => {
        const luminance = color => {
          const channels = color.match(/[0-9.]+/g).slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const style = getComputedStyle(button), body = getComputedStyle(document.body);
        return { button: ratio(luminance(style.color), luminance(style.backgroundColor)), text: ratio(luminance(body.color), luminance(body.backgroundColor)) };
      });
      assert.ok(contrast.button >= 4.5 && contrast.text >= 4.5, `${theme} contrast: ${JSON.stringify(contrast)}`);
      if (['sunflower', 'rose', 'plum', 'amoled'].includes(theme)) await p.screenshot({ path: `docs/images/theme-${theme}.png` });
    }
    await p.locator('#settings-button').click();
    await p.locator('#theme-options [data-theme="plum"]').scrollIntoViewIfNeeded();
    await p.screenshot({ path: 'docs/images/themes.png', fullPage: true });
    await c.close();
  });

  await check('mixed notes and chords across both clefs survive reload', async () => {
    const c = await context();
    const p = await c.newPage();
    p.on('pageerror', error => report.errors.push(error.message));
    await p.goto(base);
    await p.locator('#customize-button').click();
    await p.locator('[data-mode="mixed"]').click();
    await p.locator('[data-clef="mixed"]').click();
    await p.locator('[data-preset="all"]').click();
    await p.locator('#apply-button').click();
    await p.locator('#start-button').click();
    const id = (await state(p)).active.current.id;
    await p.reload();
    await p.locator('#start-button').click();
    assert.equal((await state(p)).active.current.id, id);
    await c.close();
  });
  await check('Choose notes exposes exact sharp/flat selections and Settings links to the same pool', async () => {
    const c = await context();
    const p = await c.newPage();
    await p.goto(base);
    await p.locator('#customize-button').click();
    await p.locator('[data-preset="flats"]').click();
    assert.equal(await p.locator('#pitch-options [data-note][aria-pressed="true"]').count(), 5);
    await p.locator('#apply-button').click();
    assert.deepEqual((await state(p)).settings.noteNames, ['D♭', 'E♭', 'G♭', 'A♭', 'B♭']);
    await p.locator('#start-button').click();
    assert.equal((await state(p)).active.current.tones[0].alteration, -1);
    await p.locator('#settings-button').click();
    await p.locator('#practice-settings-button').click();
    await p.locator('[data-preset="none"]').click();
    await p.locator('#pitch-options [data-note="C♯"]').click();
    await p.locator('#apply-button').click();
    await p.reload();
    await p.locator('#start-button').click();
    assert.deepEqual((await state(p)).settings.noteNames, ['C♯']);
    assert.equal((await state(p)).active.current.tones[0].name, 'C♯');
    await c.close();
  });
  await check('octave selection asks higher C5 only, validates ranges, saves and cancels changes', async () => {
    const c = await context();
    const p = await c.newPage();
    await p.goto(base);
    await p.locator('#customize-button').click();
    await p.locator('[data-preset="none"]').click();
    await p.locator('#pitch-options [data-note="C"]').click();
    await p.locator('[data-range-clef="treble"][data-octave="4"]').click();
    await p.locator('#apply-button').click();
    assert.match(await p.locator('#setup-error').innerText(), /at least one octave/);
    await p.locator('[data-range-clef="treble"][data-octave="5"]').click();
    await p.locator('#range-settings').scrollIntoViewIfNeeded();
    await p.screenshot({ path: 'docs/images/octave-settings.png' });
    await p.locator('#apply-button').click();
    assert.match(await p.locator('#practice-detail').innerText(), /C5–B5/);
    await p.locator('#start-button').click();
    assert.equal((await state(p)).active.current.tones[0].octave, 5);
    assert.equal((await state(p)).active.current.tones[0].midi, 72);
    assert.equal(await p.locator('#quiz-staff ellipse').getAttribute('cy'), '42');
    await p.screenshot({ path: 'docs/images/higher-c5.png' });
    await p.locator('#unknown-button').click();
    assert.match(await p.locator('#staff-caption').innerText(), /C5/);
    await p.reload();
    await p.locator('#start-button').click();
    assert.equal((await state(p)).active.current.tones[0].octave, 5);
    assert.equal((await state(p)).history['note:treble:0:0:5'].attempts, 1);
    await p.locator('#settings-button').click();
    await p.locator('#practice-settings-button').click();
    await p.locator('[data-range="all"]').click();
    await p.keyboard.press('Escape');
    assert.deepEqual((await state(p)).settings.octaves.treble, [5]);
    await p.locator('#settings-button').click();
    await p.locator('#practice-settings-button').click();
    await p.locator('[data-clef="mixed"]').click();
    await p.locator('[data-range="wider"]').click();
    await p.locator('#apply-button').click();
    const after = await state(p);
    assert.deepEqual(after.settings.octaves, { treble: [4, 5], bass: [2, 3] });
    assert.equal(after.active, null);
    await c.close();
  });
  await check('blocked storage keeps the app usable with an honest notice', async () => {
    const c = await context();
    await c.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
    const p = await c.newPage();
    p.on('pageerror', error => report.errors.push(error.message));
    await p.goto(base);
    await p.locator('#start-button').click();
    assert.equal(await p.locator('#storage-notice').isVisible(), true);
    await p.locator('#unknown-button').click();
    assert.match(await p.locator('#staff-caption').innerText(), /Moving on/);
    await c.close();
  });
  if (!inMemory) {
    await check('service worker installs, then supports a fresh offline launch and quiz', async () => {
      const c = await context();
      const p = await c.newPage();
      await p.goto(base);
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await p.locator('#start-button').click();
      await p.locator('#unknown-button').click();
      await c.setOffline(true);
      await p.reload();
      await p.locator('#start-button').click();
      assert.match(await p.locator('#staff-caption').innerText(), /Moving on/);
      await p.locator('#next-button').click();
      await p.locator('#unknown-button').click();
      await c.close();
    });
    await check('piano audio works, or an independently unavailable audio backend is reported', async () => {
      const c = await context();
      let backendUnavailable = false;
      if (engine === 'webkit') {
        const probe = await c.newPage();
        await probe.goto(base);
        await probe.evaluate(() => {
          const button = document.createElement('button');
          button.id = 'audio-backend-probe';
          button.textContent = 'Check audio backend';
          button.onclick = () => {
            window.backendProbe = new AudioContext();
            const tone = window.backendProbe.createOscillator();
            const volume = window.backendProbe.createGain();
            volume.gain.value = 0;
            tone.connect(volume).connect(window.backendProbe.destination);
            tone.start();
            tone.stop(window.backendProbe.currentTime + 0.1);
            void window.backendProbe.resume().catch(() => {});
          };
          document.body.prepend(button);
        });
        await probe.locator('#audio-backend-probe').click();
        try { await probe.waitForFunction(() => window.backendProbe.state === 'running', null, { timeout: 1800 }); }
        catch { backendUnavailable = true; }
        report.audioBackendProbe = await probe.evaluate(() => ({ state: window.backendProbe.state, currentTime: window.backendProbe.currentTime }));
        await probe.close();
      }
      await c.addInitScript(() => {
        window.audioMeters = [];
        window.audioContexts = [];
        const Native = window.AudioContext || window.webkitAudioContext;
        window.AudioContext = class extends Native {
          constructor(...args) { super(...args); window.audioContexts.push(this); }
        };
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (...args) {
          if (args[0] === this.context.destination) {
            const analyser = this.context.createAnalyser();
            analyser.fftSize = 512;
            connect.call(this, analyser);
            window.audioMeters.push(analyser);
            return connect.call(analyser, ...args);
          }
          return connect.apply(this, args);
        };
      });
      const p = await c.newPage();
      p.on('pageerror', error => report.errors.push(error.message));
      await p.goto(base);
      await p.locator('#start-button').click();
      await p.locator('#unknown-button').click();
      await p.locator('#hear-button').click();
      if (backendUnavailable) {
        await p.waitForFunction(() => document.getElementById('hear-button').textContent.includes('unavailable'));
        report.audio = 'unverified: independent WebKit audio context cannot start on this host';
        report.limits.push(report.audio);
        await c.close();
        return;
      }
      await p.waitForFunction(() => window.audioMeters.some(analyser => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return samples.some(value => Math.abs(value) > 0.0001);
      }));
      await p.locator('#pause-button').click();
      await p.waitForFunction(() => window.audioContexts.every(context => context.state === 'suspended'));
      report.audio = 'real sample output signal and pause suspension verified';
      await c.close();
    });
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  if (inMemory) report.limits.push('In-memory routes exercise UI and modules; they do not verify service-worker installation, actual offline startup, or deployment.');
} catch (error) {
  report.result = 'failed';
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`docs/${process.env.PIANO_URL ? 'live' : 'browser'}-${engine}.json`, JSON.stringify(report, null, 2) + '\n');
}
