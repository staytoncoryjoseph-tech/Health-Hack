/* ============================================================
   Health Hack OS — Service Worker
   Powered by health-engine.json
   ============================================================ */

const ENGINE_URL = "/health-engine.json";

let ENGINE = {
  version: "dev",
  cacheName: "health-hack-cache",
  precache: [],
  runtimeCache: []
};

/* ------------------------------------------------------------
   Load Health Engine Config
------------------------------------------------------------ */
async function loadEngine() {
  try {
    const res = await fetch(ENGINE_URL, { cache: "no-store" });
    ENGINE = await res.json();

    ENGINE.cacheName = `${ENGINE.cacheName || "health-hack"}-${ENGINE.version || "v1"}`;

    console.log("[SW] Health Engine Loaded:", ENGINE);
  } catch (err) {
    console.warn("[SW] Failed to load health-engine.json", err);
  }
}

/* ------------------------------------------------------------
   INSTALL
------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await loadEngine();

      const cache = await caches.open(ENGINE.cacheName);

      if (Array.isArray(ENGINE.precache)) {
        await cache.addAll(ENGINE.precache);
        console.log("[SW] Precached:", ENGINE.precache);
      }

      self.skipWaiting();
    })()
  );
});

/* ------------------------------------------------------------
   ACTIVATE
------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {
          if (key !== ENGINE.cacheName) {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
    })()
  );
});

/* ------------------------------------------------------------
   FETCH
------------------------------------------------------------ */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(ENGINE.cacheName);

      // Cache-first for precached assets
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const network = await fetch(request);

        // Runtime caching rules
        if (shouldRuntimeCache(request.url)) {
          cache.put(request, network.clone());
        }

        return network;
      } catch (err) {
        // Offline fallback
        if (ENGINE.offlineFallback) {
          const fallback = await cache.match(ENGINE.offlineFallback);
          if (fallback) return fallback;
        }

        throw err;
      }
    })()
  );
});

/* ------------------------------------------------------------
   Runtime Cache Rules
------------------------------------------------------------ */
function shouldRuntimeCache(url) {
  if (!Array.isArray(ENGINE.runtimeCache)) return false;

  return ENGINE.runtimeCache.some(rule => {
    if (!rule.pattern) return false;
    return new RegExp(rule.pattern).test(url);
  });
}

/* ------------------------------------------------------------
   Messages (optional control)
------------------------------------------------------------ */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
