/* ============================================================
   uv.js — UV Engine Loader (LifeHack Health Engine)
   Reads: /health-engine.json (YOUR schema)
   ============================================================ */

(() => {
  const ENGINE_URL = "/health-engine.json";

  // ----------------- logging -----------------
  const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
  const ts = () => new Date().toISOString();

  function makeLogger(level = "info") {
    const L = LEVELS[level] ?? LEVELS.info;
    return {
      debug: (...a) => L >= 4 && console.log("[UV][debug]", ...a),
      info:  (...a) => L >= 3 && console.log("[UV]", ...a),
      warn:  (...a) => L >= 2 && console.warn("[UV][warn]", ...a),
      error: (...a) => L >= 1 && console.error("[UV][error]", ...a),
    };
  }

  // ----------------- tiny event bus -----------------
  const Events = {
    _map: new Map(),
    on(name, fn) {
      if (!this._map.has(name)) this._map.set(name, new Set());
      this._map.get(name).add(fn);
      return () => this._map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      (this._map.get(name) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error("[UV][event error]", name, e); }
      });
      // also dispatch DOM event (handy for vanilla apps)
      try {
        window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      } catch {}
    }
  };

  // ----------------- loaders -----------------
  const loadCSS = (href) =>
    new Promise((resolve, reject) => {
      // avoid duplicates
      if ([...document.styleSheets].some(ss => ss.href && ss.href.includes(href))) return resolve(href);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve(href);
      link.onerror = () => reject(new Error(`Failed CSS: ${href}`));
      document.head.appendChild(link);
    });

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      // avoid duplicates
      if ([...document.scripts].some(s => s.src && s.src.includes(src))) return resolve(src);

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error(`Failed JS: ${src}`));
      document.head.appendChild(s);
    });

  async function preloadJSON(url) {
    try {
      // fetch and discard body (warm cache)
      await fetch(url, { cache: "no-store" });
      return true;
    } catch {
      return false;
    }
  }

  function isCSS(p) { return /\.css(\?|#|$)/i.test(p); }
  function isJS(p)  { return /\.js(\?|#|$)/i.test(p); }
  function isJSON(p){ return /\.json(\?|#|$)/i.test(p); }

  // ----------------- core fetch -----------------
  async function fetchEngine() {
    const res = await fetch(ENGINE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`health-engine.json ${res.status} ${res.statusText}`);
    return res.json();
  }

  // ----------------- UV global -----------------
  const UV = (window.UV = window.UV || {});
  UV.events = UV.events || Events;

  // convenience router
  function setLocation(pathOrUrl) {
    // If it's a full URL, just go
    if (/^https?:\/\//i.test(pathOrUrl)) {
      window.location.href = pathOrUrl;
      return;
    }
    // Make sure it starts with /
    const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    window.location.href = p;
  }

  // module helper
  function moduleList(modulesObj) {
    return Object.values(modulesObj || {}).filter(Boolean);
  }

  function computeCachePlan(engineJson) {
    const cache = engineJson.cache || {};
    const modules = moduleList(engineJson.modules);

    // Build a unified precache list: cache.core + all enabled module assets + module path pages
    const precache = new Set([...(cache.core || [])]);

    modules.forEach((m) => {
      if (m.enabled === false) return;
      if (m.path) precache.add(m.path);
      (m.assets || []).forEach((a) => precache.add(a));
    });

    // Also add routing targets
    const routes = engineJson.routing?.routes || {};
    Object.values(routes).forEach((r) => precache.add(r));

    return {
      strategy: cache.strategy || "cache-first",
      version: cache.version || "health-cache-v1",
      precache: [...precache],
      dynamic: cache.dynamic || []
    };
  }

  async function registerServiceWorkerIfNeeded(engineJson, log) {
    const offlineEnabled = !!engineJson.engine?.offline;
    if (!offlineEnabled) {
      log.info("Offline disabled (engine.offline=false) — skipping SW register.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      log.warn("Service workers not supported in this browser.");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      log.info("Service Worker registered: /sw.js");

      // optional: upgrade flow
      if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        UV.events.emit("sw:controllerchange", { at: ts() });
      });
    } catch (e) {
      log.warn("SW registration failed:", e.message);
    }
  }

  async function loadModuleAssets(mod, log) {
    const assets = mod.assets || [];
    const results = [];

    // Order matters: CSS first, then JSON warm, then JS last
    const css = assets.filter(isCSS);
    const json = assets.filter(isJSON);
    const js  = assets.filter(isJS);
    const other = assets.filter(a => !isCSS(a) && !isJSON(a) && !isJS(a));

    for (const href of css) {
      await loadCSS(href);
      results.push({ type: "css", url: href });
    }

    // Warm JSON (optional)
    for (const url of json) {
      const ok = await preloadJSON(url);
      results.push({ type: "json", url, warmed: ok });
    }

    for (const src of js) {
      await loadScript(src);
      results.push({ type: "js", url: src });
    }

    // Just warn for unknown asset types
    for (const url of other) {
      log.warn("Unknown asset type (not css/js/json):", url);
      results.push({ type: "other", url });
    }

    return results;
  }

  function buildEmergencyMatcher(engineJson) {
    const kws = engineJson.safety?.emergencyKeywords || [];
    const normalized = kws.map(k => String(k).toLowerCase()).filter(Boolean);

    return (text) => {
      const t = String(text || "").toLowerCase();
      return normalized.some(k => t.includes(k));
    };
  }

  async function boot() {
    // fetch engine first (so we know log level)
    let json;
    try {
      json = await fetchEngine();
    } catch (e) {
      console.error("[UV] Engine load failed:", e);
      UV.events.emit("engine:error", { message: e.message, at: ts() });
      return;
    }

    const log = makeLogger(json.uv?.logLevel || "info");

    // normalize + expose state
    UV.engineRaw = json;
    UV.engineMeta = {
      name: json.engine?.name || "LifeHack Health Engine",
      version: json.engine?.version || "0.0.0",
      mode: json.engine?.mode || "local-first",
      offline: !!json.engine?.offline,
      lastUpdated: json.engine?.lastUpdated || null
    };

    UV.safety = {
      medicalDisclaimer: !!json.safety?.medicalDisclaimer,
      diagnosisAllowed: !!json.safety?.diagnosisAllowed,
      emergencyBypass: !!json.safety?.emergencyBypass,
      isEmergencyText: buildEmergencyMatcher(json)
    };

    UV.modules = json.modules || {};
    UV.routes = json.routing?.routes || {};
    UV.defaultModule = json.routing?.defaultModule || null;

    UV.cachePlan = computeCachePlan(json);

    // helper navigation
    UV.route = (path) => setLocation(path);
    UV.go = (moduleId) => {
      const mod = UV.modules?.[moduleId];
      if (!mod) throw new Error(`Unknown module: ${moduleId}`);
      setLocation(mod.path || UV.routes?.[`/${moduleId}`] || "/");
    };

    // emit early ready
    UV.events.emit("engine:loaded", { meta: UV.engineMeta, at: ts() });
    log.info("Engine loaded:", UV.engineMeta);

    // register SW (if offline enabled)
    await registerServiceWorkerIfNeeded(json, log);

    // auto-register modules/assets
    const auto = !!json.uv?.autoRegisterModules;
    if (auto) {
      const mods = moduleList(UV.modules).filter(m => m.enabled !== false);

      for (const mod of mods) {
        try {
          UV.events.emit("module:loading", { id: mod.id, name: mod.name, at: ts() });
          const loaded = await loadModuleAssets(mod, log);

          UV.events.emit("module:ready", {
            id: mod.id,
            name: mod.name,
            type: mod.type,
            path: mod.path,
            loaded,
            at: ts()
          });

          log.info(`Module ready: ${mod.id}`, loaded);
        } catch (e) {
          log.warn(`Module failed: ${mod.id}`, e.message);
          UV.events.emit("module:error", { id: mod.id, message: e.message, at: ts() });
        }
      }
    } else {
      log.info("autoRegisterModules=false — skipping asset auto-load.");
    }

    // exposeState toggle
    if (!json.uv?.exposeState) {
      // Keep minimal public surface
      delete UV.engineRaw;
    }

    UV.events.emit("uv:ready", { at: ts(), meta: UV.engineMeta, cachePlan: UV.cachePlan });
    log.info("UV ready.");
  }

  // Boot gate
  const shouldBoot = true; // your uv.boot is true; if you want, enforce it here
  if (!shouldBoot) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

