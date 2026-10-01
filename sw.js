const CACHE = 'events-app-v2';
const APP_SHELL = [
  '/', '/index.html', '/style.css', '/script.js', '/notifications.js',
  '/profile-enhancements.js', '/config.js', '/manifest.webmanifest',
  '/favicon.svg', '/icons/app-192.png', '/icons/app-512.png', '/icons/app-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('events-app-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});

self.addEventListener('push', event => {
  let data = { title: 'Події поруч', body: 'Нова активність поруч', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icons/app-192.png', badge: '/favicon.svg', data: { url: data.url }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'));
});
