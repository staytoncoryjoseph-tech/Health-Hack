// medical.js (module)
// Uses Firebase v12 modular via your firebase-config.js

import { app, auth, db } from "./firebase-config.js";

// Optional Firestore (ready when you want to save chat/metrics)
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- Confirm Firebase loaded ---
console.log("🔥 Firebase connected:", app?.name || "no app");

// --- DOM ---
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

const bpBtn = document.getElementById("bpBtn");
const bpValue = document.getElementById("bpValue");

const stepsValue = document.getElementById("stepsValue");
const waterValue = document.getElementById("waterValue");

// Guard (so page never crashes)
if (!chatBox || !chatInput || !chatSend) {
  console.warn("Medical AI: Missing chat DOM elements.");
}

// --- Helpers ---
function escapeText(s) {
  return String(s ?? "").replace(/[<>]/g, "");
}

function addMessage(role, text) {
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = escapeText(text);

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function isEmergency(text) {
  const t = (text || "").toLowerCase();

  const emergencyKeywords = [
    "chest pain",
    "shortness of breath",
    "cannot breathe",
    "can't breathe",
    "trouble breathing",
    "fainting",
    "passed out",
    "stroke",
    "face droop",
    "slurred",
    "seizure",
    "severe bleeding",
    "bleeding a lot",
    "overdose",
    "suicide",
    "kill myself"
  ];

  return emergencyKeywords.some((k) => t.includes(k));
}

function safeMedicalResponse(userText) {
  const t = (userText || "").toLowerCase();

  if (isEmergency(t)) {
    return "If this may be an emergency, call 911 now. If you can, stay with someone, unlock your door, and follow dispatcher instructions. If you tell me what’s happening, I can share basic first steps while help is coming.";
  }

  // BP / readings (general info, not diagnosis)
  if (t.includes("blood pressure") || t.includes("bp") || t.includes("118/76")) {
    return "Generally, 118/76 is a normal range for many adults. Blood pressure shifts with stress, pain, caffeine, hydration, and activity. If you have chest pain, severe headache, confusion, weakness on one side, or shortness of breath—seek urgent care.";
  }

  // Water guidance
  if (t.includes("water") || t.includes("hydration") || t.includes("drink")) {
    return "Hydration needs vary. A simple approach is sipping throughout the day and watching urine color (pale yellow is often a good sign). If you have kidney/heart issues or fluid restriction, follow your clinician’s plan.";
  }

  // CPR
  if (t.includes("cpr")) {
    return "CPR basics: call 911, hands mid-chest, push hard & fast (100–120/min), allow chest to rise, and keep going until help arrives or an AED is used.";
  }

  // Steps
  if (t.includes("steps")) {
    return "Steps are a great baseline for daily activity. If you tell me your goal (fat loss, stamina, general health), I can suggest a realistic step target and progression.";
  }

  return "I can help with general health info and safe guidance. Tell me symptoms, how long it’s been happening, and any readings (BP, temp, pulse). If symptoms feel severe, sudden, or scary—seek urgent care.";
}

// --- Optional: save chat to Firestore (OFF by default) ---
const SAVE_CHAT_TO_FIRESTORE = false;

async function saveChatPair(userText, aiText) {
  if (!SAVE_CHAT_TO_FIRESTORE) return;

  try {
    await addDoc(collection(db, "medicalChat"), {
      userText,
      aiText,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("Firestore save failed (ok for now):", e);
  }
}

// --- Chat send ---
async function handleSend() {
  const text = (chatInput?.value || "").trim();
  if (!text) return;

  addMessage("user", text);
  chatInput.value = "";

  const reply = safeMedicalResponse(text);
  addMessage("ai", reply);

  await saveChatPair(text, reply);
}

chatSend?.addEventListener("click", handleSend);

chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

// --- Wrist BP button demo (replace later with real sensor) ---
bpBtn?.addEventListener("click", () => {
  bpBtn.textContent = "Reading...";
  bpBtn.disabled = true;

  setTimeout(() => {
    // Demo: normal-ish range
    const sys = Math.floor(108 + Math.random() * 18); // 108–125
    const dia = Math.floor(68 + Math.random() * 12);  // 68–79

    if (bpValue) bpValue.textContent = `${sys} / ${dia}`;

    bpBtn.textContent = "Press wrist sensor";
    bpBtn.disabled = false;

    addMessage("ai", `New BP reading recorded: ${sys}/${dia}. If you feel dizzy, weak, or have chest pain—seek urgent care.`);
  }, 1200);
});

// --- OPTIONAL: if later you pull real steps/water from localStorage or other pages ---
function hydrateMetricsFromStorage() {
  try {
    const steps = localStorage.getItem("health.steps.today");
    const water = localStorage.getItem("health.water.oz");

    if (steps && stepsValue) stepsValue.textContent = String(steps);
    if (water && waterValue) waterValue.textContent = `${String(water)} oz`;
  } catch (e) {
    // safe ignore
  }
}
hydrateMetricsFromStorage();
