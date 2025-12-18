// ---------------------------
// UV Tracker (local-first) + Auto-location + Photosensitive Mode
// ---------------------------
const UV_KEY = "hh_uv_today";
const UV_PHOTO_KEY = "hh_uv_photo_mode";

function uvDayKey(){ return new Date().toISOString().slice(0,10); }

function isPhotoMode(){
  return localStorage.getItem(UV_PHOTO_KEY) === "1";
}

function setPhotoMode(on){
  localStorage.setItem(UV_PHOTO_KEY, on ? "1" : "0");
  const hint = $("uvPhotoHint");
  if(hint) hint.textContent = on ? "Stricter guidance ON" : "Normal guidance";
}

function setUVDot(level){
  const dot = $("uvDot");
  if(!dot) return;

  if(level == null){
    dot.style.background = "rgba(234,240,255,.35)";
    dot.style.boxShadow = "0 0 0 6px rgba(234,240,255,.08)";
    return;
  }

  // In photosensitive mode, shift thresholds stricter
  const photo = isPhotoMode();
  const L = Number(level);

  // thresholds:
  // normal: <3 low, <6 moderate, else high
  // photo:  <2.5 low, <4.5 moderate, else high
  const lowMax = photo ? 2.5 : 3;
  const modMax = photo ? 4.5 : 6;

  if(L < lowMax){
    dot.style.background = "rgba(41,211,145,.95)";
    dot.style.boxShadow = "0 0 0 6px rgba(41,211,145,.12)";
  } else if(L < modMax){
    dot.style.background = "rgba(255,209,102,.95)";
    dot.style.boxShadow = "0 0 0 6px rgba(255,209,102,.12)";
  } else {
    dot.style.background = "rgba(255,93,108,.95)";
    dot.style.boxShadow = "0 0 0 6px rgba(255,93,108,.12)";
  }
}

function uvAdvice(level){
  if(level == null) return "Save a UV reading to get guidance.";

  const photo = isPhotoMode();
  const L = Number(level);

  // Make advice stricter if photosensitive mode enabled
  if(!photo){
    if(L < 3) return "Low UV. Still consider protection if you're photosensitive. Hat + shade is an easy win.";
    if(L < 6) return "Moderate UV. Plan shade, consider long sleeves/hat, and avoid peak sun when possible.";
    if(L < 8) return "High UV. Prefer shade + protective clothing. Limit outdoor time during peak hours.";
    if(L < 11) return "Very High UV. Minimize sun exposure. Prioritize shade/cover and indoor alternatives.";
    return "Extreme UV. Avoid direct sun as much as possible and protect aggressively (shade + coverage).";
  } else {
    if(L < 2.5) return "Low UV (photosensitive mode). Still use shade/hat if you react strongly to UV.";
    if(L < 4.5) return "Moderate UV (photosensitive mode). Treat this like HIGH: shade + coverage, avoid peak sun.";
    if(L < 7) return "High UV (photosensitive mode). Strongly minimize exposure; plan indoor alternatives.";
    if(L < 10) return "Very High UV (photosensitive mode). Avoid direct sun; maximize protective clothing/shade.";
    return "Extreme UV (photosensitive mode). Avoid direct sun; protection is non-negotiable.";
  }
}

function loadUV(){
  try{
    const raw = localStorage.getItem(UV_KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(obj.day !== uvDayKey()) return null;
    return obj;
  }catch{ return null; }
}

function saveUV(level, source="manual"){
  const obj = { day: uvDayKey(), level, source, ts: Date.now() };
  localStorage.setItem(UV_KEY, JSON.stringify(obj));
  renderUV(obj);
}

function clearUV(){
  localStorage.removeItem(UV_KEY);
  renderUV(null);
}

function renderUV(obj){
  const label = $("uvLabel");
  const desc = $("uvDesc");
  const adviceEl = $("uvAdvice");
  const meta = $("uvMeta");
  if(!label || !desc || !adviceEl || !meta) return;

  if(!obj){
    label.textContent = "UV: —";
    desc.textContent = "No reading yet";
    adviceEl.textContent = uvAdvice(null);
    meta.textContent = "Local-first. Saves today’s UV reading on this device.";
    setUVDot(null);
    return;
  }

  const lvl = Number(obj.level);
  label.textContent = `UV: ${lvl.toFixed(1)}`;
  desc.textContent = obj.source === "auto" ? "Auto reading" : "Manual reading";
  adviceEl.textContent = uvAdvice(lvl);

  const t = new Date(obj.ts);
  meta.textContent = `Saved ${t.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} • ${obj.source} • ${isPhotoMode() ? "photosensitive" : "normal"}`;
  setUVDot(lvl);
}

// Sunscreen timer (simple local reminder)
let uvTimer = null;
function startUVReminder(){
  if(uvTimer) clearInterval(uvTimer);
  const minutes = 90; // education-only reminder cadence
  const end = Date.now() + minutes*60*1000;
  toast(`Sunscreen timer started (${minutes} min).`);
  uvTimer = setInterval(() => {
    if(Date.now() >= end){
      clearInterval(uvTimer);
      uvTimer = null;
      toast("Reminder: time to reapply protection ✅");
    }
  }, 1000);
}

// Optional auto UV via Open-Meteo (no key)
async function autoUV(lat, lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=uv_index`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Auto UV fetch failed");
  const data = await res.json();
  const uv = data?.current?.uv_index;
  if(uv == null) throw new Error("No UV in response");
  return Number(uv);
}

// Auto-location helper
function getMyLocation(){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
    );
  });
}

// Wire UV events
window.addEventListener("DOMContentLoaded", () => {
  // init photo mode toggle
  const toggle = $("uvPhotoMode");
  if(toggle){
    toggle.checked = isPhotoMode();
    setPhotoMode(toggle.checked);
    toggle.addEventListener("change", () => {
      setPhotoMode(toggle.checked);
      renderUV(loadUV()); // re-evaluate advice + dot thresholds
      toast(toggle.checked ? "Photosensitive mode ON" : "Photosensitive mode OFF");
    });
  }

  renderUV(loadUV());

  $("btnSaveUV")?.addEventListener("click", () => {
    const v = Number($("uvManual")?.value);
    if(!Number.isFinite(v) || v < 0) return toast("Enter a valid UV number");
    saveUV(v, "manual");
    toast("UV saved ✅");
  });

  $("btnClearUV")?.addEventListener("click", () => {
    clearUV();
    toast("UV cleared");
  });

  $("btnUVReminder")?.addEventListener("click", () => startUVReminder());

  $("btnGeoUV")?.addEventListener("click", async () => {
    try{
      toast("Getting your location…");
      const loc = await getMyLocation();
      if($("uvLat")) $("uvLat").value = loc.lat.toFixed(4);
      if($("uvLon")) $("uvLon").value = loc.lon.toFixed(4);
      toast("Location loaded ✅ Now tap Auto UV.");
    }catch(e){
      toast("Location blocked — enter lat/lon manually.");
    }
  });

  $("btnAutoUV")?.addEventListener("click", async () => {
    const lat = Number($("uvLat")?.value);
    const lon = Number($("uvLon")?.value);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return toast("Enter valid lat/lon");

    try{
      toast("Fetching UV…");
      const uv = await autoUV(lat, lon);
      saveUV(uv, "auto");
      toast("Auto UV saved ✅");
    }catch(e){
      toast("Auto UV failed — use manual UV instead.");
    }
  });
