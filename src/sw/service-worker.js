// Service worker for the app shell. It makes Splitti start like an installed
// app, also without a connection: the shell (HTML, scripts, styles, icons) is
// kept on the device. Data is never kept: everything below /api/ always goes
// to the server, so capturing and saving need the connection (see docs/PLAN.md).
//
// __VERSION__ is replaced at build time; a new build gets a new cache and
// removes the old one.

const CACHE = 'splitti-__VERSION__';
const SHELL = '/';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('splitti-') && key !== CACHE)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

// The page tells which files it loaded before the service worker was in
// charge, so the very first visit already leaves a complete shell behind.
self.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.type !== 'cache-shell' || !Array.isArray(data.urls)) return;
    const urls = data.urls.filter((url) => typeof url === 'string' && isShellFile(new URL(url)));
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) =>
                Promise.all(
                    urls.map((url) =>
                        cache
                            .match(url)
                            .then((hit) => hit ?? cache.add(url).catch(() => undefined)),
                    ),
                ),
            ),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    // Data: always from the server, never from the device.
    if (url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(shell(request));
    } else if (isShellFile(url)) {
        event.respondWith(shellFile(request));
    }
});

function isShellFile(url) {
    return (
        url.origin === self.location.origin &&
        (url.pathname.startsWith('/_astro/') ||
            url.pathname.startsWith('/icons/') ||
            url.pathname === '/favicon.svg' ||
            url.pathname === '/manifest.webmanifest')
    );
}

/** Pages: fresh from the server when it is reachable, otherwise the kept shell. */
async function shell(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        // Every app path is served the same shell, so one copy stands for all.
        if (response.ok && (response.headers.get('content-type') ?? '').includes('text/html')) {
            cache.put(SHELL, response.clone());
        }
        return response;
    } catch (error) {
        const kept = await cache.match(SHELL);
        if (kept) return kept;
        throw error;
    }
}

/** Scripts, styles and icons: their names change with their content, so a kept copy is always right. */
async function shellFile(request) {
    const cache = await caches.open(CACHE);
    const kept = await cache.match(request);
    if (kept) return kept;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}
