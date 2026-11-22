const CACHE_NAME = "bot-p2p-shell-v2";
const PRECACHE_URLS = [
  "/offline.html",
  "/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo interceptar peticiones GET del mismo origen
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // REGLA CRÍTICA: Jamás cachear APIs (/api/*), autenticación ni datos en vivo de Binance
  if (url.pathname.startsWith("/api/")) return;

  // Navegaciones de página: siempre ir a red (sin cachear HTML autenticado),
  // mostrando /offline.html únicamente si el teléfono pierde internet.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedOffline = await caches.match("/offline.html");
        if (cachedOffline) return cachedOffline;
        return new Response("Sin conexión a internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
    return;
  }

  // Íconos estáticos y página offline: cache-first con fallback a red
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/offline.html"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              const clone = networkResponse.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone))
                .catch(() => {});
            }
            return networkResponse;
          })
      )
    );
  }
});
