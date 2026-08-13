// firebase-config.js
// Firebase config is safe to expose on the client (it's not a secret,
// unlike the Gemini API key). Security is enforced by Firestore Rules,
// not by hiding these values.
//
// Get these values from: Firebase Console → Project settings → Your apps → SDK setup

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDGAssYd4I9zIrbJ2_NcEhVDVjhx--GdA8",
  authDomain: "aedygemini.firebaseapp.com",
  projectId: "aedygemini",
  storageBucket: "aedygemini.firebasestorage.app",
  messagingSenderId: "963331349289",
  appId: "1:963331349289:web:80cc02ca925cd8b0f53538",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Expose globally so script.js (loaded as a separate module) can use them
// without needing a bundler.
window.__aedy = { auth, db, googleProvider };
