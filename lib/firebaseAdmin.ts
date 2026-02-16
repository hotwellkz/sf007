/**
 * Firebase Admin SDK — server-only, Node runtime.
 * Use only in route handlers and server libs. Do not import in client components.
 */

import fs from "node:fs";
import path from "node:path";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore as getFirestoreInstance } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export type CredentialSource = "gac-file" | "env-vars" | "none";

export class FirebaseAdminInitError extends Error {
  constructor(
    message: string,
    public readonly source: CredentialSource,
    public readonly hint?: string
  ) {
    super(message);
    this.name = "FirebaseAdminInitError";
  }
}

let adminApp: App | null = null;
let credentialSource: CredentialSource = "none";
let projectId: string | null = null;
let initLogged = false;

function getApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0] as App;
    return adminApp;
  }

  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = rawKey?.replace(/\\n/g, "\n");

  if (envProjectId && clientEmail && privateKey) {
    try {
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || undefined;
      adminApp = initializeApp({
        credential: cert({ projectId: envProjectId, clientEmail, privateKey }),
        projectId: envProjectId,
        storageBucket,
      });
      credentialSource = "env-vars";
      projectId = envProjectId;
      if (!initLogged) {
        console.log("[firebaseAdmin] Initialized using env-vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
        initLogged = true;
      }
      return adminApp;
    } catch (e) {
      if (e instanceof FirebaseAdminInitError) throw e;
      const hint = e instanceof Error ? e.message : String(e);
      throw new FirebaseAdminInitError(
        "Failed to initialize Firebase Admin from env vars.",
        "env-vars",
        hint
      );
    }
  }

  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gacPath) {
    const absolutePath = path.isAbsolute(gacPath) ? gacPath : path.resolve(process.cwd(), gacPath);
    try {
      const raw = fs.readFileSync(absolutePath, "utf8");
      const serviceAccount = JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new FirebaseAdminInitError(
          "Service account JSON missing project_id, client_email, or private_key.",
          "gac-file",
          "Check the JSON file contents."
        );
      }
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || undefined;
      adminApp = initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
        }),
        projectId: serviceAccount.project_id,
        storageBucket,
      });
      credentialSource = "gac-file";
      projectId = serviceAccount.project_id;
      if (!initLogged) {
        console.log("[firebaseAdmin] Initialized using gac-file (GOOGLE_APPLICATION_CREDENTIALS)");
        initLogged = true;
      }
      return adminApp;
    } catch (e) {
      if (e instanceof FirebaseAdminInitError) throw e;
      const hint = e instanceof Error ? e.message : String(e);
      throw new FirebaseAdminInitError(
        "Failed to initialize Firebase Admin from GOOGLE_APPLICATION_CREDENTIALS (file not found or invalid). For Netlify/production use FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY instead.",
        "gac-file",
        hint
      );
    }
  }

  const missing: string[] = [];
  if (!envProjectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!rawKey?.trim()) missing.push("FIREBASE_PRIVATE_KEY");
  throw new FirebaseAdminInitError(
    `Firebase Admin not configured. Missing: ${missing.join(", ")}. On Netlify set these env vars and do not use GOOGLE_APPLICATION_CREDENTIALS.`,
    "none",
    "Restart dev server or redeploy after changing env."
  );
}

/**
 * Env var presence only (no secret values). Use for health/diagnostics.
 */
export function getEnvDiagnostics(): {
  hasProjectId: boolean;
  hasClientEmail: boolean;
  hasPrivateKey: boolean;
} {
  const projectIdEnv =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  return {
    hasProjectId: Boolean(projectIdEnv?.trim()),
    hasClientEmail: Boolean(clientEmail?.trim()),
    hasPrivateKey: Boolean(rawKey?.trim()),
  };
}

/**
 * Returns credential source used for initialization, or "none" if not yet initialized.
 */
export function getCredentialSource(): CredentialSource {
  return credentialSource;
}

/**
 * Returns project ID after successful init, or null.
 */
export function getProjectId(): string | null {
  if (adminApp) return projectId;
  return null;
}

/**
 * Returns Firebase Admin App. Throws FirebaseAdminInitError if credentials are missing or invalid.
 */
export function getAdminApp(): App {
  return getApp();
}

/**
 * Returns Firebase Admin Auth. Throws if not initialized.
 */
export function getAdminAuth() {
  return getAuth(getApp());
}

/**
 * Returns Firestore instance from Admin SDK (admin.firestore()). Throws if not initialized.
 */
export function getFirestore() {
  return getFirestoreInstance(getApp());
}

let _bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]> | null = null;
let bucketLogged = false;

/**
 * Returns Storage bucket from Admin SDK. Uses FIREBASE_STORAGE_BUCKET (not NEXT_PUBLIC_).
 * Throws if FIREBASE_STORAGE_BUCKET is missing or if not initialized.
 */
export function getStorageBucket() {
  if (_bucket) return _bucket;
  const app = getApp();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName || !bucketName.trim()) {
    throw new FirebaseAdminInitError(
      "FIREBASE_STORAGE_BUCKET env variable is missing",
      "none",
      "Set FIREBASE_STORAGE_BUCKET in .env.local (e.g. your-project.appspot.com)"
    );
  }
  _bucket = getStorage(app).bucket(bucketName);
  if (!_bucket.name || _bucket.name.trim() === "") {
    throw new FirebaseAdminInitError(
      "FIREBASE_STORAGE_BUCKET env variable is missing",
      "none",
      "Set FIREBASE_STORAGE_BUCKET in .env.local"
    );
  }
  if (!bucketLogged) {
    console.log("Firebase Storage bucket:", _bucket.name);
    bucketLogged = true;
  }
  return _bucket;
}

/** Alias for getStorageBucket() for routes that want to import { bucket } and call bucket.file(). */
export function getBucket() {
  return getStorageBucket();
}
