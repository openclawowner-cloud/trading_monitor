"""
WOO real-paper bot:
- strategy parity with BB+RSI ladder logic
- scans only SPOT_*_USDT symbols with market cap > threshold
- writes telemetry to its own AGENT_OUT_DIR under trading-live-woo-real
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime

import pandas as pd
import pandas_ta as ta

# Ensure shared helper modules under src/agents are importable when launched by supervisor.
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.dirname(THIS_DIR)
AGENTS_DIR = os.path.join(SRC_DIR, "agents")
if AGENTS_DIR not in sys.path:
    sys.path.insert(0, AGENTS_DIR)

from telemetry_io import atomic_write_json
from universe_filter import get_filtered_woo_symbols
from woo_cc_5m_exchange_ops import sync_state_from_exchange
from woo_cc_5m_bb_rsi import fetch_best_bid_ask, get_woo_klines, woo_spot_to_internal_pair
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
    root = (os.environ.get("TELEMETRY_ROOT") or "").strip() or os.path.join(os.getcwd(), "trading-live-woo-real")
    return os.path.join(root, "WOO_REAL_CC_5M_BB_RSI")


AGENT_ID = os.path.basename(os.path.normpath(_agent_dir())) or "WOO_REAL_CC_5M_BB_RSI"
AGENT_DIR = _agent_dir()
os.makedirs(AGENT_DIR, exist_ok=True)

STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")
CONTROL_FILE = os.path.join(AGENT_DIR, "control.json")

WOO_BASE = (os.environ.get("WOO_REAL_API_BASE") or os.environ.get("WOOX_API_BASE") or "https://api.woox.io").strip().rstrip("/")
INITIAL_BUDGET = float((os.environ.get("WOO_REAL_BOT_INITIAL_CASH") or "10000").strip() or "10000")
FEE_RATE = 0.0015
MIN_BB_WIDTH_PCT = 1.2
RSI_ENTRY_MAX = 30.0
MIN_MARKET_CAP_USD = float((os.environ.get("WOO_REAL_MIN_MARKET_CAP_USD") or "400000000").strip() or "400000000")
USE_PRIVATE_BALANCE_SYNC = (os.environ.get("WOO_REAL_USE_PRIVATE_BALANCE_SYNC") or "true").strip().lower() in ("1", "true", "yes")

_CYCLE_TRADED = False


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
    if len(dl) > 200:
        state["decision_log"] = dl[-200:]


def save_status(state, prices, excluded):
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
        "paused": bool(state.get("paused", False)),
        "universe_filter": {
            "minMarketCapUsd": MIN_MARKET_CAP_USD,
            "excludedCount": len(excluded),
            "excluded": excluded[:100],
        },
    }
    if state.get("latest_decision"):
        status["latest_decision"] = state["latest_decision"]
    atomic_write_json(STATUS_FILE, status)


def _read_control() -> dict:
    if not os.path.exists(CONTROL_FILE):
        return {}
    try:
        with open(CONTROL_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_control(control: dict) -> None:
    atomic_write_json(CONTROL_FILE, control if isinstance(control, dict) else {})


def _consume_manual_sell_request() -> bool:
    control = _read_control()
    if not bool(control.get("manualSell")):
        return False
    control["manualSell"] = False
    control["updatedAt"] = int(time.time() * 1000)
    _write_control(control)
    return True


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


def execute_trade(state, symbol, side, qty, price, reason):
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
    if side == "buy":
        state["cash"] -= notional + fee
        pos = state["positions"].setdefault(symbol, {"qty": 0.0, "avgCost": 0.0, "entries": 0, "entry1_price": 0.0, "entry2_price": 0.0, "entry3_price": 0.0, "step_pct": 0.0})
        total_cost = pos["qty"] * pos["avgCost"] + notional
        pos["qty"] += qty
        pos["avgCost"] = total_cost / pos["qty"]
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
    _log(f"[{datetime.now().strftime('%H:%M:%S')}] {side.upper()} {qty:.4f} {symbol} @ {price:.6f} | {reason}")


def run_cycle():
    global _CYCLE_TRADED
    _CYCLE_TRADED = False
    state = load_state()
    control = _read_control()
    paused = bool(control.get("paused"))
    state["paused"] = paused
    prices: dict[str, float] = {}

    universe, excluded = get_filtered_woo_symbols(
        WOO_BASE,
        min_market_cap_usd=MIN_MARKET_CAP_USD,
        instruments_cache_sec=float((os.environ.get("WOO_REAL_BOT_INSTRUMENTS_CACHE_SEC") or "3600").strip() or "3600"),
        market_cap_cache_sec=float((os.environ.get("WOO_REAL_BOT_MARKET_CAP_CACHE_SEC") or "1800").strip() or "1800"),
        max_symbols=int((os.environ.get("WOO_REAL_BOT_MAX_SCAN_MARKETS") or "0").strip() or "0"),
    )
    if not universe:
        record_decision(state, "SCAN", "skip", "no_valid_pair_scanned", {"excludedCount": len(excluded)})
        save_state(state)
        save_status(state, prices, excluded)
        return

    signed_client = None
    if USE_PRIVATE_BALANCE_SYNC:
        # Map WOO_REAL_* secrets into existing signed client env keys without logging any secret values.
        if (os.environ.get("WOO_REAL_API_KEY") or "").strip():
            os.environ["WOOX_API_KEY"] = (os.environ.get("WOO_REAL_API_KEY") or "").strip()
        if (os.environ.get("WOO_REAL_API_SECRET") or "").strip():
            os.environ["WOOX_API_SECRET"] = (os.environ.get("WOO_REAL_API_SECRET") or "").strip()
        if (os.environ.get("WOO_REAL_API_BASE") or "").strip():
            os.environ["WOOX_API_BASE"] = (os.environ.get("WOO_REAL_API_BASE") or "").strip()
        signed_client = load_signed_client_from_env()

    open_symbols = list(state["positions"].keys())
    if open_symbols:
        symbol = open_symbols[0]
        woo_sym = state["positions"][symbol].get("wooSymbol") or f"SPOT_{symbol[:-4]}_USDT"
        df = get_woo_klines(woo_sym)
        if df is None:
            save_state(state)
            save_status(state, prices, excluded)
            return
        sig = closed_candle_signal(df)
        if sig is None:
            save_state(state)
            save_status(state, prices, excluded)
            return
        close_now = sig["close"]
        prices[symbol] = close_now
        pos = state["positions"][symbol]
        if _consume_manual_sell_request() and pos["qty"] > 0:
            bid, _ = fetch_best_bid_ask(woo_sym)
            execute_trade(state, symbol, "sell", pos["qty"], float(bid) if bid else close_now, "manual_sell")
            record_decision(state, symbol, "sell", "manual_sell", {"paused": paused, "wooSymbol": woo_sym})
            save_state(state)
            save_status(state, prices, excluded)
            return
        if signed_client:
            sync_state_from_exchange(signed_client, woo_sym, state, symbol, float(close_now))
        if sig["high"] >= sig["bb_upper"] and pos["qty"] > 0:
            bid, _ = fetch_best_bid_ask(woo_sym)
            execute_trade(state, symbol, "sell", pos["qty"], float(bid) if bid else close_now, "upper_bb_touch_exit")
            save_state(state)
            save_status(state, prices, excluded)
            return
    else:
        if _consume_manual_sell_request():
            record_decision(
                state,
                "SCAN",
                "skip",
                "manual_sell_no_open_position",
                {"paused": paused, "universeSize": len(universe), "excludedCount": len(excluded)},
            )
            save_state(state)
            save_status(state, prices, excluded)
            return
        if paused:
            record_decision(
                state,
                "SCAN",
                "hold",
                "paused",
                {"paused": True, "universeSize": len(universe), "excludedCount": len(excluded)},
            )
            save_state(state)
            save_status(state, prices, excluded)
            return
        for woo_sym in universe:
            symbol = woo_spot_to_internal_pair(woo_sym)
            df = get_woo_klines(woo_sym)
            if df is None:
                continue
            sig = closed_candle_signal(df)
            if sig is None:
                continue
            prices[symbol] = sig["close"]
            if signed_client:
                sync_state_from_exchange(signed_client, woo_sym, state, symbol, float(sig["close"]))
            if sig["bb_width_pct"] < MIN_BB_WIDTH_PCT:
                continue
            if not (sig["close"] < sig["bb_lower"] and sig["rsi14"] < RSI_ENTRY_MAX):
                continue
            budget = state["initial_budget"] * 0.25
            if state["cash"] < budget:
                break
            ask = fetch_best_bid_ask(woo_sym)[1]
            px = float(ask) if ask else sig["close"]
            qty = budget / px
            execute_trade(state, symbol, "buy", qty, px, "entry_1")
            pos = state["positions"][symbol]
            pos["entries"] = 1
            pos["entry1_price"] = sig["close"]
            pos["step_pct"] = max(MIN_BB_WIDTH_PCT, float(sig["bb_width_pct"]))
            pos["wooSymbol"] = woo_sym
            break

    if not _CYCLE_TRADED:
        record_decision(state, "SCAN", "hold", "no_trade_this_cycle", {"universeSize": len(universe), "excludedCount": len(excluded)})
    save_state(state)
    save_status(state, prices, excluded)


def publish_heartbeat(reason: str = "startup") -> None:
    state = load_state()
    record_decision(state, "SYSTEM", "heartbeat", reason, {})
    save_state(state)
    save_status(state, {}, [])


if __name__ == "__main__":
    _log(f"Starting {AGENT_ID} WOO real 5m BB+RSI (minMarketCapUsd={MIN_MARKET_CAP_USD:.0f})...")
    publish_heartbeat("startup")
    while True:
        try:
            run_cycle()
        except Exception as e:
            _log(f"Error in cycle: {type(e).__name__}: {e}")
            try:
                publish_heartbeat("cycle_error")
            except Exception:
                pass
        time.sleep(300)
