// medical.js (module)
// Loads Firebase config + runs Medical AI UI logic

import { app, auth, db } from "./firebase-config.js";

// (Optional Firestore utilities - ready if you want to save chat later)
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

const bpBtn = document.getElementById("bpBtn");
const bpValue = document.getElementById("bpValue");

// --- Chat helpers ---
function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function safeMedicalResponse(userText) {
  const t = userText.toLowerCase();

  // Emergency triggers
  const emergencies = [
    "chest pain", "can't breathe", "cannot breathe", "shortness of breath",
    "stroke", "face drooping", "slurred", "seizure", "faint", "passed out",
    "bleeding", "suicide", "kill myself"
  ];

  if (emergencies.some(k => t.includes(k))) {
    return "If this may be an emergency, call 911 now. If you can, stay with someone, unlock your door, and follow dispatcher instructions. I can also tell you basic first steps while help is coming.";
  }

  // Basic general guidance (non-diagnostic)
  if (t.includes("blood pressure") || t.includes("118/76") || t.includes("bp")) {
    return "Generally, 118/76 is in a normal range for many adults. BP is affected by stress, hydration, caffeine, pain, and activity. If you feel dizzy, have chest pain, severe headache, or shortness of breath, seek urgent care.";
  }

  if (t.includes("water") || t.includes("hydration")) {
    return "Hydration needs vary, but a common starting point is sipping throughout the day. If you have kidney/heart conditions, follow your clinician’s fluid guidance. If you tell me your weight and activity level, I can estimate a safe range.";
  }

  if (t.includes("cpr")) {
    return "CPR basics: call 911, hands mid-chest, push hard and fast (100–120/min), keep going until help arrives or AED is used.";
  }

  return "I can help with general health info and safe guidance. Tell me your symptoms, duration, and any readings (BP, temp, pulse). If it feels severe or sudden, call 911 or seek urgent care.";
}

// --- Send message ---
async function handleSend() {
  const text = (chatInput.value || "").trim();
  if (!text) return;

  addMessage("user", text);
  chatInput.value = "";

  const reply = safeMedicalResponse(text);
  addMessage("ai", reply);

  // OPTIONAL: Save chat to Firestore (turn on when you want)
  // Requirements: Firestore enabled + rules set.
  // Uncomment to store every message pair.
  /*
  try {
    await addDoc(collection(db, "medicalChat"), {
      userText: text,
      aiText: reply,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("Firestore save failed (ok for now):", e);
  }
  */
}

chatSend.addEventListener("click", handleSend);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

// --- Fake BP wrist button behavior (you can replace with real sensor later) ---
bpBtn.addEventListener("click", () => {
  bpBtn.textContent = "Reading...";
  bpBtn.disabled = true;

  setTimeout(() => {
    // Simple demo: random-ish normal range
    const sys = Math.floor(108 + Math.random() * 18); // 108–125
    const dia = Math.floor(68 + Math.random() * 12);  // 68–79
    bpValue.textContent = `${sys} / ${dia}`;

    bpBtn.textContent = "Press wrist sensor";
    bpBtn.disabled = false;

    addMessage("ai", `New BP reading recorded: ${sys}/${dia}. If you feel unwell, dizzy, or have chest pain—seek urgent care.`);
  }, 1200);
});
