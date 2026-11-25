const cacheName = 'english-on-air-v1';
const assets = [
  './', './index.html', './style.css', './episodes.js', './timestamps.js', './app.js',
  './hero.jpg', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  './audio/coffee.mp3', './audio/meeting.mp3', './audio/airport.mp3',
  './audio/plans.mp3', './audio/deadline.mp3', './audio/hotel.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith('english-on-air-') && key !== cacheName);
    await Promise.all(old.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function audioRange(response, header) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  const data = await response.arrayBuffer();
  const size = data.byteLength;
  const [, first, last] = match || [];
  const start = first ? Number(first) : Math.max(0, size - Number(last));
  const end = first && last ? Math.min(Number(last), size - 1) : size - 1;
  if (!match || (!first && !last) || start > end || start >= size) {
    return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
  }
  return new Response(data.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (request.mode === 'navigate') {
      try { return await fetch(request); }
      catch { return cache.match('./index.html'); }
    }
    const cached = await cache.match(request);
    if (!cached) return fetch(request);
    const range = request.headers.get('Range');
    return range && new URL(request.url).pathname.endsWith('.mp3') ? audioRange(cached, range) : cached;
  })());
});
