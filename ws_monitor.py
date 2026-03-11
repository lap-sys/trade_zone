"""Hyperliquid WebSocket Market Ambiance Monitor.
Streams trades and L2 orderbook, computes rolling metrics (1m, 5m, 15m):
- Avg trade size buy/sell ($)
- Avg L1-5 bid/ask depth ($)
- Buy/sell volume per minute
Monitors multiple assets concurrently from assets_config.json.
Usage: python3 ws_monitor.py [COIN]  # single coin override
       python3 ws_monitor.py         # all coins from config
"""
import asyncio, json, os, time, signal, sys
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import websockets
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

WS_URL = "wss://api.hyperliquid.xyz/ws"
WINDOWS = {"1m": 60, "5m": 300, "15m": 900}
PRINT_INTERVAL = 60  # seconds between prints & DB writes
CONFIG_PATH = Path(__file__).parent / "assets_config.json"

# --- MongoDB setup ---
_client = MongoClient(os.environ["DB_URI"])
db = _client["trade_zone"]
col = db["ambiance"]
col.create_index([("ts", 1), ("coin", 1)])


def load_coins() -> list[str]:
    """Load coin symbols from config. CLI arg overrides."""
    if len(sys.argv) > 1:
        return [sys.argv[1]]
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    coins = []
    for cat in cfg["categories"].values():
        for asset in cat.values():
            coins.append(asset["symbol"])
    return coins


@dataclass
class Trade:
    ts: float; side: str; size: float; price: float

@dataclass
class BookSnap:
    ts: float; bids: list; asks: list  # [(price, size), ...]


class Monitor:
    """Aggregates trades and book snapshots; computes stats for any window."""

    def __init__(self, max_window: int = max(WINDOWS.values())):
        self.max_window = max_window
        self.trades: deque[Trade] = deque()
        self.books: deque[BookSnap] = deque()

    def _prune(self):
        cutoff = time.time() - self.max_window
        while self.trades and self.trades[0].ts < cutoff:
            self.trades.popleft()
        while self.books and self.books[0].ts < cutoff:
            self.books.popleft()

    def add_trade(self, t: Trade):
        self.trades.append(t)

    def add_book(self, b: BookSnap):
        self.books.append(b)

    def stats(self, window: int) -> dict:
        """Return ambiance metrics for a given window (seconds)."""
        now = time.time()
        self._prune()
        cutoff = now - window

        buys = [t for t in self.trades if t.ts >= cutoff and t.side == "buy"]
        sells = [t for t in self.trades if t.ts >= cutoff and t.side == "sell"]
        snaps = [s for s in self.books if s.ts >= cutoff]

        avg_buy = sum(t.size * t.price for t in buys) / len(buys) if buys else 0
        avg_sell = sum(t.size * t.price for t in sells) / len(sells) if sells else 0

        # Rolling volume per minute (total notional / window minutes)
        window_min = window / 60
        buy_vol = sum(t.size * t.price for t in buys) / window_min if window_min else 0
        sell_vol = sum(t.size * t.price for t in sells) / window_min if window_min else 0

        n = len(snaps)
        avg_bid = avg_ask = mid_price = 0.0
        if n:
            avg_bid = sum(sum(p * s for p, s in snap.bids[:5]) for snap in snaps) / n
            avg_ask = sum(sum(p * s for p, s in snap.asks[:5]) for snap in snaps) / n
            mid_price = sum((snap.bids[0][0] + snap.asks[0][0]) / 2
                            for snap in snaps if snap.bids and snap.asks) / n

        return {
            "avg_buy_usd": round(avg_buy, 2),
            "avg_sell_usd": round(avg_sell, 2),
            "avg_bid_depth": round(avg_bid, 2),
            "avg_ask_depth": round(avg_ask, 2),
            "mid_price": round(mid_price, 2),
            "buy_vol_per_min": round(buy_vol, 2),
            "sell_vol_per_min": round(sell_vol, 2),
        }

    def all_stats(self) -> dict:
        """Return stats for every configured window."""
        return {label: self.stats(sec) for label, sec in WINDOWS.items()}


def record(coin: str, stats: dict):
    """Print + insert one document with all window metrics."""
    now = datetime.now(timezone.utc)
    ts_str = now.strftime("%H:%M:%S")

    doc = {"ts": now, "coin": coin}
    for label, s in stats.items():
        doc[label] = s
        print(f"  [{ts_str}] {label}  buy=${s['avg_buy_usd']:,.0f}  sell=${s['avg_sell_usd']:,.0f}"
              f"  bid=${s['avg_bid_depth']:,.0f}  ask=${s['avg_ask_depth']:,.0f}", flush=True)

    col.insert_one(doc)
    print(f"  → saved to MongoDB\n", flush=True)


async def run_coin(coin: str):
    """Monitor a single coin: WS listener + periodic DB writer."""
    mon = Monitor()

    async def listen():
        while True:
            try:
                async with websockets.connect(WS_URL) as ws:
                    for sub in [
                        {"method": "subscribe", "subscription": {"type": "trades", "coin": coin}},
                        {"method": "subscribe", "subscription": {"type": "l2Book", "coin": coin}},
                    ]:
                        await ws.send(json.dumps(sub))
                    async for raw in ws:
                        msg = json.loads(raw)
                        ch = msg.get("channel")
                        data = msg.get("data")
                        if ch == "trades" and isinstance(data, list):
                            for t in data:
                                side = "buy" if t["side"] == "B" else "sell"
                                mon.add_trade(Trade(
                                    ts=time.time(), side=side,
                                    size=float(t["sz"]), price=float(t["px"]),
                                ))
                        elif ch == "l2Book" and isinstance(data, dict):
                            levels = data.get("levels") or data.get("book", {}).get("levels", [])
                            if len(levels) >= 2:
                                bids = [(float(l["px"]), float(l["sz"])) for l in levels[0][:5]]
                                asks = [(float(l["px"]), float(l["sz"])) for l in levels[1][:5]]
                                mon.add_book(BookSnap(ts=time.time(), bids=bids, asks=asks))
            except (websockets.ConnectionClosed, Exception) as e:
                print(f"[{coin} ws] reconnecting after: {e}")
                await asyncio.sleep(2)

    async def writer():
        while True:
            await asyncio.sleep(PRINT_INTERVAL)
            try:
                record(coin, mon.all_stats())
            except Exception as e:
                print(f"[{coin} writer] error: {e}", flush=True)

    await asyncio.gather(listen(), writer())


async def run_all(coins: list[str]):
    """Run monitors for all coins concurrently. Each coin is isolated."""
    async def safe_run(coin: str):
        while True:
            try:
                await run_coin(coin)
            except Exception as e:
                print(f"[{coin}] crashed, restarting in 5s: {e}", flush=True)
                await asyncio.sleep(5)

    await asyncio.gather(*(safe_run(c) for c in coins))


if __name__ == "__main__":
    coins = load_coins()
    print(f"═══ Ambiance Monitor ({', '.join(coins)}) → MongoDB ═══", flush=True)
    loop = asyncio.new_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: sys.exit(0))
    loop.run_until_complete(run_all(coins))

