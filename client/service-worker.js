const CACHE='cbg-cache-v2';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))));self.clients.claim();});

async function networkFirst(req){
  try{ const fresh=await fetch(req,{cache:'no-store'}); const c=await caches.open(CACHE); c.put(req, fresh.clone()); return fresh; }
  catch{ const cached=await caches.match(req); if(cached) return cached; throw new Error('Network and cache both failed'); }
}

async function cacheFirst(req){
  const cached=await caches.match(req); if(cached) return cached; const fresh=await fetch(req); const c=await caches.open(CACHE); c.put(req, fresh.clone()); return fresh;
}

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return;

  const dest=e.request.destination;
  if(e.request.mode==='navigate' || dest==='document'){
    e.respondWith(networkFirst(e.request)); return;
  }
  if(dest==='script' || dest==='style' || u.pathname.endsWith('/app.js') || u.pathname.endsWith('/index.html')){
    e.respondWith(networkFirst(e.request)); return;
  }
  e.respondWith(cacheFirst(e.request));
});
