// Service Worker: macht die App offline-fähig.
// Strategie: unveränderliche Schriften (vendor/fonts/) kommen cache-first, also ohne
// Netzwerk-Wartezeit; App-Dateien network-first mit Cache-Fallback — Updates kommen sofort an,
// ohne Netz (z.B. Turnhalle) läuft die zuletzt geladene Version weiter.
const CACHE_NAME = 'klassenmanager-v6';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './core.js',
    './app.js',
    './theme.js',
    './manifest.webmanifest',
    './icon.svg',
    './icons/icon-192.png',
    './icons/apple-touch-icon.png',
    './vendor/tailwind.css',
    './vendor/fontawesome/css/icons.min.css',
    './vendor/fontawesome/webfonts/fa-solid-subset.woff2',
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
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.includes('/vendor/fonts/')) {
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
