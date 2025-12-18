/* BP Monitor / Recorder (LocalStorage) + AI Coach (Lupus-focused, non-medical) */

const LS_BP   = "bpLog.readings.v1";
const LS_GOAL = "bpLog.goals.v1";

const $ = (id) => document.getElementById(id);

let RULES = null;

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseNum(v){
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function pick(arr){
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random()*arr.length)];
}

function loadReadings(){
  try { return JSON.parse(localStorage.getItem(LS_BP) || "[]"); }
  catch { return []; }
}
function saveReadings(items){
  localStorage.setItem(LS_BP, JSON.stringify(items));
}
function loadGoals(){
  try { return JSON.parse(localStorage.getItem(LS_GOAL) || "{}"); }
  catch { return {}; }
}
function saveGoals(goals){
  localStorage.setItem(LS_GOAL, JSON.stringify(goals));
}

async function loadRules(){
  try{
    const res = await fetch("./bp-rules.json", { cache:"no-store" });
    if (!res.ok) throw new Error("rules not found");
    RULES = await res.json();
  }catch(e){
    RULES = { defaults:{}, coachTemplates:{win:[],nudge:[],warning:[]}, classify:{} };
    console.warn("bp-rules.json load failed:", e);
  }
}

function getSelectedDay(){
  return $("daySelect").value || todayISO();
}
function getRange(){
  return $("range").value;
}
function inLastNDays(dayISO, n){
  const d = new Date(dayISO + "T00:00:00");
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000*60*60*24));
  return diffDays >= 0 && diffDays < n;
}

function filterReadings(all){
  const q = ($("search").value || "").trim().toLowerCase();
  const range = getRange();
  const day = getSelectedDay();

  let items = all.slice();

  if (range === "day") items = items.filter(x => x.day === day);
  if (range === "7d")  items = items.filter(x => inLastNDays(x.day, 7));
  if (range === "30d") items = items.filter(x => inLastNDays(x.day, 30));

  if (q) {
    items = items.filter(x => {
      const hay = [x.notes, x.symptoms, x.context, x.position, x.arm, x.cuff].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // sort newest first within range
  items.sort((a,b) => (b.day + (b.time||"")).localeCompare(a.day + (a.time||"")));
  return items;
}

function classifyBP(sys, dia, goals){
  const alertSys = parseNum(goals.alertSys);
  const alertDia = parseNum(goals.alertDia);

  if ((alertSys && sys >= alertSys) || (alertDia && dia >= alertDia)) {
    return { level:"bad", label:"URGENT RANGE" };
  }

  // Simple category logic
  if (sys >= 140 || dia >= 90) return { level:"bad", label:"High BP (Stage 2+)" };
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) return { level:"warn", label:"High BP (Stage 1)" };
  if (sys >= 120 && sys <= 129 && dia < 80) return { level:"warn", label:"Elevated" };
  return { level:"good", label:"In range" };
}

function calcSummary(items){
  if (!items.length) return null;

  let sumSys=0, sumDia=0, sumHr=0, nHr=0;
  let minSys=999, maxSys=0, minDia=999, maxDia=0;

  for (const x of items){
    const sys = parseNum(x.sys);
    const dia = parseNum(x.dia);
    sumSys += sys; sumDia += dia;

    minSys = Math.min(minSys, sys);
    maxSys = Math.max(maxSys, sys);
    minDia = Math.min(minDia, dia);
    maxDia = Math.max(maxDia, dia);

    const hr = parseNum(x.hr);
    if (hr > 0) { sumHr += hr; nHr++; }
  }

  return {
    n: items.length,
    avgSys: Math.round(sumSys/items.length),
    avgDia: Math.round(sumDia/items.length),
    avgHr:  nHr ? Math.round(sumHr/nHr) : null,
    minSys, maxSys, minDia, maxDia
  };
}

function renderSummary(items, goals){
  const range = getRange();
  const day = getSelectedDay();

  const label =
    range === "day" ? `Selected day (${day})` :
    range === "7d" ? `Last 7 days (rolling)` :
    `Last 30 days (rolling)`;

  $("summaryLabel").textContent = label;

  const s = calcSummary(items);
  if (!s){
    $("avgSys").textContent = "—";
    $("avgDia").textContent = "—";
    $("nReadings").textContent = "Readings: —";
    $("avgHr").textContent = "Avg HR: —";
    $("minMaxSys").textContent = "—";
    $("minMaxDia").textContent = "—";
    $("flagCount").textContent = "—";
    return;
  }

  // flagged = above target OR urgent range
  const tSys = parseNum(goals.targetSys);
  const tDia = parseNum(goals.targetDia);

  let flagged = 0;
  for (const x of items){
    const sys = parseNum(x.sys), dia = parseNum(x.dia);
    const c = classifyBP(sys,dia,goals);
    if ((tSys && sys >= tSys) || (tDia && dia >= tDia) || c.level === "bad") flagged++;
  }

  $("avgSys").textContent = String(s.avgSys);
  $("avgDia").textContent = String(s.avgDia);
  $("nReadings").textContent = `Readings: ${s.n}`;
  $("avgHr").textContent = `Avg HR: ${s.avgHr ?? "—"}`;
  $("minMaxSys").textContent = `${s.minSys} / ${s.maxSys}`;
  $("minMaxDia").textContent = `${s.minDia} / ${s.maxDia}`;
  $("flagCount").textContent = String(flagged);
}

function renderList(items, goals){
  const wrap = $("bpList");
  wrap.innerHTML = "";

  if (!items.length){
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="empty">No readings in this range yet. Add one above.</div>`;
    wrap.appendChild(div);
    return;
  }

  for (const x of items){
    const sys = parseNum(x.sys), dia = parseNum(x.dia);
    const hr = parseNum(x.hr);
    const c = classifyBP(sys,dia,goals);

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-top">
        <div>
          <div class="item-title">${sys}/${dia} <span class="badge ${c.level}">${escapeHtml(c.label)}</span></div>
          <div class="item-meta">${escapeHtml(x.day)} • ${escapeHtml(x.time || "—")} • ${escapeHtml(x.context)} • ${escapeHtml(x.position)} • ${escapeHtml(x.arm)} • ${escapeHtml(x.cuff)}</div>
        </div>
        <div class="item-actions">
          <button class="iconbtn" data-act="edit" data-id="${x.id}" title="Edit">✏️</button>
          <button class="iconbtn" data-act="del" data-id="${x.id}" title="Delete">🗑️</button>
        </div>
      </div>

      <div class="kpi">
        <span>SYS: <strong>${sys}</strong></span>
        <span>DIA: <strong>${dia}</strong></span>
        <span>HR: <strong>${hr || "—"}</strong></span>
      </div>

      ${x.symptoms ? `<div class="item-meta" style="margin-top:8px"><strong>Symptoms:</strong> ${escapeHtml(x.symptoms)}</div>` : ""}
      ${x.notes ? `<div class="item-meta" style="margin-top:6px"><strong>Notes:</strong> ${escapeHtml(x.notes)}</div>` : ""}
    `;

    wrap.appendChild(div);
  }

  wrap.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      const id  = btn.getAttribute("data-id");
      if (act === "edit") startEdit(id);
      if (act === "del")  removeReading(id);
    });
  });
}

function clearForm(){
  $("editId").value = "";
  $("bpForm").reset();
  $("daySelect").value = todayISO();
  $("context").value = "AM";
  $("position").value = "seated";
  $("arm").value = "left";
  $("cuff").value = "upper_arm";
  $("btnSave").textContent = "Add reading";
}

function startEdit(id){
  const all = loadReadings();
  const x = all.find(r => r.id === id);
  if (!x) return;

  $("editId").value = x.id;
  $("daySelect").value = x.day || todayISO();
  $("time").value = x.time || "";
  $("context").value = x.context || "AM";
  $("sys").value = x.sys;
  $("dia").value = x.dia;
  $("hr").value = x.hr || "";
  $("position").value = x.position || "seated";
  $("arm").value = x.arm || "left";
  $("cuff").value = x.cuff || "upper_arm";
  $("symptoms").value = x.symptoms || "";
  $("notes").value = x.notes || "";

  $("btnSave").textContent = "Update reading";
  window.scrollTo({ top:0, behavior:"smooth" });
}

function removeReading(id){
  const all = loadReadings();
  saveReadings(all.filter(x => x.id !== id));
  refresh();
}

function upsertReading(){
  const all = loadReadings();

  const entry = {
    id: $("editId").value || uid(),
    day: $("daySelect").value || todayISO(),
    time: ($("time").value || "").trim(),
    context: $("context").value || "Other",
    sys: parseNum($("sys").value),
    dia: parseNum($("dia").value),
    hr: parseNum($("hr").value),
    position: $("position").value || "seated",
    arm: $("arm").value || "left",
    cuff: $("cuff").value || "upper_arm",
    symptoms: ($("symptoms").value || "").trim(),
    notes: ($("notes").value || "").trim(),
    createdAt: Date.now()
  };

  const idx = all.findIndex(x => x.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);

  // sort by day/time ascending for stable reporting
  all.sort((a,b) => (a.day + (a.time||"")).localeCompare(b.day + (b.time||"")));
  saveReadings(all);
}

function readGoalsFromUI(){
  return {
    targetSys: parseNum($("targetSys").value),
    targetDia: parseNum($("targetDia").value),
    alertSys:  parseNum($("alertSys").value),
    alertDia:  parseNum($("alertDia").value)
  };
}
function writeGoalsToUI(g){
  $("targetSys").value = g.targetSys || "";
  $("targetDia").value = g.targetDia || "";
  $("alertSys").value  = g.alertSys || "";
  $("alertDia").value  = g.alertDia || "";
}

function coachFor(items, goals, label){
  const out = [];
  const t = RULES?.coachTemplates || {win:[],nudge:[],warning:[]};

  if (!items.length) {
    out.push({ level:"warn", title:"No data yet", body:"Add readings, ideally AM/PM with consistent technique, then run coaching." });
    return out;
  }

  const s = calcSummary(items);
  const targetSys = parseNum(goals.targetSys);
  const targetDia = parseNum(goals.targetDia);

  // Count categories + pattern
  let urgentCount = 0, aboveTarget = 0, stage2 = 0, stage1 = 0;
  const byContext = { AM:[], PM:[], Other:[] };

  for (const x of items){
    const sys = parseNum(x.sys), dia = parseNum(x.dia);
    const c = classifyBP(sys,dia,goals);
    if (c.label === "URGENT RANGE") urgentCount++;
    if (sys >= 140 || dia >= 90) stage2++;
    if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) stage1++;
    if ((targetSys && sys >= targetSys) || (targetDia && dia >= targetDia)) aboveTarget++;
    byContext[x.context]?.push({sys,dia});
  }

  const hasWarn = stage1 > 0 || aboveTarget > Math.max(1, Math.floor(items.length*0.35));
  const hasBad  = urgentCount > 0 || stage2 > 0;

  const flavor = hasBad ? pick(t.warning) : hasWarn ? pick(t.nudge) : pick(t.win);

  out.push({
    level: hasBad ? "bad" : hasWarn ? "warn" : "good",
    title: `Coach recap • ${label}`,
    body: flavor
  });

  out.push({
    level: hasBad ? "bad" : "warn",
    title: "Your numbers (summary)",
    body:
      `Avg: ${s.avgSys}/${s.avgDia} (n=${s.n})\n` +
      `Min/Max SYS: ${s.minSys}/${s.maxSys}\n` +
      `Min/Max DIA: ${s.minDia}/${s.maxDia}\n` +
      (targetSys || targetDia ? `Target: ${targetSys || "—"}/${targetDia || "—"}\n` : "") +
      (urgentCount ? `Urgent-range readings: ${urgentCount}\n` : "") +
      (stage2 ? `High BP (stage 2+) readings: ${stage2}\n` : "") +
      (stage1 ? `High BP (stage 1) readings: ${stage1}\n` : "")
  });

  // Technique coaching (high-value)
  out.push({
    level: "good",
    title: "Data quality checklist",
    body:
      "• Use a validated cuff and correct size.\n" +
      "• Avoid caffeine/exercise/smoking 30 min before.\n" +
      "• Sit quietly 5 minutes, arm supported, feet flat, no talking.\n" +
      "• Take 2 readings per session and record both when possible."
  });

  // Lupus-specific framing (non-medical)
  out.push({
    level: "warn",
    title: "Lupus focus",
    body:
      "With lupus, cardiovascular risk management matters. Bring your 7-day trend to your clinician and ask what BP goal is right for you (often <130/80 is discussed, but personal targets vary)."
  });

  // Next steps
  if (hasBad){
    out.push({
      level:"bad",
      title:"Next step (do not ignore)",
      body:
        "If you are in urgent ranges or have severe symptoms (chest pain, shortness of breath, neuro symptoms), seek urgent care.\n" +
        "Otherwise, capture a clean 7-day AM/PM set and share it with your clinician."
    });
  } else if (hasWarn){
    out.push({
      level:"warn",
      title:"Next step (tighten the trend)",
      body:
        "Run a clean 7-day routine: AM + PM, 2 readings each session. Track triggers: pain flare, stress, high-sodium meals, missed meds."
    });
  } else {
    out.push({
      level:"good",
      title:"Next step (keep winning)",
      body:
        "Keep the routine steady and bring your log to appointments. Consistency is the difference between guesswork and real care."
    });
  }

  return out;
}

function renderCoach(blocks){
  const out = $("coachOut");
  out.innerHTML = "";
  for (const b of blocks){
    const div = document.createElement("div");
    div.className = "coach-block";
    div.innerHTML = `
      <div style="margin-bottom:6px">
        <span class="badge ${b.level}">${b.level.toUpperCase()}</span>
        <
