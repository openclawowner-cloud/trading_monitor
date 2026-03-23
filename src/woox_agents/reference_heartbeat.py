"""
Ultra-minimal WOO pipeline heartbeat: writes telemetry every 2s for supervisor/API validation.
No trading, no orders. Price from public WOO X REST (order book); last value or "0" on failure.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

# --- paths (supervisor sets AGENT_OUT_DIR and TELEMETRY_ROOT) ---
def _agent_dir() -> str:
    out = (os.environ.get("AGENT_OUT_DIR") or "").strip()
    if out:
        return out
    root = (os.environ.get("TELEMETRY_ROOT") or "").strip() or os.path.join(
        os.getcwd(), "trading-live-woox"
    )
    aid = (os.environ.get("WOOX_REF_AGENT_ID") or "woox-ref-1").strip()
    return os.path.join(root, aid)


def _agent_id() -> str:
    return os.path.basename(os.path.normpath(_agent_dir())) or "woox-ref-1"


def _woo_base_url() -> str:
    return (os.environ.get("WOOX_API_BASE") or "https://api.woox.io").strip().rstrip("/")


def _woo_symbol() -> str:
    return (os.environ.get("WOOX_REF_SYMBOL") or "SPOT_BTC_USDT").strip() or "SPOT_BTC_USDT"


def atomic_write_json(path: str, obj: Any) -> None:
    """Temp file + replace; same idea as src/agents/telemetry_io.py (stdlib only)."""
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".telemetry.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2)
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def fetch_woo_mid_price_str() -> Optional[str]:
    """
    Public WOO X V3 order book (best bid / best ask), then mid-price as string.

    Endpoint: GET {WOOX_API_BASE}/v3/public/orderbook?symbol=<SYM>&maxLevel=1
    Expected JSON: { "success": true, "data": { "bids": [{"price","quantity"},...],
      "asks": [...] } } — prices are strings (WOO convention).

    Rationale: dedicated public ticker routes were unavailable/503 from this environment;
    the order book is a stable public feed and the bid/ask mid is a simple live reference for
    infra heartbeat (not execution).
    """
    base = _woo_base_url()
    sym = _woo_symbol()
    q = urllib.parse.urlencode({"symbol": sym, "maxLevel": "1"})
    url = f"{base}/v3/public/orderbook?{q}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "woox-reference-heartbeat/2.0 (public-orderbook)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
        return None

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    if not isinstance(payload, dict) or payload.get("success") is not True:
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    bids = data.get("bids")
    asks = data.get("asks")
    if not isinstance(bids, list) or not isinstance(asks, list):
        return None
    if not bids or not asks:
        return None
    b0 = bids[0]
    a0 = asks[0]
    if not isinstance(b0, dict) or not isinstance(a0, dict):
        return None
    bid_p = b0.get("price")
    ask_p = a0.get("price")
    if not isinstance(bid_p, str) or not isinstance(ask_p, str):
        return None
    try:
        mid = (Decimal(bid_p) + Decimal(ask_p)) / Decimal(2)
    except InvalidOperation:
        return None
    return format(mid, "f")


def main() -> None:
    agent_dir = _agent_dir()
    agent_id = _agent_id()
    symbol = _woo_symbol()
    os.makedirs(agent_dir, exist_ok=True)

    status_path = os.path.join(agent_dir, "latest_status.json")
    state_path = os.path.join(agent_dir, "paper_state.json")

    last_price = "0"
    try:
        while True:
            now_ms = int(time.time() * 1000)
            fetched = fetch_woo_mid_price_str()
            if fetched is not None:
                last_price = fetched

            latest_status = {
                "schemaVersion": 1,
                "venue": "woox",
                "timestamp": now_ms,
                "status": "running",
                "mode": "paper_local",
                "symbol": symbol,
                "lastPrice": last_price,
                "price": last_price,
                "agentId": agent_id,
                "source": "woox-public",
            }
            paper_state = {
                "schemaVersion": 1,
                "venue": "woox",
                "timestamp": now_ms,
                "mode": "paper_local",
                "symbol": symbol,
                "balance": "1000",
                "positions": [],
                "source": "woox-public",
            }
            atomic_write_json(status_path, latest_status)
            atomic_write_json(state_path, paper_state)
            time.sleep(2)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="backslashreplace")
    except Exception:
        pass
    main()
