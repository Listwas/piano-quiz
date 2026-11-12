import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.PIANO_URL || 'http://127.0.0.1:8421/';
const report = {
  build: JSON.parse(await readFile('dist/version.json')).version,
  origin, testedAt: new Date().toISOString(), checks: [], errors: [],
  limits: ['Tablet and phone viewports and the MIDI connection are simulated; physical devices are not attached.'],
};
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--mute-audio'] });
try {
  await mkdir('docs/images', { recursive: true });
  for (const [width, height] of [[430, 932], [800, 1280], [1280, 800], [932, 430]]) {
    for (const input of ['touch', 'midi']) for (const theme of ['light', 'nocturne']) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        const port = { id: 'staff-test', name: 'Test keyboard', state: 'connected', connection: 'closed', async open() { this.connection = 'open'; }, async close() { this.connection = 'closed'; } };
        Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([[port.id, port]]) }) });
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(origin);
      await page.locator('#settings-button').click();
      await page.locator(`#theme-options [data-theme=${theme}]`).click();
      await page.locator('[data-close=settings-dialog]').click();
      await page.locator(`.practice-card [data-input-mode=${input}]`).click();
      await page.locator('#start-button').click();
      const label = `${width}x${height}, ${input}, ${theme}`;
      const dimensions = await page.evaluate(async () => {
        const { renderStaff } = await import('./js/staff.js');
        const { makeTone } = await import('./js/notes.js');
        const host = document.getElementById('quiz-staff');
        const dimensions = [];
        for (const clef of ['treble', 'bass']) for (let fixture = 0; fixture < 8; fixture++) {
          const octave = clef === 'treble' ? 4 : 3;
          const tones = (fixture === 7 ? [0, 2, 4] : [fixture]).map(letter => makeTone(letter, 0, octave));
          host.innerHTML = renderStaff({ tones }, clef);
          const svg = host.querySelector('svg');
          const lines = [...svg.querySelectorAll(':scope > .staff__line')];
          const lineGap = lines[1].getBoundingClientRect().y - lines[0].getBoundingClientRect().y;
          const headWidth = svg.querySelector('.staff__head').getBoundingClientRect().width;
          dimensions.push({ clef, fixture, lineGap, headWidth });
        }
        return dimensions;
      });
      for (let fixture = 0; fixture < 8; fixture++) {
        const treble = dimensions[fixture], bass = dimensions[fixture + 8];
        assert.ok(Math.abs(treble.lineGap - bass.lineGap) < 0.1, `${label}: staff spacing differs ${JSON.stringify({ treble, bass })}`);
        assert.ok(Math.abs(treble.headWidth - bass.headWidth) < 0.1, `${label}: notehead sizes differ`);
      }
      const bounds = await page.evaluate(async () => {
        const { renderStaff } = await import('./js/staff.js');
        const { makeTone } = await import('./js/notes.js');
        const out = [];
        for (const [clef, octaves] of [['treble', [3, 6]], ['bass', [1, 4]]]) for (const octave of octaves) for (const letter of [0, 6]) {
          document.getElementById('quiz-staff').innerHTML = renderStaff({ tones: [makeTone(letter, 0, octave)] }, clef);
          const svg = document.querySelector('#quiz-staff svg'), box = svg.getBBox(), view = svg.viewBox.baseVal;
          out.push({ clef, octave, letter, inside: box.x >= view.x && box.y >= view.y && box.x + box.width <= view.x + view.width && box.y + box.height <= view.y + view.height });
        }
        return out;
      });
      assert.ok(bounds.every(b => b.inside), `${label}: extreme notes clipped ${JSON.stringify(bounds)}`);
      if (width === 1280 && input === 'midi' && theme === 'nocturne') {
        for (const clef of ['treble', 'bass']) {
          await page.evaluate(async clef => {
            const { renderStaff } = await import('./js/staff.js');
            const { makeTone } = await import('./js/notes.js');
            document.getElementById('quiz-staff').innerHTML = renderStaff({ tones: [makeTone(0, 0, clef === 'treble' ? 4 : 3)] }, clef);
            document.getElementById('clef-label').textContent = `${clef === 'treble' ? 'Treble' : 'Bass'} clef`;
          }, clef);
          await page.screenshot({ path: `docs/images/quiz-scale-${clef}-tablet.png` });
        }
      }
      await page.locator('#pause-button').tap();
      await page.locator('#resume-button').tap();
      report.checks.push(`${label}: equal staff spacing and notehead sizes for seven notes and a chord, extreme notes fit, Pause/Resume works`);
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  console.log(`${report.checks.length} staff scale checks passed`);
} catch (error) {
  report.result = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`docs/${process.env.PIANO_URL ? 'live-' : ''}staff-scale.json`, JSON.stringify(report, null, 2) + '\n');
}
