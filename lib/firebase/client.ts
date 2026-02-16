/**
 * Firebase client SDK — Auth and Firestore. Only uses public config from env.
 * Use only in client components. Server uses firebase-admin via lib/firebaseAdmin.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function initFirebase() {
  if (getApps().length > 0) return getApp();
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
    if (typeof window !== "undefined") {
      console.warn(
        "[Firebase client] Config missing. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID (and others) in env. On Netlify, set them in Site settings → Environment variables for build."
      );
    }
    return null;
  }
  const app = initializeApp(firebaseConfig);
  if (typeof window !== "undefined") {
    console.log("Firebase config loaded:", {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      apiKey: firebaseConfig.apiKey ? "[SET]" : "[MISSING]",
      appId: firebaseConfig.appId ? "[SET]" : "[MISSING]",
    });
  }
  return app;
}

const app = typeof window !== "undefined" ? initFirebase() : null;
export const auth = app ? getAuth(app) : null;

/** Firestore client (for client-side reads). Use getDocs(collection(db, "stocks")) etc. */
export const db = app ? getFirestore(app) : null;
