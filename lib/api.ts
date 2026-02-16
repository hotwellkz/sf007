import type { RankingApiResponse, RankingRow } from "./types";

export type TopStocksResponse = {
  ok: true;
  sourceUsed: "auto" | "db" | "api";
  asOfDate: string;
  items: RankingRow[];
};

/** Base URL for API calls. Client: same origin. Server: empty for relative (same host). */
function getApiBase(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

async function handleRes(res: Response): Promise<never> {
  let message = res.statusText || "Request failed";
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error && typeof body.error === "string") message = body.error;
      else message = text.slice(0, 200);
    } catch {
      message = text.slice(0, 200);
    }
  }
  throw new Error(message);
}

function getDateParam(date?: string): string {
  if (date) return date;
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export type GetTopStocksOptions = {
  date?: string;
  asset?: "stock" | "etf";
  buyTrackRecord?: boolean;
  sellTrackRecord?: boolean;
};

export async function getTopStocks(
  date?: string,
  asset: "stock" | "etf" = "stock",
  options?: { buyTrackRecord?: boolean; sellTrackRecord?: boolean }
) {
  const dateStr = getDateParam(date);
  const params = new URLSearchParams({ date: dateStr, asset });
  if (options?.buyTrackRecord) params.set("buy_track_record", "1");
  if (options?.sellTrackRecord) params.set("sell_track_record", "1");
  const base = getApiBase();
  const url = base ? `${base}/api/ranking?${params}` : `/api/ranking?${params}`;
  const res = await fetch(url);
  if (!res.ok) await handleRes(res);
  const data: RankingApiResponse = await res.json();
  return data;
}

export type TopStocksSource = "auto" | "db" | "api";

/**
 * Fetch top stocks from unified API (Firestore or external API by source).
 * Use for Top Stocks tab to support source=db when rate limited.
 */
export async function getTopStocksUnified(
  asOfDate?: string,
  source?: TopStocksSource
): Promise<TopStocksResponse> {
  const dateStr = getDateParam(asOfDate);
  const params = new URLSearchParams({ asOfDate: dateStr });
  if (source) params.set("source", source);
  const base = getApiBase();
  const url = base ? `${base}/api/top-stocks?${params}` : `/api/top-stocks?${params}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data?.error as string) || res.statusText || "Request failed";
    const err = new Error(msg) as Error & { status?: number; isRateLimit?: boolean };
    err.status = res.status;
    err.isRateLimit = res.status === 502 && typeof msg === "string" && msg.includes("Rate limit");
    throw err;
  }
  if (!data.ok || !Array.isArray(data.items)) {
    throw new Error((data?.error as string) || "Invalid response");
  }
  return data as TopStocksResponse;
}

export async function getStockDetails(ticker: string, date?: string) {
  const params = new URLSearchParams({ ticker });
  if (date) params.set("date", date);
  const base = getApiBase();
  const url = base ? `${base}/api/ranking?${params}` : `/api/ranking?${params}`;
  const res = await fetch(url);
  if (!res.ok) await handleRes(res);
  return res.json();
}

export async function getTradeIdeas(date?: string) {
  const dateStr = getDateParam(date);
  const params = new URLSearchParams({ date: dateStr, buy_track_record: "1" });
  const base = getApiBase();
  const url = base ? `${base}/api/ranking?${params}` : `/api/ranking?${params}`;
  const res = await fetch(url);
  if (!res.ok) await handleRes(res);
  const data: RankingApiResponse = await res.json();
  return data;
}

export async function getSectors() {
  const res = await fetch(`${getApiBase()}/api/sectors`);
  if (!res.ok) throw new Error("Failed to fetch sectors");
  return res.json() as Promise<{ sector: string }[]>;
}

export async function getSectorScores(slug: string) {
  const res = await fetch(`${getApiBase()}/api/sectors/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Failed to fetch sector scores");
  return res.json();
}

export async function getIndustries() {
  const res = await fetch(`${getApiBase()}/api/industries`);
  if (!res.ok) throw new Error("Failed to fetch industries");
  return res.json() as Promise<{ industry: string }[]>;
}

export async function getIndustryScores(slug: string) {
  const res = await fetch(`${getApiBase()}/api/industries/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Failed to fetch industry scores");
  return res.json();
}

export type { RankingApiResponse };
