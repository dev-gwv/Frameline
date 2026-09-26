/* Frameline gallery service worker (hand-written, no build step).
 * - App shell: cached on install; navigations are network-first and fall back to the cached shell offline.
 * - Built assets (/assets/*, hashed): cache-first.
 * - Photo renditions and fonts: cache-first with a size cap, so photos a guest has viewed open offline.
 * Bump VERSION to drop old caches. Registered only in production builds (src/lib/pwa.ts).
 */
const VERSION = 'v1'
const SHELL = `fl-shell-${VERSION}`
const ASSETS = `fl-assets-${VERSION}`
const PHOTOS = `fl-photos-${VERSION}`
const PHOTO_LIMIT = 300
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, PHOTOS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cacheName, max) {
  const c = await caches.open(cacheName)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName)
  const hit = await c.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok || res.type === 'opaque') {
    c.put(req, res.clone())
    if (max) trim(cacheName, max)
  }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(SHELL).then((c) => c.put('/index.html', res.clone())); return res })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(req, ASSETS))
    return
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, ASSETS))
    return
  }
  if (req.destination === 'image') {
    e.respondWith(cacheFirst(req, PHOTOS, PHOTO_LIMIT).catch(() => caches.match(req)))
  }
})

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting()
})
