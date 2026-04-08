// PilotOS Service Worker — v1
// Fase de test: solo precaching del shell. Sin estrategia offline compleja aún.

const CACHE_NAME = 'pilotos-shell-v1';

const SHELL_URLS = [
  '/conductor',
  '/login',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentar cachear el shell; si falla, no bloquea la instalación
      return Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API y uploads: siempre red (no cachear datos dinámicos)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Estrategia Network-first para el resto: intenta red, cae a caché si offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Solo cachear respuestas ok y de tipo básico
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
