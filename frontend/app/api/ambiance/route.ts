import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/** Fetch 1m candles from Hyperliquid for a time range */
async function fetchCandles(coin: string, startMs: number, endMs: number) {
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
    // Build map: open_time_ms → close price
    const map = new Map<number, number>();
    for (const c of candles) {
      // Round to nearest minute for matching
      const min = Math.floor(c.t / 60000) * 60000;
      map.set(min, parseFloat(c.c));
    }
    return map;
  } catch {
    return new Map<number, number>();
  }
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

  // Fetch candles covering the data range
  let candleMap = new Map<number, number>();
  if (docs.length > 0) {
    const startMs = new Date(docs[0].ts).getTime();
    const endMs = new Date(docs[docs.length - 1].ts).getTime();
    candleMap = await fetchCandles(coin, startMs, endMs + 60000);
  }

  const data = docs.map((d) => {
    const tsMs = Math.floor(new Date(d.ts).getTime() / 60000) * 60000;
    const stored = d["5m"]?.mid_price ?? d["1m"]?.mid_price ?? 0;
    const mid_price = stored > 0 ? stored : (candleMap.get(tsMs) ?? 0);
    const patch = (w: any) => w ? {
      ...w,
      buy_vol_per_min: w.buy_vol_per_min ?? 0,
      sell_vol_per_min: w.sell_vol_per_min ?? 0,
    } : w;
    return {
      ts: d.ts,
      mid_price,
      "1m": patch(d["1m"]),
      "5m": patch(d["5m"]),
      "15m": patch(d["15m"]),
    };
  });

  return NextResponse.json(data);
}

