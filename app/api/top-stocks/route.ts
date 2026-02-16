import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirestore, getStorageBucket, FirebaseAdminInitError } from "@/lib/firebaseAdmin";
import { getAppConfig } from "@/lib/top-stocks/config";
import { snapshotDocToRow } from "@/lib/top-stocks/normalize";
import { rankingResponseToRows } from "@/lib/ranking-mapping";
import { rowHash } from "@/lib/csv/hash";
import { upsertSnapshotItem } from "@/lib/firestore/bulkUpsert";
import type { RankingRow } from "@/lib/types";
import type { RankingApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ITEMS = 200;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function jsonErr(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Fetch from internal ranking API (Danelfin). Uses request origin for same-host call. */
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

/** Read items from Firestore snapshots/{asOfDate}/items, normalize and sort. */
async function getItemsFromDb(asOfDate: string): Promise<RankingRow[]> {
  const db = getFirestore();
  const itemsRef = db.collection("snapshots").doc(asOfDate).collection("items");
  const snap = await itemsRef.limit(MAX_ITEMS + 50).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const rows = docs.map((d, i) => snapshotDocToRow(d.id, d.data, i + 1));
  rows.sort((a, b) => (b.aiscore !== a.aiscore ? b.aiscore - a.aiscore : a.rank - b.rank));
  return rows.slice(0, MAX_ITEMS).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Cache API response into Firestore snapshots/{asOfDate}/items. */
async function cacheApiResponseToFirestore(
  asOfDate: string,
  data: RankingApiResponse
): Promise<void> {
  const db = getFirestore();
  let bucket;
  try {
    bucket = getStorageBucket();
  } catch {
    bucket = null;
  }
  const dateKey = Object.keys(data)[0];
  if (!dateKey) return;
  const byTicker = data[dateKey] as Record<string, Record<string, unknown>>;
  const tickers = Object.keys(byTicker).slice(0, MAX_ITEMS);
  const now = Timestamp.now();
  for (let i = 0; i < tickers.length; i++) {
    const symbol = tickers[i];
    const rawObj = byTicker[symbol] ?? {};
    const raw: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(rawObj)) {
      if (v === null || v === undefined) raw[k] = null;
      else if (typeof v === "number" || typeof v === "string") raw[k] = v as string | number;
      else raw[k] = String(v);
    }
    const norm = { ...raw };
    const source = { sessionId: "api", fileId: "api", partIndex: 0, rowNumber: i + 1 };
    try {
      await upsertSnapshotItem(db, bucket, asOfDate, { symbol, raw, norm, rowHash: rowHash(raw), source }, now);
    } catch {
      // skip single item on error
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const { searchParams } = new URL(request.url);
    const paramSource = searchParams.get("source") as "auto" | "db" | "api" | null;
    const paramAsOf = searchParams.get("asOfDate");

    const config = await getAppConfig();
    const dataSource = paramSource === "auto" || paramSource === "db" || paramSource === "api"
      ? paramSource
      : config.dataSource;
    const asOfDate =
      paramAsOf && DATE_REGEX.test(paramAsOf)
        ? paramAsOf
        : config.defaultAsOfDate || today();

    if (dataSource === "db") {
      const items = await getItemsFromDb(asOfDate);
      return NextResponse.json({
        ok: true,
        sourceUsed: "db" as const,
        asOfDate,
        items,
      });
    }

    if (dataSource === "api") {
      try {
        const data = await fetchRankingApi(asOfDate, origin, "stock");
        const items = rankingResponseToRows(data);
        return NextResponse.json({
          ok: true,
          sourceUsed: "api" as const,
          asOfDate,
          items,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "API failed";
        const status = (e as Error & { status?: number }).status;
        if (status === 429) {
          return NextResponse.json(
            {
              ok: false,
              error: "Rate limit exceeded. Try again later or use source=db to use cached data.",
            },
            { status: 502 }
          );
        }
        return NextResponse.json({ ok: false, error: message }, { status: status === 400 ? 400 : 502 });
      }
    }

    if (dataSource === "auto") {
      try {
        const itemsFromDb = await getItemsFromDb(asOfDate);
        if (itemsFromDb.length > 0) {
          return NextResponse.json({
            ok: true,
            sourceUsed: "db" as const,
            asOfDate,
            items: itemsFromDb,
          });
        }
      } catch {
        // Fall through to API
      }
      try {
        const data = await fetchRankingApi(asOfDate, origin, "stock");
        const items = rankingResponseToRows(data);
        try {
          await cacheApiResponseToFirestore(asOfDate, data);
        } catch {
          // cache best-effort
        }
        return NextResponse.json({
          ok: true,
          sourceUsed: "api" as const,
          asOfDate,
          items,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "API failed";
        const status = (e as Error & { status?: number }).status;
        if (status === 429) {
          return NextResponse.json(
            {
              ok: false,
              error: "Rate limit exceeded. Try again later or use source=db to use cached data.",
            },
            { status: 502 }
          );
        }
        return NextResponse.json({ ok: false, error: message }, { status: status === 400 ? 400 : 502 });
      }
    }

    return jsonErr("Invalid source", 400);
  } catch (e) {
    if (e instanceof FirebaseAdminInitError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Firebase Admin not configured.",
          hint: e.hint ?? "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on Netlify. See docs/NETLIFY_ENV.md.",
        },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
