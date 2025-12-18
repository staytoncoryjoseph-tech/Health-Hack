/* Meal Log + Local AI Nutritionist (no API)
   - Stores meals + goals in localStorage
   - Coaching uses daily totals + tag signals + mode priorities
*/

const LS_MEALS = "mealLog.meals.v1";
const LS_GOALS = "mealLog.goals.v1";
const LS_MODE  = "mealLog.mode.v1";

const $ = (id) => document.getElementById(id);

let RULES = null;

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function loadMeals() {
  try { return JSON.parse(localStorage.getItem(LS_MEALS) || "[]"); }
  catch { return []; }
}

function saveMeals(meals) {
  localStorage.setItem(LS_MEALS, JSON.stringify(meals));
}

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(LS_GOALS) || "{}"); }
  catch { return {}; }
}

function saveGoals(goals) {
  localStorage.setItem(LS_GOALS, JSON.stringify(goals));
}

function loadMode() {
  try { return JSON.parse(localStorage.getItem(LS_MODE) || "{}"); }
  catch { return {}; }
}

function saveModeState(state) {
  localStorage.setItem(LS_MODE, JSON.stringify(state));
}

function servingsScale(base, servings) {
  const s = Math.max(0, parseNum(servings || 1));
  return base * s;
}

function normalizeTags(tagStr) {
  return (tagStr || "")
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

function getSelectedDay() {
  const v = $("daySelect").value;
  return v || todayISO();
}

function mealsForDay(meals, dayISO) {
  return meals.filter(m => m.day === dayISO);
}

function sumDay(dayMeals) {
  const totals = {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0,
    mealCount: dayMeals.length,
    tags: []
  };

  for (const m of dayMeals) {
    totals.calories += parseNum(m.calories);
    totals.protein += parseNum(m.protein);
    totals.carbs   += parseNum(m.carbs);
    totals.fat     += parseNum(m.fat);
    totals.fiber   += parseNum(m.fiber);
    totals.sodium  += parseNum(m.sodium);
    totals.sugar   += parseNum(m.sugar);
    totals.tags.push(...(m.tags || []));
  }

  return totals;
}

function clampInt(n) {
  const x = Math.round(parseNum(n));
  return Number.isFinite(x) ? x : 0;
}

function formatK(v, unit = "") {
  const n = Math.round(parseNum(v));
  return `${n}${unit}`;
}

function pick(arr) {
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderDayLabel(dayISO) {
  $("dayLabel").textContent = dayISO === todayISO()
    ? `Today (${dayISO})`
    : `Selected day (${dayISO})`;
}

function renderTotals(t, goals) {
  $("sumCalories").textContent = formatK(t.calories);
  $("sumProtein").textContent  = formatK(t.protein, "g");
  $("sumCarbs").textContent    = formatK(t.carbs, "g");
  $("sumFat").textContent      = formatK(t.fat, "g");

  $("sumFiber").textContent  = formatK(t.fiber, "g");
  $("sumSodium").textContent = formatK(t.sodium, "mg");
  $("sumSugar").textContent  = formatK(t.sugar, "g");

  $("targetCalories").textContent = `Target: ${goals.calories ? goals.calories : "—"}`;
  $("targetProtein").textContent  = `Target: ${goals.protein ? goals.protein + "g" : "—"}`;
  $("targetCarbs").textContent    = `Target: ${goals.carbs ? goals.carbs + "g" : "—"}`;
  $("targetFat").textContent      = `Target: ${goals.fat ? goals.fat + "g" : "—"}`;
}

function renderList(dayMeals, searchTerm = "") {
  const list = $("mealList");
  list.innerHTML = "";

  const q = (searchTerm || "").trim().toLowerCase();
  const filtered = q
    ? dayMeals.filter(m => {
        const hay = [
          m.name, m.notes, (m.tags || []).join(" "),
          String(m.calories), String(m.protein), String(m.carbs), String(m.fat)
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : dayMeals;

  if (!filtered.length) {
    const div = document.createElement("div");
    div.className = "meal-item";
    div.innerHTML = `<div class="empty">No meals yet for this day. Add one above.</div>`;
    list.appendChild(div);
    return;
  }

  for (const m of filtered) {
    const el = document.createElement("div");
    el.className = "meal-item";

    const time = m.time ? m.time : "—";
    const tagsHtml = (m.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");

    el.innerHTML = `
      <div class="meal-top">
        <div>
          <div class="meal-name">${escapeHtml(m.name)}</div>
          <div class="meal-meta">${escapeHtml(m.day)} • ${escapeHtml(time)} • Servings: ${escapeHtml(String(m.servings || 1))}</div>
        </div>
        <div class="meal-actions">
          <button class="iconbtn" data-act="edit" data-id="${m.id}" title="Edit">✏️</button>
          <button class="iconbtn" data-act="del" data-id="${m.id}" title="Delete">🗑️</button>
        </div>
      </div>

      <div class="kpi">
        <span>Cal: <strong>${clampInt(m.calories)}</strong></span>
        <span>P: <strong>${clampInt(m.protein)}g</strong></span>
        <span>C: <strong>${clampInt(m.carbs)}g</strong></span>
        <span>F: <strong>${clampInt(m.fat)}g</strong></span>
        <span>Fiber: <strong>${clampInt(m.fiber)}g</strong></span>
        <span>Na: <strong>${clampInt(m.sodium)}mg</strong></span>
        <span>Sugar: <strong>${clampInt(m.sugar)}g</strong></span>
      </div>

      ${m.notes ? `<div class="meal-meta" style="margin-top:8px">${escapeHtml(m.notes)}</div>` : ""}

      ${tagsHtml ? `<div class="meal-tags">${tagsHtml}</div>` : ""}
    `;

    list.appendChild(el);
  }

  list.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (act === "edit") startEdit(id);
      if (act === "del") deleteMeal(id);
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function getGoalsWithDefaults(modeKey, goals) {
  const mode = RULES?.modes?.[modeKey];
  const_toggle = (v) => (v === 0 ? 0 : (v || null));

  const defaults = mode?.defaults || {};
  // user goals override defaults
  return {
    calories: parseNum(goals.calories),
    protein: parseNum(goals.protein || defaults.protein),
    carbs:   parseNum(goals.carbs),
    fat:     parseNum(goals.fat),
    fiber:   parseNum(goals.fiber || defaults.fiber),
    sodium:  parseNum(goals.sodium || defaults.sodium),
    sugar:   parseNum(goals.sugar || defaults.sugar)
  };
}

function scoreAgainstGoals(totals, goals) {
  // returns flags
  const flags = [];

  // calories
  if (goals.calories > 0) {
    const pct = totals.calories / goals.calories;
    if (pct > 1.12) flags.push({ level:"bad", code:"calories_high", msg:`Calories are high (${Math.round(pct*100)}% of target).` });
    else if (pct < 0.55 && totals.mealCount >= 2) flags.push({ level:"warn", code:"calories_low", msg:`Calories look low for the day—watch under-eating and late-night rebound.` });
  }

  // protein
  if (goals.protein > 0) {
    const pct = totals.protein / goals.protein;
    if (pct < 0.6 && totals.mealCount >= 2) flags.push({ level:"warn", code:"protein_low", msg:`Protein is low (${Math.round(pct*100)}% of target). Add lean protein.` });
    if (pct > 1.35) flags.push({ level:"warn", code:"protein_high", msg:`Protein is high (${Math.round(pct*100)}% of target). If kidney-friendly mode, confirm target with clinician.` });
  }

  // fiber
  if (goals.fiber > 0) {
    const pct = totals.fiber / goals.fiber;
    if (pct < 0.6 && totals.mealCount >= 2) flags.push({ level:"warn", code:"fiber_low", msg:`Fiber is low. Add vegetables/beans/whole grains (as tolerated).` });
  }

  // sodium
  if (goals.sodium > 0) {
    const pct = totals.sodium / goals.sodium;
    if (pct > 1.0) flags.push({ level:"bad", code:"sodium_over", msg:`Sodium is over cap (${Math.round(pct*100)}%). Choose low-sodium next meal.` });
    else if (pct > 0.8) flags.push({ level:"warn", code:"sodium_close", msg:`Sodium is getting close to cap (${Math.round(pct*100)}%).` });
  }

  // sugar
  if (goals.sugar > 0) {
    const pct = totals.sugar / goals.sugar;
    if (pct > 1.0) flags.push({ level:"bad", code:"sugar_over", msg:`Added sugar is over cap (${Math.round(pct*100)}%).` });
    else if (pct > 0.8) flags.push({ level:"warn", code:"sugar_close", msg:`Added sugar is close to cap (${Math.round(pct*100)}%).` });
  }

  return flags;
}

function applyTagSignals(totals) {
  const tagSignals = RULES?.tagSignals || {};
  const signals = [];
  const seen = new Set();

  for (const tag of totals.tags) {
    const sig = tagSignals[tag];
    if (sig && !seen.has(tag)) {
      seen.add(tag);
      signals.push({ tag, ...sig });
    }
  }

  // derive “estimated” risk bumps (used in coaching narrative)
  const bumps = signals.reduce((acc, s) => {
    acc.calories += parseNum(s.calorieBoost);
    acc.sodium   += parseNum(s.sodiumBoost);
    acc.sugar    += parseNum(s.sugarBoost);
    acc.protein  += parseNum(s.proteinBoost);
    acc.fiber    += parseNum(s.fiberBoost);
    return acc;
  }, { calories:0, sodium:0, sugar:0, protein:0, fiber:0 });

  return { signals, bumps };
}

function buildCoachBlocks({ headline, flags, signals, modeKey, riskKey, totals, goals }) {
  const out = [];
  const template = RULES?.coachingTemplates || {};

  // headline based on severity
  const hasBad = flags.some(f => f.level === "bad");
  const hasWarn = flags.some(f => f.level === "warn");
  const flavor =
    hasBad ? pick(template.warning) :
    hasWarn ? pick(template.nudge) :
    pick(template.win);

  out.push({
    level: hasBad ? "bad" : hasWarn ? "warn" : "good",
    title: headline,
    body: flavor
  });

  // mode notes
  if (modeKey === "kidney_stage3") {
    out.push({
      level: "warn",
      title: "Kidney-friendly mode note",
      body: "We focus on sodium + steady nutrition. Targets can vary based on labs/doctor plan—double-check your personal limits."
    });
  }

  // flags details
  if (flags.length) {
    out.push({
      level: hasBad ? "bad" : "warn",
      title: "Today’s signals",
      body: flags.map(f => `• ${f.msg}`).join("\n")
    });
  } else {
    out.push({
      level: "good",
      title: "Status",
      body: "No red flags detected from your logged numbers. Keep the next meal simple and repeatable."
    });
  }

  // tag coaching
  if (signals.length) {
    out.push({
      level: "warn",
      title: "Pattern coaching from tags",
      body: signals.map(s => `• (${s.tag}) ${s.message}`).join("\n")
    });
  }

  // next-meal recommendation
  out.push({
    level: "good",
    title: "Next meal (simple blueprint)",
    body: nextMealBlueprint(modeKey, totals, goals, riskKey)
  });

  // hydration / behavior nudge
  out.push({
    level: "good",
    title: "Behavior move (easy win)",
    body: behavioralNudge(totals, flags, riskKey)
  });

  return out;
}

function nextMealBlueprint(modeKey, totals, goals, riskKey) {
  // Make it practical and “doable”
  const strict = riskKey === "strict";
  const gentle = riskKey === "gentle";

  const sodiumNote = (goals.sodium > 0 && totals.sodium / goals.sodium > 0.75)
    ? "Keep it low-sodium (avoid sauces, deli meats, packaged soups)."
    : "Watch sodium by choosing simple seasonings.";

  const sugarNote = (goals.sugar > 0 && totals.sugar / goals.sugar > 0.75)
    ? "Skip sweets/drinks; go fruit or yogurt (no added sugar)."
    : "Limit added sugar.";

  if (modeKey === "fatloss") {
    return [
      "Plate: 1–2 palms lean protein + 2 fists vegetables + 1 thumb fat.",
      strict ? "Carbs: keep to 1 cupped hand (or less)." : "Carbs: 1 cupped hand (rice/potato/beans).",
      sodiumNote,
      sugarNote
    ].join("\n");
  }

  if (modeKey === "muscle") {
    return [
      "Plate: 2 palms protein + 1–2 cupped hands carbs + veggies.",
      gentle ? "Add carbs if training today." : "Keep carbs clean (rice, oats, potatoes).",
      sodiumNote
    ].join("\n");
  }

  if (modeKey === "kidney_stage3") {
    return [
      "Aim for a balanced, gentle meal: lean protein (moderate) + vegetables + a controlled carb.",
      "Choose fresh foods over packaged to manage sodium.",
      sodiumNote,
      sugarNote,
      "If you track potassium/phosphorus with your clinician, keep those personal limits in mind."
    ].join("\n");
  }

  // general
  return [
    "Plate: protein + fiber + color.",
    "Example: grilled chicken or eggs + salad/veg + rice/beans (portion-controlled).",
    sodiumNote,
    sugarNote
  ].join("\n");
}

function behavioralNudge(totals, flags, riskKey) {
  const bad = flags.some(f => f.level === "bad");
  if (bad) {
    return riskKey === "strict"
      ? "Reset now: water, 10-minute walk, and make your next meal clean. No ‘I’ll fix it tomorrow’."
      : "Reset now: drink water and make the next meal simple. Don’t punish—just correct."
  }
  if (totals.mealCount === 0) return "Start with one meal. Momentum beats motivation.";
  if (totals.mealCount >= 4) return "You’re logging like a pro. Keep portions honest and finish the day steady.";
  return "Add one small upgrade: more protein or fiber. One move changes the whole day.";
}

function renderCoach(blocks) {
  const out = $("coachOut");
  out.innerHTML = "";

  for (const b of blocks) {
    const div = document.createElement("div");
    div.className = "coach-block";
    div.innerHTML = `
      <div style="margin-bottom:6px">
        <span class="badge ${b.level}">${b.level.toUpperCase()}</span>
        <strong>${escapeHtml(b.title)}</strong>
      </div>
      <div style="white-space:pre-wrap; color: rgba(233,236,246,.86)">${escapeHtml(b.body)}</div>
    `;
    out.appendChild(div);
  }
}

function startEdit(id) {
  const meals = loadMeals();
  const m = meals.find(x => x.id === id);
  if (!m) return;

  $("editId").value = m.id;

  $("mealName").value = m.name || "";
  $("mealTime").value = m.time || "";
  $("servings").value = m.servings || 1;

  $("calories").value = m.calories || "";
  $("protein").value  = m.protein || "";
  $("carbs").value    = m.carbs || "";
  $("fat").value      = m.fat || "";
  $("fiber").value    = m.fiber || "";
  $("sodium").value   = m.sodium || "";
  $("sugar").value    = m.sugar || "";

  $("tags").value = (m.tags || []).join(", ");
  $("notes").value = m.notes || "";

  $("btnSave").textContent = "Update meal";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteMeal(id) {
  const meals = loadMeals();
  const next = meals.filter(m => m.id !== id);
  saveMeals(next);
  refresh();
}

function clearForm() {
  $("editId").value = "";
  $("mealForm").reset();
  $("servings").value = 1;
  $("btnSave").textContent = "Add meal";
}

function upsertMeal(formData) {
  const meals = loadMeals();
  const day = getSelectedDay();

  const servings = Math.max(0.25, parseNum(formData.get("servings") || 1));

  // scale nutrition by servings (simple but effective)
  const base = {
    calories: parseNum(formData.get("calories")),
    protein:  parseNum(formData.get("protein")),
    carbs:    parseNum(formData.get("carbs")),
    fat:      parseNum(formData.get("fat")),
    fiber:    parseNum(formData.get("fiber")),
    sodium:   parseNum(formData.get("sodium")),
    sugar:    parseNum(formData.get("sugar"))
  };

  const scaled = {
    calories: servingsScale(base.calories, 1),
    protein:  servingsScale(base.protein, 1),
    carbs:    servingsScale(base.carbs, 1),
    fat:      servingsScale(base.fat, 1),
    fiber:    servingsScale(base.fiber, 1),
    sodium:   servingsScale(base.sodium, 1),
    sugar:    servingsScale(base.sugar, 1)
  };

  // Actually store scaled * servings (so user can enter per-serving numbers or total)
  // If they entered totals already, servings should be 1.
  const totals = {
    calories: servingsScale(scaled.calories, servings),
    protein:  servingsScale(scaled.protein, servings),
    carbs:    servingsScale(scaled.carbs, servings),
    fat:      servingsScale(scaled.fat, servings),
    fiber:    servingsScale(scaled.fiber, servings),
    sodium:   servingsScale(scaled.sodium, servings),
    sugar:    servingsScale(scaled.sugar, servings)
  };

  const entry = {
    id: $("editId").value || uid(),
    day,
    name: String(formData.get("mealName") || "").trim(),
    time: String(formData.get("mealTime") || "").trim(),
    servings,
    ...totals,
    tags: normalizeTags(formData.get("tags")),
    notes: String(formData.get("notes") || "").trim(),
    createdAt: Date.now()
  };

  const idx = meals.findIndex(m => m.id === entry.id);
  if (idx >= 0) meals[idx] = entry;
  else meals.push(entry);

  // keep meals sorted by time if present
  meals.sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day);
    return (a.time || "").localeCompare(b.time || "");
  });

  saveMeals(meals);
}

function readGoalsFromUI() {
  return {
    calories: parseNum($("goalCalories").value),
    protein:  parseNum($("goalProtein").value),
    carbs:    parseNum($("goalCarbs").value),
    fat:      parseNum($("goalFat").value),
    sodium:   parseNum($("goalSodium").value),
    sugar:    parseNum($("goalSugar").value),
    fiber:    0
  };
}

function writeGoalsToUI(goals) {
  $("goalCalories").value = goals.calories || "";
  $("goalProtein").value  = goals.protein || "";
  $("goalCarbs").value    = goals.carbs || "";
  $("goalFat").value      = goals.fat || "";
  $("goalSodium").value   = goals.sodium || "";
  $("goalSugar").value    = goals.sugar || "";
}

function refresh() {
  const meals = loadMeals();
  const goalsSaved = loadGoals();
  const modeState = loadMode();

  const day = getSelectedDay();
  renderDayLabel(day);

  $("mode").value = modeState.mode || "general";
  $("risk").value = modeState.risk || "balanced";

  // render list + totals
  const dayMeals = mealsForDay(meals, day);
  renderList(dayMeals, $("search").value);

  const modeKey = $("mode").value;
  const goals = getGoalsWithDefaults(modeKey, goalsSaved);

  const totals = sumDay(dayMeals);
  renderTotals(totals, goals);
}

function runCoaching(deep = false) {
  const meals = loadMeals();
  const goalsSaved = loadGoals();

  const day = getSelectedDay();
  const dayMeals = mealsForDay(meals, day);
  const totals = sumDay(dayMeals);

  const modeKey = $("mode").value;
  const riskKey = $("risk").value;

  const goals = getGoalsWithDefaults(modeKey, goalsSaved);

  const flags = scoreAgainstGoals(totals, goals);
  const { signals, bumps } = applyTagSignals(totals);

  let headline = deep
    ? `Deep audit • ${day} • ${totals.mealCount} meals`
    : `Coach recap • ${day} • ${totals.mealCount} meals`;

  // In deep mode add “estimated risk bumps”
  if (deep && (bumps.sodium || bumps.sugar || bumps.calories)) {
    const parts = [];
    if (bumps.calories) parts.push(`+${bumps.calories} cal`);
    if (bumps.sodium) parts.push(`+${bumps.sodium} mg Na`);
    if (bumps.sugar) parts.push(`+${bumps.sugar} g sugar`);
    headline += ` • Tag risk estimate: ${parts.join(", ")}`;
  }

  const blocks = buildCoachBlocks({
    headline, flags, signals, modeKey, riskKey, totals, goals
  });

  renderCoach(blocks);
}

async function loadRules() {
  // try local JSON file first
  try {
    const res = await fetch("./nutrition-rules.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Rules not found");
    RULES = await res.json();
  } catch (e) {
    RULES = { tagSignals:{}, modes:{}, coachingTemplates:{} };
    console.warn("Could not load nutrition-rules.json:", e);
  }
}

function wireUI() {
  // init day select
  $("daySelect").value = todayISO();
  $("mealTime").value = "";

  // form submit
  $("mealForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    if (!String(fd.get("mealName") || "").trim()) return;

    upsertMeal(fd);
    clearForm();
    refresh();
  });

  $("btnClearForm").addEventListener("click", () => clearForm());

  $("search").addEventListener("input", () => refresh());
  $("daySelect").addEventListener("change", () => refresh());

  $("mode").addEventListener("change", () => {
    saveModeState({ mode: $("mode").value, risk: $("risk").value });
    refresh();
  });
  $("risk").addEventListener("change", () => {
    saveModeState({ mode: $("mode").value, risk: $("risk").value });
  });

  $("btnSaveGoals").addEventListener("click", () => {
    const goals = readGoalsFromUI();
    saveGoals(goals);
    refresh();
  });

  $("btnAutoGoals").addEventListener("click", () => {
    // sensible starting defaults — user can edit
    const modeKey = $("mode").value;

    const base = {
      general:  { calories: 2000, protein: 120, carbs: 220, fat: 70, sodium: 2300, sugar: 36 },
      fatloss:  { calories: 1800, protein: 140, carbs: 170, fat: 60, sodium: 2300, sugar: 30 },
      muscle:   { calories: 2400, protein: 160, carbs: 280, fat: 80, sodium: 2600, sugar: 40 },
      kidney_stage3: { calories: 2000, protein: 90, carbs: 230, fat: 70, sodium: 2000, sugar: 30 }
    };

    const pick = base[modeKey] || base.general;
    writeGoalsToUI(pick);
  });

  $("btnCoach").addEventListener("click", () => runCoaching(false));
  $("btnCoachDeep").addEventListener("click", () => runCoaching(true));

  // export/import
  $("btnExport").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      meals: loadMeals(),
      goals: loadGoals(),
      mode: loadMode()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meal-log-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data.meals)) saveMeals(data.meals);
      if (data.goals) saveGoals(data.goals);
      if (data.mode) saveModeState(data.mode);
      refresh();
      runCoaching(false);
    } catch {
      alert("Invalid JSON file.");
    } finally {
      e.target.value = "";
    }
  });

  $("btnReset").addEventListener("click", () => {
    const ok = confirm("Reset meal log, goals, and mode? This cannot be undone.");
    if (!ok) return;
    localStorage.removeItem(LS_MEALS);
    localStorage.removeItem(LS_GOALS);
    localStorage.removeItem(LS_MODE);
    clearForm();
    $("daySelect").value = todayISO();
    refresh();
    $("coachOut").innerHTML = `<div class="empty">Reset complete. Log meals and run coaching.</div>`;
  });
}

(async function init(){
  await loadRules();

  // load saved UI state
  const modeState = loadMode();
  $("mode").value = modeState.mode || "general";
  $("risk").value = modeState.risk || "balanced";

  // load goals into inputs
  const goals = loadGoals();
  writeGoalsToUI(goals);

  wireUI();
  refresh();
})();
