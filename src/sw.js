/*
 * Lets Snack Snake work offline once it has been opened (in the car, on a plane...).
 *
 *  - The page itself is fetched from the network first, so a new version arrives as soon as
 *    there is a connection; offline, the last copy is used.
 *  - Everything else (scripts, styles, fonts, icons) is stored when this version installs and
 *    served from the cache.
 *  - Each build gets its own cache; installing a new build deletes the old one, so files from
 *    past versions never pile up on the device.
 *
 * Not served as is: the build (vite.config.ts) fills in __BUILD__ and __FILES__.
 *
 * Only same-origin GET requests are handled. Children's progress is not involved: it lives in
 * the browser's own storage, not in this cache.
 */
const CACHE = 'snack-snake-__BUILD__';
/** This build's files, relative to the page. */
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  const requests = [scope, ...FILES.map((f) => new URL(f, scope).href)].map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(requests))
      .then(() => self.skipWaiting()),
  );
});

// Only this game's own old caches: other sites on the same address (every GitHub Pages project of
// one account shares wilfsta.github.io) keep theirs.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('snack-snake-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(self.registration.scope, copy));
          }
          return response;
        })
        .catch(() => caches.match(self.registration.scope).then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
