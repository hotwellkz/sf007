/**
 * Firebase Admin SDK and admin-user check.
 * Server-only. Never expose service account or admin list to the client.
 * Initialization lives in @/lib/firebaseAdmin.
 */

import { getAdminAuth, getFirestore, getStorageBucket } from "@/lib/firebaseAdmin";

const ADMIN_EMAILS_KEY = "ADMIN_EMAILS";

function getAdminEmails(): string[] {
  const raw = process.env[ADMIN_EMAILS_KEY];
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function getAdminFirestore() {
  try {
    return getFirestore();
  } catch {
    return null;
  }
}

export function getAdminStorage() {
  try {
    return getStorageBucket();
  } catch {
    return null;
  }
}

export { getAdminAuth } from "@/lib/firebaseAdmin";

const adminEmailsSet = new Set<string>();

function loadAdminEmails(): Set<string> {
  if (adminEmailsSet.size > 0) return adminEmailsSet;
  getAdminEmails().forEach((e) => adminEmailsSet.add(e));
  return adminEmailsSet;
}

/**
 * Returns true if the given email is in ADMIN_EMAILS env (comma-separated).
 * Call only on server.
 */
export function isAdminByEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const set = loadAdminEmails();
  return set.has(email.trim().toLowerCase());
}

export type VerifyAdminResult =
  | { admin: true; email: string }
  | { admin: false; reason?: "no_token" | "no_auth" | "invalid_token" | "not_in_list" };

/**
 * Verify Firebase ID token and return email if admin.
 */
export async function verifyAdminToken(
  idToken: string | null | undefined
): Promise<VerifyAdminResult> {
  if (!idToken?.trim()) return { admin: false, reason: "no_token" };
  let auth;
  try {
    auth = getAdminAuth();
  } catch {
    return { admin: false, reason: "no_auth" };
  }
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase().trim();
    if (!email) return { admin: false, reason: "invalid_token" };
    if (isAdminByEmail(email)) return { admin: true, email };
    return { admin: false, reason: "not_in_list" };
  } catch {
    return { admin: false, reason: "invalid_token" };
  }
}
