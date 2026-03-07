import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const coin = searchParams.get("coin") || "BTC";

  try {
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

