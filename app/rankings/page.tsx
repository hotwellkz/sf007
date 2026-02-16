"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getTopStocksUnified, getTradeIdeas } from "@/lib/api";
import type { RankingRow } from "@/lib/types";
import { rankingResponseToRows } from "@/lib/ranking-mapping";
import { addTicker } from "@/lib/portfolio";
import { formatCompactNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Navbar } from "@/components/navbar";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { InnerStocksTabs } from "@/components/ranking/inner-stocks-tabs";
import { RankingTable } from "@/components/ranking/ranking-table";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

const PAGE_SIZE = 20;
type TabId = "stocks" | "etfs" | "trade-ideas" | "sectors" | "industries";

function formatLastUpdate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rowsToCSV(rows: RankingRow[]): string {
  const headers = [
    "Rank",
    "Ticker",
    "Company",
    "Country",
    "AI Score",
    "Change",
    "Fundamental",
    "Technical",
    "Sentiment",
    "Low Risk",
    "Volume",
    "Industry",
  ];
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n"))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.rank,
        r.ticker,
        r.companyName ?? "",
        r.country ?? "",
        r.aiscore,
        r.change ?? "",
        r.fundamental,
        r.technical,
        r.sentiment,
        r.low_risk,
        r.volume != null ? formatCompactNumber(r.volume) : "",
        r.industry ?? "",
      ].map(escape).join(",")
    );
  }
  return lines.join("\n");
}

function RankingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const tabParam = (searchParams.get("tab") || "stocks") as TabId;
  const marketParam = searchParams.get("market") || "usa";
  const sourceParam = (searchParams.get("source") || "auto") as "auto" | "db" | "api";

  const [tab, setTab] = useState<TabId>(tabParam);
  const [market, setMarket] = useState(marketParam);
  const [dataSource, setDataSource] = useState<"auto" | "db" | "api">(sourceParam);
  const [innerTab, setInnerTab] = useState("top-popular");
  const [buyTrackRecord, setBuyTrackRecord] = useState(false);
  const [sellTrackRecord, setSellTrackRecord] = useState(false);
  const [countryFilter, setCountryFilter] = useState("all");
  const [alphaSignals, setAlphaSignals] = useState<"all" | "buy" | "sell">("all");

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [rankingDateKey, setRankingDateKey] = useState<string>("");
  const [sourceUsed, setSourceUsed] = useState<"auto" | "db" | "api" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const updateUrl = useCallback(
    (newTab: TabId, newMarket: string, newSource?: "auto" | "db" | "api") => {
      const params = new URLSearchParams();
      params.set("tab", newTab);
      params.set("market", newMarket);
      if (newSource && newSource !== "auto") params.set("source", newSource);
      else if (newSource === "auto") params.delete("source");
      router.replace(`/rankings?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const handleTabChange = useCallback(
    (v: string) => {
      const t = v as TabId;
      setTab(t);
      setPage(0);
      updateUrl(t, market, dataSource);
    },
    [market, dataSource, updateUrl]
  );

  const handleMarketChange = useCallback(
    (id: string) => {
      setMarket(id);
      updateUrl(tab, id, dataSource);
    },
    [tab, dataSource, updateUrl]
  );

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const date = new Date().toISOString().slice(0, 10);

    if (tab === "stocks") {
      getTopStocksUnified(date, dataSource)
        .then((data) => {
          setRankingDateKey(data.asOfDate);
          setSourceUsed(data.sourceUsed);
          setRows(data.items);
        })
        .catch((e) => {
          const msg = e.message || "Failed to load";
          setError(msg);
          if ((e as { isRateLimit?: boolean }).isRateLimit) {
            setError("Rate limit exceeded. Try switching to DB mode below to use cached data.");
          }
        })
        .finally(() => setLoading(false));
    } else if (tab === "etfs") {
      getTradeIdeas(date)
        .then((data) => {
          const dateKey = Object.keys(data)[0] ?? date;
          setRankingDateKey(dateKey);
          setSourceUsed(null);
          setRows(rankingResponseToRows(data));
        })
        .catch((e) => setError(e.message || "Failed to load"))
        .finally(() => setLoading(false));
    } else if (tab === "trade-ideas") {
      getTradeIdeas(date)
        .then((data) => {
          const dateKey = Object.keys(data)[0] ?? date;
          setRankingDateKey(dateKey);
          setSourceUsed(null);
          setRows(rankingResponseToRows(data));
        })
        .catch((e) => setError(e.message || "Failed to load"))
        .finally(() => setLoading(false));
    } else {
      setRows([]);
      setRankingDateKey(date);
      setSourceUsed(null);
      setLoading(false);
    }
  }, [tab, dataSource, buyTrackRecord, sellTrackRecord]);

  useEffect(() => {
    setTab(tabParam);
    setMarket(marketParam);
    setDataSource(sourceParam);
  }, [tabParam, marketParam, sourceParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = r.country ?? r.countryCode ?? "USA";
      set.add(c);
    }
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (countryFilter === "all") return rows;
    return rows.filter((r) => {
      const c = r.country ?? r.countryCode ?? "";
      return c === countryFilter;
    });
  }, [rows, countryFilter]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const paginatedRows = filteredRows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const handleExportCSV = useCallback(() => {
    const csv = rowsToCSV(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking-${rankingDateKey || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, rankingDateKey]);

  const handleAddToPortfolio = useCallback(
    (ticker: string) => {
      addTicker(ticker);
      toast.show("Added to portfolio");
    },
    [toast]
  );

  const lastUpdateLabel = rankingDateKey
    ? formatLastUpdate(rankingDateKey)
    : "—";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <section className="px-6 py-8">
          <div className="mx-auto max-w-[1400px]">
            {/* Breadcrumbs + Last update + Export */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <nav className="flex items-center gap-2 text-sm text-gray-600">
                <Link href="/" className="text-[#1D74C6] hover:underline">
                  Home
                </Link>
                <span>/</span>
                <span>US Market</span>
                <span>/</span>
                <Link href="/rankings" className="text-[#1D74C6] hover:underline">
                  Top Stocks
                </Link>
                <span>/</span>
                <span className="font-medium text-gray-900">Top Popular</span>
              </nav>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Last update: {lastUpdateLabel}
                </span>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Top-level tabs */}
            <div className="mb-6">
              <SegmentTabs value={tab} onValueChange={handleTabChange} />
            </div>

            {/* Inner tabs (Top Stocks only) */}
            {tab === "stocks" && (
              <div className="mb-6">
                <InnerStocksTabs value={innerTab} onValueChange={setInnerTab} />
              </div>
            )}

            {/* Data source switch (Top Stocks only) */}
            {tab === "stocks" && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white p-2">
                <span className="text-sm font-medium text-gray-700">Data source:</span>
                {(["auto", "db", "api"] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      setDataSource(src);
                      updateUrl(tab, market, src);
                      setPage(0);
                      fetchData();
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                      dataSource === src
                        ? "bg-[#EAF4FF] text-[#1D74C6]"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {src}
                  </button>
                ))}
                {sourceUsed && (
                  <span className="ml-2 text-xs text-gray-500">
                    (using: {sourceUsed})
                  </span>
                )}
              </div>
            )}

            {/* Country chips (optional, keep for consistency) */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white p-2">
                <span className="text-sm font-medium text-gray-700">
                  Top Stocks in:
                </span>
                <button
                  type="button"
                  onClick={() => handleMarketChange("usa")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    market === "usa"
                      ? "bg-[#EAF4FF] text-[#1D74C6]"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  USA
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-gray-700">
                Filter stocks:
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={buyTrackRecord}
                    onChange={(e) => {
                      setBuyTrackRecord(e.target.checked);
                      setAlphaSignals(e.target.checked ? "buy" : sellTrackRecord ? "sell" : "all");
                      setPage(0);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-[#1D74C6]"
                  />
                  <span className="text-sm text-gray-700">Buy Track Record</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sellTrackRecord}
                    onChange={(e) => {
                      setSellTrackRecord(e.target.checked);
                      setAlphaSignals(e.target.checked ? "sell" : buyTrackRecord ? "buy" : "all");
                      setPage(0);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-[#1D74C6]"
                  />
                  <span className="text-sm text-gray-700">Sell Track Record</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">All Countries</label>
                  <select
                    value={countryFilter}
                    onChange={(e) => {
                      setCountryFilter(e.target.value);
                      setPage(0);
                    }}
                    className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="all">All Countries</option>
                    {countryOptions
                      .filter((c) => c !== "all")
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Alpha Signals</label>
                  <select
                    value={alphaSignals}
                    onChange={(e) => {
                      const v = e.target.value as "all" | "buy" | "sell";
                      setAlphaSignals(v);
                      setBuyTrackRecord(v === "buy");
                      setSellTrackRecord(v === "sell");
                      setPage(0);
                    }}
                    className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="all">All</option>
                    <option value="buy">Buy Track Record</option>
                    <option value="sell">Sell Track Record</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Table card */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
              <h3 className="text-lg font-bold text-gray-900">
                Popular Stocks Ranked by StockForge AI
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                US-listed stocks are ranked according to the AI Score, which
                rates the probability of beating the market in the next 3
                months.
              </p>

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {error}
                  {tab === "stocks" && error.includes("Rate limit") && (
                    <p className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDataSource("db");
                          updateUrl(tab, market, "db");
                          fetchData();
                        }}
                        className="font-medium text-red-800 underline hover:no-underline focus:outline-none focus:underline"
                      >
                        Switch to DB mode
                      </button>
                      {" "}to use cached snapshot data.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchData()}
                    className="ml-3 mt-2 inline-block font-medium text-red-800 underline hover:no-underline focus:outline-none focus:underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {loading ? (
                <div className="mt-6 flex min-h-[400px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1D74C6] border-t-transparent" />
                </div>
              ) : (
                <>
                  <div className="mt-6">
                    <RankingTable
                      data={paginatedRows}
                      onAddToPortfolio={handleAddToPortfolio}
                    />
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-5 flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setPage((p) => Math.max(0, p - 1))
                        }
                        disabled={currentPage === 0}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage((p) =>
                            Math.min(totalPages - 1, p + 1)
                          )
                        }
                        disabled={currentPage >= totalPages - 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function RankingsFallback() {
  return (
    <>
      <Navbar />
      <main className="flex min-h-[40vh] items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1D74C6] border-t-transparent" />
      </main>
    </>
  );
}

export default function RankingsPage() {
  return (
    <Suspense fallback={<RankingsFallback />}>
      <RankingsContent />
    </Suspense>
  );
}
