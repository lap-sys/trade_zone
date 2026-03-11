import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/** Fetch 1m candles from Hyperliquid. Returns sorted array of {t, price}. */
async function fetchCandles(coin: string, startMs: number, endMs: number): Promise<{t: number; price: number}[]> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin, interval: "1m", startTime: startMs, endTime: endMs },
      }),
    });
    const candles = await res.json();
    return candles
      .map((c: any) => ({ t: Number(c.t), price: parseFloat(c.c) }))
      .filter((c: any) => c.price > 0)
      .sort((a: any, b: any) => a.t - b.t);
  } catch {
    return [];
  }
}

/** Find nearest candle price for a given timestamp via binary search. */
function nearestCandlePrice(candles: {t: number; price: number}[], tsMs: number): number {
  if (!candles.length) return 0;
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t < tsMs) lo = mid + 1; else hi = mid;
  }
  // Compare lo and lo-1 to find closest
  if (lo > 0 && Math.abs(candles[lo - 1].t - tsMs) <= Math.abs(candles[lo].t - tsMs)) lo--;
  return candles[lo].price;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const coin = searchParams.get("coin") || "BTC";
  const limit = Math.min(Number(searchParams.get("limit") || 200), 1000);

  const client = await clientPromise;
  const col = client.db("trade_zone").collection("ambiance");

  const docs = await col
    .find({ coin })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();

  docs.reverse();

  // Fetch candles covering the data range — price comes ONLY from candles
  let candles: {t: number; price: number}[] = [];
  if (docs.length > 0) {
    const startMs = new Date(docs[0].ts).getTime();
    const endMs = new Date(docs[docs.length - 1].ts).getTime();
    candles = await fetchCandles(coin, startMs - 60000, endMs + 60000);
  }

  const patch = (w: any) => w ? {
    ...w,
    buy_vol_per_min: w.buy_vol_per_min ?? 0,
    sell_vol_per_min: w.sell_vol_per_min ?? 0,
  } : w;

  // Map docs to candle prices, then drop any with price=0 (gaps where no candle exists)
  const data = docs
    .map((d) => ({
      ts: d.ts,
      mid_price: nearestCandlePrice(candles, new Date(d.ts).getTime()),
      "1m": patch(d["1m"]),
      "5m": patch(d["5m"]),
      "15m": patch(d["15m"]),
    }))
    .filter((d) => d.mid_price > 0);

  return NextResponse.json(data);
}

