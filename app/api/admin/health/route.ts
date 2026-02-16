import { NextResponse } from "next/server";
import {
  getFirestore,
  getCredentialSource,
  getProjectId,
  FirebaseAdminInitError,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check: initializes Admin (if needed), runs a trivial Firestore op.
 * Returns credential source and projectId on success.
 */
export async function GET() {
  try {
    const db = getFirestore();
    await db.listCollections();
    return NextResponse.json({
      ok: true,
      credentialSource: getCredentialSource(),
      projectId: getProjectId(),
    });
  } catch (e) {
    if (e instanceof FirebaseAdminInitError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          hint: e.hint,
          source: e.source,
        },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: e != null ? String(e) : undefined,
      },
      { status: 503 }
    );
  }
}
