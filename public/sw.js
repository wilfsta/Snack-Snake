/*
 * Lets Snack Snake work offline once it has been opened (in the car, on a plane...).
 *
 *  - The page itself is fetched from the network first, so a new version arrives as soon as
 *    there is a connection; offline, the last copy is used.
 *  - Everything else (scripts, styles, fonts, icons) has a unique name per build, so it is
 *    served from the cache once fetched, and a new build simply fetches new files.
 *
 * Only same-origin GET requests are handled. Children's progress is not involved: it lives in
 * the browser's own storage, not in this cache.
 */
const CACHE = 'snack-snake-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(self.registration.scope, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
