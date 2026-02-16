"use client";

import { useState, useEffect, useCallback } from "react";
import { getTopStocks, getTradeIdeas } from "@/lib/api";
import type { RankingApiResponse, RankingRow } from "@/lib/types";
import { rankingResponseToRows } from "@/lib/ranking-mapping";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { RankingCard } from "./ranking-card";
import { CountryChips } from "../country-chips";

type TabId = "stocks" | "etfs" | "trade-ideas" | "sectors" | "industries";

const HOME_PREVIEW_ROWS = 5;

function formatRankingDate(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function RankingSection() {
  const [tab, setTab] = useState<TabId>("stocks");
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateLabel] = useState(formatRankingDate());
  const [market, setMarket] = useState("usa");

  const fetchData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const date = new Date().toISOString().slice(0, 10);

    const done = (data: Parameters<typeof rankingResponseToRows>[0] | null, err: string | null) => {
      if (!cancelled) {
        setRows(data ? rankingResponseToRows(data) : []);
        setError(err);
        setLoading(false);
      }
    };

    if (tab === "stocks") {
      getTopStocks(date, "stock")
        .then((data) => done(data, null))
        .catch((e) => done(null, e.message || "Failed to load"));
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
