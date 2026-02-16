import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/api/adminAuth";
import { getFirestore, FirebaseAdminInitError } from "@/lib/firebaseAdmin";
import type { ImportSession } from "@/lib/admin/import-types";
import { DEFAULT_TOTALS } from "@/lib/admin/import-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(
  message: string,
  status: number,
  extra?: { hint?: string; source?: string }
) {
  return NextResponse.json(
    { ok: false, error: message, ...extra },
    { status }
  );
}

export async function GET(request: NextRequest) {
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
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 100);
    const snap = await db.collection("import_sessions").orderBy("createdAt", "desc").limit(limit).get();
    const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, sessions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { ok: false, error: message, hint: e != null ? String(e) : undefined },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    let body: { asOfDate?: string };
    try {
      body = await request.json();
    } catch {
      return jsonErr("Invalid JSON", 400);
    }
    const asOfDate = body.asOfDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return jsonErr("Invalid asOfDate (use YYYY-MM-DD)", 400);
    }
    const session: Omit<ImportSession, "createdAt"> & { createdAt: Timestamp } = {
      status: "draft",
      createdAt: Timestamp.now(),
      createdBy: auth.email,
      asOfDate,
      totals: { ...DEFAULT_TOTALS },
    };
    const ref = await db.collection("import_sessions").add(session);
    return NextResponse.json({ ok: true, sessionId: ref.id, asOfDate });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { ok: false, error: message, hint: e != null ? String(e) : undefined },
      { status: 500 }
    );
  }
}
