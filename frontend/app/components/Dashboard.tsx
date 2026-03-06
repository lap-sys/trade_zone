"use client";
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

type WindowData = {
  avg_buy_usd: number;
  avg_sell_usd: number;
  avg_bid_depth: number;
  avg_ask_depth: number;
};
type Row = { ts: string; "1m": WindowData; "5m": WindowData; "15m": WindowData };

const WINDOWS = ["1m", "5m", "15m"] as const;
const METRICS = [
  { key: "avg_buy_usd", label: "Avg Trade Size Buy ($)", color: "#22c55e" },
  { key: "avg_sell_usd", label: "Avg Trade Size Sell ($)", color: "#ef4444" },
  { key: "avg_bid_depth", label: "Avg L1-5 Bid Depth ($)", color: "#3b82f6" },
  { key: "avg_ask_depth", label: "Avg L1-5 Ask Depth ($)", color: "#f59e0b" },
] as const;

const fmt = (v: number) => v >= 1_000_000 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Dashboard() {
  const [data, setData] = useState<Row[]>([]);
  const [coin, setCoin] = useState("BTC");
  const [activeWindow, setActiveWindow] = useState<typeof WINDOWS[number]>("5m");

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/ambiance?coin=${coin}&limit=200`);
    if (res.ok) setData(await res.json());
  }, [coin]);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 30_000); return () => clearInterval(iv); }, [fetchData]);

  const chartData = data.map((r) => ({
    ts: fmtTime(r.ts),
    ...r[activeWindow],
  }));

  const latest = data.length ? data[data.length - 1] : null;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-neutral-400">trade_zone</span>{" "}
          <span className="text-white">Market Ambiance</span>
        </h1>
        <div className="flex gap-2">
          {["BTC", "ETH", "SOL"].map((c) => (
            <button key={c} onClick={() => setCoin(c)}
              className={`px-3 py-1 rounded text-sm font-mono ${coin === c ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Latest values cards */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {METRICS.map((m) => (
            <div key={m.key} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <p className="text-xs text-neutral-500 mb-1">{m.label}</p>
              <div className="flex items-baseline gap-2">
                {WINDOWS.map((w) => (
                  <div key={w} className="text-center">
                    <p className="text-[10px] text-neutral-600">{w}</p>
                    <p className="text-sm font-mono" style={{ color: m.color }}>
                      {fmt((latest[w] as WindowData)[m.key as keyof WindowData])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Window selector */}
      <div className="flex gap-2 mb-4">
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => setActiveWindow(w)}
            className={`px-3 py-1 rounded text-sm font-mono ${activeWindow === w ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-500 hover:bg-neutral-800"}`}>
            {w}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-600 self-center">
          {data.length} points · auto-refresh 30s
        </span>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trade sizes */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h2 className="text-sm text-neutral-400 mb-3">Avg Trade Size ($) — {activeWindow}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: "#666" }} width={60} />
              <Tooltip contentStyle={{ background: "#171717", border: "1px solid #333", fontSize: 12 }} formatter={(v) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="avg_buy_usd" name="Buy" stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="avg_sell_usd" name="Sell" stroke="#ef4444" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Depth */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h2 className="text-sm text-neutral-400 mb-3">Avg L1-5 Depth ($) — {activeWindow}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: "#666" }} width={60} />
              <Tooltip contentStyle={{ background: "#171717", border: "1px solid #333", fontSize: 12 }} formatter={(v) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="avg_bid_depth" name="Bid Depth" stroke="#3b82f6" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="avg_ask_depth" name="Ask Depth" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Buy/Sell ratio */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 md:col-span-2">
          <h2 className="text-sm text-neutral-400 mb-3">Buy/Sell Imbalance & Depth Ratio — {activeWindow}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.map((d) => ({
              ...d,
              buy_sell_ratio: d.avg_sell_usd ? d.avg_buy_usd / d.avg_sell_usd : 0,
              bid_ask_ratio: d.avg_ask_depth ? d.avg_bid_depth / d.avg_ask_depth : 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} width={40} domain={[0, "auto"]} />
              <Tooltip contentStyle={{ background: "#171717", border: "1px solid #333", fontSize: 12 }} formatter={(v) => Number(v).toFixed(3)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="buy_sell_ratio" name="Buy/Sell Ratio" stroke="#a855f7" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="bid_ask_ratio" name="Bid/Ask Depth Ratio" stroke="#06b6d4" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.length === 0 && (
        <div className="text-center text-neutral-600 mt-12">
          No data yet. Start <code className="text-neutral-400">python3 ws_monitor.py {coin}</code> to populate.
        </div>
      )}
    </div>
  );
}

