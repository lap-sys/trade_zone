import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Asset config — single source of truth for frontend + backend */
const CONFIG = {
  categories: {
    Crypto: {
      BTC: { symbol: "BTC" },
    },
    Commodities: {
      GOLD: { symbol: "xyz:GOLD" },
      SILVER: { symbol: "xyz:SILVER" },
      OIL: { symbol: "xyz:CL" },
      NATGAS: { symbol: "xyz:NATGAS" },
    },
    Stocks: {
      NVDA: { symbol: "xyz:NVDA" },
      TSLA: { symbol: "xyz:TSLA" },
      GOOGL: { symbol: "xyz:GOOGL" },
    },
    Forex: {
      USDJPY: { symbol: "xyz:JPY" },
    },
  },
};

export async function GET() {
  return NextResponse.json(CONFIG);
}

