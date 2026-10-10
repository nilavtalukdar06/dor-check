// Travel Trap Detector service worker.
// Caches only the offline page and immutable static assets. Page HTML, /api
// and anything authenticated always go to the network, so signed-in data is
// never stored on the device.
// Bumping this drops every cache an older worker wrote (activate deletes other ttd- caches).
const VERSION = "v2";
const STATIC_CACHE = `ttd-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/icon-192.png", "/icon-512.png"];

// Only files the server marks immutable (production's content-hashed /_next/static
// files) are ever stored. `next dev` serves the same chunk URLs with changing content
// and no-store, so a cache-first copy would run stale code against fresh server HTML.
function isImmutable(res) {
  return res.ok && /\bimmutable\b/.test(res.headers.get("cache-control") ?? "");
}

async function cacheImmutable(cache, request) {
  const res = await fetch(request);
  if (isImmutable(res)) await cache.put(request, res.clone());
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);

      // Cache the offline page together with the assets it needs to render.
      const res = await fetch(OFFLINE_URL, { cache: "reload" });
      if (!res.ok) throw new Error("offline page unavailable");
      const html = await res.clone().text();
      await cache.put(OFFLINE_URL, res);
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
      await Promise.all(
        [...assets].map((url) => cacheImmutable(cache, url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("ttd-") && k !== STATIC_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || /^\/icon-.*\.png$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__clerk")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        return cacheImmutable(cache, request);
      })(),
    );
  }
});
