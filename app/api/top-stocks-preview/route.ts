import { NextRequest, NextResponse } from "next/server";
import { getItemsFromDb } from "@/lib/top-stocks/db";
import { getAppConfig } from "@/lib/top-stocks/config";
import { rankingResponseToRows } from "@/lib/ranking-mapping";
import { FirebaseAdminInitError } from "@/lib/firebaseAdmin";
import type { RankingApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_LIMIT = 5;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fetch from internal ranking API (Danelfin). */
async function fetchRankingApi(
  asOfDate: string,
  origin: string,
  asset: "stock" | "etf" = "stock"
): Promise<RankingApiResponse> {
  const url = `${origin}/api/ranking?date=${encodeURIComponent(asOfDate)}&asset=${asset}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data?.error as string) || res.statusText || "Ranking API failed";
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return data as RankingApiResponse;
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  return status === 429 || (typeof msg === "string" && msg.includes("Rate limit"));
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const { searchParams } = new URL(request.url);
    const paramSource = searchParams.get("source") as "auto" | "db" | "api" | null;
    const paramAsOf = searchParams.get("asOfDate");
    const market = searchParams.get("market") ?? "US";
    const tab = searchParams.get("tab") ?? "popular";

    const config = await getAppConfig();
    const dataSource =
      paramSource === "auto" || paramSource === "db" || paramSource === "api"
        ? paramSource
        : "auto";
    const asOfDate =
      paramAsOf && DATE_REGEX.test(paramAsOf)
        ? paramAsOf
        : config.defaultAsOfDate || today();

    if (dataSource === "db") {
      const items = await getItemsFromDb(asOfDate, PREVIEW_LIMIT);
      console.log("[top-stocks-preview] source=db", { asOfDate, count: items.length });
      return NextResponse.json({
        ok: true,
        sourceUsed: "db" as const,
        asOfDate,
        items,
      });
    }

    if (dataSource === "api") {
      const data = await fetchRankingApi(asOfDate, origin, "stock");
      const rows = rankingResponseToRows(data);
      const items = rows.slice(0, PREVIEW_LIMIT).map((r, i) => ({ ...r, rank: i + 1 }));
      console.log("[top-stocks-preview] source=api", { asOfDate, count: items.length });
      return NextResponse.json({
        ok: true,
        sourceUsed: "api" as const,
        asOfDate,
        items,
      });
    }

    if (dataSource === "auto") {
      try {
        const data = await fetchRankingApi(asOfDate, origin, "stock");
        const rows = rankingResponseToRows(data);
        const items = rows.slice(0, PREVIEW_LIMIT).map((r, i) => ({ ...r, rank: i + 1 }));
        console.log("[top-stocks-preview] source=auto (api)", { asOfDate, count: items.length });
        return NextResponse.json({
          ok: true,
          sourceUsed: "api" as const,
          asOfDate,
          items,
        });
      } catch (apiErr) {
        if (isRateLimitError(apiErr)) {
          console.log("[top-stocks-preview] source=auto fallback to db (rate limit)");
        } else {
          console.log("[top-stocks-preview] source=auto fallback to db", {
            err: apiErr instanceof Error ? apiErr.message : String(apiErr),
          });
        }
        const items = await getItemsFromDb(asOfDate, PREVIEW_LIMIT);
        return NextResponse.json({
          ok: true,
          sourceUsed: "db" as const,
          asOfDate,
          items,
        });
      }
    }

    return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400 });
  } catch (e) {
    if (e instanceof FirebaseAdminInitError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Firebase Admin not configured.",
          hint: e.hint ?? "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.",
        },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    const isAuth =
      message.includes("UNAUTHENTICATED") || message.includes("invalid authentication");
    if (isAuth) {
      return NextResponse.json(
        {
          ok: false,
          error: "Firebase Admin credentials invalid or not configured.",
          hint: "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
