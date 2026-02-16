/**
 * Admin auth for API routes — server only.
 * Verifies Firebase ID token and ADMIN_EMAILS allowlist.
 */

import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import type { CredentialSource } from "@/lib/firebaseAdmin";
import { FirebaseAdminInitError } from "@/lib/firebaseAdmin";

const ADMIN_EMAILS_KEY = "ADMIN_EMAILS";

function getAdminEmailsSet(): Set<string> {
  const raw = process.env[ADMIN_EMAILS_KEY];
  if (!raw || typeof raw !== "string") return new Set();
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function getIdTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.cookies.get("firebaseIdToken")?.value ?? null;
}

export type RequireAdminResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; status: number; message: string; hint?: string; source?: CredentialSource };

/**
 * Verify request is from an admin.
 * - 401: token missing
 * - 403: token invalid or email not in ADMIN_EMAILS
 * - 503: Firebase Admin not configured
 */
export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
  const token = getIdTokenFromRequest(request);
  if (!token) {
    console.log("[adminAuth] Missing token: no Authorization Bearer header");
    return {
      ok: false,
      status: 401,
      message: "Not signed in. Send Authorization: Bearer <idToken>.",
    };
  }

  let adminAuth;
  try {
    adminAuth = getAdminAuth();
  } catch (e) {
    if (e instanceof FirebaseAdminInitError) {
      console.log("[adminAuth] Admin not configured:", e.message);
      return {
        ok: false,
        status: 503,
        message: e.message,
        hint: e.hint,
        source: e.source,
      };
    }
    throw e;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return {
        ok: false,
        status: 403,
        message: "Invalid or expired token. Sign out and sign in again.",
      };
    }
    const allowed = getAdminEmailsSet();
    if (!allowed.has(email)) {
      console.log("[adminAuth] Email not in allowlist (ADMIN_EMAILS)");
      return {
        ok: false,
        status: 403,
        message:
          "Admin only. Add your email to ADMIN_EMAILS in .env.local (comma-separated) and restart the dev server.",
      };
    }
    return { ok: true, uid: decoded.uid, email };
  } catch {
    return {
      ok: false,
      status: 403,
      message: "Invalid or expired token. Sign out and sign in again.",
    };
  }
}
