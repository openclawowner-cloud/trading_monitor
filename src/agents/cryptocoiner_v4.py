"""
Cryptocoiner v4 — Risk-first refactor of v3.1.2.
Same 1m mean-reversion altcoin scalper, with:
- Regime/trend filter to avoid strong downtrends
- Earlier, capped risk-stop (replaces catastrophic_stop)
- Safer ladder (25/25/25), configurable max entries
- Falling-knife filters (BB expansion, red candles, body drop, 5m)
- Stricter jojo-add (only when regime allows)
"""
import os
import sys

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
import requests
import pandas as pd
import pandas_ta as ta
from datetime import datetime

# --- IDENTITY & PATHS ---
AGENT_ID = "cryptocoiner_v4"
TELEMETRY_ROOT = (os.environ.get("TELEMETRY_ROOT") or os.path.join(os.getcwd(), "trading-live")).strip().rstrip("/\\")
AGENT_DIR = os.path.join(TELEMETRY_ROOT, AGENT_ID)
os.makedirs(AGENT_DIR, exist_ok=True)
STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")

# --- GLOBAL CONSTANTS (unchanged from v3) ---
INITIAL_BUDGET = 10000.0
FEE_RATE = 0.0015
GLIJBAAN_TOLERANCE = 1.01
MIN_BB_WIDTH_E1 = 1.2
MIN_VOLUME_USDT = 3000000
MIN_PRICE = 0.0001
COOLDOWN_MS_AFTER_RISK_STOP = 10 * 60 * 1000

# --- V4 CONFIG (tuneable risk & regime) ---
CONFIG = {
    "ENABLE_TREND_FILTER": True,
    "ENABLE_HIGHER_TF_CONFIRMATION": True,
    "HIGHER_TF_INTERVAL": "5m",
    "TREND_MA_SHORT": 50,
    "TREND_MA_LONG": 100,
    "MAX_ENTRIES": 3,
    "LADDER_WEIGHTS": [0.25, 0.25, 0.25],
    "MAX_RISK_FRACTION_PER_TRADE": 0.03,
    "EARLY_STOP_PCT": 0.015,
    "MAX_BB_EXPANSION": 4.0,
    "MAX_RED_CANDLES": 3,
    "MAX_BODY_DROP_PCT": 2.0,
    "JOJO_ADD_ENABLED": True,
    "JOJO_ADD_MAX_PCT": 0.40,
    "PARTIAL_TP_PCT": 0.004,
    "JOJO_TP_PCT": 0.005,
    "JOJO_SL_PCT": 0.005,
}

# --- STATE ---
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {
        "initial_budget": INITIAL_BUDGET,
        "cash": INITIAL_BUDGET,
        "equity": INITIAL_BUDGET,
        "realizedPnl": 0,
        "positions": {},
        "trades": [],
        "cooldowns": {},
        "timestamp": int(time.time() * 1000),
    }


def save_state(state):
    state["timestamp"] = int(time.time() * 1000)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def save_status(state, prices):
    equity = state["cash"]
    unrealized = 0
    positions_status = {}
    for pair, pos in state["positions"].items():
        if pos["qty"] > 0:
            price = prices.get(pair, pos["avgCost"])
            value = pos["qty"] * price
            equity += value
            unrealized += (price - pos["avgCost"]) * pos["qty"]
            positions_status[pair] = {
                "qty": pos["qty"],
                "avgCost": pos["avgCost"],
                "currentPrice": price,
                "unrealizedPnl": (price - pos["avgCost"]) * pos["qty"],
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
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


# --- MARKET DATA ---
def get_top_pairs():
    try:
        res = requests.get("https://api.binance.com/api/v3/ticker/24hr")
        data = res.json()
        pairs = []
        for d in data:
            if d["symbol"].endswith("USDT") and "UP" not in d["symbol"] and "DOWN" not in d["symbol"]:
                vol = float(d["quoteVolume"])
                price = float(d["lastPrice"])
                if vol >= MIN_VOLUME_USDT and price >= MIN_PRICE:
                    pairs.append(d["symbol"])
        pairs.sort(
            key=lambda x: float(next(item["quoteVolume"] for item in data if item["symbol"] == x)),
            reverse=True,
        )
        return pairs[:100]
    except Exception as e:
        print(f"Error fetching pairs: {e}")
        return []


def get_klines(symbol, interval="1m", limit=120):
    try:
        res = requests.get(
            f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
        )
        data = res.json()
        df = pd.DataFrame(
            data,
            columns=[
                "timestamp", "open", "high", "low", "close", "volume",
                "close_time", "qav", "num_trades", "taker_base_vol", "taker_quote_vol", "ignore",
            ],
        )
        df["close"] = df["close"].astype(float)
        df["high"] = df["high"].astype(float)
        df["low"] = df["low"].astype(float)
        df["open"] = df["open"].astype(float)
        return df
    except Exception as e:
        print(f"Error fetching klines for {symbol}: {e}")
        return None


def calculate_indicators(df):
    if df is None or len(df) < 30:
        return None
    bb = ta.bbands(df["close"], length=20, std=2)
    if bb is None:
        return None
    df = pd.concat([df, bb], axis=1)
    macd = ta.macd(df["close"])
    if macd is not None:
        df = pd.concat([df, macd], axis=1)
    df["ma20"] = ta.sma(df["close"], length=20)
    psar = ta.psar(df["high"], df["low"], df["close"])
    if psar is not None:
        df = pd.concat([df, psar], axis=1)
    return df.iloc[-1]


# --- V4: REGIME & FALLING-KNIFE HELPERS ---
def get_trend_context(df):
    """
    Block entries only in clear downtrend: price < MA50 and MA50 < MA100.
    Neutral/range (MA50 >= MA100) or price above MA50 allows mean-reversion.
    """
    if df is None or len(df) < CONFIG["TREND_MA_LONG"]:
        return False
    close = df["close"].astype(float)
    ma50 = close.rolling(CONFIG["TREND_MA_SHORT"]).mean().iloc[-1]
    ma100 = close.rolling(CONFIG["TREND_MA_LONG"]).mean().iloc[-1]
    price = close.iloc[-1]
    if pd.isna(ma50) or pd.isna(ma100):
        return True
    strong_downtrend = price < ma50 and ma50 < ma100
    return not strong_downtrend


def is_falling_knife(df):
    """Block entries when recent candles show strong downside momentum."""
    if df is None or len(df) < 5:
        return False
    recent = df.tail(5)
    red = (recent["close"] < recent["open"]).sum()
    if red > CONFIG["MAX_RED_CANDLES"]:
        return True
    last = recent.iloc[-1]
    if last["open"] <= 0:
        return False
    body_drop_pct = (last["open"] - last["close"]) / last["open"] * 100
    if body_drop_pct > CONFIG["MAX_BODY_DROP_PCT"]:
        return True
    return False


def get_bb_width_pct(ind):
    """BB width as % of middle band."""
    bbl = [c for c in ind.index if c.startswith("BBL_")]
    bbu = [c for c in ind.index if c.startswith("BBU_")]
    bbm = [c for c in ind.index if c.startswith("BBM_")]
    if not bbl or not bbu or not bbm:
        return 0.0
    lower = ind[bbl[0]]
    upper = ind[bbu[0]]
    mid = ind[bbm[0]]
    if mid == 0:
        return 0.0
    return (upper - lower) / mid * 100


def higher_tf_ok(symbol):
    """Optional: block new entries if 5m is bearish (close < MA20 or MACD hist < 0)."""
    if not CONFIG["ENABLE_HIGHER_TF_CONFIRMATION"]:
        return True
    df5 = get_klines(symbol, interval=CONFIG["HIGHER_TF_INTERVAL"], limit=30)
    if df5 is None or len(df5) < 25:
        return True
    close = df5["close"].astype(float)
    ma20_5m = close.rolling(20).mean().iloc[-1]
    macd5 = ta.macd(close)
    if macd5 is None:
        return close.iloc[-1] >= ma20_5m if not pd.isna(ma20_5m) else True
    macd_cols = [c for c in macd5.columns if "MACDh" in c]
    hist = macd5[macd_cols[0]].iloc[-1] if macd_cols else 0
    price_ok = close.iloc[-1] >= ma20_5m if not pd.isna(ma20_5m) else True
    return price_ok and hist >= 0


def allow_new_buys(df, ind, symbol):
    """Combined regime + falling-knife + higher-TF gate for any new buy (entry_1, ladder, jojo)."""
    if CONFIG["ENABLE_TREND_FILTER"] and not get_trend_context(df):
        return False
    if is_falling_knife(df):
        return False
    bb_width = get_bb_width_pct(ind)
    if bb_width > CONFIG["MAX_BB_EXPANSION"]:
        return False
    if not higher_tf_ok(symbol):
        return False
    return True


# --- TRADING LOGIC ---
def execute_trade(state, symbol, side, qty, price, reason):
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
        if symbol not in state["positions"]:
            state["positions"][symbol] = {
                "qty": 0, "avgCost": 0, "entries": 0,
                "entry1_price": 0, "entry2_price": 0,
                "step_pct": 0, "partial_done": False,
                "jojo_qty": 0, "jojo_avg_cost": 0,
            }
        pos = state["positions"][symbol]
        total_cost = pos["qty"] * pos["avgCost"] + notional
        pos["qty"] += qty
        pos["avgCost"] = total_cost / pos["qty"]
        trade["pnl"] = 0
    else:
        state["cash"] += notional - fee
        pos = state["positions"][symbol]
        pnl = (price - pos["avgCost"]) * qty - fee
        state["realizedPnl"] += pnl
        trade["pnl"] = round(pnl, 4)
        pos["qty"] -= qty
        if pos["qty"] <= 1e-8:
            del state["positions"][symbol]
    state["trades"].append(trade)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {side.upper()} {qty:.4f} {symbol} @ {price:.4f} | Reason: {reason}")


def run_cycle():
    state = load_state()
    prices = {}
    now = int(time.time() * 1000)
    state["cooldowns"] = {k: v for k, v in state.get("cooldowns", {}).items() if v > now}
    open_symbols = list(state["positions"].keys())

    if len(open_symbols) > 0:
        symbol = open_symbols[0]
        pos = state["positions"][symbol]
        df = get_klines(symbol, limit=120)
        if df is None:
            return
        current_price = float(df["close"].iloc[-1])
        prices[symbol] = current_price
        ind = calculate_indicators(df)
        if ind is None:
            return

        avg_cost = pos["avgCost"]
        entries = pos.get("entries", 1)
        qty = pos["qty"]
        unrealized = (current_price - avg_cost) * qty
        max_dollar_loss = INITIAL_BUDGET * CONFIG["MAX_RISK_FRACTION_PER_TRADE"]
        early_stop_pct = CONFIG["EARLY_STOP_PCT"]

        # --- EXIT 1: Risk stop (replaces catastrophic_stop) — earlier and capped ---
        price_breach = current_price <= avg_cost * (1 - early_stop_pct)
        dollar_breach = unrealized <= -max_dollar_loss
        if price_breach or dollar_breach:
            reason = f"risk_stop_e{entries}"
            execute_trade(state, symbol, "sell", qty, current_price, reason)
            state["cooldowns"][symbol] = now + COOLDOWN_MS_AFTER_RISK_STOP
            save_state(state)
            save_status(state, prices)
            return

        # --- EXIT 2: Partial TP (unchanged) ---
        if not pos["partial_done"] and current_price >= avg_cost * (1 + CONFIG["PARTIAL_TP_PCT"]):
            sell_qty = qty * 0.75
            execute_trade(state, symbol, "sell", sell_qty, current_price, "partial_tp")
            pos["partial_done"] = True

        # --- EXIT 3 & 4: Jojo TP / SL (unchanged) ---
        if pos["jojo_qty"] > 0 and current_price >= pos["jojo_avg_cost"] * (1 + CONFIG["JOJO_TP_PCT"]):
            execute_trade(state, symbol, "sell", pos["jojo_qty"], current_price, "jojo_tp")
            pos["jojo_qty"] = 0
            pos["jojo_avg_cost"] = 0
        if pos["jojo_qty"] > 0 and current_price <= pos["jojo_avg_cost"] * (1 - CONFIG["JOJO_SL_PCT"]):
            execute_trade(state, symbol, "sell", pos["jojo_qty"], current_price, "jojo_sl")
            pos["jojo_qty"] = 0
            pos["jojo_avg_cost"] = 0

        # --- EXIT 5: MA20 exit (unchanged) ---
        if pos["partial_done"] and current_price < ind["ma20"] and pos["qty"] > 0:
            execute_trade(state, symbol, "sell", pos["qty"], current_price, "ma20_exit")
            save_state(state)
            save_status(state, prices)
            return

        # --- LADDER ENTRIES (v4: 25/25/25, max_entries, regime gate) ---
        allow = allow_new_buys(df, ind, symbol)
        max_entries = CONFIG["MAX_ENTRIES"]
        weights = CONFIG["LADDER_WEIGHTS"]

        if allow and pos["entries"] == 1 and max_entries >= 2:
            if current_price <= pos["entry1_price"] * (1 - pos["step_pct"] / 100):
                budget = INITIAL_BUDGET * weights[1]
                if state["cash"] >= budget:
                    execute_trade(state, symbol, "buy", budget / current_price, current_price, "entry_2")
                    pos["entries"] = 2
                    pos["entry2_price"] = current_price

        elif allow and pos["entries"] == 2 and max_entries >= 3:
            if current_price <= pos["entry2_price"] * (1 - pos["step_pct"] / 100):
                budget = INITIAL_BUDGET * weights[2]
                if state["cash"] >= budget:
                    execute_trade(state, symbol, "buy", budget / current_price, current_price, "entry_3")
                    pos["entries"] = 3

        # --- JOJO ADD (v4: only when regime allows, capped size) ---
        if (
            CONFIG["JOJO_ADD_ENABLED"]
            and pos["partial_done"]
            and pos["jojo_qty"] == 0
            and allow
            and current_price < pos["avgCost"] * 0.999
        ):
            psar_col = [c for c in ind.index if c.startswith("PSARl_")]
            macd_col = [c for c in ind.index if c.startswith("MACDh_")]
            if psar_col and macd_col:
                psar_val = ind[psar_col[0]]
                macd_hist = ind[macd_col[0]]
                if current_price > psar_val and macd_hist > 0:
                    budget = min(
                        INITIAL_BUDGET * CONFIG["JOJO_ADD_MAX_PCT"],
                        state["cash"] - 50,
                    )
                    if budget >= 100:
                        execute_trade(state, symbol, "buy", budget / current_price, current_price, "jojo_add")
                        pos["jojo_qty"] = budget / current_price
                        pos["jojo_avg_cost"] = current_price

    else:
        # --- SCAN FOR ENTRY 1 (v4: trend + falling-knife + higher-TF) ---
        pairs = get_top_pairs()
        for symbol in pairs:
            if symbol in state.get("cooldowns", {}):
                continue
            df = get_klines(symbol, limit=120)
            if df is None:
                continue
            current_price = float(df["close"].iloc[-1])
            prices[symbol] = current_price
            ind = calculate_indicators(df)
            if ind is None:
                continue
            bb_width = get_bb_width_pct(ind)
            if bb_width < MIN_BB_WIDTH_E1:
                continue
            if not allow_new_buys(df, ind, symbol):
                continue
            lower_bb = ind[[c for c in ind.index if c.startswith("BBL_")]].iloc[0]
            if current_price <= lower_bb * GLIJBAAN_TOLERANCE:
                budget = INITIAL_BUDGET * CONFIG["LADDER_WEIGHTS"][0]
                if state["cash"] >= budget:
                    execute_trade(state, symbol, "buy", budget / current_price, current_price, "entry_1")
                    pos = state["positions"][symbol]
                    pos["entries"] = 1
                    pos["entry1_price"] = current_price
                    pos["step_pct"] = max(1.8, min(3.0, bb_width))
                break

    save_state(state)
    save_status(state, prices)


if __name__ == "__main__":
    print(f"Starting {AGENT_ID}...")
    while True:
        try:
            run_cycle()
        except Exception as e:
            import traceback
            print(f"Error in cycle: {type(e).__name__}: {e}")
            traceback.print_exc()
        time.sleep(60)
