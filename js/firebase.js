/**
 * ASTRA SOFTWARE — Firebase Configuration & Helpers
 * Replace the placeholder values below with your actual Firebase project config.
 */

// ─── Firebase SDK (v9 compat) ────────────────────────────────────────────────
import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp }
                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously }
                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── ⚠️  Replace with your Firebase project config ──────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ─────────────────────────────────────────────────────────────────────────────

let app, db, auth;
let firebaseReady = false;

/**
 * Initialise Firebase once (idempotent).
 * Returns true on success, false if the config is still a placeholder.
 */
export function initFirebase() {
  if (firebaseReady) return true;

  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn("[ASTRA] Firebase config not set – persistence disabled.");
    return false;
  }

  try {
    app  = initializeApp(firebaseConfig);
    db   = getFirestore(app);
    auth = getAuth(app);

    // Anonymous auth so users don't need to log in for logging
    signInAnonymously(auth).catch(e =>
      console.warn("[ASTRA] Anonymous auth failed:", e.message)
    );

    firebaseReady = true;
    console.info("[ASTRA] Firebase initialised.");
    return true;
  } catch (e) {
    console.error("[ASTRA] Firebase init error:", e);
    return false;
  }
}

/**
 * Log a user action to the `logs` Firestore collection.
 * @param {string} action  - e.g. "page_visit", "form_submit"
 * @param {object} payload - additional data to store
 */
export async function logAction(action, payload = {}) {
  if (!initFirebase()) return;

  try {
    await addDoc(collection(db, "logs"), {
      action,
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      timestamp: serverTimestamp(),
      ...payload
    });
  } catch (e) {
    console.warn("[ASTRA] logAction failed:", e.message);
  }
}

/**
 * Store a contact-form submission in the `contacts` Firestore collection.
 * @param {{ name:string, email:string, subject?:string, message:string }} data
 * @returns {Promise<boolean>} true on success
 */
export async function saveContactMessage(data) {
  if (!initFirebase()) return false;

  try {
    await addDoc(collection(db, "contacts"), {
      ...data,
      timestamp: serverTimestamp(),
      status: "new"
    });
    return true;
  } catch (e) {
    console.error("[ASTRA] saveContactMessage failed:", e);
    return false;
  }
}

// Auto-initialise when this module is imported
initFirebase();
