import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/api/adminAuth";
import { getFirestore, getBucket, FirebaseAdminInitError } from "@/lib/firebaseAdmin";
import { headersHash } from "@/lib/csv/hash";
import type { ImportFile } from "@/lib/admin/import-types";
import { parse } from "csv-parse/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getFirstLine(buffer: Buffer): string[] {
  const firstLine = buffer.toString("utf8").split(/\r?\n/)[0];
  if (!firstLine) return [];
  const parsed = parse(firstLine + "\n", { relax_column_count: true });
  return (parsed[0] as string[]) || [];
}

function jsonErr(
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
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
    let bucket;
    try {
      db = getFirestore();
      bucket = getBucket();
    } catch (e) {
      if (e instanceof FirebaseAdminInitError) {
        return jsonErr(e.message, 503, { hint: e.hint, source: e.source });
      }
      return jsonErr(e instanceof Error ? e.message : "Internal server error", 500, {
        hint: e != null ? String(e) : undefined,
      });
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonErr("Invalid form data", 400);
    }
    const sessionId = formData.get("sessionId") as string | null;
    const partIndexStr = formData.get("partIndex") as string | null;
    const file = formData.get("file") as File | null;
    if (!sessionId || !file || typeof file.arrayBuffer !== "function") {
      return jsonErr("sessionId and file required", 400);
    }
    const partIndex = partIndexStr ? Math.max(1, parseInt(partIndexStr, 10)) : 1;
    if (Number.isNaN(partIndex)) {
      return jsonErr("Invalid partIndex", 400);
    }

    const sessionRef = db.collection("import_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return jsonErr("Session not found", 404);
    }
    const sessionData = sessionSnap.data();
    const asOfDate = sessionData?.asOfDate as string;

    const buf = Buffer.from(await file.arrayBuffer());
    const headers = getFirstLine(buf);
    if (headers.length === 0) {
      return jsonErr("Could not read CSV headers", 400);
    }
    const hHash = headersHash(headers);
    const existingHash = sessionData?.headersHash as string | undefined;
    if (existingHash && existingHash !== hHash) {
      return jsonErr(
        "Headers mismatch; upload belongs to another export. All parts must have the same columns.",
        400
      );
    }

    const fileHash = createHash("md5").update(buf).digest("hex");
    const storagePath = `imports/${sessionId}/part-${partIndex}-${fileHash.slice(0, 12)}.csv`;

    try {
      const storageFile = bucket.file(storagePath);
      await storageFile.save(buf, {
        contentType: "text/csv",
        resumable: false,
      });
    } catch (storageError) {
      const message = storageError instanceof Error ? storageError.message : String(storageError);
      return NextResponse.json(
        {
          ok: false,
          error: message,
          bucket: process.env.FIREBASE_STORAGE_BUCKET ?? bucket.name,
        },
        { status: 500 }
      );
    }

    let rowsDetected = 0;
    try {
      const rows = parse(buf.toString("utf8"), { relax_column_count: true, skip_empty_lines: true });
      rowsDetected = Math.max(0, rows.length - 1);
    } catch {
      rowsDetected = 0;
    }

    const fileId = `${sessionId}_part_${partIndex}`;
    const fileDoc: Omit<ImportFile, "uploadedAt"> & { uploadedAt: Timestamp } = {
      partIndex,
      storagePath,
      originalName: file.name,
      uploadedAt: Timestamp.now(),
      sizeBytes: buf.length,
      rowsDetected,
      headersHash: hHash,
      fileHash,
      status: "uploaded",
    };
    await sessionRef.collection("files").doc(fileId).set(fileDoc);

    if (!existingHash) {
      await sessionRef.update({
        headersHash: hHash,
        status: "uploading",
        "totals.files": (sessionData?.totals?.files ?? 0) + 1,
      });
    } else {
      await sessionRef.update({
        "totals.files": (sessionData?.totals?.files ?? 0) + 1,
      });
    }

    return NextResponse.json({
      ok: true,
      storagePath,
      bucket: bucket.name,
      fileId,
      partIndex,
      rowsDetected,
      headersHash: hHash,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        bucket: process.env.FIREBASE_STORAGE_BUCKET,
      },
      { status: 500 }
    );
  }
}
