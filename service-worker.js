const CACHE='cbg-cache-v3';
const ASSETS=[
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './favicon.ico',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        // Add all assets to cache
        return cache.addAll(ASSETS);
      })
      .catch(err => {
        console.error('Failed to cache assets during install:', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    // Cache the response if it's successful
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // If network fails, try cache
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error('Network and cache both failed: ' + err.message);
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  
  try {
    const fresh = await fetch(req);
    // Cache the response if it's successful
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    throw new Error('Failed to fetch and cache: ' + err.message);
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // Skip requests to external origins
  if (url.origin !== location.origin) return;
  
  // For navigation requests, use network first
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(networkFirst(e.request));
    return;
  }
  
  // For scripts and styles, use network first
  if (
    e.request.destination === 'script' || 
    e.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  
  // For other assets, try cache first
  e.respondWith(cacheFirst(e.request));
});
