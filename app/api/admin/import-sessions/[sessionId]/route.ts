import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import { getFirestore, FirebaseAdminInitError } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(
  message: string,
  status: number,
  extra?: { hint?: string; source?: string }
) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.message,
          ...(auth.status === 503 && { hint: auth.hint, source: auth.source }),
        },
        { status: auth.status }
      );
    }
    let db;
    try {
      db = getFirestore();
    } catch (e) {
      if (e instanceof FirebaseAdminInitError) {
        return jsonErr(e.message, 503, { hint: e.hint, source: e.source });
      }
      return jsonErr(e instanceof Error ? e.message : "Internal server error", 500, {
        hint: e != null ? String(e) : undefined,
      });
    }
    const { sessionId } = await params;
    const sessionRef = db.collection("import_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return jsonErr("Session not found", 404);
    }
    const filesSnap = await sessionRef.collection("files").orderBy("partIndex").get();
    const files = filesSnap.docs.map((d) => ({ fileId: d.id, ...d.data() }));
    return NextResponse.json({
      ok: true,
      session: { id: sessionSnap.id, ...sessionSnap.data(), files },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { ok: false, error: message, hint: e != null ? String(e) : undefined },
      { status: 500 }
    );
  }
}
