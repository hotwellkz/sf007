/**
 * Firestore schema types for import sessions and snapshots.
 */

import type { Timestamp } from "firebase-admin/firestore";

export type ImportSessionStatus = "draft" | "uploading" | "processing" | "completed" | "failed";
export type ImportFileStatus = "uploaded" | "processing" | "processed" | "failed";

export interface ImportSessionTotals {
  files: number;
  rows: number;
  processedRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failedRows: number;
}

export interface ImportSession {
  status: ImportSessionStatus;
  createdAt: Timestamp;
  createdBy: string;
  asOfDate: string;
  expectedParts?: number;
  headersHash?: string;
  totals: ImportSessionTotals;
  lastError?: string;
}

export interface ImportFile {
  partIndex: number;
  storagePath: string;
  originalName: string;
  uploadedAt: Timestamp;
  sizeBytes: number;
  rowsDetected: number;
  headersHash: string;
  fileHash: string;
  status: ImportFileStatus;
  error?: string;
}

export interface SnapshotItemSource {
  sessionId: string;
  fileId: string;
  partIndex: number;
  rowNumber: number;
}

export interface SnapshotItem {
  symbol: string;
  raw: Record<string, string | number | null>;
  norm: Record<string, string | number | null>;
  rowHash: string;
  updatedAt: Timestamp;
  source: SnapshotItemSource;
}

export const DEFAULT_TOTALS: ImportSessionTotals = {
  files: 0,
  rows: 0,
  processedRows: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  failedRows: 0,
};
