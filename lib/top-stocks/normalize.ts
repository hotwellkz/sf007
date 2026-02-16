/**
 * Normalize Firestore snapshot doc (norm/raw) to UI shape (RankingRow-like).
 * Tries multiple key names for CSV/API variations.
 */

import type { RankingRow } from "@/lib/types";

type RecordLike = Record<string, string | number | null | unknown>;

const NUM_KEYS: Record<string, string[][]> = {
  aiscore: [["AI Score", "aiscore", "ai_score", "Aiscore"]],
  fundamental: [["Fundamental", "fundamental"]],
  technical: [["Technical", "technical"]],
  sentiment: [["Sentiment", "sentiment"]],
  low_risk: [["Low Risk", "low_risk", "lowRisk"]],
  change: [["Change", "change", "aiScoreDelta", "AI Score Delta"]],
  volume: [["Volume", "volume", "dailyVolume", "Daily Volume"]],
};

const STR_KEYS: Record<string, string[][]> = {
  companyName: [["Company", "companyName", "company", "Company Name", "Name"]],
  country: [["Country", "country", "countryName", "countryCode", "Country Name"]],
  countryCode: [["Country Code", "countryCode", "country"]],
  industry: [["Industry", "industry"]],
};

function pickNum(obj: RecordLike, keyGroups: string[][]): number | null {
  for (const keys of keyGroups) {
    for (const k of keys) {
      const v = obj[k];
      if (v === null || v === undefined) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isNaN(n)) return n;
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
    if (v === true || v === 1) return true;
  }
  return false;
}

/**
 * Map a Firestore snapshot item doc to RankingRow.
 * Doc may have symbol (doc id or field), norm, raw.
 */
export function snapshotDocToRow(
  docId: string,
  data: { symbol?: string; norm?: RecordLike; raw?: RecordLike } | undefined,
  rank: number
): RankingRow {
  const norm = (data?.norm ?? data?.raw ?? {}) as RecordLike;
  const raw = (data?.raw ?? data?.norm ?? {}) as RecordLike;
  const combined = { ...norm, ...raw };

  const ticker = (data?.symbol ?? docId) || docId;
  const aiscore = pickNum(combined, NUM_KEYS.aiscore) ?? 0;
  const fundamental = pickNum(combined, NUM_KEYS.fundamental) ?? 0;
  const technical = pickNum(combined, NUM_KEYS.technical) ?? 0;
  const sentiment = pickNum(combined, NUM_KEYS.sentiment) ?? 0;
  const low_risk = pickNum(combined, NUM_KEYS.low_risk) ?? 0;
  const changeRaw = pickNum(combined, NUM_KEYS.change);
  const change = changeRaw != null ? Math.round(changeRaw) : null;
  const volume = pickNum(combined, NUM_KEYS.volume) ?? null;
  const companyName = pickStr(combined, STR_KEYS.companyName);
  const countryName = pickStr(combined, STR_KEYS.country);
  const countryCode = pickStr(combined, STR_KEYS.countryCode);
  const industry = pickStr(combined, STR_KEYS.industry);

  return {
    ticker,
    rank,
    companyName: companyName ?? null,
    country: countryName ?? countryCode ?? null,
    countryCode: countryCode ?? null,
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
