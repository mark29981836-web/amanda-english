const CACHE="amanda-english-github-5fd83684dc";
const CORE=["./","./index.html","./style.css","./app.js","./words.json","./manifest.webmanifest","./icon-192.svg","./icon-512.svg","./chunk-1.js","./chunk-2.js","./chunk-3.js","./chunk-4.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(e.request.method==="GET"&&r.ok){const x=r.clone();caches.open(CACHE).then(k=>k.put(e.request,x));}return r;})));});
