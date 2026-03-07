"use client";
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from "recharts";

type WindowData = {
  avg_buy_usd: number; avg_sell_usd: number;
  avg_bid_depth: number; avg_ask_depth: number;
  mid_price?: number;
};
type Row = { ts: string; mid_price: number; "1m": WindowData; "5m": WindowData; "15m": WindowData };

const WINDOWS = ["1m", "5m", "15m"] as const;
const fmt = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
const fmtPrice = (v: number) => v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;
const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const TIP = { background: "#171717", border: "1px solid #333", fontSize: 12 };
const TICK = { fontSize: 10, fill: "#666" };

/** Shared chart wrapper — no X label except on last chart */
function ChartBox({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`bg-neutral-900 border border-neutral-800 rounded-lg p-4 ${last ? "" : "mb-1"}`}>
      <h2 className="text-xs text-neutral-500 mb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Row[]>([]);
  const [price, setPrice] = useState<number>(0);
  const [coin, setCoin] = useState("BTC");
  const [activeWindow, setActiveWindow] = useState<typeof WINDOWS[number]>("5m");

  const fetchData = useCallback(async () => {
    const [ambRes, prRes] = await Promise.all([
      fetch(`/api/ambiance?coin=${coin}&limit=200`),
      fetch(`/api/price?coin=${coin}`),
    ]);
    if (ambRes.ok) setData(await ambRes.json());
    if (prRes.ok) { const j = await prRes.json(); setPrice(j.price); }
  }, [coin]);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 30_000); return () => clearInterval(iv); }, [fetchData]);

  const chartData = data.map((r) => ({
    ts: fmtTime(r.ts),
    mid_price: r.mid_price,
    ...r[activeWindow],
    buy_sell_ratio: r[activeWindow].avg_sell_usd ? r[activeWindow].avg_buy_usd / r[activeWindow].avg_sell_usd : 1,
    bid_ask_ratio: r[activeWindow].avg_ask_depth ? r[activeWindow].avg_bid_depth / r[activeWindow].avg_ask_depth : 1,
    net_depth: r[activeWindow].avg_bid_depth - r[activeWindow].avg_ask_depth,
  }));

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header with live price */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight text-neutral-400">trade_zone</h1>
          {price > 0 && (
            <span className="text-2xl font-mono font-bold text-white">{coin} {fmtPrice(price)}</span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setActiveWindow(w)}
              className={`px-2 py-0.5 rounded text-xs font-mono ${activeWindow === w ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-500 hover:bg-neutral-800"}`}>
              {w}
            </button>
          ))}
          <span className="text-neutral-700 mx-1">|</span>
          {["BTC", "ETH", "SOL"].map((c) => (
            <button key={c} onClick={() => setCoin(c)}
              className={`px-2 py-0.5 rounded text-xs font-mono ${coin === c ? "bg-white text-black" : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center text-neutral-600 mt-20">
          No data yet. Run <code className="text-neutral-400">python3 ws_monitor.py {coin}</code>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* 1. Price */}
          <ChartBox title={`${coin} Mid Price`}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="gPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="ts" tick={TICK} interval="preserveStartEnd" hide />
                <YAxis tickFormatter={fmtPrice} tick={TICK} width={65} domain={["auto", "auto"]} />
                <Tooltip contentStyle={TIP} formatter={(v) => fmtPrice(Number(v))} />
                <Area type="monotone" dataKey="mid_price" stroke="#8b5cf6" fill="url(#gPrice)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>

          {/* 2. Trade Sizes Buy vs Sell */}
          <ChartBox title={`Avg Trade Size — ${activeWindow}`}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="ts" tick={TICK} interval="preserveStartEnd" hide />
                <YAxis tickFormatter={fmt} tick={TICK} width={55} />
                <Tooltip contentStyle={TIP} formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="avg_buy_usd" name="Buy" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="avg_sell_usd" name="Sell" stroke="#ef4444" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          {/* 3. L1-5 Depth */}
          <ChartBox title={`L1-5 Depth — ${activeWindow}`}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gBid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gAsk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="ts" tick={TICK} interval="preserveStartEnd" hide />
                <YAxis tickFormatter={fmt} tick={TICK} width={55} />
                <Tooltip contentStyle={TIP} formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="avg_bid_depth" name="Bid" stroke="#3b82f6" fill="url(#gBid)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="avg_ask_depth" name="Ask" stroke="#f59e0b" fill="url(#gAsk)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>

          {/* 4. Buy/Sell & Bid/Ask Ratios */}
          <ChartBox title={`Ratios — ${activeWindow}`}>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="ts" tick={TICK} interval="preserveStartEnd" hide />
                <YAxis tick={TICK} width={35} domain={[0, "auto"]} />
                <Tooltip contentStyle={TIP} formatter={(v) => Number(v).toFixed(3)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={1} stroke="#333" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="buy_sell_ratio" name="Buy/Sell" stroke="#a855f7" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="bid_ask_ratio" name="Bid/Ask" stroke="#06b6d4" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          {/* 5. Net Depth (bid - ask) */}
          <ChartBox title={`Net Depth (Bid − Ask) — ${activeWindow}`} last>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="ts" tick={TICK} interval="preserveStartEnd" />
                <YAxis tickFormatter={fmt} tick={TICK} width={55} />
                <Tooltip contentStyle={TIP} formatter={(v) => fmt(Number(v))} />
                <ReferenceLine y={0} stroke="#555" />
                <Area type="monotone" dataKey="net_depth" stroke="#10b981" fill="url(#gNet)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>

          <p className="text-[10px] text-neutral-700 text-right">{data.length} pts · 30s refresh</p>
        </div>
      )}
    </div>
  );
}

