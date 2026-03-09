import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const coin = searchParams.get("coin") || "BTC";

  try {
    // xyz: perps aren't in allMids — use l2Book mid price instead
    if (coin.startsWith("xyz:")) {
      const res = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin }),
      });
      const book = await res.json();
      const levels = book?.levels;
      if (levels?.[0]?.[0] && levels?.[1]?.[0]) {
        const mid = (parseFloat(levels[0][0].px) + parseFloat(levels[1][0].px)) / 2;
        return NextResponse.json({ coin, price: mid });
      }
      return NextResponse.json({ coin, price: 0 });
    }
    // Standard perps — use allMids
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    });
    const mids = await res.json();
    const price = parseFloat(mids[coin] || "0");
    return NextResponse.json({ coin, price });
  } catch {
    return NextResponse.json({ coin, price: 0 }, { status: 500 });
  }
}

