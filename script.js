/* ================================
   HEALTH HACK — JSON ENGINE
   Stage 3 CKD
================================ */

let ENGINE = null;

// Load JSON engine
async function loadEngine() {
  const res = await fetch("health-engine.json");
  ENGINE = await res.json();
  console.log("Health Engine Loaded", ENGINE);
}
loadEngine();

/* -------------------------------
   UTILITIES
-------------------------------- */
const $ = (id) => document.getElementById(id);

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

/* -------------------------------
   STORAGE
-------------------------------- */
const DB = {
  meals: JSON.parse(localStorage.getItem("hh_meals") || "{}"),
  water: JSON.parse(localStorage.getItem("hh_water") || "{}"),
  bp: JSON.parse(localStorage.getItem("hh_bp") || "{}")
};

function saveDB() {
  localStorage.setItem("hh_meals", JSON.stringify(DB.meals));
  localStorage.setItem("hh_water", JSON.stringify(DB.water));
  localStorage.setItem("hh_bp", JSON.stringify(DB.bp));
}

/* -------------------------------
   MEAL LOGIC
-------------------------------- */
function analyzeMeal(text) {
  const rules = ENGINE.mealScoring;
  let score = rules.baseScore;

  rules.keywords.good.forEach(k => {
    if (text.toLowerCase().includes(k)) score++;
  });

  rules.keywords.bad.forEach(k => {
    if (text.toLowerCase().includes(k)) score--;
  });

  score = Math.max(rules.minScore, Math.min(rules.maxScore, score));

  return {
    score,
    verdict: score >= 4 ? "good" : score <= 2 ? "bad" : "neutral",
    tip: score >= 4 ? ENGINE.tips.mealGood : ENGINE.tips.mealBad
  };
}

function logMeal(text) {
  const key = todayKey();
  const analysis = analyzeMeal(text);

  DB.meals[key] = DB.meals[key] || [];
  DB.meals[key].push({
    text,
    analysis,
    ts: Date.now()
  });

  saveDB();
  return analysis;
}

/* -------------------------------
   HYDRATION LOGIC
-------------------------------- */
function addWater(oz) {
  const key = todayKey();
  DB.water[key] = DB.water[key] || 0;
  DB.water[key] += oz;
  saveDB();
  return evaluateHydration();
}

function evaluateHydration() {
  const key = todayKey();
  const total = DB.water[key] || 0;
  const range = ENGINE.ckd["3"].hydration;

  if (total < range.minOz) return ENGINE.tips.hydrationLow;
  if (total > range.maxOz) return ENGINE.tips.hydrationHigh;
  return "Hydration on track.";
}

/* -------------------------------
   BLOOD PRESSURE LOGIC
-------------------------------- */
function logBP(sys, dia) {
  const key = todayKey();
  DB.bp[key] = { sys, dia, ts: Date.now() };
  saveDB();
  return evaluateBP(sys, dia);
}

function evaluateBP(sys, dia) {
  for (const r of ENGINE.bpRanges) {
    if (sys <= r.sysMax && dia <= r.diaMax) {
      return {
        label: r.label,
        color: r.color,
        message:
          r.color === "red"
            ? ENGINE.tips.bpHigh
            : "BP within acceptable range."
      };
    }
  }
  return { label: "Unknown", color: "gray", message: "Unable to classify BP." };
}

/* -------------------------------
   AI-STYLE SUMMARY (RULE ENGINE)
-------------------------------- */
function dailySummary() {
  const key = todayKey();
  const meals = DB.meals[key] || [];
  const water = DB.water[key] || 0;
  const bp = DB.bp[key];

  return {
    date: key,
    mealsLogged: meals.length,
    hydrationOz: water,
    bpStatus: bp ? evaluateBP(bp.sys, bp.dia) : "No BP logged",
    guidance: [
      water < ENGINE.ckd["3"].hydration.minOz && ENGINE.tips.hydrationLow,
      meals.some(m => m.analysis.verdict === "bad") && ENGINE.tips.mealBad,
      bp && bp.sys > ENGINE.ckd["3"].bpTargets.systolicMax && ENGINE.tips.bpHigh
    ].filter(Boolean)
  };
}

/* -------------------------------
   DEBUG (DEV POWER MOVE)
-------------------------------- */
window.HealthHack = {
  logMeal,
  addWater,
  logBP,
  dailySummary,
  DB
};
