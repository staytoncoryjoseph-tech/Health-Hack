/* ==========================================================
  Environmental AI + Larry Life Coach
  - Weather + UV: Open-Meteo forecast endpoint
  - Air quality + pollution + pollen: Open-Meteo air-quality endpoint
  - City search: Open-Meteo Geocoding API
  - Larry boosts: original motivational text inspired by selected thinker
========================================================== */

const $ = (id) => document.getElementById(id);

const LS = {
  lastLoc: "env.lastLoc.v1",
  savedBoosts: "larry.savedBoosts.v1"
};

const SAVED_CITIES = [
  { name: "Dallas",     lat: 32.7767, lon: -96.7970 },
  { name: "Melissa",    lat: 33.2859, lon: -96.5728 },
  { name: "Frisco",     lat: 33.1507, lon: -96.8236 },
  { name: "Denton",     lat: 33.2148, lon: -97.1331 },
  { name: "The Colony", lat: 33.0806, lon: -96.8928 }
];

function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
function lsGet(key, fallback){
  const v = localStorage.getItem(key);
  if(!v) return fallback;
  const p = safeParse(v);
  return p ?? fallback;
}
function lsSet(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function fmt(n, digits=0){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function nowLocalTimeString(){
  const d = new Date();
  return d.toLocaleString([], { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

/* ==============================
   Environmental AI
============================== */

function renderSavedCities(){
  const wrap = $("savedCities");
  if(!wrap) return;
  wrap.innerHTML = "";

  SAVED_CITIES.forEach(c => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = c.name;
    b.addEventListener("click", () => {
      loadEnvironment(c.lat, c.lon, `${c.name}, TX`).catch(err => {
        $("envBox").textContent = "Failed to load environment data.\n" + String(err);
      });
    });
    wrap.appendChild(b);
  });
}

async function geocodeCity(name){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if(!data?.results?.length) return null;
  return data.results[0];
}

async function fetchWeatherUV(lat, lon){
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&daily=uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Weather fetch failed");
  return res.json();
}

async function fetchAirQuality(lat, lon){
  const hourlyVars = [
    "us_aqi",
    "pm2_5","pm10",
    "nitrogen_dioxide","ozone","sulphur_dioxide","carbon_monoxide",
    "dust",
    "uv_index",
    "alder_pollen","birch_pollen","grass_pollen","mugwort_pollen","olive_pollen","ragweed_pollen"
  ].join(",");

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=${hourlyVars}&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Air quality fetch failed");
  return res.json();
}

function nearestHourIndex(times){
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  for(let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    const diff = Math.abs(t - now);
    if(diff < bestDiff){ bestDiff = diff; best = i; }
  }
  return best;
}

function aqiLabel(aqi){
  if(aqi === null || aqi === undefined || Number.isNaN(aqi)) return { label:"—", cls:"" };
  const v = Number(aqi);
  if(v <= 50) return { label:`${v} (Good)`, cls:"ok" };
  if(v <= 100) return { label:`${v} (Moderate)`, cls:"warn" };
  if(v <= 150) return { label:`${v} (Sensitive)`, cls:"warn" };
  if(v <= 200) return { label:`${v} (Unhealthy)`, cls:"danger" };
  return { label:`${v} (Very Unhealthy)`, cls:"danger" };
}

function uvLabel(uv){
  if(uv === null || uv === undefined || Number.isNaN(uv)) return { label:"—", cls:"" };
  const v = Number(uv);
  if(v < 3) return { label:`${fmt(v,1)} (Low)`, cls:"ok" };
  if(v < 6) return { label:`${fmt(v,1)} (Moderate)`, cls:"warn" };
  if(v < 8) return { label:`${fmt(v,1)} (High)`, cls:"warn" };
  if(v < 11) return { label:`${fmt(v,1)} (Very High)`, cls:"danger" };
  return { label:`${fmt(v,1)} (Extreme)`, cls:"danger" };
}

function maxPollenAtIndex(aq, idx){
  const keys = ["grass_pollen","ragweed_pollen","birch_pollen","alder_pollen","mugwort_pollen","olive_pollen"];
  const vals = keys
    .map(k => aq?.hourly?.[k]?.[idx])
    .filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if(!vals.length) return null;
  return Math.max(...vals.map(Number));
}

function pollenLabel(v){
  if(v === null || v === undefined || Number.isNaN(v)) return { label: "—", cls: "" };
  // Relative index; treat as severity bands
  if(v < 20) return { label: `${fmt(v,1)} (Low)`, cls: "ok" };
  if(v < 50) return { label: `${fmt(v,1)} (Moderate)`, cls: "warn" };
  return { label: `${fmt(v,1)} (High)`, cls: "danger" };
}

function setRiskBanner({ uvVal, aqiVal, pollenVal }){
  const banner = $("riskBanner");
  const title = $("riskTitle");
  const score = $("riskScore");
  const text = $("riskText");
  if(!banner || !title || !score || !text) return;

  const uv = uvLabel(uvVal);
  const aqi = aqiLabel(aqiVal);
  const pol = pollenLabel(pollenVal);

  const rank = (cls) => cls === "danger" ? 3 : cls === "warn" ? 2 : cls === "ok" ? 1 : 0;
  const worst = Math.max(rank(uv.cls), rank(aqi.cls), rank(pol.cls));
  const overallCls = worst === 3 ? "danger" : worst === 2 ? "warn" : "ok";

  banner.className = `banner ${overallCls}`;
  title.textContent = overallCls === "danger" ? "Risk: HIGH" : overallCls === "warn" ? "Risk: MODERATE" : "Risk: LOW";

  score.textContent = `UV ${uv.label} • AQI ${aqi.label} • Pollen ${pol.label}`;

  const recs = [];
  if(overallCls === "danger"){
    recs.push("Limit outdoor exertion if sensitive (asthma/allergies).");
    recs.push("If outdoors: mask can help on bad air/pollen days.");
    recs.push("UV protection: sunscreen + shade + sunglasses.");
  } else if(overallCls === "warn"){
    recs.push("Outdoor activity is OK—keep it lighter if you feel symptoms.");
    recs.push("Hydrate and rinse face/eyes after outdoors if allergy-prone.");
    recs.push("Use sunscreen if outside > 20 minutes.");
  } else {
    recs.push("Green light: perfect day for a walk outside.");
    recs.push("Keep the streak: hydration + steps + consistent sleep.");
  }

  text.textContent = recs.map(r => `• ${r}`).join("\n");
}

function pollenSummary(obj, idx){
  const pick = (k) => (obj?.hourly?.[k]?.[idx] ?? null);
  const items = [
    ["Grass", pick("grass_pollen")],
    ["Ragweed", pick("ragweed_pollen")],
    ["Birch", pick("birch_pollen")],
    ["Alder", pick("alder_pollen")],
    ["Mugwort", pick("mugwort_pollen")],
    ["Olive", pick("olive_pollen")]
  ].filter(([,v]) => v !== null && v !== undefined && !Number.isNaN(v));

  if(!items.length) return "Allergies/Pollen: Not available for this region/season.";

  items.sort((a,b) => Number(b[1]) - Number(a[1]));
  const top = items.slice(0,3).map(([name,val]) => `${name}: ${fmt(val,1)}`).join(" • ");
  return `Allergies/Pollen (index): ${top}`;
}

function weatherCodeToText(code){
  const m = {
    0:"Clear",
    1:"Mainly clear",
    2:"Partly cloudy",
    3:"Overcast",
    45:"Fog",
    48:"Rime fog",
    51:"Light drizzle",
    53:"Drizzle",
    55:"Dense drizzle",
    61:"Light rain",
    63:"Rain",
    65:"Heavy rain",
    71:"Light snow",
    73:"Snow",
    75:"Heavy snow",
    80:"Rain showers",
    81:"Rain showers",
    82:"Violent showers",
    95:"Thunderstorm"
  };
  return m[code] || `Weather code ${code}`;
}

async function loadEnvironment(lat, lon, labelText){
  $("envBox").textContent = "Loading environment signals…";
  $("timePill").textContent = `Time: ${nowLocalTimeString()}`;
  $("locPill").textContent = `Location: ${labelText} (${fmt(lat,3)}, ${fmt(lon,3)})`;

  lsSet(LS.lastLoc, { lat, lon, labelText, t: Date.now() });

  const [w, aq] = await Promise.all([
    fetchWeatherUV(lat, lon),
    fetchAirQuality(lat, lon)
  ]);

  const current = w?.current || {};
  const temp = current?.temperature_2m;
  const feels = current?.apparent_temperature;
  const wind = current?.wind_speed_10m;
  const hum = current?.relative_humidity_2m;
  const code = current?.weather_code;
  const nowText = weatherCodeToText(code);

  const uvMax = w?.daily?.uv_index_max?.[0] ?? null;

  const times = aq?.hourly?.time || [];
  const idx = times.length ? nearestHourIndex(times) : 0;

  const usAqi = aq?.hourly?.us_aqi?.[idx] ?? null;

  const uvHr = aq?.hourly?.uv_index?.[idx] ?? null;
  const uvDisplay = uvMax ?? uvHr;

  const aqi = aqiLabel(usAqi);
  const uv = uvLabel(uvDisplay);

  const pm25 = aq?.hourly?.pm2_5?.[idx] ?? null;
  const pm10 = aq?.hourly?.pm10?.[idx] ?? null;
  const o3 = aq?.hourly?.ozone?.[idx] ?? null;
  const no2 = aq?.hourly?.nitrogen_dioxide?.[idx] ?? null;
  const co = aq?.hourly?.carbon_monoxide?.[idx] ?? null;
  const so2 = aq?.hourly?.sulphur_dioxide?.[idx] ?? null;
  const dust = aq?.hourly?.dust?.[idx] ?? null;

  // Update KPIs
  $("kNow").textContent = nowText;
  $("kTemp").textContent = `${fmt(temp,0)}° (feels ${fmt(feels,0)}°)`;
  $("kUV").textContent = uv.label;
  $("kUV").className = "val " + (uv.cls || "");
  $("kAQI").textContent = aqi.label;
  $("kAQI").className = "val " + (aqi.cls || "");

  // Risk Banner (UV + AQI + Pollen)
  const pollenMax = maxPollenAtIndex(aq, idx);
  setRiskBanner({ uvVal: uvDisplay, aqiVal: usAqi, pollenVal: pollenMax });

  // Recommendations
  const recs = [];
  if(uvDisplay !== null && !Number.isNaN(Number(uvDisplay))){
    const v = Number(uvDisplay);
    if(v >= 8) recs.push("UV is high: sunscreen + shade + sunglasses. Limit midday exposure.");
    else if(v >= 3) recs.push("UV is moderate: sunscreen recommended if outdoors > 20 minutes.");
    else recs.push("UV is low: still protect skin if outside for long periods.");
  }
  if(usAqi !== null && !Number.isNaN(Number(usAqi))){
    const v = Number(usAqi);
    if(v > 150) recs.push("Air quality is unhealthy: reduce outdoor exertion; consider a mask if sensitive.");
    else if(v > 100) recs.push("Air quality is elevated: sensitive groups should limit outdoor intensity.");
    else recs.push("Air quality looks okay: outdoor walk is a strong prevention move.");
  }
  if(Number(wind) >= 20) recs.push("Windy: eye protection can help if you’re allergy-prone.");
  if(Number(current?.precipitation) > 0) recs.push("Wet conditions: drive carefully + layer for warmth.");

  const pollenLine = pollenSummary(aq, idx);

  const out =
`ENVIRONMENT DASHBOARD
Time: ${nowLocalTimeString()}
Weather: ${nowText}
Temp: ${fmt(temp,0)}° (feels ${fmt(feels,0)}°) • Humidity: ${fmt(hum,0)}% • Wind: ${fmt(wind,0)} mph

UV: ${uv.label}
AQI (US): ${aqi.label}

Pollution snapshot (nearest hour):
• PM2.5: ${fmt(pm25,1)} µg/m³
• PM10: ${fmt(pm10,1)} µg/m³
• O₃ (ozone): ${fmt(o3,1)} µg/m³
• NO₂: ${fmt(no2,1)} µg/m³
• CO: ${fmt(co,1)} µg/m³
• SO₂: ${fmt(so2,1)} µg/m³
• Dust: ${fmt(dust,1)} µg/m³

${pollenLine}

TODAY’S PREVENTION GAME PLAN
- ${(recs.length ? recs.join("\n- ") : "Stay consistent: hydrate, walk, and sleep on time.")}
`;

  $("envBox").textContent = out;
}

/* UI wiring */
$("btnUseLocation").addEventListener("click", () => {
  if(!navigator.geolocation){
    alert("Geolocation not supported. Type a city instead.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      loadEnvironment(lat, lon, "My location").catch(err => {
        $("envBox").textContent = "Failed to load environment data.\n" + String(err);
      });
    },
    () => alert("Location blocked. Type a city instead.")
  );
});

$("btnSearchCity").addEventListener("click", async () => {
  const name = ($("cityInput").value || "").trim();
  if(!name) return;
  try{
    const hit = await geocodeCity(name);
    if(!hit){ alert("No results found. Try adding state/country."); return; }
    const label = `${hit.name}${hit.admin1 ? ", " + hit.admin1 : ""}${hit.country ? ", " + hit.country : ""}`;
    await loadEnvironment(hit.latitude, hit.longitude, label);
  }catch(err){
    $("envBox").textContent = "City search failed.\n" + String(err);
  }
});

(function bootEnv(){
  renderSavedCities();
  $("timePill").textContent = `Time: ${nowLocalTimeString()}`;

  const last = lsGet(LS.lastLoc, null);
  if(last?.lat && last?.lon){
    loadEnvironment(last.lat, last.lon, last.labelText || "Last location").catch(() => {});
  }
})();

/* ==============================
   Larry Life Coach
============================== */

const AUTHORS = ["jung","seuss","aristotle","debotton","nightingale"];

function daySeed(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function pickDailyAuthor(){
  const seed = daySeed();
  let h = 0;
  for(const c of seed) h = (h*31 + c.charCodeAt(0)) >>> 0;
  return AUTHORS[h % AUTHORS.length];
}

function themeFor(author){
  switch(author){
    case "jung": return "Shadow → awareness → growth";
    case "seuss": return "Playful courage + forward motion";
    case "aristotle": return "Character built by daily habits";
    case "debotton": return "Calm realism + meaning in ordinary life";
    case "nightingale": return "Goals, focus, and disciplined mindset";
    default: return "Daily strength";
  }
}

function larryBoost(author){
  const base = {
    jung: [
      "Larry here. Your growth is hiding inside the stuff you avoid. Name the feeling. Don’t fight it — study it. Then choose one brave action anyway.",
      "Today: catch the pattern. The moment you notice it, you’re not trapped by it — you’re steering it.",
      "Your mind isn’t your enemy. It’s your instrument. Clean it. Tune it. Then play the day on purpose."
    ],
    seuss: [
      "Larry says: You don’t need the perfect plan — you need the next right step. Make it tiny. Make it now. Repeat until momentum shows up.",
      "If your day feels heavy, go light: one smile, one glass of water, one walk. That’s how big changes start — sneaky and simple.",
      "Today’s mission: be the person who tries again. Even if it’s awkward. Especially if it’s awkward."
    ],
    aristotle: [
      "Larry’s rule: you become what you repeatedly do. So pick one repeatable action today — 10 minutes — and guard it like it’s sacred.",
      "Excellence is not a mood. It’s a routine. You don’t rise to your wishes — you rise to your habits.",
      "Choose the kind of person you’re building, then do one action that matches that identity."
    ],
    debotton: [
      "Larry’s calm truth: most days won’t feel epic — and that’s fine. Meaning is built in ordinary minutes done with care.",
      "If you feel behind, shrink the target. Do something small with full attention. That’s how you regain control.",
      "You don’t need a flawless life. You need a livable one: sleep, order, honest people, and a steady direction."
    ],
    nightingale: [
      "Larry says: decide what you want, write it down, then act like it matters. A focused 20 minutes beats a scattered 2 hours.",
      "Your results are a mirror of your dominant thoughts. So today: feed your mind what you want to become.",
      "Pick one goal. Block one distraction. Do one daily win. That’s the formula."
    ]
  };

  const arr = base[author] || base.aristotle;
  const seed = daySeed() + "|" + author;
  let h = 0;
  for(const c of seed) h = (h*33 + c.charCodeAt(0)) >>> 0;
  const msg = arr[h % arr.length];

  const closer =
`\n\n— Larry, the Life Coach
Today’s theme: ${themeFor(author)}
Daily move: pick ONE tiny action and do it in the next 10 minutes.`;

  return msg + closer;
}

function updateSavedCount(){
  const arr = lsGet(LS.savedBoosts, []);
  $("savedCount").textContent = String(arr.length);
}

$("btnLarry").addEventListener("click", () => {
  const sel = $("authorSelect").value;
  const author = sel === "daily" ? pickDailyAuthor() : sel;
  const out = larryBoost(author);

  $("larryBox").textContent = out;
  $("todayTheme").textContent = themeFor(author);
});

$("btnSaveBoost").addEventListener("click", () => {
  const text = ($("larryBox").textContent || "").trim();
  if(!text || text.includes("Tap “Give me today’s boost”")){
    alert("Generate a boost first.");
    return;
  }
  const arr = lsGet(LS.savedBoosts, []);
  arr.push({ t: Date.now(), text });
  lsSet(LS.savedBoosts, arr.slice(-50));
  updateSavedCount();
});

(function bootLarry(){
  updateSavedCount();
  $("todayTheme").textContent = themeFor(pickDailyAuthor());
})();
