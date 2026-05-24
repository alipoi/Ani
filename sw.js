var CACHE = 'ani-v1';
var PRECACHE = [
  '/',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).then(function(res) {
        if (res && res.ok && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
