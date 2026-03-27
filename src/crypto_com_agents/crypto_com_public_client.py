"""
Crypto.com public client helpers for spot quote-filtered universe + candles/orderbook.
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
        headers={"User-Agent": "TradingMonitor-crypto-com-public/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _to_instrument(symbol: str, quote_asset: str = "USDT") -> str:
    raw = (symbol or "").strip().upper()
    quote = (quote_asset or "USDT").strip().upper()
    if "_" in raw:
        return raw
    if raw.endswith(quote) and len(raw) > len(quote):
        return f"{raw[:-len(quote)]}_{quote}"
    return raw


def timeframe_for(interval: str) -> str:
    iv = interval.strip().lower()
    if iv in ("1m", "5m", "15m", "30m", "1h", "4h"):
        return iv
    if iv == "1d":
        return "1D"
    return "5m"


def get_kline_rows(base_url: str, symbol: str, interval: str, limit: int = 120) -> list[dict[str, Any]] | None:
    q = urllib.parse.urlencode(
        {"instrument_name": _to_instrument(symbol), "timeframe": timeframe_for(interval)}
    )
    url = f"{base_url.rstrip('/')}/v2/public/get-candlestick?{q}"
    payload = _http_get_json(url)
    if not payload or int(payload.get("code", -1)) != 0:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    rows = result.get("data")
    if not isinstance(rows, list):
        return None
    data = [row for row in rows if isinstance(row, dict)]
    if limit > 0 and len(data) > limit:
        data = data[-limit:]
    return data


def fetch_best_bid_ask(base_url: str, symbol: str, quote_asset: str = "USDT") -> tuple[float | None, float | None]:
    instrument = _to_instrument(symbol, quote_asset)
    q = urllib.parse.urlencode({"instrument_name": instrument})
    url = f"{base_url.rstrip('/')}/v2/public/get-ticker?{q}"
    payload = _http_get_json(url)
    if not payload or int(payload.get("code", -1)) != 0:
        return (None, None)
    result = payload.get("result")
    if not isinstance(result, dict):
        return (None, None)
    rows = result.get("data")
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return (None, None)
    row = rows[0]
    try:
        bid = float(row.get("b")) if row.get("b") is not None else None
        ask = float(row.get("k")) if row.get("k") is not None else None
    except Exception:
        return (None, None)
    return (bid, ask)


def fetch_spot_quote_symbols(base_url: str, quote_asset: str = "USDT") -> list[str]:
    quote = (quote_asset or "USDT").strip().upper()
    url = f"{base_url.rstrip('/')}/v2/public/get-ticker"
    payload = _http_get_json(url)
    if not payload or int(payload.get("code", -1)) != 0:
        return []
    result = payload.get("result")
    if not isinstance(result, dict):
        return []
    rows = result.get("data")
    if not isinstance(rows, list):
        return []
    out: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        inst = row.get("i")
        if not isinstance(inst, str) or "_" not in inst:
            continue
        base, q = inst.strip().upper().split("_", 1)
        if q != quote or not base:
            continue
        out.add(f"{base}{q}")
    return sorted(out)


def get_cached_spot_quote_symbols(
    base_url: str, quote_asset: str = "USDT", ttl_sec: float = 3600.0, max_symbols: int = 0
) -> list[str]:
    quote = (quote_asset or "USDT").strip().upper() or "USDT"
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
