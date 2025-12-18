// firebase-config.js (Firebase v12 modular)
// Reusable Firebase setup for Health Hack

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6YArvzbW3zdseQQuoMvT4ekO7ufbUs5Q",
  authDomain: "health-hack-6a9f3.firebaseapp.com",
  projectId: "health-hack-6a9f3",
  storageBucket: "health-hack-6a9f3.firebasestorage.app",
  messagingSenderId: "354172722904",
  appId: "1:354172722904:web:cf72391de5b91884cbc1ad"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Optional services (ready for you to use)
export const auth = getAuth(app);
export const db = getFirestore(app);
