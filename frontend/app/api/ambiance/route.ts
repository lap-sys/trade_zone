import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

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

  // Return chronological order
  docs.reverse();

  const data = docs.map((d) => ({
    ts: d.ts,
    "1m": d["1m"],
    "5m": d["5m"],
    "15m": d["15m"],
  }));

  return NextResponse.json(data);
}

