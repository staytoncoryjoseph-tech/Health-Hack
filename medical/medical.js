/* =========================================================
   Medical AI (Local-first) — medical.js
   - Prevention-focused educational assistant (not a doctor)
   - Blood pressure + steps tracking
   - Condition modes + tips
   - Prevention game plans
   - Prescriptions + refill dates
   - Doctor appointments
   - Emergency detection + CPR (emergency-only)
   - LocalStorage persistence
========================================================= */

/* ================== STORAGE KEYS ================== */
const KEYS = {
  bp: "health.bp.v1",
  steps: "health.steps.v1",
  condition: "health.conditionMode.v1",
  chat: "health.medicalChat.v1",
  plan: "health.gameplan.v1",
  rx: "health.rx.v1",
  appt: "health.appt.v1"
};

/* ================== CONDITIONS ================== */
const CONDITIONS = {
  general: {
    label: "General",
    tipsTitle: "General Guidance",
    tips: [
      "If symptoms are severe, sudden, or worsening fast, seek urgent care.",
      "Track basics daily: sleep, hydration, stress, steps, and blood pressure.",
      "For new meds/supplements, check interactions with a pharmacist or clinician.",
      "Bring a symptom timeline to appointments (when it started, triggers, what helps)."
    ],
    note: "Educational only. For diagnosis/treatment, consult a licensed clinician."
  },
  lupus: {
    label: "Lupus (SLE)",
    tipsTitle: "Lupus (SLE) — Daily Focus",
    tips: [
      "Pace activity: plan rest breaks to help prevent flares.",
      "Sun protection matters: SPF + protective clothing; UV can trigger symptoms.",
      "Track flare signals: fatigue, joint pain, rash, fever, swelling, mouth sores.",
      "Medication adherence matters. Don’t stop meds abruptly without clinician guidance."
    ],
    note: "If chest pain, shortness of breath, confusion, or sudden swelling → urgent care."
  },
  ckd3: {
    label: "CKD Stage 3",
    tipsTitle: "CKD Stage 3 — Daily Focus",
    tips: [
      "Blood pressure control is key—log BP consistently.",
      "Hydration guidance is personal—follow your care plan.",
      "Be cautious with NSAIDs unless your clinician says it’s ok.",
      "Watch sodium and ultra-processed foods; ask about protein targets."
    ],
    note: "CKD advice must be individualized. Ask about potassium/phosphorus & medication safety."
  },
  htn: {
    label: "Hypertension",
    tipsTitle: "Hypertension — Daily Focus",
    tips: [
      "Measure BP correctly: seated, relaxed, arm supported, same time daily.",
      "Lower sodium; movement and sleep quality can improve BP.",
      "Know red flags: very high BP + chest pain, weakness, vision changes → urgent care."
    ],
    note: "Don’t self-adjust prescriptions. Follow your clinician plan."
  },
  diabetes: {
    label: "Diabetes (General)",
    tipsTitle: "Diabetes — Daily Focus",
    tips: [
      "Meals: fiber + protein + healthy fats help reduce spikes.",
      "Track patterns: meals, activity, sleep, stress.",
      "Know low sugar signs (shaking, sweating, confusion) and follow your care plan."
    ],
    note: "For dosing/insulin questions, follow your clinician’s plan."
  },
  stress: {
    label: "Anxiety / Stress",
    tipsTitle: "Anxiety / Stress — Daily Focus",
    tips: [
      "Quick reset: inhale 4, exhale 6 for 2–5 minutes.",
      "Reduce stimulants if anxiety is high.",
      "Move daily. Track triggers and sleep patterns.",
      "If you feel unsafe, seek immediate help (US: 988)."
    ],
    note: "This isn’t therapy. If severe/persistent, consider professional support."
  }
};

/* ================== EMERGENCY DETECTION ================== */
const EMERGENCY_KEYWORDS = [
  "chest pain",
  "shortness of breath",
  "can't breathe",
  "cannot breathe",
  "stroke",
  "face drooping",
  "one sided weakness",
  "seizure",
  "fainting",
  "unresponsive",
  "not breathing",
  "no pulse",
  "cardiac arrest",
  "cpr",
  "suicidal",
  "kill myself"
];

let currentMode = "general";

/* ================== DOM HELPERS ================== */
const $ = (id) => document.getElementById(id);

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadLS(key, fallback = null) {
  const v = localStorage.getItem(key);
  if (!v) return fallback;
  const parsed = safeParse(v);
  return parsed ?? fallback;
}

/* ================== CHAT UI ================== */
function scrollChat() {
  const box = $("messages");
  if (box) box.scrollTop = box.scrollHeight;
}

function persistChat(role, text, kind = "normal") {
  const arr = loadLS(KEYS.chat, []);
  arr.push({ role, text, kind, t: Date.now(), mode: currentMode });
  // keep last 200
  saveLS(KEYS.chat, arr.slice(-200));
}

function addMsg(role, text, kind = "normal", persist = true) {
  const messages = $("messages");
  if (!messages) return;

  const div = document.createElement("div");
  div.className = `msg ${kind === "system" ? "system" : (role === "user" ? "user" : "ai")}`;

  const prefix = kind === "system" ? "Note: " : (role === "user" ? "You: " : "Medical AI: ");
  div.textContent = prefix + text;

  messages.appendChild(div);

  if (persist) persistChat(role, text, kind);
  scrollChat();
}

function addUser(text, persist = true) { addMsg("user", text, "normal", persist); }
function addAI(text, persist = true, kind = "normal") { addMsg("ai", text, kind, persist); }

/* ================== LIST RENDER ================== */
function renderList(ulId, items) {
  const ul = $(ulId);
  if (!ul) return;
  ul.innerHTML = "";
  (items || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  });
}

/* ================== MODE ================== */
function applyModeUI() {
  const info = CONDITIONS[currentMode] || CONDITIONS.general;

  if ($("modeFlag")) $("modeFlag").textContent = `Mode: ${info.label}`;

  if ($("tipsTitle")) $("tipsTitle").textContent = info.tipsTitle;
  renderList("tipsList", info.tips);
  if ($("tipsNote")) $("tipsNote").textContent = info.note;
}

function setConditionMode(mode) {
  if (!CONDITIONS[mode]) mode = "general";
  currentMode = mode;
  localStorage.setItem(KEYS.condition, currentMode);
  applyModeUI();
  addAI(`Condition Mode set to: ${CONDITIONS[currentMode].label}.`, true, "system");
}

/* ================== GAME PLAN ================== */
function generatePlan() {
  const goal = $("goalSelect") ? $("goalSelect").value : "general";

  const plans = {
    general: {
      title: "Today’s Missions (General)",
      items: [
        "Drink water with every meal (3x).",
        "Walk 10 minutes (or 1,000–2,000 steps).",
        "Add 1 fruit or veggie serving.",
        "Do 5 minutes of light stretching.",
        "Write one symptom/energy note today."
      ],
      note: "Small wins stack. Consistency beats intensity."
    },
    bp: {
      title: "Today’s Missions (Blood Pressure)",
      items: [
        "Measure BP once today (seated, calm). Log it.",
        "Swap one salty item for a lower-sodium option.",
        "Take a 10–20 minute walk.",
        "Do 2 minutes of slow breathing (inhale 4, exhale 6).",
        "Plan tomorrow’s breakfast (avoid ultra-processed)."
      ],
      note: "If you feel unwell with very high BP, treat it as urgent."
    },
    steps: {
      title: "Today’s Missions (Steps)",
      items: [
        "Take a 5–10 minute walk after a meal.",
        "Stand up and move for 2 minutes every hour.",
        "Add 500 steps to your baseline.",
        "Stretch calves/hips for 3 minutes.",
        "Log your steps at day end."
      ],
      note: "Start small; add 250–500 steps per day each week."
    },
    sleep: {
      title: "Today’s Missions (Sleep)",
      items: [
        "Set a consistent bedtime window (±30 min).",
        "No caffeine 8 hours before bed.",
        "Dim screens 45 minutes before sleep.",
        "Write a 3-line brain-dump before bed.",
        "Bedroom cool + dark check."
      ],
      note: "Sleep helps BP, glucose, stress, and recovery."
    },
    hydration: {
      title: "Today’s Missions (Hydration)",
      items: [
        "Start day with 8–12 oz water.",
        "Drink 8 oz with each meal.",
        "Carry water during any outing.",
        "Log total ounces in Water tab.",
        "Swap one sugary drink for water."
      ],
      note: "If CKD/heart failure, fluid limits can be individualized—follow your plan."
    },
    stress: {
      title: "Today’s Missions (Stress/Anxiety)",
      items: [
        "2 minutes breathing: inhale 4, exhale 6.",
        "10-minute walk (even indoors).",
        "Do one small task to reduce chaos.",
        "Write one worry → one next step.",
        "Limit doom-scrolling to a set time."
      ],
      note: "If you feel unsafe or at risk of self-harm, seek immediate help (US: 988)."
    },
    ckd: {
      title: "Today’s Missions (Kidney-Friendly)",
      items: [
        "Log BP once today (trend tracking).",
        "Choose one lower-sodium meal/snack.",
        "Avoid NSAIDs unless clinician approved.",
        "Walk 10 minutes (as tolerated).",
        "Write 1 question for your clinician (labs/meds/diet)."
      ],
      note: "Use as coaching, not a prescription. CKD plans are personal."
    },
    lupus: {
      title: "Today’s Missions (Lupus-Friendly)",
      items: [
        "Sun protection check (SPF/clothing).",
        "Pace activity: schedule 1 rest break.",
        "Track flare signs (fatigue/joints/rash).",
        "Gentle movement (stretch or short walk).",
        "Plan one calming activity today."
      ],
      note: "Chest pain, SOB, confusion, sudden swelling → urgent care."
    }
  };

  const plan = plans[goal] || plans.general;

  if ($("planTitle")) $("planTitle").textContent = plan.title;
  renderList("planList", plan.items);
  if ($("planNote")) $("planNote").textContent = plan.note;

  saveLS(KEYS.plan, plan);
}

function loadPlan() {
  const saved = loadLS(KEYS.plan, null);
  if (saved && saved.items) {
    if ($("planTitle")) $("planTitle").textContent = saved.title || "Today’s Missions";
    renderList("planList", saved.items);
    if ($("planNote")) $("planNote").textContent = saved.note || "";
  } else {
    generatePlan();
  }
}

/* ================== RX TRACKING ================== */
function uid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function addRx() {
  const name = ($("rxName")?.value || "").trim();
  const dose = ($("rxDose")?.value || "").trim();
  const time = ($("rxTime")?.value || "").trim();
  const refillDate = $("rxRefillDate")?.value || "";

  if (!name) return alert("Add a medication name.");

  const arr = loadLS(KEYS.rx, []);
  arr.push({ id: uid(), name, dose, time, refillDate, created: Date.now() });
  saveLS(KEYS.rx, arr);

  if ($("rxName")) $("rxName").value = "";
  if ($("rxDose")) $("rxDose").value = "";
  if ($("rxTime")) $("rxTime").value = "";
  if ($("rxRefillDate")) $("rxRefillDate").value = "";

  renderRx();
  addAI("Prescription saved locally on this device. (Not medical advice.)", true, "system");
}

function deleteRx(id) {
  const arr = loadLS(KEYS.rx, []);
  saveLS(KEYS.rx, arr.filter(x => x.id !== id));
  renderRx();
}

function renderRx() {
  const ul = $("rxList");
  if (!ul) return;

  const arr = loadLS(KEYS.rx, []);
  ul.innerHTML = "";

  if (!arr.length) {
    const li = document.createElement("li");
    li.textContent = "No prescriptions saved yet.";
    ul.appendChild(li);
    return;
  }

  arr.forEach(rx => {
    const li = document.createElement("li");
    const refillTxt = rx.refillDate ? ` • Refill: ${rx.refillDate}` : "";
    const timeTxt = rx.time ? ` • Take: ${rx.time}` : "";
    li.textContent = `${rx.name}${rx.dose ? " ("+rx.dose+")" : ""}${timeTxt}${refillTxt}`;

    const del = document.createElement("button");
    del.className = "mini-btn";
    del.type = "button";
    del.textContent = "Remove";
    del.onclick = () => deleteRx(rx.id);

    li.appendChild(del);
    ul.appendChild(li);
  });
}

/* ================== APPOINTMENTS ================== */
function addAppt() {
  const title = ($("apptTitle")?.value || "").trim();
  const date = $("apptDate")?.value || "";
  const time = ($("apptTime")?.value || "").trim();

  if (!title || !date) return alert("Add appointment title + date.");

  const arr = loadLS(KEYS.appt, []);
  arr.push({ id: uid(), title, date, time, created: Date.now() });
  saveLS(KEYS.appt, arr);

  if ($("apptTitle")) $("apptTitle").value = "";
  if ($("apptDate")) $("apptDate").value = "";
  if ($("apptTime")) $("apptTime").value = "";

  renderAppts();
  addAI("Appointment saved locally on this device.", true, "system");
}

function deleteAppt(id) {
  const arr = loadLS(KEYS.appt, []);
  saveLS(KEYS.appt, arr.filter(x => x.id !== id));
  renderAppts();
}

function renderAppts() {
  const ul = $("apptList");
  if (!ul) return;

  const arr = loadLS(KEYS.appt, []);
  ul.innerHTML = "";

  if (!arr.length) {
    const li = document.createElement("li");
    li.textContent = "No appointments saved yet.";
    ul.appendChild(li);
    return;
  }

  arr.slice().sort((a,b) => (a.date > b.date ? 1 : -1)).forEach(ap => {
    const li = document.createElement("li");
    li.textContent = `${ap.title} • ${ap.date}${ap.time ? " • " + ap.time : ""}`;

    const del = document.createElement("button");
    del.className = "mini-btn";
    del.type = "button";
    del.textContent = "Remove";
    del.onclick = () => deleteAppt(ap.id);

    li.appendChild(del);
    ul.appendChild(li);
  });
}

/* ================== METRICS ================== */
function saveBP() {
  const sys = ($("systolic")?.value || "").trim();
  const dia = ($("diastolic")?.value || "").trim();
  if (!sys || !dia) return alert("Enter both systolic and diastolic values.");

  saveLS(KEYS.bp, { sys, dia, date: Date.now() });

  if ($("bpDisplay")) $("bpDisplay").textContent = `${sys}/${dia} mmHg`;
  if ($("systolic")) $("systolic").value = "";
  if ($("diastolic")) $("diastolic").value = "";

  addAI("Saved your blood pressure reading locally on this device.", true, "system");
}

function saveSteps() {
  const steps = ($("stepsInput")?.value || "").trim();
  if (!steps) return;

  localStorage.setItem(KEYS.steps, steps);
  if ($("stepsDisplay")) $("stepsDisplay").textContent = steps;
  if ($("stepsInput")) $("stepsInput").value = "";

  addAI("Saved today’s steps locally on this device.", true, "system");
}

/* ================== CPR (EMERGENCY ONLY) ================== */
function showCPR() {
  addAI(
`CPR (Emergency Only) — quick guide:
1) Check responsiveness. Shout for help.
2) Call 911 (or local emergency). If possible, send someone to get an AED.
3) If not breathing normally: start chest compressions.
4) Hands center of chest. Push hard & fast (about 100–120/min), allow full recoil.
5) If trained, do 30 compressions + 2 breaths. If not trained, hands-only CPR is OK.
6) Use AED ASAP and follow prompts.
Stop only when help takes over or the person wakes/breathes normally.`,
    true,
    "system"
  );
}

/* ================== CHAT LOGIC ================== */
function clearChat() {
  if (!confirm("Clear the chat history on this device?")) return;
  localStorage.removeItem(KEYS.chat);
  if ($("messages")) $("messages").innerHTML = "";
  addAI("Chat cleared. Prevention-first and safety-first, always.", true, "system");
}

function buildResponse(userText) {
  const mode = CONDITIONS[currentMode] || CONDITIONS.general;

  return [
    "I can share general medical education and prevention ideas, not a diagnosis.",
    "",
    `Current mode: ${mode.label}.`,
    "",
    "If you want a prevention plan, say: “Make me a 7-day game plan for ___.”",
    "",
    "To answer your question safely, tell me:",
    "• Age range",
    "• Main symptoms or goal",
    "• How long it’s been going on",
    "• Any meds/supplements",
    "• What makes it better/worse",
    "",
    "If you’re worried this is urgent, contact a clinician or seek urgent care."
  ].join("\n");
}

function sendMessage() {
  const inputEl = $("userInput");
  const input = (inputEl?.value || "").trim();
  if (!input) return;

  addUser(input);
  inputEl.value = "";

  const lc = input.toLowerCase();

  // emergency detection
  if (EMERGENCY_KEYWORDS.some(k => lc.includes(k))) {
    addAI("⚠️ This may be an emergency. Call 911 now. If someone is not breathing or has no pulse, I can show CPR steps.", true, "system");

    const likelyCPR = lc.includes("not breathing") || lc.includes("no pulse") || lc.includes("cpr") || lc.includes("cardiac arrest");
    if (likelyCPR) showCPR();
    return;
  }

  // Educational stub response (you can expand to real “AI style” later)
  addAI(buildResponse(input));
}

/* ================== BOOTSTRAP ================== */
function loadChat() {
  const savedChat = loadLS(KEYS.chat, []);
  if (savedChat.length) {
    savedChat.forEach(m => {
      if (m.role === "user") addUser(m.text, false);
      else addAI(m.text, false, m.kind);
    });
    scrollChat();
  } else {
    const label = (CONDITIONS[currentMode] || CONDITIONS.general).label;
    addAI(`Hi. I’m your Medical AI assistant. I focus on prevention and safety-first education. Current mode: ${label}.`, true, "system");
  }
}

function init() {
  // Load saved mode
  const savedMode = localStorage.getItem(KEYS.condition);
  if (savedMode && CONDITIONS[savedMode]) currentMode = savedMode;
  if ($("conditionSelect")) $("conditionSelect").value = currentMode;

  // Apply tips UI
  applyModeUI();

  // Load BP
  const bp = loadLS(KEYS.bp, null);
  if (bp?.sys && bp?.dia && $("bpDisplay")) $("bpDisplay").textContent = `${bp.sys}/${bp.dia} mmHg`;

  // Load steps
  const steps = localStorage.getItem(KEYS.steps);
  if (steps && $("stepsDisplay")) $("stepsDisplay").textContent = steps;

  // Load extras
  loadPlan();
  renderRx();
  renderAppts();

  // Load chat
  loadChat();

  // Wire events
  $("conditionSelect")?.addEventListener("change", (e) => setConditionMode(e.target.value));

  $("btnAsk")?.addEventListener("click", sendMessage);
  $("btnClearChat")?.addEventListener("click", clearChat);

  $("btnSaveBP")?.addEventListener("click", saveBP);
  $("btnSaveSteps")?.addEventListener("click", saveSteps);

  $("btnPlan")?.addEventListener("click", generatePlan);

  $("btnAddRx")?.addEventListener("click", addRx);
  $("btnAddAppt")?.addEventListener("click", addAppt);

  $("btnCPR")?.addEventListener("click", showCPR);

  // Enter to send (only when in chat input)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement && document.activeElement.id === "userInput") {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Run when DOM ready (script is defer, so DOM is already parsed)
init();
