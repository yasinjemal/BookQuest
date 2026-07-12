/* BookQuest service worker.
   - API GETs: network-first, cache fallback → always fresh online, still works offline.
   - Pages & static assets: stale-while-revalidate → instant loads.
   Course data therefore plays offline once it has been viewed online. */
const CACHE = "bookquest-v4";
const PRECACHE = [
  "/",
  "/explore",
  "/classes",
  "/review",
  "/profile",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // uploads/completions need the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // Network-first: fresh data online, last-known data offline
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error("offline and not cached");
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for pages and assets
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
