import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const origin = 'https://piano-quiz.test/';
const script = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const files = ['./', './index.html', './js/app.js'];

function worker({ missingAudio = false, missingCore = false } = {}) {
  const events = new Map(), data = new Map(), fetches = [];
  let claimed = 0, activated = 0;
  const url = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const fetcher = async request => {
    fetches.push(url(request));
    const path = new URL(url(request)).pathname;
    if ((missingAudio && path.endsWith('.mp3')) || (missingCore && path === '/js/app.js')) return new Response('', { status: 404 });
    return new Response(path, { headers: { 'content-type': 'text/plain' } });
  };
  const caches = {
    async open(key) {
      if (!data.has(key)) data.set(key, new Map());
      const entries = data.get(key);
      return {
        async put(request, response) { entries.set(url(request), response); },
        async match(request) { return entries.get(url(request))?.clone(); },
        async add(request) { const response = await fetcher(request); if (!response.ok) throw Error('missing'); entries.set(url(request), response); },
      };
    },
    async keys() { return [...data.keys()]; },
    async delete(key) { return data.delete(key); },
  };
  const self = { addEventListener: (name, handler) => events.set(name, handler), location: { origin: new URL(origin).origin }, clients: { async claim() { claimed++; } }, async skipWaiting() { activated++; } };
  class RelativeRequest extends Request { constructor(path, options) { super(new URL(path, origin), options); } }
  vm.runInNewContext(script.replace('__BUILD__', 'test').replace('__CORE__', JSON.stringify(files)), { self, caches, Request: RelativeRequest, Response, Headers, URL, fetch: fetcher });
  async function dispatch(name, extra = {}) {
    const pending = [];
    events.get(name)({ waitUntil: promise => pending.push(promise), respondWith: promise => pending.push(promise), ...extra });
    return Promise.all(pending);
  }
  return { events, caches, data, fetches, dispatch, get claimed() { return claimed; }, get activated() { return activated; } };
}

test('offline installation caches core files and optional samples without forcing activation', async () => {
  const sw = worker();
  await sw.dispatch('install');
  const cache = await sw.caches.open('piano-quiz-test');
  assert.ok(await cache.match('./index.html'));
  assert.ok(await cache.match('./audio/C4.mp3'));
  assert.equal(sw.activated, 0);
  let status;
  await sw.dispatch('message', { data: 'status', ports: [{ postMessage: value => status = value }] });
  assert.equal(status.audioReady, true);
});

test('missing optional piano samples do not fail offline installation', async () => {
  const sw = worker({ missingAudio: true });
  await sw.dispatch('install');
  let status;
  await sw.dispatch('message', { data: 'status', ports: [{ postMessage: value => status = value }] });
  assert.equal(status.ready, true);
  assert.equal(status.audioReady, false);
});

test('a missing core module rejects the new cache installation', async () => {
  await assert.rejects(worker({ missingCore: true }).dispatch('install'), /app.js/);
});

test('activation only deletes this app’s old caches and claims clients', async () => {
  const sw = worker();
  await sw.caches.open('random-piano-practice-old');
  await sw.caches.open('piano-quiz-old');
  await sw.dispatch('install');
  await sw.dispatch('activate');
  assert.equal(sw.claimed, 1);
  assert.ok(sw.data.has('random-piano-practice-old'));
  assert.ok(!sw.data.has('piano-quiz-old'));
  assert.ok(sw.data.has('piano-quiz-test'));
});

test('only an explicit activation message releases a waiting update', async () => {
  const sw = worker();
  await sw.dispatch('message', { data: 'unrelated' });
  assert.equal(sw.activated, 0);
  await sw.dispatch('message', { data: 'activate' });
  assert.equal(sw.activated, 1);
});

test('cached runtime files are returned without another fetch; foreign requests are ignored', async () => {
  const sw = worker();
  await sw.dispatch('install');
  const before = sw.fetches.length;
  const [response] = await sw.dispatch('fetch', { request: new Request(new URL('./js/app.js', origin)) });
  assert.equal(await response.text(), '/js/app.js');
  assert.equal(sw.fetches.length, before);
  const ignored = await sw.dispatch('fetch', { request: new Request('https://example.com/') });
  assert.equal(ignored.length, 0);
});

test('the built service worker parses, manifest assets exist, and the build excludes development data', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url)));
  for (const icon of manifest.icons) assert.ok((await stat(new URL('../dist/' + icon.src, import.meta.url))).size > 0);
  const builtSW = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(builtSW, /__BUILD__|__CORE__/);
  assert.doesNotThrow(() => new vm.Script(builtSW));
  assert.doesNotMatch(builtSW, /node_modules|tests\/|tools\/|\.wrangler|package-lock/);
  assert.match(builtSW, /\.\/js\/storage.js/);
  assert.match(builtSW, /\.\/icons\/icon-192.png/);
});
