const CACHE = 'piano-quiz-__BUILD__';
const CORE = __CORE__;
const AUDIO = ['A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6'].map(name => `./audio/${name}.mp3`);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE.map(async path => {
    const response = await fetch(new Request(path, { cache: 'reload' }));
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    await cache.put(path, new Response(await response.arrayBuffer(), { status: 200, headers }));
  }));
  await Promise.allSettled(AUDIO.map(path => cache.add(path)));
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith('piano-quiz-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data === 'activate') event.waitUntil(self.skipWaiting());
  if (event.data === 'status') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const audio = await Promise.all(AUDIO.map(path => cache.match(path)));
    event.ports[0]?.postMessage({ ready: true, audioReady: audio.every(Boolean) });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, { ignoreSearch: true });
    if (hit) return hit;
    if (event.request.mode === 'navigate' && url.pathname === '/') return await cache.match('./index.html') || fetch(event.request);
    const response = await fetch(event.request);
    if (response.ok && url.pathname.startsWith('/audio/')) await cache.put(event.request, response.clone());
    return response;
  })());
});
