const CACHE_NAME = "gizzyfx-v9";
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
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 1. Never touch non-GET requests
  if (method !== "GET") return;

  // 2. Never intercept API/auth/cron endpoints
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/events") ||
    url.pathname.startsWith("/api/news") ||
    url.pathname.startsWith("/api/hermes/") ||
    url.pathname.startsWith("/api/smc")
  ) {
    return;
  }

  // 3. For ALL navigations, always serve index.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("/").then((cached) => {
        return fetch(event.request)
          .then((response) => {
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

  // 4. For static assets: network first (always get fresh), fall back to cache
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname.match(/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || Response.error()))
    );
    return;
  }
});
