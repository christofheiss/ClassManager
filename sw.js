// Service Worker: macht die App offline-fähig.
// Strategie: unveränderliche Bibliotheken/Schriften (vendor/, Icons) kommen cache-first, also ohne
// Netzwerk-Wartezeit; App-Dateien network-first mit Cache-Fallback — Updates kommen sofort an,
// ohne Netz (z.B. Turnhalle) läuft die zuletzt geladene Version weiter.
const CACHE_NAME = 'klassenmanager-v4';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './core.js',
    './app.js',
    './manifest.webmanifest',
    './icon.svg',
    './vendor/tailwind.css',
    './vendor/fontawesome/css/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './vendor/fonts/inter-latin-400-normal.woff2',
    './vendor/fonts/inter-latin-500-normal.woff2',
    './vendor/fonts/inter-latin-600-normal.woff2',
    './vendor/fonts/inter-latin-700-normal.woff2',
    './vendor/fonts/inter-latin-800-normal.woff2'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    const url = new URL(req.url);
    if (url.pathname.includes('/vendor/') && !url.pathname.endsWith('/vendor/tailwind.css')) {
        event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
            if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy)); }
            return res;
        })));
        return;
    }
    event.respondWith(
        fetch(req)
            .then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req, { ignoreSearch: true }))
    );
});
