"""
WOO-native bot: same BB+RSI ladder idea as CC_5M_BB_RSI, but
- 5m candles from WOO public GET /v3/public/kline
- fills priced from WOO public orderbook (bid sell / ask buy) in paper mode
- optional signed spot MARKET orders when WOOX_EXCHANGE_TRADING=true and keys are set
- WOOX_BOT_SYMBOL=ALL: scan capped list of SPOT_*_USDT from GET /v3/public/instruments (one open position).
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime

# venv site-packages when run under supervisor
_exe = getattr(sys, "executable", "")
if _exe and os.path.isfile(_exe):
    _scripts_dir = os.path.dirname(_exe)
    if _scripts_dir.endswith((os.path.join("Scripts"), "Scripts")):
        _venv_root = os.path.dirname(_scripts_dir)
        _site = os.path.join(_venv_root, "Lib", "site-packages")
        if os.path.isdir(_site) and _site not in sys.path:
            sys.path.insert(0, _site)

_woox_dir = os.path.dirname(os.path.abspath(__file__))
_src_agents = os.path.normpath(os.path.join(_woox_dir, "..", "agents"))
if os.path.isdir(_src_agents) and _src_agents not in sys.path:
    sys.path.insert(0, _src_agents)

import pandas as pd
import pandas_ta as ta
import urllib.error
import urllib.parse
import urllib.request

from telemetry_io import atomic_write_json

from woo_cc_5m_exchange_ops import exchange_buy_budget, exchange_sell_all, sync_state_from_exchange
from woo_public_universe import get_cached_spot_usdt_symbols
from woo_signed_client import load_signed_client_from_env

try:
    sys.stdout.reconfigure(errors="backslashreplace")
except Exception:
    pass


def _log(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "backslashreplace").decode("ascii"))


def _agent_dir() -> str:
    out = (os.environ.get("AGENT_OUT_DIR") or "").strip()
    if out:
        return out
    root = (os.environ.get("TELEMETRY_ROOT") or "").strip() or os.path.join(os.getcwd(), "trading-live-woox")
    return os.path.join(root, "WOO_CC_5M_BB_RSI")


AGENT_ID = os.path.basename(os.path.normpath(_agent_dir())) or "WOO_CC_5M_BB_RSI"
AGENT_DIR = _agent_dir()
os.makedirs(AGENT_DIR, exist_ok=True)

STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")

CANDLE_INTERVAL = "5m"
INITIAL_BUDGET = float((os.environ.get("WOOX_BOT_INITIAL_CASH") or "10000").strip() or "10000")
FEE_RATE = 0.0015
MIN_BB_WIDTH_PCT = 1.2
RSI_ENTRY_MAX = 30.0

WOO_BASE = (os.environ.get("WOOX_API_BASE") or "https://api.woox.io").strip().rstrip("/")

_EXCHANGE_MODE = os.environ.get("WOOX_EXCHANGE_TRADING", "").strip().lower() in ("1", "true", "yes")


def _woo_symbol_env_raw() -> str:
    return (os.environ.get("WOOX_BOT_SYMBOL") or "SPOT_BTC_USDT").strip() or "SPOT_BTC_USDT"


def _is_universe_all_symbols() -> bool:
    return _woo_symbol_env_raw().upper() in ("ALL", "*", "UNIVERSE")


def resolve_target_woo_symbols() -> list[str]:
    """Single symbol from WOOX_BOT_SYMBOL, or all tradable SPOT_*_USDT when set to ALL."""
    raw = _woo_symbol_env_raw()
    if raw.upper() in ("ALL", "*", "UNIVERSE"):
        ttl = float((os.environ.get("WOOX_BOT_INSTRUMENTS_CACHE_SEC") or "3600").strip() or "3600")
        mx = int((os.environ.get("WOOX_BOT_MAX_SCAN_MARKETS") or "200").strip() or "200")
        syms = get_cached_spot_usdt_symbols(WOO_BASE, ttl_sec=ttl, max_symbols=mx if mx > 0 else 0)
        return syms if syms else ["SPOT_BTC_USDT"]
    return [raw]


def internal_usdt_pair_to_woo_symbol(pair: str) -> str | None:
    p = pair.strip().upper()
    if not p.endswith("USDT") or len(p) <= 4:
        return None
    base = p[:-4]
    return f"SPOT_{base}_USDT" if base else None


def _woo_for_open_position(state: dict, internal_sym: str) -> str:
    pos = state.get("positions", {}).get(internal_sym)
    if isinstance(pos, dict):
        w = pos.get("wooSymbol")
        if isinstance(w, str) and w.strip():
            return w.strip().upper()
    inferred = internal_usdt_pair_to_woo_symbol(internal_sym)
    if inferred:
        return inferred
    return resolve_target_woo_symbols()[0]

_CYCLE_TRADED = False


def woo_spot_to_internal_pair(woo_sym: str) -> str:
    s = woo_sym.strip().upper()
    if not s.startswith("SPOT_"):
        return s.replace("_", "")
    body = s[5:]
    parts = body.split("_")
    if len(parts) >= 2:
        quote = parts[-1]
        base = "".join(parts[:-1])
        return f"{base}{quote}"
    return body.replace("_", "")


def _http_get_json(url: str, timeout_sec: int = 15) -> dict | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "woo-cc-5m-bb-rsi/1.0 (WOO public)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def get_woo_klines(symbol: str, interval: str = CANDLE_INTERVAL, limit: int = 120) -> pd.DataFrame | None:
    q = urllib.parse.urlencode({"symbol": symbol, "type": interval, "limit": str(limit)})
    url = f"{WOO_BASE}/v3/public/kline?{q}"
    payload = _http_get_json(url)
    if not payload or payload.get("success") is not True:
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        return None
    rows = list(reversed(rows))
    records: list[dict] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        try:
            ts = int(r.get("startTimestamp", 0))
            o = float(r["open"])
            h = float(r["high"])
            low = float(r["low"])
            c = float(r["close"])
            v = float(r.get("volume", 0) or 0)
        except (TypeError, ValueError, KeyError):
            continue
        records.append({"timestamp": ts, "open": o, "high": h, "low": low, "close": c, "volume": v})
    if len(records) < 25:
        return None
    return pd.DataFrame(records)


def fetch_best_bid_ask(symbol: str) -> tuple[float | None, float | None]:
    q = urllib.parse.urlencode({"symbol": symbol, "maxLevel": "1"})
    url = f"{WOO_BASE}/v3/public/orderbook?{q}"
    payload = _http_get_json(url)
    if not payload or payload.get("success") is not True:
        return (None, None)
    data = payload.get("data")
    if not isinstance(data, dict):
        return (None, None)
    bids = data.get("bids")
    asks = data.get("asks")
    if not isinstance(bids, list) or not isinstance(asks, list) or not bids or not asks:
        return (None, None)
    b0 = bids[0] if isinstance(bids[0], dict) else {}
    a0 = asks[0] if isinstance(asks[0], dict) else {}
    try:
        bid = float(b0["price"]) if b0.get("price") is not None else None
        ask = float(a0["price"]) if a0.get("price") is not None else None
        return (bid, ask)
    except (TypeError, ValueError, KeyError):
        return (None, None)


def _num(x):
    try:
        if x is None:
            return None
        v = float(x)
        if pd.isna(v):
            return None
        return round(v, 8)
    except (TypeError, ValueError):
        return None


def build_decision_context(df, ind, symbol, trigger_detail=None, *, woo_symbol: str | None = None):
    if df is None or ind is None:
        return {"trigger": trigger_detail or "", "pair": symbol, "wooSymbol": woo_symbol or ""}
    try:
        ts = int(df["timestamp"].iloc[-1])
    except Exception:
        ts = int(time.time() * 1000)
    return {
        "candle_time": ts,
        "pair": symbol,
        "price": _num(df["close"].iloc[-1]),
        "bb_upper": _num(ind.get("bb_upper")),
        "bb_mid": _num(ind.get("bb_mid")),
        "bb_lower": _num(ind.get("bb_lower")),
        "bb_width_pct": _num(ind.get("bb_width_pct")),
        "rsi14": _num(ind.get("rsi14")),
        "trigger": trigger_detail or "",
        "venue": "woox",
        "wooSymbol": woo_symbol or "",
    }


def record_decision(state, pair, action, reason, context):
    rec = {
        "timestamp": int(time.time() * 1000),
        "pair": pair or "—",
        "action": action,
        "reason": reason,
        "context": context if isinstance(context, dict) else {},
    }
    state["latest_decision"] = rec
    dl = state.setdefault("decision_log", [])
    dl.append(rec)
    if len(dl) > 100:
        state["decision_log"] = dl[-100:]


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "initial_budget": INITIAL_BUDGET,
        "cash": INITIAL_BUDGET,
        "equity": INITIAL_BUDGET,
        "realizedPnl": 0,
        "positions": {},
        "trades": [],
        "decision_log": [],
        "timestamp": int(time.time() * 1000),
    }


def save_state(state):
    state["timestamp"] = int(time.time() * 1000)
    atomic_write_json(STATE_FILE, state)


def save_status(state, prices):
    equity = state["cash"]
    unrealized = 0.0
    positions_status = {}
    for pair, pos in state["positions"].items():
        if pos["qty"] <= 0:
            continue
        price = prices.get(pair, pos["avgCost"])
        equity += pos["qty"] * price
        upnl = (price - pos["avgCost"]) * pos["qty"]
        unrealized += upnl
        positions_status[pair] = {
            "qty": pos["qty"],
            "avgCost": pos["avgCost"],
            "currentPrice": price,
            "unrealizedPnl": upnl,
        }

    state["equity"] = equity
    status = {
        "agentId": AGENT_ID,
        "venue": "woox",
        "timestamp": int(time.time() * 1000),
        "scoreboard": {
            "initial_budget": state["initial_budget"],
            "cash": state["cash"],
            "equity": equity,
            "realizedPnl": state["realizedPnl"],
            "unrealizedPnl": unrealized,
        },
        "positions": positions_status,
        "prices": prices,
    }
    if state.get("latest_decision"):
        status["latest_decision"] = state["latest_decision"]
    atomic_write_json(STATUS_FILE, status)


def closed_candle_signal(df):
    if df is None or len(df) < 25:
        return None
    bb = ta.bbands(df["close"], length=20, std=2)
    rsi = ta.rsi(df["close"], length=14)
    if bb is None or rsi is None:
        return None
    bbl_col = next((c for c in bb.columns if str(c).startswith("BBL_")), None)
    bbm_col = next((c for c in bb.columns if str(c).startswith("BBM_")), None)
    bbu_col = next((c for c in bb.columns if str(c).startswith("BBU_")), None)
    if bbl_col is None or bbm_col is None or bbu_col is None:
        return None

    i = -2
    close_c = float(df["close"].iloc[i])
    high_c = float(df["high"].iloc[i])
    bb_lower = float(bb[bbl_col].iloc[i])
    bb_mid = float(bb[bbm_col].iloc[i])
    bb_upper = float(bb[bbu_col].iloc[i])
    rsi14 = float(rsi.iloc[i])
    if not (pd.notna(close_c) and pd.notna(high_c) and pd.notna(bb_lower) and pd.notna(bb_mid) and pd.notna(bb_upper) and pd.notna(rsi14)):
        return None
    if bb_mid == 0:
        return None
    bb_width_pct = ((bb_upper - bb_lower) / bb_mid) * 100.0
    return {
        "close": close_c,
        "high": high_c,
        "bb_lower": bb_lower,
        "bb_mid": bb_mid,
        "bb_upper": bb_upper,
        "bb_width_pct": bb_width_pct,
        "rsi14": rsi14,
    }


def execute_trade(state, symbol, side, qty, price, reason, decision_context=None):
    global _CYCLE_TRADED
    _CYCLE_TRADED = True
    notional = qty * price
    fee = notional * FEE_RATE
    trade = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "pair": symbol,
        "side": side,
        "qty": qty,
        "price": price,
        "fee": fee,
        "reason": reason,
    }
    if decision_context:
        trade["decision_context"] = decision_context

    if side == "buy":
        state["cash"] -= notional + fee
        pos = state["positions"].setdefault(
            symbol,
            {
                "qty": 0.0,
                "avgCost": 0.0,
                "entries": 0,
                "entry1_price": 0.0,
                "entry2_price": 0.0,
                "entry3_price": 0.0,
                "step_pct": 0.0,
            },
        )
        total_cost = pos["qty"] * pos["avgCost"] + notional
        pos["qty"] += qty
        pos["avgCost"] = total_cost / pos["qty"]
        trade["pnl"] = 0.0
    else:
        pos = state["positions"][symbol]
        state["cash"] += notional - fee
        pnl = (price - pos["avgCost"]) * qty - fee
        state["realizedPnl"] += pnl
        trade["pnl"] = round(pnl, 6)
        pos["qty"] -= qty
        if pos["qty"] <= 1e-8:
            del state["positions"][symbol]

    state["trades"].append(trade)
    record_decision(state, symbol, side, reason, decision_context or {})
    _log(f"[{datetime.now().strftime('%H:%M:%S')}] {side.upper()} {qty:.4f} {symbol} @ {price:.6f} | {reason}")


def _fill_buy_price(woo_sym: str, sig_close: float) -> float:
    _b, ask = fetch_best_bid_ask(woo_sym)
    return float(ask) if ask is not None else float(sig_close)


def _fill_sell_price(woo_sym: str, sig_close: float) -> float:
    bid, _a = fetch_best_bid_ask(woo_sym)
    return float(bid) if bid is not None else float(sig_close)


def run_cycle():
    global _CYCLE_TRADED
    _CYCLE_TRADED = False
    state = load_state()
    prices: dict[str, float] = {}
    last_scan: dict = {"pair": None, "signal": None, "wooSymbol": None}
    targets = resolve_target_woo_symbols()
    default_pair = woo_spot_to_internal_pair(targets[0])

    signed_client = load_signed_client_from_env() if _EXCHANGE_MODE else None
    if _EXCHANGE_MODE and signed_client is None:
        record_decision(
            state,
            default_pair,
            "error",
            "WOOX_EXCHANGE_TRADING enabled but WOOX_API_KEY/WOOX_API_SECRET missing",
            {"wooSymbol": targets[0]},
        )
        save_state(state)
        save_status(state, prices)
        return

    if _EXCHANGE_MODE and len(targets) > 1:
        record_decision(
            state,
            default_pair,
            "error",
            "WOOX_EXCHANGE_TRADING requires a single WOOX_BOT_SYMBOL (not ALL/universe)",
            {"wooSymbol": targets[0], "targetCount": len(targets)},
        )
        save_state(state)
        save_status(state, prices)
        return

    open_symbols = list(state["positions"].keys())
    if open_symbols:
        symbol = open_symbols[0]
        woo_sym = _woo_for_open_position(state, symbol)
        df = get_woo_klines(woo_sym)
        if df is None:
            p = state["positions"].get(symbol)
            px = float(p["avgCost"]) if p else 0.0
            save_state(state)
            save_status(state, {symbol: px} if px else {})
            return
        sig = closed_candle_signal(df)
        if sig is None:
            p = state["positions"].get(symbol)
            px = float(p["avgCost"]) if p else 0.0
            save_state(state)
            save_status(state, {symbol: px} if px else {})
            return
        close_now = sig["close"]
        prices[symbol] = close_now
        ctx = build_decision_context(df, sig, symbol, "manage_position", woo_symbol=woo_sym)

        if signed_client:
            if not sync_state_from_exchange(signed_client, woo_sym, state, symbol, close_now):
                record_decision(state, symbol, "skip", "exchange_balance_sync_failed", {"wooSymbol": woo_sym})
                save_state(state)
                save_status(state, prices)
                return

        if sig["high"] >= sig["bb_upper"] and state["positions"][symbol]["qty"] > 0:
            px = _fill_sell_price(woo_sym, close_now)
            if signed_client:
                pos = state["positions"][symbol]
                if exchange_sell_all(
                    signed_client,
                    woo_sym,
                    state,
                    symbol,
                    pos["qty"],
                    px,
                    float(pos["avgCost"]),
                    "upper_bb_touch_exit",
                    ctx,
                    record_decision,
                    _log,
                    FEE_RATE,
                ):
                    _CYCLE_TRADED = True
            else:
                execute_trade(state, symbol, "sell", state["positions"][symbol]["qty"], px, "upper_bb_touch_exit", ctx)
            save_state(state)
            save_status(state, prices)
            return

        pos = state["positions"][symbol]
        pos["wooSymbol"] = woo_sym
        step = float(pos.get("step_pct", 0.0)) / 100.0
        if pos["entries"] == 1 and close_now <= pos["entry1_price"] * (1 - step):
            budget = state["initial_budget"] * 0.25
            if state["cash"] >= budget:
                px = _fill_buy_price(woo_sym, close_now)
                qty = budget / px
                if signed_client:
                    if exchange_buy_budget(
                        signed_client,
                        woo_sym,
                        state,
                        symbol,
                        budget,
                        px,
                        "entry_2",
                        ctx,
                        record_decision,
                        _log,
                        FEE_RATE,
                    ):
                        _CYCLE_TRADED = True
                        pos = state["positions"][symbol]
                        pos["entries"] = 2
                        pos["entry2_price"] = close_now
                        pos["wooSymbol"] = woo_sym
                else:
                    execute_trade(state, symbol, "buy", qty, px, "entry_2", ctx)
                    pos = state["positions"][symbol]
                    pos["entries"] = 2
                    pos["entry2_price"] = close_now
                    pos["wooSymbol"] = woo_sym
        elif pos["entries"] == 2 and close_now <= pos["entry2_price"] * (1 - step):
            budget = state["initial_budget"] * 0.50
            if state["cash"] >= budget:
                px = _fill_buy_price(woo_sym, close_now)
                qty = budget / px
                if signed_client:
                    if exchange_buy_budget(
                        signed_client,
                        woo_sym,
                        state,
                        symbol,
                        budget,
                        px,
                        "entry_3",
                        ctx,
                        record_decision,
                        _log,
                        FEE_RATE,
                    ):
                        _CYCLE_TRADED = True
                        pos = state["positions"][symbol]
                        pos["entries"] = 3
                        pos["entry3_price"] = close_now
                        pos["wooSymbol"] = woo_sym
                else:
                    execute_trade(state, symbol, "buy", qty, px, "entry_3", ctx)
                    pos = state["positions"][symbol]
                    pos["entries"] = 3
                    pos["entry3_price"] = close_now
                    pos["wooSymbol"] = woo_sym
        elif pos["entries"] >= 3 and close_now <= pos["entry3_price"] * (1 - step):
            px = _fill_sell_price(woo_sym, close_now)
            q = state["positions"][symbol]["qty"]
            if signed_client:
                pos = state["positions"][symbol]
                if exchange_sell_all(
                    signed_client,
                    woo_sym,
                    state,
                    symbol,
                    q,
                    px,
                    float(pos["avgCost"]),
                    "catastrophic_step_stop",
                    ctx,
                    record_decision,
                    _log,
                    FEE_RATE,
                ):
                    _CYCLE_TRADED = True
            else:
                execute_trade(state, symbol, "sell", q, px, "catastrophic_step_stop", ctx)
            save_state(state)
            save_status(state, prices)
            return
    else:
        for woo_sym in targets:
            internal = woo_spot_to_internal_pair(woo_sym)
            df = get_woo_klines(woo_sym)
            if df is None:
                continue
            sig = closed_candle_signal(df)
            if sig is None:
                continue
            last_scan = {"pair": internal, "signal": sig, "wooSymbol": woo_sym}
            prices[internal] = sig["close"]

            if signed_client:
                if not sync_state_from_exchange(signed_client, woo_sym, state, internal, float(sig["close"])):
                    record_decision(state, internal, "skip", "exchange_balance_sync_failed", {"wooSymbol": woo_sym})
                    save_state(state)
                    save_status(state, prices)
                    return

            if sig["bb_width_pct"] < MIN_BB_WIDTH_PCT:
                continue
            if not (sig["close"] < sig["bb_lower"] and sig["rsi14"] < RSI_ENTRY_MAX):
                continue

            budget = state["initial_budget"] * 0.25
            if state["cash"] < budget:
                break

            px = _fill_buy_price(woo_sym, sig["close"])
            qty = budget / px
            ctx = build_decision_context(df, sig, internal, "entry_1", woo_symbol=woo_sym)
            if signed_client:
                if exchange_buy_budget(
                    signed_client,
                    woo_sym,
                    state,
                    internal,
                    budget,
                    px,
                    "entry_1",
                    ctx,
                    record_decision,
                    _log,
                    FEE_RATE,
                ):
                    _CYCLE_TRADED = True
                    pos = state["positions"][internal]
                    pos["entries"] = 1
                    pos["entry1_price"] = sig["close"]
                    pos["step_pct"] = max(MIN_BB_WIDTH_PCT, float(sig["bb_width_pct"]))
                    pos["wooSymbol"] = woo_sym
                    _log(f"[ENTRY_OK] {internal} ({woo_sym}) step_pct={pos['step_pct']:.2f}%")
            else:
                execute_trade(state, internal, "buy", qty, px, "entry_1", ctx)
                pos = state["positions"][internal]
                pos["entries"] = 1
                pos["entry1_price"] = sig["close"]
                pos["step_pct"] = max(MIN_BB_WIDTH_PCT, float(sig["bb_width_pct"]))
                pos["wooSymbol"] = woo_sym
                _log(f"[ENTRY_OK] {internal} ({woo_sym}) step_pct={pos['step_pct']:.2f}%")
            break

    if not _CYCLE_TRADED:
        if state.get("positions"):
            sym = list(state["positions"].keys())[0]
            w = _woo_for_open_position(state, sym)
            record_decision(state, sym, "hold", "no_trade_this_cycle", {"pair": sym, "wooSymbol": w})
        elif last_scan["pair"] is not None:
            sig = last_scan.get("signal") or {}
            record_decision(
                state,
                last_scan["pair"],
                "skip",
                "no_entry_triggered",
                {
                    "pair": last_scan["pair"],
                    "wooSymbol": last_scan.get("wooSymbol"),
                    **sig,
                },
            )
        else:
            record_decision(
                state,
                "SCAN",
                "skip",
                "no_valid_pair_scanned",
                {
                    "targetCount": len(targets),
                    "universeAll": _is_universe_all_symbols(),
                },
            )

    save_state(state)
    save_status(state, prices)


if __name__ == "__main__":
    if _EXCHANGE_MODE:
        _log(
            "WARNING: WOOX_EXCHANGE_TRADING is on — spot MARKET orders are sent to WOO. "
            "Use api.staging.woox.io + small balances for testing."
        )
    _targets = resolve_target_woo_symbols()
    _log(
        f"Starting {AGENT_ID} WOO 5m BB+RSI (targets={len(_targets)} universe={_is_universe_all_symbols()} "
        f"first={_targets[0]})..."
    )
    while True:
        try:
            run_cycle()
        except Exception as e:
            import traceback

            _log(f"Error in cycle: {type(e).__name__}: {e}")
            traceback.print_exc()
        time.sleep(300)
