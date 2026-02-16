"use client";

import { useState, useEffect, useCallback } from "react";
import { getTopStocks, getTradeIdeas, getTopStocksPreview } from "@/lib/api";
import type { RankingApiResponse, RankingRow } from "@/lib/types";
import { rankingResponseToRows } from "@/lib/ranking-mapping";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { RankingCard } from "./ranking-card";
import { CountryChips } from "../country-chips";

type TabId = "stocks" | "etfs" | "trade-ideas" | "sectors" | "industries";

const HOME_PREVIEW_ROWS = 5;
const PREVIEW_CACHE_KEY = "homepage-preview-stocks";
const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;

function formatRankingDate(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getCachedPreview(): RankingRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREVIEW_CACHE_KEY);
    if (!raw) return null;
    const { items, timestamp } = JSON.parse(raw) as { items: RankingRow[]; timestamp: number };
    if (!Array.isArray(items) || items.length === 0) return null;
    if (Date.now() - timestamp > PREVIEW_CACHE_TTL_MS) return null;
    return items;
  } catch {
    return null;
  }
}

function setCachedPreview(items: RankingRow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify({ items, timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

export function RankingSection() {
  const [tab, setTab] = useState<TabId>("stocks");
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateLabel] = useState(formatRankingDate());
  const [market, setMarket] = useState("usa");
  const [usingCachedPreview, setUsingCachedPreview] = useState(false);

  const fetchData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUsingCachedPreview(false);

    const date = new Date().toISOString().slice(0, 10);

    const done = (data: Parameters<typeof rankingResponseToRows>[0] | null, err: string | null) => {
      if (!cancelled) {
        setRows(data ? rankingResponseToRows(data) : []);
        setError(err);
        setLoading(false);
      }
    };

    if (tab === "stocks") {
      getTopStocksPreview({ market: "US", tab: "popular", source: "auto" })
        .then((data) => {
          if (cancelled) return;
          setRows(data.items);
          setError(null);
          setCachedPreview(data.items);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          const cached = getCachedPreview();
          if (cached && cached.length > 0) {
            setRows(cached);
            setError(null);
            setUsingCachedPreview(true);
          } else {
            setRows([]);
            setError(e.message || "Failed to load");
          }
          setLoading(false);
        });
    } else if (tab === "etfs") {
      getTopStocks(date, "etf")
        .then((data) => done(data, null))
        .catch((e) => done(null, e.message || "Failed to load"));
    } else if (tab === "trade-ideas") {
      getTradeIdeas(date)
        .then((data) => done(data, null))
        .catch((e) => done(null, e.message || "Failed to load"));
    } else {
      setRows([]);
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <section id="ranking" className="bg-white px-6 py-14">
      <div className="mx-auto max-w-[1200px]">
        <SectionHeader
          title="Best Stocks and ETFs Picked by AI"
          dateText={`${dateLabel}. For a 3-month investment horizon.`}
        />

        <div className="mt-8">
          <SegmentTabs value={tab} onValueChange={(v) => setTab(v as TabId)} />
        </div>

        {usingCachedPreview && (
          <p className="mt-4 text-center text-sm text-amber-700" role="status">
            Showing previously loaded data. Retry to fetch latest.
          </p>
        )}
        <div className="mt-6">
          <RankingCard
            data={rows}
            loading={loading}
            error={error}
            maxRows={HOME_PREVIEW_ROWS}
            showFooterLink={true}
            footerLinkHref="/rankings?tab=stocks&market=US"
            footerLinkText="See the full US Popular Stocks ranking"
            onRetry={fetchData}
          />
        </div>

        <div className="mt-6">
          <CountryChips
            label="Top Stocks in:"
            value={market}
            onValueChange={setMarket}
          />
        </div>
      </div>
    </section>
  );
}
