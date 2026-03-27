"""
Bybit public testnet client helpers for spot quote-filtered universe + kline/orderbook.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any

_UNIVERSE_CACHE: dict[str, tuple[float, list[str]]] = {}


def _http_get_json(url: str, timeout_sec: int = 20) -> dict[str, Any] | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TradingMonitor-bybit-public/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def interval_to_bybit(interval: str) -> str:
    iv = interval.strip().lower()
    if iv == "1m":
        return "1"
    if iv == "3m":
        return "3"
    if iv == "5m":
        return "5"
    if iv == "15m":
        return "15"
    if iv == "1h":
        return "60"
    if iv == "4h":
        return "240"
    if iv == "1d":
        return "D"
    return "5"


def get_kline_rows(base_url: str, symbol: str, interval: str, limit: int = 120) -> list[list[str]] | None:
    q = urllib.parse.urlencode(
        {
            "category": "spot",
            "symbol": symbol.strip().upper(),
            "interval": interval_to_bybit(interval),
            "limit": str(limit),
        }
    )
    url = f"{base_url.rstrip('/')}/v5/market/kline?{q}"
    payload = _http_get_json(url)
    if not payload or int(payload.get("retCode", -1)) != 0:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    rows = result.get("list")
    if not isinstance(rows, list):
        return None
    out: list[list[str]] = []
    for row in rows:
        if isinstance(row, list) and len(row) >= 6:
            out.append(row)
    return out


def fetch_best_bid_ask(base_url: str, symbol: str) -> tuple[float | None, float | None]:
    q = urllib.parse.urlencode({"category": "spot", "symbol": symbol.strip().upper()})
    url = f"{base_url.rstrip('/')}/v5/market/orderbook?{q}"
    payload = _http_get_json(url)
    if not payload or int(payload.get("retCode", -1)) != 0:
        return (None, None)
    result = payload.get("result")
    if not isinstance(result, dict):
        return (None, None)
    bids = result.get("b")
    asks = result.get("a")
    if not isinstance(bids, list) or not isinstance(asks, list) or not bids or not asks:
        return (None, None)
    try:
        bid = float(bids[0][0]) if isinstance(bids[0], list) and len(bids[0]) >= 1 else None
        ask = float(asks[0][0]) if isinstance(asks[0], list) and len(asks[0]) >= 1 else None
    except Exception:
        return (None, None)
    return (bid, ask)


def fetch_spot_quote_symbols(base_url: str, quote_asset: str = "USDT") -> list[str]:
    quote = (quote_asset or "USDT").strip().upper()
    if not quote:
        quote = "USDT"
    q = urllib.parse.urlencode({"category": "spot", "limit": "1000"})
    url = f"{base_url.rstrip('/')}/v5/market/instruments-info?{q}"
    payload = _http_get_json(url)
    if not payload or int(payload.get("retCode", -1)) != 0:
        return []
    result = payload.get("result")
    if not isinstance(result, dict):
        return []
    rows = result.get("list")
    if not isinstance(rows, list):
        return []
    out: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        status = str(row.get("status", "")).upper()
        if status and status not in ("TRADING", "ONLINE"):
            continue
        sym = row.get("symbol")
        if not isinstance(sym, str) or not sym.endswith(quote):
            continue
        out.append(sym.strip().upper())
    out.sort()
    return out


def get_cached_spot_quote_symbols(
    base_url: str, quote_asset: str = "USDT", ttl_sec: float = 3600.0, max_symbols: int = 0
) -> list[str]:
    quote = (quote_asset or "USDT").strip().upper()
    if not quote:
        quote = "USDT"
    cache_key = f"{base_url.rstrip('/')}|{quote}"
    now = time.time()
    cached = _UNIVERSE_CACHE.get(cache_key)
    if cached is not None and now - cached[0] < ttl_sec:
        symbols = cached[1]
    else:
        symbols = fetch_spot_quote_symbols(base_url, quote_asset=quote)
        _UNIVERSE_CACHE[cache_key] = (now, symbols)
    if max_symbols > 0 and len(symbols) > max_symbols:
        return symbols[:max_symbols]
    return list(symbols)
