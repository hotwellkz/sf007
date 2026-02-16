import { NextResponse } from "next/server";
import { getBucket, FirebaseAdminInitError } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storage health check: ensures bucket is configured and accessible.
 */
export async function GET() {
  try {
    const bucket = getBucket();
    return NextResponse.json({
      ok: true,
      bucket: bucket.name,
    });
  } catch (e) {
    if (e instanceof FirebaseAdminInitError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          hint: e.hint,
        },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        bucket: process.env.FIREBASE_STORAGE_BUCKET,
      },
      { status: 503 }
    );
  }
}
