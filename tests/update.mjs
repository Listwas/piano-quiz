import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.BROWSER || 'chromium';
const root = resolve('dist');
const version = JSON.parse(await readFile(resolve(root, 'version.json'), 'utf8')).version;
const report = { engine, build: version, testedAt: new Date().toISOString(), checks: [], errors: [] };
let updated = false;
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let body = await readFile(path);
    if (updated && url.pathname === '/sw.js') body = Buffer.from(body.toString().replace(`piano-quiz-${version}`, `piano-quiz-${version}-update-test`));
    response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let page;
try {
  browser = await { chromium, firefox, webkit }[engine].launch({ headless: true, ...(engine === 'chromium' ? { executablePath: '/usr/bin/chromium', args: ['--mute-audio'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.locator('#update-notice').waitFor({ state: 'hidden' });
  report.checks.push('first install activates without offering a stale update prompt');
  await page.locator('#start-button').click();
  await page.locator('#unknown-button').click();
  await page.locator('#pause-button').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pianoQuiz.state.v1')));
  updated = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.locator('#update-notice').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#quiz-staff .staff--wrong').count(), 1);
  report.checks.push('new service worker waits and offers Update without interrupting feedback');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.locator('#update-button').click()]);
  await page.locator('#start-button').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pianoQuiz.state.v1')));
  assert.equal(after.active.id, before.active.id);
  assert.equal(after.active.current.id, before.active.current.id);
  assert.equal(after.active.answers.length, before.active.answers.length);
  assert.deepEqual(after.history, before.history);
  assert.equal(await page.locator('#quiz-staff .staff--wrong').count(), 1);
  report.checks.push('explicit update reloads with the same round, correction, and learning history');
  const caches = await page.evaluate(() => window.caches.keys());
  assert.ok(caches.includes(`piano-quiz-${version}-update-test`));
  assert.ok(!caches.includes(`piano-quiz-${version}`));
  report.checks.push('activated update replaces the old app cache');
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  console.log(`${engine}: ${report.checks.length} real service-worker update checks passed`);
} catch (error) {
  report.result = 'failed';
  report.failure = error.stack;
  if (page && !page.isClosed()) {
    report.diagnostics = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { url: location.href, controller: navigator.serviceWorker.controller?.state, active: registration?.active?.state, waiting: registration?.waiting?.state, installing: registration?.installing?.state, updateVisible: !document.getElementById('update-notice').hidden, paused: !document.getElementById('paused-panel').hidden, homeVisible: !document.getElementById('home-screen').hidden };
    }).catch(() => null);
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(`docs/update-${engine}.json`, JSON.stringify(report, null, 2) + '\n');
}
