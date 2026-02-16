/**
 * Upsert snapshot items into Firestore with size check and fallback for >1MB docs.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Timestamp } from "firebase-admin/firestore";
import type { Bucket } from "firebase-admin/storage";
import type { SnapshotItem, SnapshotItemSource } from "@/lib/admin/import-types";

const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;
const SAFE_LIMIT = Math.floor(FIRESTORE_DOC_LIMIT_BYTES * 0.85);

function estimateDocBytes(doc: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(doc), "utf8");
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export interface ItemToUpsert {
  symbol: string;
  raw: Record<string, string | number | null>;
  norm: Record<string, string | number | null>;
  rowHash: string;
  source: SnapshotItemSource;
}

/**
 * Write one item to snapshots/{asOfDate}/items/{symbol}.
 * If doc would exceed SAFE_LIMIT, store raw in Storage at imports/snapshots/{asOfDate}/items/{symbol}/raw.json
 * and put rawStoragePath in the Firestore doc instead of raw.
 */
export async function upsertSnapshotItem(
  db: Firestore,
  bucket: Bucket | null,
  asOfDate: string,
  item: ItemToUpsert,
  updatedAt: Timestamp
): Promise<"inserted" | "updated" | "unchanged"> {
  const itemsRef = db.collection("snapshots").doc(asOfDate).collection("items");
  const docRef = itemsRef.doc(item.symbol);

  const docData: Omit<SnapshotItem, "updatedAt"> & { updatedAt: Timestamp } = {
    symbol: item.symbol,
    raw: item.raw,
    norm: item.norm,
    rowHash: item.rowHash,
    updatedAt,
    source: item.source,
  };

  let dataToWrite: Record<string, unknown> = { ...docData, updatedAt } as unknown as Record<string, unknown>;
  const size = estimateDocBytes(dataToWrite);
  if (size > SAFE_LIMIT && bucket) {
    const storagePath = `imports/snapshots/${asOfDate}/items/${item.symbol}/raw.json`;
    const file = bucket.file(storagePath);
    await file.save(JSON.stringify(item.raw), { contentType: "application/json" });
    dataToWrite = {
      symbol: item.symbol,
      norm: item.norm,
      rowHash: item.rowHash,
      updatedAt,
      source: item.source,
      rawStoragePath: storagePath,
    };
  }

  const existing = await docRef.get();
  if (!existing.exists) {
    await docRef.set(dataToWrite);
    return "inserted";
  }
  const existingHash = existing.data()?.rowHash;
  if (existingHash === item.rowHash) return "unchanged";
  await docRef.update(dataToWrite);
  return "updated";
}
