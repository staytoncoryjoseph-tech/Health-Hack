/* ==========================================================
   HEALTH HACK — ULTIMATE APP ENGINE (JSON + UI + PWA)
   - Tab navigation w/ transitions
   - Ask AI: multi-specialist from ai-profiles.json
   - OpenAI route support (/api/ask-ai) with safe fallback
   - Local-first storage
   - Typing indicator + toasts
   - PWA install + service worker
========================================================== */

(() => {
  /* -----------------------------
     DOM helpers
  ------------------------------ */
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* -----------------------------
     Config
  ------------------------------ */
  const CFG = {
    stage: 3, // locked to Stage 3 CKD
    profilesUrl: "ai-profiles.json",
    openaiEndpoint: "/api/ask-ai",
    useOpenAI: true, // tries OpenAI endpoint, falls back to rules
    storageKey: "hh_db_v1",
    defaultTab: "ask", // home|meals|water|bp|mind|profile|ask|tips
  };

  /* -----------------------------
     Local DB (single source)
  ------------------------------ */
  const DB = loadDB();
  function loadDB() {
    try {
      return JSON.parse(localStorage.getItem(CFG.storageKey) || "{}") || {};
    } catch {
      return {};
    }
  }
  function saveDB() {
    localStorage.setItem(CFG.storageKey, JSON.stringify(DB));
  }

  // Ensure day buckets
  const dayKey = () => new Date().toISOString().slice(0, 10);
  DB.days = DB.days || {};
  DB.days[dayKey()] = DB.days[dayKey()] || { meals: [], waterOz: 0, bp: null, moods: [] };

  function day() {
    const k = dayKey();
    DB.days[k] = DB.days[k] || { meals: [], waterOz: 0, bp: null, moods: [] };
    return DB.days[k];
  }

  /* -----------------------------
     UI: Toast
  ------------------------------ */
  function toast(msg) {
    const t = $("toast");
    const text = $("toastText");
    if (!t || !text) return;
    text.textContent = msg;
    t.classList.remove("hide");
    t.style.display = "flex";
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => {
      t.classList.add("hide");
      setTimeout(() => (t.style.display = "none"), 220);
    }, 2000);
  }

  /* -----------------------------
     UI: Page transitions (tabs)
     Expected HTML:
       <section class="view" data-view="ask">...</section>
       Buttons/links: data-nav="ask" etc
  ------------------------------ */
  function setActiveView(viewId) {
    const views = qsa(".view");
    views.forEach(v => {
      const on = v.dataset.view === viewId;
      v.style.display = on ? "block" : "none";
      if (on) v.classList.remove("fadeOut");
    });

    // animate in
    const active = qs(`.view[data-view="${viewId}"]`);
    if (active) {
      active.style.opacity = "0";
      active.style.transform = "translateY(10px) scale(.99)";
      requestAnimationFrame(() => {
        active.style.transition = "opacity 260ms cubic-bezier(.16,1,.3,1), transform 260ms cubic-bezier(.16,1,.3,1)";
        active.style.opacity = "1";
        active.style.transform = "translateY(0) scale(1)";
      });
    }

    // update nav active state
    qsa("[data-nav]").forEach(btn => {
      btn.setAttribute("aria-current", btn.dataset.nav === viewId ? "page" : "false");
      btn.classList.toggle("active", btn.dataset.nav === viewId);
    });

    // store last
    DB.ui = DB.ui || {};
    DB.ui.lastView = viewId;
    saveDB();
  }

  function wireNav() {
    qsa("[data-nav]").forEach(btn => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.nav;
        if (!next) return;
        setActiveView(next);
        toast(`Opened ${next.toUpperCase()}`);
      });
    });
  }

  /* -----------------------------
     Ask AI Engine (profiles JSON)
  ------------------------------ */
  let PROFILE = null;
  let ACTIVE_AI = null;

  function addMsg(role, text) {
    const chat = $("chat");
    if (!chat) return;
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "ai");
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function addTyping() {
    const chat = $("chat");
    if (!chat) return null;
    const div = document.createElement("div");
    div.className = "typing";
    div.innerHTML = "<span></span><span></span><span></span>";
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function setActiveAI(id) {
    ACTIVE_AI = PROFILE.ais.find(a => a.id === id) || PROFILE.ais[0];

    // Disclaimer
    const d = $("disclaimerBox");
    if (d) d.textContent = `${PROFILE.shared.globalDisclaimer}\n\n${ACTIVE_AI.disclaimer}`;

    // Meta
    const meta = $("engineMeta");
    if (meta) meta.textContent = `Active: ${ACTIVE_AI.name} • CKD Stage ${CFG.stage}`;

    // Chips
    const chips = $("quickChips");
    if (chips) {
      chips.innerHTML = "";
      (ACTIVE_AI.quickPrompts || []).forEach(p => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = p;
        b.addEventListener("click", () => {
          const q = $("q");
          if (q) q.value = p;
          q && q.focus();
        });
        chips.appendChild(b);
      });
    }

    toast(`${ACTIVE_AI.emoji} ${ACTIVE_AI.name} ready`);
  }

  function normalize(s) { return (s || "").toLowerCase(); }

  function pickReplyKey(ai, q) {
    const text = normalize(q);

    // direct rules from profiles
    const rules = ai.rules?.ifContains || [];
    for (const r of rules) {
      for (const m of r.match) {
        if (text.includes(normalize(m))) return r.replyKey;
      }
    }

    // BP pattern 142/88
    const bpMatch = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (bpMatch) {
      const sys = Number(bpMatch[1]), dia = Number(bpMatch[2]);
      const t = PROFILE.context.targets.bp;
      if (sys > t.sysMax || dia > t.diaMax) return "bp_high";
      return "bp_default";
    }

    // hydration pattern 24oz
    const ozMatch = text.match(/(\d{1,3})\s*oz/);
    if (ozMatch) {
      const oz = Number(ozMatch[1]);
      const h = PROFILE.context.targets.hydration;
      if (oz < h.minOz) return "hydration_low";
      if (oz > h.maxOz) return "hydration_high";
      return "hydration_default";
    }

    const defs = ai.rules?.defaults || [];
    return defs[0] || "medical_default";
  }

  function formatReply(ai, reply) {
    const head = `${ai.emoji} ${ai.name}\n`;
    const title = reply.title ? `\n${reply.title}\n` : "\n";
    const bullets = (reply.bullets || []).map(b => `• ${b}`).join("\n");
    const action = reply.action ? `\n\nACTION STEP:\n${reply.action}` : "";
    return head + title + bullets + action;
  }

  async function askOpenAI(question) {
    // payload includes day context (meals/water/bp)
    const d = day();
    const payload = {
      aiId: ACTIVE_AI.id,
      stage: CFG.stage,
      userMessage: question,
      profile: {
        name: `${ACTIVE_AI.emoji} ${ACTIVE_AI.name}`,
        disclaimer: ACTIVE_AI.disclaimer,
        tone: ACTIVE_AI.tone
      },
      context: {
        mealsToday: (d.meals || []).map(m => `${m.type}: ${m.text}`),
        waterOz: d.waterOz ?? null,
        bp: d.bp ?? null
      }
    };

    const res = await fetch(CFG.openaiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "AI error");
    return data.text;
  }

  async function ask() {
    const input = $("q");
    const out = $("engineOut");
    const question = (input?.value || "").trim();
    if (!question) return;

    addMsg("user", question);
    input.value = "";

    // typing indicator
    const typing = addTyping();

    try {
      let answerText = "";

      if (CFG.useOpenAI) {
        // try real OpenAI endpoint
        answerText = await askOpenAI(question);
      } else {
        // rule engine fallback
        const key = pickReplyKey(ACTIVE_AI, question);
        const reply = PROFILE.replies[key] || PROFILE.replies["medical_default"];
        answerText = formatReply(ACTIVE_AI, reply);
      }

      typing && typing.remove();
      addMsg("ai", answerText);
      if (out) out.value = answerText;

      // save chat history
      DB.chat = DB.chat || [];
      DB.chat.push({ ts: Date.now(), ai: ACTIVE_AI.id, q: question, a: answerText });
      saveDB();
    } catch (e) {
      typing && typing.remove();

      // fallback to rules if OpenAI fails
      const key = pickReplyKey(ACTIVE_AI, question);
      const reply = PROFILE.replies[key] || PROFILE.replies["medical_default"];
      const fallback = formatReply(ACTIVE_AI, reply);

      addMsg("ai", `⚠️ Using local engine (AI online unavailable)\n\n${fallback}`);
      if (out) out.value = fallback;
      toast("AI online unavailable — used local engine");
    }
  }

  function wireAskAI() {
    const btnAsk = $("btnAsk");
    const q = $("q");

    btnAsk && btnAsk.addEventListener("click", ask);
    q && q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ask(); }
    });

    $("btnClear")?.addEventListener("click", () => {
      $("chat").innerHTML = "";
      $("engineOut").value = "";
      addMsg("ai", "Cleared. Ask again when ready.");
      toast("Cleared");
    });

    $("btnCopy")?.addEventListener("click", async () => {
      const text = $("engineOut").value || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      toast("Copied ✅");
    });

    $("btnDemo")?.addEventListener("click", () => {
      const demos = [
        "My BP is 142/88 — what does that mean?",
        "I only drank 24oz today — what should I do?",
        "I ate fast food and chips, help me plan tomorrow.",
        "I feel overwhelmed and anxious right now."
      ];
      $("q").value = demos[Math.floor(Math.random() * demos.length)];
      $("q").focus();
    });

    $("aiSelect")?.addEventListener("change", (e) => setActiveAI(e.target.value));
  }

  async function loadProfiles() {
    const res = await fetch(CFG.profilesUrl);
    PROFILE = await res.json();

    // force stage context
    PROFILE.context = PROFILE.context || {};
    PROFILE.context.ckdStage = CFG.stage;

    const sel = $("aiSelect");
    if (sel) {
      sel.innerHTML = "";
      PROFILE.ais.forEach(ai => {
        const opt = document.createElement("option");
        opt.value = ai.id;
        opt.textContent = `${ai.emoji} ${ai.name}`;
        sel.appendChild(opt);
      });
    }

    setActiveAI(PROFILE.ais[0].id);
    addMsg("ai", `Welcome to ${PROFILE.app.name}.\nPick an AI specialist, then ask your question.`);
  }

  /* -----------------------------
     Meals / Water / BP / Mind helpers (optional hooks)
     These are here so your app is ready to scale.
     Expected HTML (optional):
       #mealType, #mealText, #btnSaveMeal
       #btnWater8 #btnWater12 #btnWater16
       #bpSys #bpDia #btnSaveBP
       #moodSelect #moodText #btnSaveMood
  ------------------------------ */
  function wireTracking() {
    // MEALS
    $("btnSaveMeal")?.addEventListener("click", () => {
      const type = $("mealType")?.value || "Meal";
      const text = ($("mealText")?.value || "").trim();
      if (!text) return toast("Add a meal description");

      day().meals.unshift({ ts: Date.now(), type, text });
      saveDB();
      $("mealText").value = "";
      toast("Meal saved ✅");
      renderDayStats();
    });

    // WATER
    const addWater = (oz) => {
      day().waterOz = (day().waterOz || 0) + oz;
      saveDB();
      toast(`+${oz}oz water ✅`);
      renderDayStats();
    };
    $("btnWater8")?.addEventListener("click", () => addWater(8));
    $("btnWater12")?.addEventListener("click", () => addWater(12));
    $("btnWater16")?.addEventListener("click", () => addWater(16));

    // BP
    $("btnSaveBP")?.addEventListener("click", () => {
      const sys = Number($("bpSys")?.value);
      const dia = Number($("bpDia")?.value);
      if (!Number.isFinite(sys) || !Number.isFinite(dia)) return toast("Enter BP numbers");

      day().bp = { sys, dia, ts: Date.now() };
      saveDB();
      toast(`BP saved: ${sys}/${dia} ✅`);
      renderDayStats();
    });

    // MIND
    $("btnSaveMood")?.addEventListener("click", () => {
      const mood = $("moodSelect")?.value || "Neutral";
      const text = ($("moodText")?.value || "").trim();

      day().moods.unshift({ ts: Date.now(), mood, text });
      saveDB();
      $("moodText").value = "";
      toast("Mood saved ✅");
      renderDayStats();
    });
  }

  function renderDayStats() {
    const d = day();
    if ($("statMeals")) $("statMeals").textContent = String((d.meals || []).length);
    if ($("statWater")) $("statWater").textContent = String(d.waterOz || 0);
    if ($("statBP")) $("statBP").textContent = d.bp ? `${d.bp.sys}/${d.bp.dia}` : "—";
  }

  /* -----------------------------
     SPECIAL INSTALL: PWA Install + Service Worker
  ------------------------------ */
  let deferredPrompt = null;

  function wirePWA() {
    // Service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js")
        .then(() => console.log("SW registered"))
        .catch(() => console.log("SW failed"));
    }

    // Install prompt capture (Chrome/Edge/Android)
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $("btnInstall") && ($("btnInstall").style.display = "inline-flex");
      toast("Install available ✅");
    });

    // Install button
    $("btnInstall")?.addEventListener("click", async () => {
      if (!deferredPrompt) return toast("Install not available yet");
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      toast(outcome === "accepted" ? "Installed ✅" : "Install dismissed");
      $("btnInstall").style.display = "none";
    });
  }

  /* -----------------------------
     Boot
  ------------------------------ */
  async function boot() {
    wireNav();
    wireTracking();
    wireAskAI();
    wirePWA();

    renderDayStats();
    await loadProfiles();

    // initial view
    const start = (DB.ui && DB.ui.lastView) || CFG.defaultTab;
    setActiveView(start);

    // expose for debugging
    window.HealthHack = { DB, day, toast, setActiveView };
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
