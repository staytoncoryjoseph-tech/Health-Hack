/* =========================================================
  Ask AI Hub — ask-ai.js
  - Specialist selector: Psych / Medical / Nutrition
  - Swaps dynamic tools panel instantly
  - Fast, local “respond correctly” rule engine
  - Psych includes: PQ-4 + Hotlines + Vent + Sleep tracker (real logs + 7-day avg)
========================================================= */

const $ = (id) => document.getElementById(id);

const KEYS = {
  specialist: "askAI.specialist.v1",
  chat: "askAI.chat.v1",
  psych_pq4: "askAI.psych.pq4.v1",
  psych_sleep: "askAI.psych.sleep.v1",
  medical_bp: "askAI.medical.bp.v1",
  medical_steps: "askAI.medical.steps.v1",
  nutrition_log: "askAI.nutrition.log.v1"
};

const EMERGENCY_KEYWORDS = [
  "chest pain","can't breathe","cannot breathe","shortness of breath","stroke","seizure","unresponsive",
  "not breathing","no pulse","cpr",
  "suicidal","kill myself","hurt myself","self harm","self-harm"
];

let specialist = loadLS(KEYS.specialist, "psych");

/* ------------------ storage helpers ------------------ */
function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
function loadLS(key, fallback){
  const v = localStorage.getItem(key);
  if(!v) return fallback;
  const p = safeParse(v);
  return p ?? fallback;
}
function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

/* ------------------ UI: chat render ------------------ */
function addMsg(kind, text){
  const box = $("chatBox");
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.textContent = (kind === "user" ? "You: " : kind === "ai" ? "AI: " : "Note: ") + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  const arr = loadLS(KEYS.chat, []);
  arr.push({ kind, text, t: Date.now(), specialist });
  saveLS(KEYS.chat, arr.slice(-200));
}

function setEngine(text){
  $("engineBox").textContent = text;
}

/* ------------------ Specialist: set + swap ------------------ */
function setSpecialist(next){
  specialist = next;
  saveLS(KEYS.specialist, specialist);

  // pill UI
  document.querySelectorAll(".pill").forEach(p => {
    const on = p.dataset.ai === specialist;
    p.classList.toggle("isActive", on);
    p.setAttribute("aria-selected", on ? "true" : "false");
  });

  // headings
  const map = {
    psych: { chatTitle:"Chat (Psychologist)", chatSub:"Support + coping tools. Not a therapist.", pro:"Try: “I can’t sleep. Make a plan.”" },
    medical: { chatTitle:"Chat (Medical)", chatSub:"General education + prevention. Not a doctor.", pro:"Try: “My BP is 142/88 — what lifestyle steps?”" },
    nutrition: { chatTitle:"Chat (Nutritionist)", chatSub:"General nutrition coaching. Not a dietitian.", pro:"Try: “Make a balanced day of meals for energy.”" }
  };
  $("chatTitle").textContent = map[specialist].chatTitle;
  $("chatSub").textContent = map[specialist].chatSub;
  $("proTip").textContent = "Pro move: " + map[specialist].pro;

  // dynamic panel
  renderDynamicPanel();

  // system note
  addMsg("sys", `Switched to ${specialist.toUpperCase()} mode. The tools below updated.`);
}

/* ------------------ Dynamic Panel HTML ------------------ */
function renderDynamicPanel(){
  const dynTitle = $("dynTitle");
  const dynDesc = $("dynDesc");
  const dynBody = $("dynBody");

  dynBody.innerHTML = "";

  if(specialist === "psych"){
    dynTitle.textContent = "Psychologist Tools";
    dynDesc.textContent = "PQ-4, sleep tracker (real logs), hotlines/resources, vent box.";

    dynBody.appendChild(panelPQ4());
    dynBody.appendChild(panelSleep());
    dynBody.appendChild(panelSupport());
    dynBody.appendChild(panelVent());
    return;
  }

  if(specialist === "medical"){
    dynTitle.textContent = "Medical Tools";
    dynDesc.textContent = "Blood pressure + steps tracking + safety-first guidance (emergency-only CPR).";

    dynBody.appendChild(panelBP());
    dynBody.appendChild(panelSteps());
    dynBody.appendChild(panelCPR());
    dynBody.appendChild(panelLupusTips());
    return;
  }

  if(specialist === "nutrition"){
    dynTitle.textContent = "Nutritionist Tools";
    dynDesc.textContent = "Meal log + water goals + fast healthy templates + lupus-friendly option.";

    dynBody.appendChild(panelNutritionQuick());
    dynBody.appendChild(panelMealLog());
    dynBody.appendChild(panelWater());
    dynBody.appendChild(panelLupusNutrition());
    return;
  }
}

/* ------------------ Panels: Psych ------------------ */
function makePanel(title){
  const wrap = document.createElement("div");
  wrap.className = "panel";
  const h = document.createElement("h3");
  h.textContent = title;
  wrap.appendChild(h);
  return wrap;
}

function panelPQ4(){
  const p = makePanel("PQ-4 Quick Screen (educational)");
  p.insertAdjacentHTML("beforeend", `
    <p class="small">Over the last 2 weeks, how often have you been bothered by these?</p>
    <div class="small">1) Anxious/on edge</div>
    <select id="pq1">
      <option value="0">Not at all</option><option value="1">Several days</option><option value="2">More than half</option><option value="3">Nearly every day</option>
    </select>
    <div class="small" style="margin-top:8px;">2) Can’t stop worrying</div>
    <select id="pq2">
      <option value="0">Not at all</option><option value="1">Several days</option><option value="2">More than half</option><option value="3">Nearly every day</option>
    </select>
    <div class="small" style="margin-top:8px;">3) Little interest/pleasure</div>
    <select id="pq3">
      <option value="0">Not at all</option><option value="1">Several days</option><option value="2">More than half</option><option value="3">Nearly every day</option>
    </select>
    <div class="small" style="margin-top:8px;">4) Down/depressed/hopeless</div>
    <select id="pq4">
      <option value="0">Not at all</option><option value="1">Several days</option><option value="2">More than half</option><option value="3">Nearly every day</option>
    </select>

    <div class="btnRow" style="margin-top:10px;">
      <button class="secondary" id="btnPQ4">Score PQ-4</button>
      <button class="secondary" id="btnPQ4Reset">Reset</button>
    </div>

    <div class="box" id="pqOut" style="min-height:90px;margin-top:10px;">Score appears here…</div>
  `);

  // load saved
  queueMicrotask(() => {
    const saved = loadLS(KEYS.psych_pq4, null);
    if(saved){
      $("pq1").value = String(saved.q1 ?? 0);
      $("pq2").value = String(saved.q2 ?? 0);
      $("pq3").value = String(saved.q3 ?? 0);
      $("pq4").value = String(saved.q4 ?? 0);
      $("pqOut").textContent = saved.out ?? "Score appears here…";
    }

    $("btnPQ4").onclick = () => {
      const q1 = Number($("pq1").value), q2 = Number($("pq2").value), q3 = Number($("pq3").value), q4 = Number($("pq4").value);
      const total = q1+q2+q3+q4;

      let label = "";
      if(total <= 2) label = "Low signal. Keep routines + check in weekly.";
      else if(total <= 6) label = "Moderate signal. Add coping plan. Consider professional support if persistent.";
      else label = "High signal. Strongly consider professional support soon. If unsafe, seek immediate help.";

      const out =
        `PQ-4 Total: ${total}\n` +
        `${label}\n\n` +
        `Reminder: This is a SCREEN, not a diagnosis.`;

      $("pqOut").textContent = out;
      saveLS(KEYS.psych_pq4, { q1,q2,q3,q4,total,out, t: Date.now() });

      setEngine(out);
      addMsg("ai", "PQ-4 scored. If you want, tell me your biggest struggle right now (sleep, anxiety, mood, stress).");
    };

    $("btnPQ4Reset").onclick = () => {
      localStorage.removeItem(KEYS.psych_pq4);
      $("pq1").value = "0"; $("pq2").value="0"; $("pq3").value="0"; $("pq4").value="0";
      $("pqOut").textContent = "Score appears here…";
    };
  });

  return p;
}

function panelSleep(){
  const p = makePanel("Sleep Tracker (works for real)");
  p.insertAdjacentHTML("beforeend", `
    <p class="small">Log last night’s sleep. This device stores it locally and calculates a 7-day average.</p>

    <div class="small">Bedtime</div>
    <input id="sleepBed" type="time" />
    <div class="small" style="margin-top:8px;">Wake time</div>
    <input id="sleepWake" type="time" />
    <div class="small" style="margin-top:8px;">Sleep quality</div>
    <select id="sleepQuality">
      <option value="5">5 - Great</option>
      <option value="4">4 - Good</option>
      <option value="3" selected>3 - Okay</option>
      <option value="2">2 - Rough</option>
      <option value="1">1 - Terrible</option>
    </select>

    <div class="btnRow" style="margin-top:10px;">
      <button class="secondary" id="btnSleepSave">Save Sleep</button>
      <button class="secondary" id="btnSleepClear">Clear Logs</button>
    </div>

    <div class="box" id="sleepOut" style="min-height:120px;margin-top:10px;">No sleep logs yet…</div>
  `);

  function minutesBetween(bed, wake){
    // bed/wake are "HH:MM"
    const [bh,bm] = bed.split(":").map(Number);
    const [wh,wm] = wake.split(":").map(Number);
    const bedM = bh*60 + bm;
    const wakeM = wh*60 + wm;
    let diff = wakeM - bedM;
    if(diff <= 0) diff += 24*60; // crossed midnight
    return diff;
  }

  function fmtDuration(mins){
    const h = Math.floor(mins/60);
    const m = mins%60;
    return `${h}h ${String(m).padStart(2,"0")}m`;
  }

  function renderSleep(){
    const logs = loadLS(KEYS.psych_sleep, []);
    if(!logs.length){
      $("sleepOut").textContent = "No sleep logs yet…";
      return;
    }
    // last 7
    const last7 = logs.slice(-7);
    const avgMins = Math.round(last7.reduce((a,x)=>a + (x.mins||0),0) / last7.length);
    const avgQ = (last7.reduce((a,x)=>a + (x.q||0),0) / last7.length).toFixed(1);
    const last = last7[last7.length-1];

    const lines = [];
    lines.push(`Last night: ${fmtDuration(last.mins)} • Quality: ${last.q}/5`);
    lines.push(`7-day average: ${fmtDuration(avgMins)} • Avg quality: ${avgQ}/5`);
    lines.push("");
    lines.push("Recent logs:");
    last7.slice().reverse().forEach(l => {
      const d = new Date(l.t);
      lines.push(`• ${d.toLocaleDateString()} — ${fmtDuration(l.mins)} • Q${l.q}/5 (bed ${l.bed}, wake ${l.wake})`);
    });

    $("sleepOut").textContent = lines.join("\n");
  }

  queueMicrotask(() => {
    renderSleep();

    $("btnSleepSave").onclick = () => {
      const bed = ($("sleepBed").value || "").trim();
      const wake = ($("sleepWake").value || "").trim();
      const q = Number($("sleepQuality").value);

      if(!bed || !wake) return alert("Set both bedtime and wake time.");

      const mins = minutesBetween(bed, wake);
      const logs = loadLS(KEYS.psych_sleep, []);
      logs.push({ bed, wake, q, mins, t: Date.now() });
      saveLS(KEYS.psych_sleep, logs.slice(-30));

      renderSleep();

      const msg =
        `Sleep logged: ${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m • Quality ${q}/5.\n` +
        `Want a sleep game plan for tonight? (yes/no)`;
      setEngine(msg);
      addMsg("ai", msg);
    };

    $("btnSleepClear").onclick = () => {
      if(!confirm("Clear all sleep logs on this device?")) return;
      localStorage.removeItem(KEYS.psych_sleep);
      renderSleep();
    };
  });

  return p;
}

function panelSupport(){
  const p = makePanel("Support Resources");
  p.insertAdjacentHTML("beforeend", `
    <ul class="list">
      <li><strong class="danger">Emergency:</strong> Call 911 if you’re in immediate danger.</li>
      <li><strong class="warn">U.S. Crisis Support:</strong> Call/Text <strong>988</strong> (Suicide & Crisis Lifeline).</li>
      <li><strong>When to reach out:</strong> thoughts of self-harm, feeling unsafe, panic you can’t calm, or you’re spiraling.</li>
    </ul>
    <div class="btnRow">
      <button class="secondary" id="btnHowFeeling">How are you feeling today?</button>
      <button class="secondary" id="btnCoping">Give me a coping tool</button>
    </div>
  `);

  queueMicrotask(() => {
    $("btnHowFeeling").onclick = () => {
      const out =
        "Quick check-in:\n" +
        "1) Pick one: anxious / down / overwhelmed / angry / numb\n" +
        "2) Rate intensity 1–10\n" +
        "3) What triggered it (one sentence)\n\n" +
        "Reply in the chat with: feeling=__ intensity=__ trigger=__";
      setEngine(out);
      addMsg("ai", out);
    };

    $("btnCoping").onclick = () => {
      const out =
        "Coping tool (2 minutes):\n" +
        "• Inhale 4 seconds\n" +
        "• Exhale 6 seconds\n" +
        "• Repeat 10 cycles\n\n" +
        "Then: name ONE next step you can do in the next 10 minutes.";
      setEngine(out);
      addMsg("ai", out);
    };
  });

  return p;
}

function panelVent(){
  const p = makePanel("Get it off your chest (vent)");
  p.insertAdjacentHTML("beforeend", `
    <p class="small">Write freely. Nothing is sent anywhere. You can copy it into chat if you want a response.</p>
    <textarea id="ventBox" placeholder="Just vent here…"></textarea>
    <div class="btnRow">
      <button class="secondary" id="btnVentToChat">Send vent to chat</button>
      <button class="secondary" id="btnVentClear">Clear</button>
    </div>
  `);

  queueMicrotask(() => {
    $("btnVentToChat").onclick = () => {
      const v = ($("ventBox").value || "").trim();
      if(!v) return;
      $("chatInput").value = v;
      sendChat();
    };
    $("btnVentClear").onclick = () => { $("ventBox").value = ""; };
  });

  return p;
}

/* ------------------ Panels: Medical ------------------ */
function panelBP(){
  const p = makePanel("Blood Pressure (local)");
  p.insertAdjacentHTML("beforeend", `
    <div class="small">Last reading: <span id="bpLast" class="ok">Not recorded</span></div>
    <div class="btnRow" style="margin-top:10px;">
      <input id="bpSys" inputmode="numeric" placeholder="Systolic (e.g. 120)" />
      <input id="bpDia" inputmode="numeric" placeholder="Diastolic (e.g. 80)" />
      <button class="secondary" id="btnBpSave">Save</button>
    </div>
    <p class="small">Tip: seated, calm, arm supported. Track trends, not one reading.</p>
  `);

  queueMicrotask(() => {
    const saved = loadLS(KEYS.medical_bp, null);
    if(saved?.sys && saved?.dia) $("bpLast").textContent = `${saved.sys}/${saved.dia} mmHg`;

    $("btnBpSave").onclick = () => {
      const sys = ($("bpSys").value||"").trim();
      const dia = ($("bpDia").value||"").trim();
      if(!sys || !dia) return alert("Enter both systolic and diastolic.");
      saveLS(KEYS.medical_bp, { sys, dia, t: Date.now() });
      $("bpLast").textContent = `${sys}/${dia} mmHg`;
      $("bpSys").value = ""; $("bpDia").value = "";

      const out =
        `Saved BP: ${sys}/${dia} mmHg.\n\n` +
        `Prevention steps:\n• Walk 10–20 minutes\n• Lower sodium today\n• Prioritize sleep tonight\n• Re-check same time tomorrow`;
      setEngine(out);
      addMsg("ai", out);
    };
  });

  return p;
}

function panelSteps(){
  const p = makePanel("Steps (local)");
  p.insertAdjacentHTML("beforeend", `
    <div class="small">Today’s steps: <span id="stepsLast" class="ok">0</span></div>
    <div class="btnRow" style="margin-top:10px;">
      <input id="stepsIn" inputmode="numeric" placeholder="Enter steps" />
      <button class="secondary" id="btnStepsSave">Save</button>
    </div>
    <p class="small">Auto-tracking can be added later for mobile builds.</p>
  `);

  queueMicrotask(() => {
    const saved = localStorage.getItem(KEYS.medical_steps);
    if(saved) $("stepsLast").textContent = saved;

    $("btnStepsSave").onclick = () => {
      const v = ($("stepsIn").value||"").trim();
      if(!v) return;
      localStorage.setItem(KEYS.medical_steps, v);
      $("stepsLast").textContent = v;
      $("stepsIn").value = "";

      const out =
        `Saved steps: ${v}.\n\n` +
        `Next tiny upgrade: add 500 steps tomorrow (one 8–10 minute walk).`;
      setEngine(out);
      addMsg("ai", out);
    };
  });

  return p;
}

function panelCPR(){
  const p = makePanel("Emergency-only CPR");
  p.insertAdjacentHTML("beforeend", `
    <p class="small">CPR guidance is shown only when you ask or an emergency keyword appears.</p>
    <div class="btnRow">
      <button class="secondary" id="btnCPR">Show CPR steps</button>
    </div>
  `);

  queueMicrotask(() => {
    $("btnCPR").onclick = () => {
      const out =
        "CPR (Emergency Only):\n" +
        "1) Check responsiveness. Shout for help.\n" +
        "2) Call 911. Send someone for an AED.\n" +
        "3) If not breathing normally: start compressions.\n" +
        "4) Hands center chest. Push hard & fast (100–120/min).\n" +
        "5) If trained: 30 compressions + 2 breaths. If not trained: hands-only CPR is OK.\n" +
        "6) Use AED ASAP and follow prompts.";
      setEngine(out);
      addMsg("sys", out);
    };
  });

  return p;
}

function panelLupusTips(){
  const p = makePanel("Lupus (SLE) — safety-first tips (optional)");
  p.insertAdjacentHTML("beforeend", `
    <ul class="list">
      <li>Track flare signals: fatigue, joint pain, rash, fever, swelling.</li>
      <li>Sun protection matters: SPF + protective clothing.</li>
      <li>Pace activity: plan rest breaks to prevent crashes.</li>
      <li class="warn">No medication dosing advice here — follow your clinician plan.</li>
      <li class="danger">Chest pain, shortness of breath, confusion, sudden swelling → urgent evaluation.</li>
    </ul>
  `);
  return p;
}

/* ------------------ Panels: Nutrition ------------------ */
function panelNutritionQuick(){
  const p = makePanel("Quick Picks");
  p.insertAdjacentHTML("beforeend", `
    <div class="small">Choose a goal and generate a simple day plan.</div>
    <select id="nutGoal">
      <option value="balance">Balanced Meals</option>
      <option value="energy">More Energy</option>
      <option value="hydration">Hydration</option>
      <option value="bp">Blood Pressure Friendly</option>
      <option value="diabetes">Blood Sugar Friendly</option>
      <option value="lupus">Lupus-Friendly (general)</option>
    </select>
    <div class="btnRow" style="margin-top:10px;">
      <button class="secondary" id="btnNutPlan">Generate</button>
    </div>
    <div class="box" id="nutOut" style="min-height:120px;margin-top:10px;">Plan appears here…</div>
  `);

  queueMicrotask(() => {
    $("btnNutPlan").onclick = () => {
      const g = $("nutGoal").value;
      const plans = {
        balance: "Balanced day:\n• Breakfast: eggs + fruit\n• Lunch: chicken/tuna salad + whole grain\n• Dinner: lean protein + veggies + small starch\n• Snack: yogurt/nuts\n",
        energy: "Energy day:\n• Protein at every meal\n• Add fiber (oats/beans/berries)\n• 10-min walk after lunch\n• Hydrate steadily\n",
        hydration: "Hydration day:\n• 8–12 oz on wake\n• 8 oz with each meal\n• Add electrolytes only if appropriate\n",
        bp: "BP-friendly:\n• Lower sodium today\n• Add potassium foods only if your clinician says okay\n• Lean proteins + veggies\n",
        diabetes: "Blood sugar friendly:\n• Fiber + protein first\n• Avoid liquid sugar\n• Walk after meals\n",
        lupus: "Lupus-friendly (general):\n• Anti-inflammatory pattern: fish/olive oil/nuts/berries/greens\n• Hydration + sleep routine\n• Gentle movement\n"
      };
      const out = plans[g] + "\nEducational only — for medical diets follow your clinician/dietitian plan.";
      $("nutOut").textContent = out;
      setEngine(out);
      addMsg("ai", out);
    };
  });

  return p;
}

function panelMealLog(){
  const p = makePanel("Meal Log (local)");
  p.insertAdjacentHTML("beforeend", `
    <div class="small">Log meals quickly. Stored locally on this device.</div>
    <input id="mealText" placeholder="Meal (e.g., chicken + rice + salad)" />
    <div class="btnRow" style="margin-top:10px;">
      <button class="secondary" id="btnMealAdd">Add</button>
      <button class="secondary" id="btnMealClear">Clear</button>
    </div>
    <div class="box" id="mealOut" style="min-height:120px;margin-top:10px;">No meals yet…</div>
  `);

  function render(){
    const arr = loadLS(KEYS.nutrition_log, []);
    if(!arr.length){ $("mealOut").textContent = "No meals yet…"; return; }
    const lines = arr.slice(-12).reverse().map(m => {
      const d = new Date(m.t);
      return `• ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} — ${m.text}`;
    });
    $("mealOut").textContent = lines.join("\n");
  }

  queueMicrotask(() => {
    render();
    $("btnMealAdd").onclick = () => {
      const t = ($("mealText").value||"").trim();
      if(!t) return;
      const arr = loadLS(KEYS.nutrition_log, []);
      arr.push({ text:t, t: Date.now() });
      saveLS(KEYS.nutrition_log, arr.slice(-60));
      $("mealText").value = "";
      render();
      const out = `Meal saved. Want healthier swaps for this meal? Paste it into chat.`;
      setEngine(out);
      addMsg("ai", out);
    };
    $("btnMealClear").onclick = () => {
      if(!confirm("Clear all meals on this device?")) return;
      localStorage.removeItem(KEYS.nutrition_log);
      render();
    };
  });

  return p;
}

function panelWater(){
  const p = makePanel("Water Boost (quick add)");
  p.insertAdjacentHTML("beforeend", `
    <div class="small">Quick adds (not medical advice):</div>
    <div class="btnRow">
      <button class="secondary" data-oz="8">+8 oz</button>
      <button class="secondary" data-oz="12">+12 oz</button>
      <button class="secondary" data-oz="16">+16 oz</button>
    </div>
    <div class="box" id="waterOut" style="min-height:90px;margin-top:10px;">Today: 0 oz</div>
  `);

  const key = "askAI.water.v1";

  function getTodayKey(){
    const d = new Date();
    return `${key}.${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }
  function render(){
    const v = Number(localStorage.getItem(getTodayKey()) || "0");
    $("waterOut").textContent = `Today: ${v} oz`;
  }

  queueMicrotask(() => {
    render();
    p.querySelectorAll("button[data-oz]").forEach(btn => {
      btn.onclick = () => {
        const add = Number(btn.dataset.oz);
        const k = getTodayKey();
        const v = Number(localStorage.getItem(k) || "0") + add;
        localStorage.setItem(k, String(v));
        render();
        const out = `Water updated: Today ${v} oz. Keep it steady, not all at once.`;
        setEngine(out);
        addMsg("ai", out);
      };
    });
  });

  return p;
}

function panelLupusNutrition(){
  const p = makePanel("Lupus-friendly nutrition (general)");
  p.insertAdjacentHTML("beforeend", `
    <ul class="list">
      <li>Prioritize anti-inflammatory pattern: fish, olive oil, nuts, berries, greens.</li>
      <li>Protein + fiber with meals can help steady energy.</li>
      <li>Hydration + sleep routine help recovery.</li>
      <li class="warn">Avoid supplement megadoses unless clinician-approved.</li>
    </ul>
  `);
  return p;
}

/* ------------------ Chat engine ------------------ */
function emergencyCheck(text){
  const lc = text.toLowerCase();
  return EMERGENCY_KEYWORDS.some(k => lc.includes(k));
}

function engineRespond(text){
  const lc = text.toLowerCase();

  // emergency
  if(emergencyCheck(text)){
    return (
      "⚠️ This may be an emergency.\n" +
      "Call 911 (or your local emergency number) now.\n" +
      "If someone is not breathing or has no pulse, ask for CPR steps."
    );
  }

  // fast routing by specialist
  if(specialist === "psych"){
    if(lc.includes("sleep") || lc.includes("insomnia")){
      return (
        "Sleep game plan (tonight):\n" +
        "• Same wake time tomorrow\n" +
        "• No caffeine 8 hours before bed\n" +
        "• Screen dim 45 minutes before sleep\n" +
        "• 2 minutes breathing (inhale 4, exhale 6)\n" +
        "• If you wake up: low light, no phone, back to bed when sleepy\n\n" +
        "If you want, log last night in the Sleep Tracker panel."
      );
    }
    if(lc.includes("anxiety") || lc.includes("panic") || lc.includes("stress")){
      return (
        "Quick anxiety plan (2–5 minutes):\n" +
        "• Inhale 4, exhale 6 (10 cycles)\n" +
        "• Name 5 things you see (grounding)\n" +
        "• One tiny next step you can do in 10 minutes\n\n" +
        "Reply: feeling=__ intensity=__ trigger=__"
      );
    }
    return (
      "I’m here with you. I’m not a therapist, but I can help you steady the moment.\n\n" +
      "Tell me:\n• What are you feeling (one word)?\n• Intensity 1–10?\n• What triggered it (one sentence)?\n\n" +
      "Then I’ll give one coping tool + one tiny next step."
    );
  }

  if(specialist === "medical"){
    // BP pattern detection like 142/88
    const bpMatch = lc.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if(bpMatch){
      const sys = Number(bpMatch[1]), dia = Number(bpMatch[2]);
      return (
        `BP noted: ${sys}/${dia} mmHg (educational only).\n\n` +
        "Prevention-first steps:\n" +
        "• Walk 10–20 minutes today\n" +
        "• Lower sodium for the next 24 hours\n" +
        "• Prioritize sleep tonight\n" +
        "• Track trend daily for a week\n\n" +
        "If you feel unwell (chest pain, severe headache, weakness, vision changes) seek urgent care."
      );
    }
    if(lc.includes("lupus")){
      return (
        "Lupus (SLE) general tips (educational):\n" +
        "• Track flare signals (fatigue, joint pain, rash)\n" +
        "• Sun protection (SPF + clothing)\n" +
        "• Pace activity + rest breaks\n" +
        "• Bring symptom timeline to your clinician\n\n" +
        "Chest pain, shortness of breath, confusion, sudden swelling → urgent evaluation."
      );
    }
    return (
      "I can share general medical education and prevention ideas, not a diagnosis.\n\n" +
      "To answer safely, tell me:\n• Age range\n• What symptom/goal\n• How long it’s been happening\n• Any meds/supplements\n• What makes it better/worse"
    );
  }

  // nutrition
  if(specialist === "nutrition"){
    if(lc.includes("meal plan") || lc.includes("plan")){
      return (
        "Simple balanced day:\n" +
        "• Breakfast: eggs + fruit\n" +
        "• Lunch: protein + salad + whole grain\n" +
        "• Dinner: lean protein + veggies + small starch\n" +
        "• Snack: yogurt or nuts\n\n" +
        "Want it tailored to: energy, weight, BP-friendly, blood-sugar-friendly?"
      );
    }
    if(lc.includes("water")){
      return "Hydration tip: steady intake through the day beats chugging. Use the Water Boost buttons below.";
    }
    if(lc.includes("lupus")){
      return (
        "Lupus-friendly (general) nutrition pattern:\n" +
        "• Fish/olive oil/nuts/berries/greens\n" +
        "• Protein + fiber for steady energy\n" +
        "• Hydration + consistent sleep routine\n\n" +
        "Educational only — follow clinician/dietitian plan for medical diets."
      );
    }
    return (
      "Tell me your goal:\n" +
      "• energy / weight / hydration / BP-friendly / blood-sugar-friendly\n" +
      "and one typical meal you eat. I’ll suggest better swaps."
    );
  }
}

/* ------------------ actions ------------------ */
function sendChat(){
  const input = ($("chatInput").value || "").trim();
  if(!input) return;

  addMsg("user", input);
  $("chatInput").value = "";

  const out = engineRespond(input);
  setEngine(out);

  // emergency → show as system note
  if(emergencyCheck(input)) addMsg("sys", out);
  else addMsg("ai", out);
}

/* ------------------ init ------------------ */
function loadChat(){
  const arr = loadLS(KEYS.chat, []);
  $("chatBox").innerHTML = "";
  if(!arr.length){
    addMsg("sys", "Pick a specialist, then ask a question. The tools below change automatically.");
    return;
  }
  arr.forEach(m => {
    // don’t replay old messages from other specialist if you don’t want that
    // (keeping them is fine; we’ll show all)
    const div = document.createElement("div");
    div.className = `msg ${m.kind}`;
    div.textContent = (m.kind === "user" ? "You: " : m.kind === "ai" ? "AI: " : "Note: ") + m.text;
    $("chatBox").appendChild(div);
  });
  $("chatBox").scrollTop = $("chatBox").scrollHeight;
}

function demoPrompt(){
  const demos = {
    psych: "I can’t sleep and my mind races at night. Make me a plan.",
    medical: "My blood pressure is 142/88. What prevention steps should I do today?",
    nutrition: "Make me a balanced meal day for more energy."
  };
  $("chatInput").value = demos[specialist] || demos.psych;
}

function copyEngine(){
  const text = $("engineBox").textContent || "";
  navigator.clipboard?.writeText(text).then(() => {
    addMsg("sys", "Copied engine output to clipboard.");
  }).catch(() => {
    alert("Copy failed. Select the text and copy manually.");
  });
}

function wire(){
  // pills
  document.querySelectorAll(".pill").forEach(p => {
    p.addEventListener("click", () => setSpecialist(p.dataset.ai));
  });

  $("btnAsk").onclick = sendChat;
  $("btnClear").onclick = () => {
    if(!confirm("Clear chat on this device?")) return;
    localStorage.removeItem(KEYS.chat);
    loadChat();
  };
  $("btnDemo").onclick = demoPrompt;
  $("btnCopy").onclick = copyEngine;

  document.addEventListener("keydown", (e) => {
    if(e.key === "Enter" && document.activeElement?.id === "chatInput"){
      e.preventDefault();
      sendChat();
    }
  });
}

function start(){
  wire();
  loadChat();
  renderDynamicPanel();

  // set pill state from saved
  document.querySelectorAll(".pill").forEach(p => {
    const on = p.dataset.ai === specialist;
    p.classList.toggle("isActive", on);
    p.setAttribute("aria-selected", on ? "true" : "false");
  });

  // set headings for current
  const map = {
    psych: { chatTitle:"Chat (Psychologist)", chatSub:"Support + coping tools. Not a therapist.", pro:"Try: “I can’t sleep. Make a plan.”" },
    medical: { chatTitle:"Chat (Medical)", chatSub:"General education + prevention. Not a doctor.", pro:"Try: “My BP is 142/88 — what lifestyle steps?”" },
    nutrition: { chatTitle:"Chat (Nutritionist)", chatSub:"General nutrition coaching. Not a dietitian.", pro:"Try: “Make a balanced day of meals for energy.”" }
  };
  $("chatTitle").textContent = map[specialist].chatTitle;
  $("chatSub").textContent = map[specialist].chatSub;
  $("proTip").textContent = "Pro move: " + map[specialist].pro;
}

start();
