/* ============================================================
   sw.js — LifeHack Health Engine Service Worker
   Uses /health-engine.json (YOUR schema)
   ============================================================ */

const ENGINE_URL = "/health-engine.json";

let ENGINE = null;
let CACHE_NAME = "health-cache-v1"; // fallback
let PRECACHE = [];
let DYNAMIC_PREFIXES = [];
let STRATEGY = "cache-first";
let OFFLINE_FALLBACK = "/index.html";

/* -----------------------------
   Helpers
------------------------------ */
const log = (...a) => console.log("[SW]", ...a);
const warn = (...a) => console.warn("[SW]", ...a);

function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function moduleList(modulesObj) {
  return Object.values(modulesObj || {}).filter(Boolean);
}

async function loadEngine() {
  try {
    const res = await fetch(ENGINE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    ENGINE = await res.json();
  } catch (e) {
    warn("Failed to load health-engine.json; using fallback config.", e.message);
    ENGINE = {
      engine: { offline: true },
      cache: {
        strategy: "cache-first",
        version: "health-cache-v1",
        core: ["/", "/index.html", "/style.css", "/script.js", "/health-engine.json"],
        dynamic: ["/"]
      },
      routing: { routes: { "/": "/index.html" } },
      modules: {}
    };
  }

  STRATEGY = ENGINE.cache?.strategy || "cache-first";
  CACHE_NAME = ENGINE.cache?.version || "health-cache-v1";
  DYNAMIC_PREFIXES = ENGINE.cache?.dynamic || [];

  // Optional override if you add it later:
  OFFLINE_FALLBACK = ENGINE.cache?.offlineFallback || "/index.html";

  // Build precache list:
  // - cache.core
  // - enabled module paths + assets
  // - routing targets
  const precacheSet = new Set([...(ENGINE.cache?.core || [])]);

  // Modules: add module.path + module.assets
  moduleList(ENGINE.modules).forEach((m) => {
    if (m.enabled === false) return;
    if (m.path) precacheSet.add(m.path);
    (m.assets || []).forEach((a) => precacheSet.add(a));
  });

  // Routing: add all route targets
  const routes = ENGINE.routing?.routes || {};
  Object.values(routes).forEach((target) => precacheSet.add(target));

  // Ensure engine file is cached too
  precacheSet.add("/health-engine.json");

  PRECACHE = uniq([...precacheSet]);

  log("Engine loaded:", { CACHE_NAME, STRATEGY, PRECACHE_COUNT: PRECACHE.length, DYNAMIC_PREFIXES });
}

/* -----------------------------
   Install
------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await loadEngine();

      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);

      log("Installed + precached:", PRECACHE.length, "files");
      self.skipWaiting();
    })()
  );
});

/* -----------------------------
   Activate
------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Ensure engine is loaded for this SW instance
      if (!ENGINE) await loadEngine();

      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            log("Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
      log("Activated");
    })()
  );
});

/* -----------------------------
   Fetch Strategies
------------------------------ */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  if (res && res.ok) await maybePutRuntime(cache, request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) await maybePutRuntime(cache, request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("network-first: offline and not cached");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (res) => {
      if (res && res.ok) await maybePutRuntime(cache, request, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || Promise.reject(new Error("swr: offline and not cached"));
}

/* -----------------------------
   Runtime caching rules
   - Always cache if request is under dynamic prefixes
   - Also cache same-origin GETs for assets (css/js/json/images)
------------------------------ */
function urlPath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

function shouldRuntimeCache(request) {
  const url = new URL(request.url);

  // Only cache same-origin
  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;

  // Dynamic prefix match
  if (Array.isArray(DYNAMIC_PREFIXES) && DYNAMIC_PREFIXES.some((p) => path.startsWith(p))) {
    return true;
  }

  // Typical static assets
  return (
    path.endsWith(".css") ||
    path.endsWith(".js") ||
    path.endsWith(".json") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".webp") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico") ||
    path.endsWith(".woff2")
  );
}

async function maybePutRuntime(cache, request, response) {
  if (!shouldRuntimeCache(request)) return;
  await cache.put(request, response);
}

/* -----------------------------
   Fetch Handler
------------------------------ */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      // If engine hasn't loaded yet, attempt it (don’t block too long)
      if (!ENGINE) {
        try { await loadEngine(); } catch {}
      }

      try {
        // Navigation: keep it resilient offline
        if (isNavigationRequest(request)) {
          // Prefer strategy for HTML too, but always provide fallback
          let res;
          if (STRATEGY === "network-first") res = await networkFirst(request);
          else if (STRATEGY === "stale-while-revalidate") res = await staleWhileRevalidate(request);
          else res = await cacheFirst(request);

          return res;
        }

        // Assets / API / JSON
        if (STRATEGY === "network-first") return await networkFirst(request);
        if (STRATEGY === "stale-while-revalidate") return await staleWhileRevalidate(request);
        return await cacheFirst(request);
      } catch (e) {
        // Offline fallback for navigation
        if (isNavigationRequest(request)) {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match(OFFLINE_FALLBACK) || await cache.match("/index.html");
          if (fallback) return fallback;
        }
        throw e;
      }
    })()
  );
});

/* -----------------------------
   Messages
------------------------------ */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();

  // Optional: allow manual cache refresh
  if (event.data === "UV_REFRESH_ENGINE") {
    event.waitUntil(
      (async () => {
        await loadEngine();
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE);
        log("Engine refreshed + cache warmed.");
      })()
    );
  }
});
