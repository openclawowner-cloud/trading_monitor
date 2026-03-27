"""
Universe filtering for WOO real-paper bot:
- include only SPOT_*_USDT
- include only assets with market cap above threshold (USD)
"""
from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from woo_public_universe import get_cached_spot_usdt_symbols

_CAP_CACHE: tuple[float, dict[str, float]] | None = None


def _http_get_json(url: str, timeout_sec: int = 20) -> list[dict[str, Any]] | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TradingMonitor-woo-real-marketcap/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, list) else None


def _fetch_market_caps_usd(min_cap: float, ttl_sec: float) -> dict[str, float]:
    global _CAP_CACHE
    now = time.time()
    if _CAP_CACHE is not None and now - _CAP_CACHE[0] < ttl_sec:
        return _CAP_CACHE[1]

    # 2 pages is enough for most tradeable spot universe and keeps API load low.
    caps: dict[str, float] = {}
    for page in (1, 2):
        q = urllib.parse.urlencode(
            {
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": "250",
                "page": str(page),
                "sparkline": "false",
            }
        )
        url = f"https://api.coingecko.com/api/v3/coins/markets?{q}"
        rows = _http_get_json(url)
        if not rows:
            continue
        for row in rows:
            sym = str(row.get("symbol", "")).strip().upper()
            cap = row.get("market_cap")
            try:
                cap_num = float(cap)
            except (TypeError, ValueError):
                continue
            if not sym or not math.isfinite(cap_num):
                continue
            if cap_num >= min_cap:
                caps[sym] = cap_num
    _CAP_CACHE = (now, caps)
    return caps


def _base_from_woo_symbol(woo_symbol: str) -> str:
    s = woo_symbol.strip().upper()
    if not s.startswith("SPOT_") or not s.endswith("_USDT"):
        return ""
    return s[len("SPOT_") : -len("_USDT")]


def get_filtered_woo_symbols(
    woo_api_base: str,
    *,
    min_market_cap_usd: float,
    instruments_cache_sec: float = 3600.0,
    market_cap_cache_sec: float = 1800.0,
    max_symbols: int = 0,
) -> tuple[list[str], list[dict[str, Any]]]:
    """
    Returns filtered WOO symbols and exclusion reasons.
    Exclusion rows shape: {"symbol": str, "reason_code": str, "reason_text": str}
    """
    symbols = get_cached_spot_usdt_symbols(
        woo_api_base, ttl_sec=instruments_cache_sec, max_symbols=max_symbols if max_symbols > 0 else 0
    )
    caps = _fetch_market_caps_usd(min_market_cap_usd, market_cap_cache_sec)
    out: list[str] = []
    excluded: list[dict[str, Any]] = []
    for s in symbols:
        base = _base_from_woo_symbol(s)
        if not base:
            excluded.append(
                {
                    "symbol": s,
                    "reason_code": "universe_excluded_quote",
                    "reason_text": "Not a SPOT_*_USDT symbol",
                }
            )
            continue
        cap = caps.get(base)
        if cap is None:
            excluded.append(
                {
                    "symbol": s,
                    "reason_code": "universe_excluded_market_cap_missing",
                    "reason_text": f"Missing market cap for base {base}",
                }
            )
            continue
        if cap < min_market_cap_usd:
            excluded.append(
                {
                    "symbol": s,
                    "reason_code": "universe_excluded_market_cap",
                    "reason_text": f"Market cap {cap:.2f} < {min_market_cap_usd:.2f}",
                }
            )
            continue
        out.append(s)
    return out, excluded
