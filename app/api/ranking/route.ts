import { NextRequest, NextResponse } from "next/server";
import { getEnrichedData, getFinnhubDailyVolume } from "@/lib/finnhub";
import { getPrevAiScore } from "@/lib/danelfin-prev";

const DANELFIN_BASE = "https://apirest.danelfin.com";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function previousDays(fromDate: string, count: number): string[] {
  const dates: string[] = [];
  const d = new Date(fromDate + "T12:00:00Z");
  for (let i = 0; i < count; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Log on server only; never log secrets. */
function log(msg: string, meta?: Record<string, unknown>) {
  const payload = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  // eslint-disable-next-line no-console -- server diagnostic
  console.log(`[ranking] ${payload}`);
}

function logApiError(route: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const code = (e as { code?: string })?.code;
  console.error(`[${route}]`, {
    name: err.name,
    message: err.message,
    code: code ?? "unknown",
    stack: err.stack,
  });
}

export async function GET(request: NextRequest) {
  const key = process.env.DANELFIN_API_KEY;
  const hasKey = Boolean(key?.trim());

  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const dateParam = searchParams.get("date");

  log("GET", {
    hasKey,
    hasDate: Boolean(dateParam),
    hasTicker: Boolean(ticker),
    asset: searchParams.get("asset") ?? null,
    buy_track_record: searchParams.get("buy_track_record") ?? null,
  });

  if (!hasKey) {
    log("missing env DANELFIN_API_KEY");
    return NextResponse.json(
      { error: "API key not configured. Set DANELFIN_API_KEY in environment (e.g. Netlify env vars) and redeploy." },
      { status: 500 }
    );
  }

  if (!ticker && !dateParam) {
    return NextResponse.json(
      { error: "Either ticker or date is required" },
      { status: 400 }
    );
  }

  try {
    return await handleRankingRequest(request, key!, searchParams);
  } catch (e) {
    logApiError("api/ranking", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

async function handleRankingRequest(
  request: NextRequest,
  key: string,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  const ticker = searchParams.get("ticker");
  const dateParam = searchParams.get("date");

  const params = new URLSearchParams();
  if (ticker) params.set("ticker", ticker);
  const asset = searchParams.get("asset");
  if (asset) params.set("asset", asset);
  const sector = searchParams.get("sector");
  if (sector) params.set("sector", sector);
  const industry = searchParams.get("industry");
  if (industry) params.set("industry", industry);
  const buy_track_record = searchParams.get("buy_track_record");
  if (buy_track_record) params.set("buy_track_record", buy_track_record);
  const sell_track_record = searchParams.get("sell_track_record");
  if (sell_track_record) params.set("sell_track_record", sell_track_record);

  const datesToTry = dateParam
    ? [dateParam, ...previousDays(dateParam, 10)]
    : [new Date().toISOString().slice(0, 10)];

  const FETCH_TIMEOUT_MS = 20_000;
  let lastUpstreamStatus: number | null = null;
  let lastUpstreamBody = "";

  for (const date of datesToTry) {
    const q = new URLSearchParams(params);
    q.set("date", date);
    const url = `${DANELFIN_BASE}/ranking?${q.toString()}`;
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": key },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const elapsed = Date.now() - start;
      log("fetch error", { date, elapsed, err: err instanceof Error ? err.message : "unknown" });
      continue;
    }

    lastUpstreamStatus = res.status;
    const elapsed = Date.now() - start;

    if (res.ok) {
      const data = await res.json();
      const dateKey = Object.keys(data)[0];
      if (!dateKey) {
        return NextResponse.json(data);
      }

      const byTicker = data[dateKey] as Record<string, Record<string, unknown>>;
      const allTickers = Object.keys(byTicker);
      const MAX_TICKERS_FOR_DELTA = 120;
      const tickersForDelta = allTickers.slice(0, MAX_TICKERS_FOR_DELTA);

      log("upstream ok", { date: dateKey, tickers: allTickers.length, elapsed });

      const deltas = await Promise.all(
        tickersForDelta.map(async (t) => {
          try {
            const currentAiscore = Number(byTicker[t]?.aiscore);
            const prevAiscore = Number.isNaN(currentAiscore)
              ? null
              : await getPrevAiScore(t, dateKey, key!);
            const aiScoreDelta =
              prevAiscore != null && !Number.isNaN(currentAiscore)
                ? Math.round(currentAiscore - prevAiscore)
                : null;
            return { ticker: t, aiScoreDelta };
          } catch {
            return { ticker: t, aiScoreDelta: null };
          }
        })
      );
      for (const { ticker: t, aiScoreDelta } of deltas) {
        byTicker[t].aiScoreDelta = aiScoreDelta;
      }
      for (const t of allTickers.slice(MAX_TICKERS_FOR_DELTA)) {
        byTicker[t].aiScoreDelta = null;
      }

      const MAX_TICKERS_FOR_ENRICHMENT = 150;
      const tickersForEnrichment = allTickers.slice(0, MAX_TICKERS_FOR_ENRICHMENT);

      if (process.env.FINNHUB_API_KEY) {
        const enriched = await Promise.all(
          tickersForEnrichment.map(async (t) => {
            try {
              const [profile, dailyVolume] = await Promise.all([
                getEnrichedData(t),
                getFinnhubDailyVolume(t, dateKey),
              ]);
              return {
                ticker: t,
                companyName: profile.companyName ?? undefined,
                industry: profile.industry ?? undefined,
                countryCode: profile.countryCode ?? undefined,
                countryName: profile.countryName ?? undefined,
                dailyVolume: dailyVolume ?? undefined,
              };
            } catch {
              return { ticker: t, companyName: undefined, industry: undefined, countryCode: undefined, countryName: undefined, dailyVolume: undefined };
            }
          })
        );
        for (const { ticker: t, companyName, industry, countryCode, countryName, dailyVolume } of enriched) {
          if (!byTicker[t]) continue;
          if (companyName != null) byTicker[t].companyName = companyName;
          if (industry != null) byTicker[t].industry = industry;
          if (countryCode != null) byTicker[t].countryCode = countryCode;
          if (countryName != null) byTicker[t].countryName = countryName;
          if (dailyVolume != null) byTicker[t].dailyVolume = dailyVolume;
        }
      }
      for (const t of allTickers) {
        const raw = byTicker[t];
        if (raw?.buy_track_record != null) byTicker[t].buyTrackRecord = raw.buy_track_record;
        if (raw?.sell_track_record != null) byTicker[t].sellTrackRecord = raw.sell_track_record;
      }

      return NextResponse.json(data);
    }

    const bodyText = await res.text();
    lastUpstreamBody = bodyText.slice(0, 200);
    log("upstream non-ok", { date, status: res.status, elapsed, bodyPreview: lastUpstreamBody.slice(0, 80) });

    if (res.status === 400 || res.status === 403) {
      return NextResponse.json(
        { error: bodyText || res.statusText },
        { status: res.status }
      );
    }
    if (res.status === 401) {
      return NextResponse.json(
        { error: "Invalid API key. Check DANELFIN_API_KEY in environment." },
        { status: 502 }
      );
    }
    if (res.status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 502 }
      );
    }
  }

  log("no data for any date", { lastUpstreamStatus, lastBodyPreview: lastUpstreamBody.slice(0, 80) });
  return NextResponse.json(
    {
      error: lastUpstreamStatus != null
        ? `Upstream API returned ${lastUpstreamStatus}. Check server logs for details.`
        : "Upstream API unavailable (timeout or network). Try again.",
    },
    { status: 502 }
  );
}
