import os
import sys

# Ensure venv site-packages is used first when run under supervisor.
_exe = getattr(sys, "executable", "")
if _exe and os.path.isfile(_exe):
    _scripts_dir = os.path.dirname(_exe)
    if _scripts_dir.endswith((os.path.join("Scripts"), "Scripts")):
        _venv_root = os.path.dirname(_scripts_dir)
        _site = os.path.join(_venv_root, "Lib", "site-packages")
        if os.path.isdir(_site) and _site not in sys.path:
            sys.path.insert(0, _site)

import json
import time
import uuid
from datetime import datetime

import pandas as pd
import pandas_ta as ta
import requests

from telemetry_io import atomic_write_json

try:
    # Avoid Windows console crashes on unsupported characters in symbols/log lines.
    sys.stdout.reconfigure(errors="backslashreplace")
except Exception:
    pass


def _log(msg: str):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "backslashreplace").decode("ascii"))

AGENT_ID = "CC_5M_BB_RSI"
CANDLE_INTERVAL = "5m"
TELEMETRY_ROOT = (os.environ.get("TELEMETRY_ROOT") or os.path.join(os.getcwd(), "trading-live")).strip().rstrip("/\\")
AGENT_DIR = os.path.join(TELEMETRY_ROOT, AGENT_ID)
os.makedirs(AGENT_DIR, exist_ok=True)

STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")

INITIAL_BUDGET = 10000.0
FEE_RATE = 0.0015  # fee + slippage
MIN_BB_WIDTH_PCT = 1.2
MIN_VOLUME_USDT = 3_000_000
MIN_PRICE = 0.0001
RSI_ENTRY_MAX = 30.0

STABLE_BASES = {
    "USDT", "USDC", "FDUSD", "TUSD", "USDP", "BUSD", "DAI", "USDS", "PYUSD",
    "EUR", "EURC", "TRY", "BRL", "AUD", "GBP", "JPY", "RUB", "UAH"
}

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


def _stable_or_fiat_base(symbol: str) -> bool:
    if not symbol.endswith("USDT"):
        return True
    base = symbol[:-4]
    return base in STABLE_BASES


def build_decision_context(df, ind, symbol, trigger_detail=None):
    if df is None or ind is None:
        return {"trigger": trigger_detail or "", "pair": symbol}
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


def get_top_pairs():
    try:
        res = requests.get("https://api.binance.com/api/v3/ticker/24hr", timeout=15)
        data = res.json()
        pairs = []
        for d in data:
            symbol = str(d.get("symbol", ""))
            if not symbol.endswith("USDT"):
                continue
            if _stable_or_fiat_base(symbol):
                continue
            if "UP" in symbol or "DOWN" in symbol:
                continue
            vol = float(d.get("quoteVolume", 0) or 0)
            price = float(d.get("lastPrice", 0) or 0)
            if vol >= MIN_VOLUME_USDT and price >= MIN_PRICE:
                pairs.append((symbol, vol))
        pairs.sort(key=lambda x: x[1], reverse=True)
        return [p[0] for p in pairs[:100]]
    except Exception as e:
        _log(f"Error fetching pairs: {e}")
        return []


def get_klines(symbol, interval=CANDLE_INTERVAL, limit=120):
    try:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
        res = requests.get(url, timeout=15)
        data = res.json()
        df = pd.DataFrame(
            data,
            columns=[
                "timestamp", "open", "high", "low", "close", "volume", "close_time",
                "qav", "num_trades", "taker_base_vol", "taker_quote_vol", "ignore",
            ],
        )
        for c in ["open", "high", "low", "close", "volume"]:
            df[c] = df[c].astype(float)
        return df
    except Exception as e:
        _log(f"Error fetching klines for {symbol}: {e}")
        return None


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

    i = -2  # last closed candle
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
        state["cash"] -= (notional + fee)
        pos = state["positions"].setdefault(
            symbol,
            {"qty": 0.0, "avgCost": 0.0, "entries": 0, "entry1_price": 0.0, "entry2_price": 0.0, "entry3_price": 0.0, "step_pct": 0.0},
        )
        total_cost = pos["qty"] * pos["avgCost"] + notional
        pos["qty"] += qty
        pos["avgCost"] = total_cost / pos["qty"]
        trade["pnl"] = 0.0
    else:
        pos = state["positions"][symbol]
        state["cash"] += (notional - fee)
        pnl = (price - pos["avgCost"]) * qty - fee
        state["realizedPnl"] += pnl
        trade["pnl"] = round(pnl, 6)
        pos["qty"] -= qty
        if pos["qty"] <= 1e-8:
            del state["positions"][symbol]

    state["trades"].append(trade)
    record_decision(state, symbol, side, reason, decision_context or {})
    _log(f"[{datetime.now().strftime('%H:%M:%S')}] {side.upper()} {qty:.4f} {symbol} @ {price:.6f} | {reason}")


def run_cycle():
    global _CYCLE_TRADED
    _CYCLE_TRADED = False
    state = load_state()
    prices = {}
    last_scan = {"pair": None, "signal": None}

    open_symbols = list(state["positions"].keys())
    if open_symbols:
        symbol = open_symbols[0]
        pos = state["positions"][symbol]
        df = get_klines(symbol)
        if df is None:
            return
        sig = closed_candle_signal(df)
        if sig is None:
            return
        close_now = sig["close"]
        prices[symbol] = close_now
        ctx = build_decision_context(df, sig, symbol, "manage_position")

        # Take profit: if closed-candle high touches upper BB, sell all.
        if sig["high"] >= sig["bb_upper"] and pos["qty"] > 0:
            execute_trade(state, symbol, "sell", pos["qty"], close_now, "upper_bb_touch_exit", ctx)
            save_state(state)
            save_status(state, prices)
            return

        # Ladder entries.
        step = float(pos.get("step_pct", 0.0)) / 100.0
        if pos["entries"] == 1 and close_now <= pos["entry1_price"] * (1 - step):
            budget = INITIAL_BUDGET * 0.25
            if state["cash"] >= budget:
                qty = budget / close_now
                execute_trade(state, symbol, "buy", qty, close_now, "entry_2", ctx)
                pos = state["positions"][symbol]
                pos["entries"] = 2
                pos["entry2_price"] = close_now
        elif pos["entries"] == 2 and close_now <= pos["entry2_price"] * (1 - step):
            budget = INITIAL_BUDGET * 0.50
            if state["cash"] >= budget:
                qty = budget / close_now
                execute_trade(state, symbol, "buy", qty, close_now, "entry_3", ctx)
                pos = state["positions"][symbol]
                pos["entries"] = 3
                pos["entry3_price"] = close_now
        elif pos["entries"] >= 3 and close_now <= pos["entry3_price"] * (1 - step):
            execute_trade(state, symbol, "sell", pos["qty"], close_now, "catastrophic_step_stop", ctx)
            save_state(state)
            save_status(state, prices)
            return
    else:
        # Scan top 100 non-stable USDT pairs and open max 1 position.
        for symbol in get_top_pairs():
            df = get_klines(symbol)
            if df is None:
                continue
            sig = closed_candle_signal(df)
            if sig is None:
                continue
            last_scan = {"pair": symbol, "signal": sig}
            prices[symbol] = sig["close"]

            if sig["bb_width_pct"] < MIN_BB_WIDTH_PCT:
                continue
            if not (sig["close"] < sig["bb_lower"] and sig["rsi14"] < RSI_ENTRY_MAX):
                continue

            budget = INITIAL_BUDGET * 0.25
            if state["cash"] < budget:
                continue
            qty = budget / sig["close"]
            ctx = build_decision_context(df, sig, symbol, "entry_1")
            execute_trade(state, symbol, "buy", qty, sig["close"], "entry_1", ctx)
            pos = state["positions"][symbol]
            pos["entries"] = 1
            pos["entry1_price"] = sig["close"]
            pos["step_pct"] = max(MIN_BB_WIDTH_PCT, float(sig["bb_width_pct"]))
            _log(f"[ENTRY_OK] {symbol} step_pct={pos['step_pct']:.2f}%")
            break

    if not _CYCLE_TRADED:
        if state.get("positions"):
            sym = list(state["positions"].keys())[0]
            record_decision(state, sym, "hold", "no_trade_this_cycle", {"pair": sym})
        elif last_scan["pair"] is not None:
            record_decision(
                state,
                last_scan["pair"],
                "skip",
                "no_entry_triggered",
                {"pair": last_scan["pair"], **(last_scan["signal"] or {})},
            )
        else:
            record_decision(state, "SCAN", "skip", "no_valid_pair_scanned", {})

    save_state(state)
    save_status(state, prices)


if __name__ == "__main__":
    _log(f"Starting {AGENT_ID}...")
    while True:
        try:
            run_cycle()
        except Exception as e:
            import traceback
            _log(f"Error in cycle: {type(e).__name__}: {e}")
            traceback.print_exc()
        time.sleep(300)
