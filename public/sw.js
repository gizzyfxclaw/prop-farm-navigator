const CACHE_NAME = "gizzyfx-v8";
const ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-192.png",
  "/favicon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 1. Never touch non-GET requests (POST, PATCH, PUT, DELETE, OPTIONS)
  if (method !== "GET") return;

  // 2. Never intercept API/auth/cron endpoints — they must hit the server
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/events") ||
    url.pathname.startsWith("/api/news") ||
    url.pathname.startsWith("/api/hermes/") ||
    url.pathname.startsWith("/api/smc")
  ) {
    return; // let the browser handle it normally (no SW involvement)
  }

  // 3. For ALL navigations (SPA routes), always serve index.html from cache/network
  //    so the SPA router can handle the route — this avoids the redirect error
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("/").then((cached) => {
        // Always try network first for navigations, fall back to cache
        return fetch(event.request)
          .then((response) => {
            // Cache the response if it's a 200 OK page
            if (response.ok && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached || Response.error());
      })
    );
    return;
  }

  // 4. For static assets (JS, CSS, images, fonts): cache-first, then network
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname.match(/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response.ok && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  // 5. For everything else (e.g., manifest, root), pass through to network
  //    without caching — avoids the redirect error entirely
});
