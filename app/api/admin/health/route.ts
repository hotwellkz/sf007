import { NextResponse } from "next/server";
import {
  getFirestore,
  getCredentialSource,
  getProjectId,
  getEnvDiagnostics,
  FirebaseAdminInitError,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logError(route: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const code = (e as { code?: string })?.code;
  console.error(`[${route}]`, {
    name: err.name,
    message: err.message,
    code: code ?? "unknown",
    stack: err.stack,
  });
}

/**
 * Health check: env diagnostics, then initializes Admin (if needed), runs a trivial Firestore op.
 * Returns ok, hasProjectId, hasClientEmail, hasPrivateKey, nodeVersion, timestamp.
 * On Firestore init failure returns 500 with clear message (no secrets).
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  const nodeVersion = process.version;
  const env = getEnvDiagnostics();

  const basePayload = {
    hasProjectId: env.hasProjectId,
    hasClientEmail: env.hasClientEmail,
    hasPrivateKey: env.hasPrivateKey,
    nodeVersion,
    timestamp,
  };

  try {
    const db = getFirestore();
    await db.listCollections();
    return NextResponse.json({
      ok: true,
      ...basePayload,
      credentialSource: getCredentialSource(),
      projectId: getProjectId(),
    });
  } catch (e) {
    logError("api/admin/health", e);

    if (e instanceof FirebaseAdminInitError) {
      return NextResponse.json(
        {
          ok: false,
          ...basePayload,
          error: e.message,
          hint: e.hint,
          source: e.source,
        },
        { status: 503 }
      );
    }

    const message = e instanceof Error ? e.message : "Firestore init or listCollections failed.";
    return NextResponse.json(
      {
        ok: false,
        ...basePayload,
        error: message,
        hint: "Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (and FIREBASE_STORAGE_BUCKET if using Storage). No credentials are logged.",
      },
      { status: 500 }
    );
  }
}
