import { NextRequest, NextResponse } from "next/server";
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { parse } from "csv-parse";
import { requireAdmin } from "@/lib/api/adminAuth";
import { getFirestore, getStorageBucket, FirebaseAdminInitError } from "@/lib/firebaseAdmin";
import { rowHash } from "@/lib/csv/hash";
import { toRawRow, toNormRow, getSymbolFromRaw } from "@/lib/csv/normalize";
import { upsertSnapshotItem } from "@/lib/firestore/bulkUpsert";
import type { SnapshotItemSource } from "@/lib/admin/import-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 400;

function jsonErr(
  message: string,
  status: number,
  extra?: { hint?: string; source?: string }
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
      bucket = getStorageBucket();
    } catch (e) {
      if (e instanceof FirebaseAdminInitError) {
        return jsonErr(e.message, 503, { hint: e.hint, source: e.source });
      }
      return jsonErr(e instanceof Error ? e.message : "Internal server error", 500, {
        hint: e != null ? String(e) : undefined,
      });
    }
    let body: { sessionId: string; fileId?: string };
    try {
      body = await request.json();
    } catch {
      return jsonErr("Invalid JSON", 400);
    }
    const { sessionId, fileId } = body;
    if (!sessionId) {
      return jsonErr("sessionId required", 400);
    }

    const sessionRef = db.collection("import_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return jsonErr("Session not found", 404);
    }
    const sessionData = sessionSnap.data();
    const asOfDate = sessionData?.asOfDate as string;

    let filesToProcess: DocumentSnapshot[];
    if (fileId) {
      const docSnap = await sessionRef.collection("files").doc(fileId).get();
      filesToProcess = docSnap.exists ? [docSnap] : [];
    } else {
      const querySnap = await sessionRef.collection("files").where("status", "==", "uploaded").get();
      filesToProcess = querySnap.docs;
    }

    if (filesToProcess.length === 0) {
      return jsonErr(fileId ? "File not found" : "No uploaded files to process", 400);
    }

    await sessionRef.update({ status: "processing", lastError: null });

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalFailed = 0;
  const errors: { fileId: string; rowNumber: number; reason: string; rawPreview: string }[] = [];

  for (const fileDoc of filesToProcess) {
    const fid = fileDoc.id;
    const fData = fileDoc.data();
    if (!fData || fData.status === "processed") continue;
    const storagePath = fData.storagePath as string;
    const partIndex = fData.partIndex as number;

    await sessionRef.collection("files").doc(fid).update({ status: "processing", error: null });

    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      await sessionRef.collection("files").doc(fid).update({ status: "failed", error: "File not found in storage" });
      continue;
    }

    const stream = file.createReadStream();
    let headers: string[] = [];
    let rowNumber = 0;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let batch: { symbol: string; raw: Record<string, string | number | null>; norm: Record<string, string | number | null>; rowHash: string; source: SnapshotItemSource }[] = [];

    const processBatch = async () => {
      const now = Timestamp.now();
      for (const item of batch) {
        try {
          const result = await upsertSnapshotItem(db, bucket, asOfDate, item, now);
          if (result === "inserted") inserted++;
          else if (result === "updated") updated++;
          else unchanged++;
        } catch (e) {
          failed++;
          errors.push({
            fileId: fid,
            rowNumber: item.source.rowNumber,
            reason: e instanceof Error ? e.message : String(e),
            rawPreview: JSON.stringify(item.raw).slice(0, 200),
          });
        }
      }
      batch = [];
    };

    try {
      const parser = stream.pipe(parse({ relax_column_count: true, skip_empty_lines: true }));
      for await (const record of parser) {
        const row = record as string[];
        rowNumber++;
        if (rowNumber === 1) {
          headers = row.map((c) => String(c).trim());
          continue;
        }
        const raw = toRawRow(headers, row);
        const symbol = getSymbolFromRaw(raw);
        if (!symbol) {
          failed++;
          errors.push({ fileId: fid, rowNumber, reason: "Missing Ticker/Symbol", rawPreview: JSON.stringify(raw).slice(0, 200) });
          continue;
        }
        const norm = toNormRow(raw);
        const hash = rowHash(raw);
        const source: SnapshotItemSource = { sessionId, fileId: fid, partIndex, rowNumber };
        batch.push({ symbol, raw, norm, rowHash: hash, source });
        if (batch.length >= BATCH_SIZE) await processBatch();
      }
      await processBatch();
    } catch (e) {
      await sessionRef.collection("files").doc(fid).update({
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    totalInserted += inserted;
    totalUpdated += updated;
    totalUnchanged += unchanged;
    totalFailed += failed;

    await sessionRef.collection("files").doc(fid).update({
      status: "processed",
      error: null,
    });
  }

  for (const err of errors.slice(0, 100)) {
    await sessionRef.collection("errors").add(err);
  }

  const prev = sessionData?.totals ?? {};
  const newTotals = {
    ...prev,
    processedRows: (prev.processedRows ?? 0) + totalInserted + totalUpdated + totalUnchanged + totalFailed,
    inserted: (prev.inserted ?? 0) + totalInserted,
    updated: (prev.updated ?? 0) + totalUpdated,
    unchanged: (prev.unchanged ?? 0) + totalUnchanged,
    failedRows: (prev.failedRows ?? 0) + totalFailed,
  };

    await sessionRef.update({
      status: "completed",
      totals: newTotals,
      lastError: errors.length > 0 ? `${errors.length} row error(s)` : null,
    });

    return NextResponse.json({
      ok: true,
      inserted: totalInserted,
      updated: totalUpdated,
      unchanged: totalUnchanged,
      failed: totalFailed,
      errorsLogged: errors.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { ok: false, error: message, hint: e != null ? String(e) : undefined },
      { status: 500 }
    );
  }
}
