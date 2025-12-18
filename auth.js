// auth.js — local-first demo auth for GitHub Pages
const AUTH_USERS_KEY = "hh.users.v1";
const AUTH_SESSION_KEY = "hh.session.v1";

function $(id){ return document.getElementById(id); }

function readUsers(){
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]"); }
  catch { return []; }
}

function writeUsers(users){
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function setSession(session){
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function getSession(){
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null"); }
  catch { return null; }
}

function clearSession(){
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function normEmail(email){
  return (email || "").trim().toLowerCase();
}

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

function showMsg(el, text, ok=true){
  if(!el) return;
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "bad");
}

// --- Register ---
async function register(name, email, pass, pass2){
  email = normEmail(email);
  name = (name || "").trim();

  if(!name) return { ok:false, msg:"Add your name." };
  if(!email || !email.includes("@")) return { ok:false, msg:"Enter a valid email." };
  if(!pass || pass.length < 8) return { ok:false, msg:"Password must be at least 8 characters." };
  if(pass !== pass2) return { ok:false, msg:"Passwords do not match." };

  const users = readUsers();
  if(users.some(u => u.email === email)) return { ok:false, msg:"Account already exists. Log in instead." };

  const passHash = await sha256(pass);
  const user = {
    id: "u_" + Math.random().toString(16).slice(2),
    name,
    email,
    passHash,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeUsers(users);

  setSession({ userId: user.id, email: user.email, name: user.name, loginAt: new Date().toISOString() });
  return { ok:true, msg:"Account created. You’re signed in." };
}

// --- Login ---
async function login(email, pass){
  email = normEmail(email);
  if(!email || !pass) return { ok:false, msg:"Enter email and password." };

  const users = readUsers();
  const user = users.find(u => u.email === email);
  if(!user) return { ok:false, msg:"No account found. Create one on the right." };

  const passHash = await sha256(pass);
  if(passHash !== user.passHash) return { ok:false, msg:"Wrong password." };

  setSession({ userId: user.id, email: user.email, name: user.name, loginAt: new Date().toISOString() });
  return { ok:true, msg:"Logged in successfully." };
}

// --- Logout ---
function logout(){
  clearSession();
}

// --- Guard (use on protected pages) ---
function requireAuth({ redirectTo = "./auth.html" } = {}){
  const session = getSession();
  if(!session){
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

// Expose minimal helpers globally (so pages can call them)
window.HealthHackAuth = { register, login, logout, getSession, requireAuth };

// --- Wire up auth.html if elements exist ---
window.addEventListener("DOMContentLoaded", () => {
  const btnLogin = $("btnLogin");
  const btnRegister = $("btnRegister");

  if(btnLogin){
    btnLogin.addEventListener("click", async () => {
      const res = await login($("loginEmail").value, $("loginPass").value);
      showMsg($("loginMsg"), res.msg, res.ok);
      if(res.ok) window.location.href = "./index.html";
    });
  }

  if(btnRegister){
    btnRegister.addEventListener("click", async () => {
      const res = await register(
        $("regName").value,
        $("regEmail").value,
        $("regPass").value,
        $("regPass2").value
      );
      showMsg($("regMsg"), res.msg, res.ok);
      if(res.ok) window.location.href = "./index.html";
    });
  }
});
