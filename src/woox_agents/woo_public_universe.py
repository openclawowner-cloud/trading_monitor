"""
WOO public GET /v3/public/instruments — list tradable SPOT_* quote USDT symbols.
Cached to avoid hammering the API each 5m cycle.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

_CACHE: tuple[float, list[str]] | None = None


def _http_get_json(url: str, timeout_sec: int = 20) -> dict[str, Any] | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TradingMonitor-woo-universe/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _row_tradable(row: dict[str, Any]) -> bool:
    st = row.get("status")
    if st is None:
        return True
    if isinstance(st, str) and st.strip().upper() in ("TRADING", "ONLINE", "NORMAL", "1"):
        return True
    if st is True:
        return True
    if isinstance(st, (int, float)) and st == 1:
        return True
    return False


def fetch_spot_usdt_woo_symbols(base_url: str) -> list[str]:
    """Returns WOO symbols like SPOT_BTC_USDT, sorted for stable scans."""
    b = base_url.strip().rstrip("/")
    url = f"{b}/v3/public/instruments"
    payload = _http_get_json(url)
    if not payload or payload.get("success") is not True:
        return []
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    rows = data.get("rows")
    if not isinstance(rows, list):
        return []
    out: list[str] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = r.get("symbol")
        if not isinstance(sym, str) or not sym.strip():
            continue
        s = sym.strip().upper()
        if not s.startswith("SPOT_"):
            continue
        if not s.endswith("_USDT"):
            continue
        if not _row_tradable(r):
            continue
        out.append(s)
    out.sort()
    return out


def get_cached_spot_usdt_symbols(base_url: str, ttl_sec: float = 3600.0, max_symbols: int = 0) -> list[str]:
    """
    Cached instrument list. max_symbols > 0 caps length (deterministic: sorted list head).
    """
    global _CACHE
    now = time.time()
    if _CACHE is not None and now - _CACHE[0] < ttl_sec:
        sym = _CACHE[1]
    else:
        sym = fetch_spot_usdt_woo_symbols(base_url)
        _CACHE = (now, sym)
    if max_symbols > 0 and len(sym) > max_symbols:
        return sym[:max_symbols]
    return list(sym)


def clear_universe_cache() -> None:
    global _CACHE
    _CACHE = None
