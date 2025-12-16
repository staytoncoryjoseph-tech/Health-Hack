let PROFILE = null;
let ACTIVE_AI = null;

const $ = (id) => document.getElementById(id);

function addMsg(role, text){
  const chat = $("chat");
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "ai");
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function formatReply(ai, reply){
  const head = `${ai.emoji} ${ai.name}\n`;
  const title = reply.title ? `\n${reply.title}\n` : "\n";
  const bullets = (reply.bullets || []).map(b => `• ${b}`).join("\n");
  const action = reply.action ? `\n\nACTION STEP:\n${reply.action}` : "";
  return head + title + bullets + action;
}

function normalize(s){ return (s||"").toLowerCase(); }

function pickReplyKey(ai, q){
  const text = normalize(q);

  // match rules
  const rules = ai.rules?.ifContains || [];
  for (const r of rules){
    for (const m of r.match){
      if (text.includes(normalize(m))) return r.replyKey;
    }
  }

  // special parsing: BP formats like 142/88
  const bpMatch = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (bpMatch){
    const sys = Number(bpMatch[1]), dia = Number(bpMatch[2]);
    const t = PROFILE.context.targets.bp;
    if (sys > t.sysMax || dia > t.diaMax) return "bp_high";
    return "bp_default";
  }

  // hydration parsing like 24oz
  const ozMatch = text.match(/(\d{1,3})\s*oz/);
  if (ozMatch){
    const oz = Number(ozMatch[1]);
    const h = PROFILE.context.targets.hydration;
    if (oz < h.minOz) return "hydration_low";
    if (oz > h.maxOz) return "hydration_high";
    return "hydration_default";
  }

  // fallback defaults
  const defs = ai.rules?.defaults || [];
  return defs[0] || "medical_default";
}

function renderAISelect(){
  const sel = $("aiSelect");
  sel.innerHTML = "";
  PROFILE.ais.forEach(ai => {
    const opt = document.createElement("option");
    opt.value = ai.id;
    opt.textContent = `${ai.emoji} ${ai.name}`;
    sel.appendChild(opt);
  });
}

function setActiveAI(id){
  ACTIVE_AI = PROFILE.ais.find(a => a.id === id) || PROFILE.ais[0];
  $("disclaimerBox").textContent = `${PROFILE.shared.globalDisclaimer}\n\n${ACTIVE_AI.disclaimer}`;
  $("engineMeta").textContent = `Active: ${ACTIVE_AI.name} • CKD Stage ${PROFILE.context.ckdStage}`;
  renderChips();
}

function renderChips(){
  const wrap = $("quickChips");
  wrap.innerHTML = "";
  (ACTIVE_AI.quickPrompts || []).forEach(p => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = p;
    chip.onclick = () => { $("q").value = p; $("q").focus(); };
    wrap.appendChild(chip);
  });
}

async function loadProfiles(){
  const res = await fetch("ai-profiles.json");
  PROFILE = await res.json();
  renderAISelect();
  setActiveAI(PROFILE.ais[0].id);
  addMsg("ai", `Welcome to ${PROFILE.app.name}.\nPick an AI specialist, then ask your question.`);
}

function ask(){
  const q = $("q").value.trim();
  if (!q) return;
  addMsg("user", q);

  const key = pickReplyKey(ACTIVE_AI, q);
  const reply = PROFILE.replies[key] || PROFILE.replies["medical_default"];
  const out = formatReply(ACTIVE_AI, reply);

  addMsg("ai", out);
  $("engineOut").value = out;
  $("q").value = "";
}

$("btnAsk").addEventListener("click", ask);
$("q").addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); ask(); } });

$("aiSelect").addEventListener("change", (e)=> setActiveAI(e.target.value));

$("btnClear").addEventListener("click", ()=>{
  $("chat").innerHTML = "";
  $("engineOut").value = "";
  addMsg("ai", "Cleared. Ask again when ready.");
});

$("btnCopy").addEventListener("click", async ()=>{
  const text = $("engineOut").value || "";
  if (!text) return;
  await navigator.clipboard.writeText(text);
  addMsg("ai", "Copied to clipboard ✅");
});

$("btnDemo").addEventListener("click", ()=>{
  const demos = [
    "My BP is 142/88 — what does that mean?",
    "I only drank 24oz today — what should I do?",
    "I ate fast food and chips, help me plan tomorrow.",
    "I feel overwhelmed and anxious right now."
  ];
  $("q").value = demos[Math.floor(Math.random()*demos.length)];
  $("q").focus();
});

loadProfiles();
