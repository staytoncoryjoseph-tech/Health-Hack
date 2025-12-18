/* =========================================================
   Health-Hack Service Worker (PWA) — Engine-driven caching
   - Reads /health-engine.json
   - Caches core + enabled module assets
   - Cache-first for static, network-first for HTML navigations
   - Safe for GitHub Pages subpath (e.g. /Health-Hack/)
========================================================= */

const SW_VERSION = "hh-sw-v1.0.0";
const ENGINE_URL = "./health-engine.json"; // relative to SW scope (root)
const CORE_FALLBACK = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./app.js",
  "./uv.js",
  "./health-engine.json"
];

// --- helpers ---
const log = (...a) => console.log("[SW]", ...a);

function sameOrigin(reqUrl) {
  try {
    const u = new URL(reqUrl);
    return u.origin === self.location.origin;
  } catch {
    return false;
  }
}

function isHTMLRequest(req) {
  const accept = req.headers.get("accept") || "";
  return req.mode === "navigate" || accept.includes("text/html");
}

function normalizePath(p) {
  // ensure it starts with "./" (cache keys consistent in GH Pages)
  if (!p) return null;
  if (p.startsWith("http")) return p;
  if (p.startsWith("/")) return "." + p;
  if (p.startsWith("./")) return p;
  return "./" + p;
}

async function fetchEngine() {
  const res = await fetch(ENGINE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("health-engine.json fetch failed");
  return res.json();
}

function collectEngineAssets(engineJson) {
  const assets = new Set();

  // core
  (engineJson?.cache?.core || []).forEach((p) => assets.add(normalizePath(p)));
  (engineJson?.cache?.dynamic || []).forEach((p) => assets.add(normalizePath(p)));

  // modules
  const modules = engineJson?.modules || {};
  for (const key of Object.keys(modules)) {
    const m = modules[key];
    if (!m || m.enabled === false) continue;

    if (m.path) assets.add(normalizePath(m.path));
    (m.assets || []).forEach((p) => assets.add(normalizePath(p)));
  }

  // fallback essentials
  CORE_FALLBACK.forEach((p) => assets.add(normalizePath(p)));

  // clean nulls
  return Array.from(assets).filter(Boolean);
}

async function precacheAll() {
  let assets = [...CORE_FALLBACK];

  try {
    const engine = await fetchEngine();
    assets = collectEngineAssets(engine);
    log("Engine precache assets:", assets);
  } catch (e) {
    log("Engine load failed, using CORE_FALLBACK only.", e);
    assets = CORE_FALLBACK.map(normalizePath);
  }

  const cache = await caches.open(SW_VERSION);
  await cache.addAll(assets);
  return assets.length;
}

// --- lifecycle ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const count = await precacheAll();
      log("Installed. Cached items:", count);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === SW_VERSION ? null : caches.delete(k)))
      );
      await self.clients.claim();
      log("Activated. Old caches cleared.");
    })()
  );
});

// optional: allow page to tell SW to refresh cache after updates
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SW_REFRESH_CACHE") {
    event.waitUntil(
      (async () => {
        log("Refreshing cache by request…");
        await caches.delete(SW_VERSION);
        await precacheAll();
        log("Cache refreshed.");
      })()
    );
  }
});

// --- fetch strategies ---
async function cacheFirst(req) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const res = await fetch(req);
  // only cache same-origin GETs
  if (req.method === "GET" && sameOrigin(req.url) && res.ok) {
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirstHTML(req) {
  const cache = await caches.open(SW_VERSION);

  try {
    const res = await fetch(req);
    if (req.method === "GET" && sameOrigin(req.url) && res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    // fallback to cached page or index
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    const fallback = await cache.match("./index.html");
    if (fallback) return fallback;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain" }
    });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // only handle GET
  if (req.method !== "GET") return;

  // only same-origin (keeps SW from messing with CDNs)
  if (!sameOrigin(req.url)) return;

  // HTML navigations should be network-first so updates show
  if (isHTMLRequest(req)) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // everything else: cache-first
  event.respondWith(cacheFirst(req));
});
