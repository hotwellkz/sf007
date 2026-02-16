/**
 * Normalize Firestore snapshot doc (norm/raw or top-level) to UI shape (RankingRow).
 * Tolerant field mapping and safe numeric parsing for CSV-imported data.
 */

import type { RankingRow } from "@/lib/types";

type RecordLike = Record<string, string | number | null | unknown>;

/** Parse number from string (strip commas, %, spaces) or return number as-is. */
function parseNumSafe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/,/g, "").replace(/%/g, "").trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Try multiple key groups; first non-null wins. For numbers, use parseNumSafe. */
function pickNum(obj: RecordLike, keyGroups: string[][]): number | null {
  for (const keys of keyGroups) {
    for (const k of keys) {
      const v = obj[k];
      if (v === null || v === undefined) continue;
      const n = parseNumSafe(v);
      if (n !== null) return n;
    }
  }
  return null;
}

function pickStr(obj: RecordLike, keyGroups: string[][]): string | null {
  for (const keys of keyGroups) {
    for (const k of keys) {
      const v = obj[k];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

function pickBool(obj: RecordLike, keys: string[]): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (v === true || v === 1 || v === "1") return true;
  }
  return false;
}

/** Keys to try for each field (order matters). Include CSV-style and API-style names. */
const FIELD_KEYS = {
  companyName: [
    "companyName",
    "name",
    "Company",
    "company",
    "Company Name",
    "Name",
    "shortName",
    "longName",
  ],
  country: [
    "country",
    "Country",
    "countryName",
    "Country Name",
    "countryCode",
    "Country Code",
  ],
  countryCode: ["countryCode", "Country Code", "country", "Country"],
  volume: [
    "volume",
    "Volume",
    "avgVolume",
    "avg_volume",
    "Avg. Volume",
    "Avg_Volume",
    "dailyVolume",
    "Daily Volume",
  ],
  industry: ["industry", "Industry"],
  aiScore: ["aiScore", "AI Score", "ai_score", "aiscore", "Aiscore"],
  fundamental: ["fundamental", "Fundamental"],
  technical: ["technical", "Technical"],
  sentiment: ["sentiment", "Sentiment"],
  low_risk: ["low_risk", "lowRisk", "Low Risk"],
  change: ["change", "Change", "aiScoreDelta", "AI Score Delta"],
};

/**
 * Normalize a single Firestore snapshot document to the flat shape expected by the UI.
 * Input: docId (ticker), doc data which may contain norm, raw, and/or top-level fields.
 * Output: RankingRow (null for missing optional fields).
 */
export function normalizeFirestoreStock(
  docId: string,
  data: RecordLike | { symbol?: string; norm?: RecordLike; raw?: RecordLike } | undefined
): RankingRow {
  const top = (data && typeof data === "object" ? data : {}) as RecordLike;
  const norm = (top.norm ?? top.raw ?? {}) as RecordLike;
  const raw = (top.raw ?? top.norm ?? {}) as RecordLike;
  const combined: RecordLike = { ...top, ...norm, ...raw };
  delete combined.norm;
  delete combined.raw;
  delete combined.updatedAt;
  delete combined.source;
  delete combined.rowHash;
  delete combined.rawStoragePath;

  const ticker = (top.symbol ?? docId) ? String(top.symbol ?? docId) : docId;

  const companyName = pickStr(combined, [FIELD_KEYS.companyName]);
  const countryStr = pickStr(combined, [FIELD_KEYS.country]);
  const countryCodeStr = pickStr(combined, [FIELD_KEYS.countryCode]);
  const country = countryStr ?? countryCodeStr ?? null;
  const countryCode = countryCodeStr ?? countryStr ?? null;

  const aiscore = pickNum(combined, [FIELD_KEYS.aiScore]) ?? 0;
  const fundamental = pickNum(combined, [FIELD_KEYS.fundamental]) ?? 0;
  const technical = pickNum(combined, [FIELD_KEYS.technical]) ?? 0;
  const sentiment = pickNum(combined, [FIELD_KEYS.sentiment]) ?? 0;
  const low_risk = pickNum(combined, [FIELD_KEYS.low_risk]) ?? 0;
  const changeRaw = pickNum(combined, [FIELD_KEYS.change]);
  const change = changeRaw != null ? Math.round(changeRaw) : null;
  const volume = pickNum(combined, [FIELD_KEYS.volume]) ?? null;
  const industry = pickStr(combined, [FIELD_KEYS.industry]);

  return {
    ticker,
    rank: 0,
    companyName: companyName ?? null,
    country,
    countryCode,
    aiscore,
    fundamental,
    technical,
    sentiment,
    low_risk,
    change,
    volume,
    industry: industry ?? null,
    buyTrackRecord: pickBool(combined, ["buy_track_record", "buyTrackRecord"]) || undefined,
    sellTrackRecord: pickBool(combined, ["sell_track_record", "sellTrackRecord"]) || undefined,
  };
}

/**
 * Map a Firestore snapshot item doc to RankingRow (with rank).
 * Kept for backward compatibility; delegates to normalizeFirestoreStock.
 */
export function snapshotDocToRow(
  docId: string,
  data: { symbol?: string; norm?: RecordLike; raw?: RecordLike } | undefined,
  rank: number
): RankingRow {
  const row = normalizeFirestoreStock(docId, data);
  row.rank = rank;
  return row;
}
