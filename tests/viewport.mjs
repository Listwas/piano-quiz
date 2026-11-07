import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.BROWSER || 'chromium';
const base = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const key = 'pianoQuiz.state.v1';
const build = JSON.parse(await readFile('dist/version.json', 'utf8')).version;
const report = { engine, origin: base, build, testedAt: new Date().toISOString(), checks: [], errors: [], limits: ['Device sizes and safe areas are simulated; installed iOS system chrome and physical Honor MagicPad 2 behavior are not reproduced.', 'Rotation checks send real touch sequences after viewport resizing. Reduced visible height and the connected MIDI port are simulated.'] };
const profiles = [
  { name: 'iphone-14-pro-max', width: 430, height: 932, top: 59, bottom: 34 },
  { name: 'iphone-14-pro-max-landscape', width: 932, height: 430, left: 59, right: 59, bottom: 21 },
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'honor-magicpad-2-portrait', width: 800, height: 1280 },
  { name: 'honor-magicpad-2-landscape', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'compact-tablet', width: 1024, height: 600 },
];
const browser = await { chromium, firefox, webkit }[engine].launch({ headless: true, ...(engine === 'chromium' ? { executablePath: '/usr/bin/chromium', args: ['--mute-audio'] } : {}) });
let activePage;

async function touch(page, selector) {
  const locator = page.locator(selector);
  const box = await locator.boundingBox();
  assert.ok(box, `${selector} must be visible`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  assert.ok(await locator.evaluate((button, point) => button.contains(document.elementFromPoint(point.x, point.y)), point), `${selector} touch target is covered`);
  // Send a real touch sequence at the rendered position, without auto-scrolling.
  await page.touchscreen.tap(point.x, point.y);
}

async function rotationFrame(page, profile, mode, reserved = 0) {
  await page.waitForFunction(height => Math.abs(document.body.getBoundingClientRect().height - height) <= 1, profile.height - reserved);
  const geometry = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const content = document.getElementById('quiz-content');
    return { shell: rect('.app-shell'), content: { height: content.clientHeight, scroll: content.scrollHeight }, staff: rect('#quiz-staff'), scrollY, bodyPosition: getComputedStyle(document.body).position };
  });
  assert.notEqual(geometry.bodyPosition, 'fixed', 'Avoid the fixed-body iOS rotation hit-testing bug');
  assert.equal(geometry.scrollY, 0);
  assert.ok(Math.abs(geometry.shell.bottom - profile.height + reserved) <= 1, JSON.stringify(geometry));
  assert.ok(geometry.content.scroll <= geometry.content.height + 1, `Rotation clipped quiz content: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.staff.height >= 30, 'Staff must retain readable space');
  const selectors = mode === 'midi' ? ['#midi-skip-button', '#midi-recheck-quiz', '#midi-action-hint', '#pause-button'] : ['#check-button', '#unknown-button', '#pause-button', '#letters'];
  for (const selector of selectors) {
    if (selector === '#midi-action-hint' && profile.height - reserved < 420) continue;
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `${selector} must remain visible`);
    assert.ok(box.y >= (profile.top || 0) && box.y + box.height <= profile.height - reserved - (profile.bottom || 0) + 1, `${selector} cropped after rotation or browser chrome resize: ${JSON.stringify(box)}`);
  }
}

async function frame(page, profile, screen, action) {
  const geometry = await page.evaluate(({ screen, action }) => {
    const panel = document.querySelector(screen), button = document.querySelector(action);
    const rect = button.getBoundingClientRect();
    const shell = document.querySelector('.app-shell').getBoundingClientRect();
    return { docHeight: document.documentElement.scrollHeight, height: innerHeight, width: innerWidth, scrollY, contentHeight: panel.clientHeight, contentScroll: panel.scrollHeight, button: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, shell: { bottom: shell.bottom, top: shell.top }, rootBackground: getComputedStyle(document.documentElement).backgroundColor, bodyBackground: getComputedStyle(document.body).backgroundColor };
  }, { screen, action });
  const label = `${profile.name} ${screen}`;
  assert.equal(geometry.scrollY, 0, label);
  assert.ok(geometry.docHeight <= geometry.height + 1, `${label} document overflows: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.contentScroll <= geometry.contentHeight + 1, `${label} clipped content: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.button.bottom <= profile.height - (profile.bottom || 0) + 1, `${label} button below safe area: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.button.top >= (profile.top || 0), label);
  assert.ok(geometry.button.left >= (profile.left || 0), label);
  assert.ok(geometry.button.right <= profile.width - (profile.right || 0), label);
  assert.equal(geometry.rootBackground, geometry.bodyBackground, label);
  assert.ok(geometry.shell.bottom >= profile.height - 1, `${label} shell leaves a bottom strip`);
  if (engine === 'webkit') await page.evaluate(() => window.scrollTo(0, 600));
  else await page.mouse.wheel(0, 600);
  assert.equal(await page.evaluate(() => scrollY), 0, `${label} wheel scrolls page`);
  return geometry.button.top;
}

try {
  await mkdir('docs/images', { recursive: true });
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: true, reducedMotion: 'reduce', ...(engine !== 'firefox' ? { isMobile: true, deviceScaleFactor: 1 } : {}) });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    const page = await context.newPage();
    activePage = page;
    await page.goto(base);
    await page.evaluate(profile => {
      for (const [name, value] of Object.entries({ top: profile.top || 0, bottom: profile.bottom || 0, left: profile.left || 0, right: profile.right || 0 })) document.documentElement.style.setProperty(`--safe-${name}`, `${value}px`);
    }, profile);
    await frame(page, profile, '#home-screen', '#start-button');
    await page.screenshot({ path: `docs/images/${profile.name}-home.png` });
    const cancellation = await page.evaluate(() => ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      document.getElementById('home-screen').dispatchEvent(event);
      return event.defaultPrevented;
    }));
    assert.ok(cancellation.every(Boolean), `${profile.name} zoom gesture was not cancelled`);
    assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale=1,user-scalable=no/);
    if (engine === 'chromium' && profile.name === 'iphone-14-pro-max') {
      const devtools = await context.newCDPSession(page);
      await devtools.send('Input.synthesizePinchGesture', { x: 210, y: 400, scaleFactor: 1.8, relativeSpeed: 800, gestureSourceType: 'touch' });
      assert.equal(await page.evaluate(() => visualViewport.scale), 1, 'Pinch changed the app scale');
      await devtools.detach();
    }

    await page.locator('#customize-button').click();
    await page.locator('[data-mode="mixed"]').click();
    await page.locator('[data-preset="none"]').click();
    await page.locator('#pitch-options [data-note="C♯"]').click();
    while (await page.locator('#quality-options button[aria-pressed="false"]').count()) await page.locator('#quality-options button[aria-pressed="false"]').first().click();
    await page.locator('[data-range="all"]').click();
    await page.locator('#apply-button').click();
    await frame(page, profile, '#home-screen', '#start-button');
    await page.locator('#start-button').click();
    const top = await frame(page, profile, '#quiz-content', '#check-button');
    if (profile.width >= 768 && profile.height >= 600) {
      const staff = await page.locator('.score-card').boundingBox();
      const answers = await page.locator('#answer-controls').boundingBox();
      assert.ok(staff.y + staff.height <= answers.y + 1, `${profile.name} answers must be below the staff`);
      assert.ok(Math.abs(staff.x + staff.width / 2 - answers.x - answers.width / 2) <= 1, `${profile.name} staff and answers must share a centered column`);
    }
    for (let index = 0; index < 3; index++) {
      const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      assert.deepEqual(state.settings.noteNames, ['C♯']);
      assert.deepEqual(state.settings.octaves.treble, [3, 4, 5, 6]);
      assert.equal(state.active.current.tones[0].name, 'C♯', `${profile.name} quiz asked an unselected spelling`);
      await page.locator('#unknown-button').click();
      assert.ok(Math.abs(await frame(page, profile, '#quiz-content', '#next-button') - top) <= 1);
      await page.locator('#next-button').click();
      await frame(page, profile, '#quiz-content', '#check-button');
    }
    await page.screenshot({ path: `docs/images/${profile.name}-quiz.png` });
    await page.locator('#pause-button').click();
    assert.ok(Math.abs(await frame(page, profile, '#paused-panel', '#resume-button') - top) <= 1);
    await page.locator('#settings-button').click();
    await page.locator('#theme-options [data-theme="midnight"]').click();
    const modalScroll = await page.locator('#settings-dialog').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; return { scroll: dialog.scrollTop, max: dialog.scrollHeight - dialog.clientHeight }; });
    if (modalScroll.max > 1) assert.ok(modalScroll.scroll > 0, `${profile.name} settings cannot scroll`);
    await page.locator('[data-close="settings-dialog"]').click();
    await frame(page, profile, '#paused-panel', '#resume-button');
    await page.locator('#pause-home-button').click();
    await frame(page, profile, '#home-screen', '#start-button');
    await page.locator('#start-button').click();
    while ((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).active) {
      if (await page.locator('#next-button').isVisible()) await page.locator('#next-button').click();
      else await page.locator('#unknown-button').click();
    }
    await frame(page, profile, '#result-screen', '#again-button');
    await page.screenshot({ path: `docs/images/${profile.name}-results.png` });
    report.checks.push(`${profile.name}: home, exact-spelling quiz, feedback, pause, results, root background, safe areas, zoom guards, and settings-only scrolling`);
    await context.close();
  }

  for (const mode of ['touch', 'midi']) {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, reducedMotion: 'reduce', ...(engine !== 'firefox' ? { isMobile: true } : {}) });
    await context.addInitScript(() => {
      const viewport = window.visualViewport;
      const actualHeight = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height').get.bind(viewport);
      // Simulate browser/system UI reducing visibility without changing layout.
      Object.defineProperty(viewport, 'height', { get: () => window.testViewportHeight ?? actualHeight() });
      const port = { id: 'test', name: 'USB func for MIDI', state: 'connected', connection: 'closed', async open() { this.connection = 'open'; }, async close() { this.connection = 'closed'; } };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([['test', port]]) }) });
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base);
    if (mode === 'touch') {
      await page.locator('#customize-button').click();
      await page.locator('[data-mode="chords"]').click();
      await page.locator('#apply-button').click();
    }
    if (mode === 'midi') await touch(page, '.practice-card [data-input-mode="midi"]');
    await touch(page, '#start-button');
    const rotations = [profiles[1], profiles[0], profiles[1], profiles[0], profiles[4], profiles[3]];
    for (const profile of rotations) {
      await page.setViewportSize({ width: profile.width, height: profile.height });
      await page.evaluate(profile => {
        for (const [name, value] of Object.entries({ top: profile.top || 0, bottom: profile.bottom || 0, left: profile.left || 0, right: profile.right || 0 })) document.documentElement.style.setProperty(`--safe-${name}`, `${value}px`);
        window.dispatchEvent(new Event('orientationchange'));
      }, profile);
      await rotationFrame(page, profile, mode);
      await touch(page, '#pause-button');
      await page.locator('#paused-panel').waitFor({ state: 'visible' });
      await touch(page, '#settings-button');
      await page.locator('#settings-dialog').waitFor({ state: 'visible' });
      await touch(page, '[data-close="settings-dialog"]');
      await touch(page, '#resume-button');
      await page.locator('#pause-button').waitFor({ state: 'visible' });
      if (mode === 'touch') {
        await touch(page, '#letters [data-letter="0"]');
        assert.equal(await page.locator('#letters [data-letter="0"]').getAttribute('aria-pressed'), 'true');
      }
      // The underlying layout viewport remains unchanged, like browser chrome
      // appearing after rotation. Only a VisualViewport resize event is sent.
      await page.evaluate(() => { window.testViewportHeight = innerHeight - 96; visualViewport.dispatchEvent(new Event('resize')); });
      await rotationFrame(page, profile, mode, 96);
      if (mode === 'touch') {
        await touch(page, '#accidentals [data-alteration="1"]');
        assert.equal(await page.locator('#accidentals [data-alteration="1"]').getAttribute('aria-pressed'), 'true');
      }
      const dock = await page.locator(mode === 'midi' ? '#midi-skip-button' : '#check-button').boundingBox();
      await touch(page, '#pause-button');
      await page.locator('#paused-panel').waitFor({ state: 'visible' });
      assert.ok(Math.abs((await page.locator('#resume-button').boundingBox()).y - dock.y) <= 1, 'Pause must keep the action row aligned');
      await touch(page, '#settings-button');
      await page.locator('#settings-dialog').waitFor({ state: 'visible' });
      const dialog = await page.locator('#settings-dialog').boundingBox();
      assert.ok(dialog.y >= (profile.top || 0) && dialog.y + dialog.height <= profile.height - 96 - (profile.bottom || 0) + 1, `Settings cropped by browser chrome: ${JSON.stringify(dialog)}`);
      await touch(page, '[data-close="settings-dialog"]');
      await touch(page, '#resume-button');
      await page.locator('#pause-button').waitFor({ state: 'visible' });
      if (mode === 'touch') {
        await touch(page, '#unknown-button');
        await page.locator('#next-button').waitFor({ state: 'visible' });
        assert.ok(Math.abs((await page.locator('#next-button').boundingBox()).y - dock.y) <= 1, 'Feedback must keep the action row aligned');
        await touch(page, '#next-button');
        await page.locator('#check-button').waitFor({ state: 'visible' });
      }
      if (profile.name === 'honor-magicpad-2-landscape') await page.screenshot({ path: `docs/images/rotation-tablet-${mode}-${engine}.png` });
      await page.evaluate(() => { window.testViewportHeight = null; visualViewport.dispatchEvent(new Event('resize')); });
      await rotationFrame(page, profile, mode);
    }
    report.checks.push(`${mode}: six consecutive phone/tablet rotations, real touch Pause/Resume/Settings${mode === 'touch' ? '/letter selection' : ''}, and a simulated 96px visible-viewport reduction with dock fully visible`);
    await context.close();
  }

  const fallbackContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await fallbackContext.addInitScript(() => Object.defineProperty(window, 'visualViewport', { value: undefined }));
  const fallback = await fallbackContext.newPage();
  activePage = fallback;
  fallback.on('pageerror', error => report.errors.push(error.message));
  await fallback.goto(base);
  await fallback.setViewportSize({ width: 932, height: 430 });
  await fallback.waitForFunction(() => document.body.getBoundingClientRect().height === 430);
  report.checks.push('Window resize fallback sizes the app when VisualViewport is unavailable');
  await fallbackContext.close();
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  console.log(`${engine}: ${report.checks.length} viewport and rotation checks passed`);
} catch (error) {
  report.result = 'failed';
  report.failure = error.stack;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `docs/images/viewport-failure-${engine}.png`, fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`docs/${process.env.PIANO_URL ? 'live-' : ''}viewport-${engine}.json`, JSON.stringify(report, null, 2) + '\n');
}
