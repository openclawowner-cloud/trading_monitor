"""
Crypto.com paper bot: CC_5M_BB_RSI-style ladder on spot */USDT markets.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid

_agent_dir = os.path.dirname(os.path.abspath(__file__))
_src_agents = os.path.normpath(os.path.join(_agent_dir, "..", "agents"))
if os.path.isdir(_src_agents) and _src_agents not in sys.path:
    sys.path.insert(0, _src_agents)

import pandas as pd
import pandas_ta as ta

from telemetry_io import atomic_write_json
from crypto_com_public_client import (
    fetch_best_bid_ask,
    get_cached_spot_quote_symbols,
    get_kline_rows,
)

try:
    sys.stdout.reconfigure(errors="backslashreplace")
except Exception:
    pass


def _log(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "backslashreplace").decode("ascii"))


def _runtime_dir() -> str:
    out = (os.environ.get("AGENT_OUT_DIR") or "").strip()
    if out:
        return out
    root = (os.environ.get("TELEMETRY_ROOT") or "").strip() or os.path.join(
        os.getcwd(), "trading-live-crypto-com"
    )
    return os.path.join(root, "CR_COM_CC_5M_BB_RSI")


AGENT_ID = os.path.basename(os.path.normpath(_runtime_dir())) or "CR_COM_CC_5M_BB_RSI"
AGENT_DIR = _runtime_dir()
os.makedirs(AGENT_DIR, exist_ok=True)

STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")
CONTROL_FILE = os.path.join(AGENT_DIR, "control.json")

CRYPTO_COM_BASE = (os.environ.get("CRYPTO_COM_API_BASE") or "https://api.crypto.com").strip().rstrip("/")
QUOTE_ASSET = (os.environ.get("CRYPTO_COM_BOT_QUOTE_ASSET") or "USDT").strip().upper() or "USDT"
INITIAL_BUDGET = float((os.environ.get("CRYPTO_COM_BOT_INITIAL_CASH") or "10000").strip() or "10000")
FEE_RATE = 0.0015
MIN_BB_WIDTH_PCT = 1.2
RSI_ENTRY_MAX = 30.0
_CYCLE_TRADED = False


def _parse_symbol_whitelist() -> set[str]:
    raw = (os.environ.get("CRYPTO_COM_BOT_SYMBOL_WHITELIST") or "").strip()
    if not raw:
        return set()
    out: set[str] = set()
    for token in raw.split(","):
        sym = token.strip().upper().replace("_", "")
        if sym:
            out.add(sym)
    return out


ALLOWED_SYMBOLS = _parse_symbol_whitelist()
STABLE_ASSETS = {"USDC", "USDT", "USDE", "USDD", "DAI", "FDUSD", "TUSD", "USDP", "PYUSD", "RLUSD"}


def _is_stable_stable_pair(symbol: str) -> bool:
    normalized = (symbol or "").upper().replace("_", "")
    if not normalized.endswith(QUOTE_ASSET):
        return False
    base = normalized[: -len(QUOTE_ASSET)]
    return bool(base) and base in STABLE_ASSETS and QUOTE_ASSET in STABLE_ASSETS


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
        "venue": "crypto_com",
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


def get_klines_df(symbol: str, interval: str = "5m", limit: int = 120) -> pd.DataFrame | None:
    rows = get_kline_rows(CRYPTO_COM_BASE, symbol, interval, limit)
    if not rows:
        return None
    records = []
    for row in rows:
        try:
            ts = int(float(row.get("t")))
            o = float(row.get("o"))
            h = float(row.get("h"))
            l = float(row.get("l"))
            c = float(row.get("c"))
            v = float(row.get("v"))
        except Exception:
            continue
        records.append({"timestamp": ts, "open": o, "high": h, "low": l, "close": c, "volume": v})
    if len(records) < 25:
        return None
    return pd.DataFrame(records)


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


def run_cycle():
    global _CYCLE_TRADED
    _CYCLE_TRADED = False
    state = load_state()
    prices: dict[str, float] = {}
    control = _read_control()
    paused = bool(control.get("paused"))
    state["paused"] = paused
    save_status(state, prices)

    ttl = float((os.environ.get("CRYPTO_COM_BOT_INSTRUMENTS_CACHE_SEC") or "3600").strip() or "3600")
    mx = int((os.environ.get("CRYPTO_COM_BOT_MAX_SCAN_MARKETS") or "40").strip() or "40")
    universe = get_cached_spot_quote_symbols(
        CRYPTO_COM_BASE, quote_asset=QUOTE_ASSET, ttl_sec=ttl, max_symbols=mx if mx > 0 else 0
    )
    if not universe:
        record_decision(state, "SCAN", "skip", "no_valid_pair_scanned", {})
        save_state(state)
        save_status(state, prices)
        return

    open_symbols = list(state["positions"].keys())
    if open_symbols:
        symbol = open_symbols[0]
        df = get_klines_df(symbol)
        if df is None:
            save_state(state)
            save_status(state, prices)
            return
        sig = closed_candle_signal(df)
        if sig is None:
            save_state(state)
            save_status(state, prices)
            return
        close_now = sig["close"]
        prices[symbol] = close_now
        pos = state["positions"][symbol]
        if _consume_manual_sell_request() and pos["qty"] > 0:
            bid, _ = fetch_best_bid_ask(CRYPTO_COM_BASE, symbol, quote_asset=QUOTE_ASSET)
            execute_trade(state, symbol, "sell", pos["qty"], float(bid) if bid else close_now, "manual_sell")
            record_decision(
                state,
                symbol,
                "sell",
                "manual_sell",
                {"paused": paused, "quoteAsset": QUOTE_ASSET},
            )
            save_state(state)
            save_status(state, prices)
            return
        if sig["high"] >= sig["bb_upper"] and pos["qty"] > 0:
            bid, _ = fetch_best_bid_ask(CRYPTO_COM_BASE, symbol, quote_asset=QUOTE_ASSET)
            execute_trade(state, symbol, "sell", pos["qty"], float(bid) if bid else close_now, "upper_bb_touch_exit")
            save_state(state)
            save_status(state, prices)
            return
    else:
        if _consume_manual_sell_request():
            record_decision(
                state,
                "SCAN",
                "skip",
                "manual_sell_no_open_position",
                {"paused": paused, "quoteAsset": QUOTE_ASSET},
            )
            save_state(state)
            save_status(state, prices)
            return
        if paused:
            record_decision(state, "SCAN", "hold", "paused", {"paused": True, "quoteAsset": QUOTE_ASSET})
            save_state(state)
            save_status(state, prices)
            return
        for symbol in universe:
            if not symbol.endswith(QUOTE_ASSET):
                continue
            if ALLOWED_SYMBOLS and symbol.upper() not in ALLOWED_SYMBOLS:
                continue
            if _is_stable_stable_pair(symbol):
                continue
            df = get_klines_df(symbol)
            if df is None:
                continue
            sig = closed_candle_signal(df)
            if sig is None:
                continue
            prices[symbol] = sig["close"]
            if sig["bb_width_pct"] < MIN_BB_WIDTH_PCT:
                continue
            if not (sig["close"] < sig["bb_lower"] and sig["rsi14"] < RSI_ENTRY_MAX):
                continue
            budget = state["initial_budget"] * 0.25
            if state["cash"] < budget:
                break
            trigger_price = float(sig["close"])
            ask = fetch_best_bid_ask(CRYPTO_COM_BASE, symbol, quote_asset=QUOTE_ASSET)[1]
            if ask is not None and float(ask) > trigger_price:
                record_decision(
                    state,
                    symbol,
                    "skip",
                    "entry_price_above_trigger",
                    {
                        "triggerPrice": trigger_price,
                        "bestAsk": float(ask),
                        "quoteAsset": QUOTE_ASSET,
                    },
                )
                continue
            px = float(ask) if ask else trigger_price
            qty = budget / px
            execute_trade(state, symbol, "buy", qty, px, "entry_1")
            pos = state["positions"][symbol]
            pos["entries"] = 1
            pos["entry1_price"] = trigger_price
            pos["step_pct"] = max(MIN_BB_WIDTH_PCT, float(sig["bb_width_pct"]))
            break

    if not _CYCLE_TRADED:
        record_decision(state, "SCAN", "hold", "no_trade_this_cycle", {"universeSize": len(universe)})
    save_state(state)
    save_status(state, prices)


if __name__ == "__main__":
    _log(f"Starting {AGENT_ID} Crypto.com mainnet 5m BB+RSI on */{QUOTE_ASSET}...")
    while True:
        try:
            run_cycle()
        except Exception as e:
            _log(f"Error in cycle: {type(e).__name__}: {e}")
        time.sleep(300)
