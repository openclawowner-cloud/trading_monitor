import os
import sys

# Ensure venv site-packages is used first when run under supervisor (Scripts/python.exe -> venv/Lib/site-packages)
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
from datetime import datetime, timezone

# --- CONFIGURATION ---
AGENT_ID = "cryptocoiner_v3.1.2"
TELEMETRY_ROOT = (os.environ.get("TELEMETRY_ROOT") or os.path.join(os.getcwd(), "trading-live")).strip().rstrip("/\\")
AGENT_DIR = os.path.join(TELEMETRY_ROOT, AGENT_ID)
os.makedirs(AGENT_DIR, exist_ok=True)

STATE_FILE = os.path.join(AGENT_DIR, "paper_state.json")
STATUS_FILE = os.path.join(AGENT_DIR, "latest_status.json")

INITIAL_BUDGET = 10000.0
FEE_RATE = 0.0015 # 0.1% fee + 0.05% slippage

# Strategy Params
GLIJBAAN_TOLERANCE = 1.01
MIN_BB_WIDTH_E1 = 1.2
MIN_VOLUME_USDT = 3000000
MIN_PRICE = 0.0001
CATASTROPHIC_STOP_PCT = 0.02
PARTIAL_TP_PCT = 0.004
JOJO_TP_PCT = 0.005
JOJO_SL_PCT = 0.005
JOJO_ADD_PCT = 0.5

# --- STATE MANAGEMENT ---
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
        "timestamp": int(time.time() * 1000)
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
                "unrealizedPnl": (price - pos["avgCost"]) * pos["qty"]
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
            "unrealizedPnl": unrealized
        },
        "positions": positions_status,
        "prices": prices
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
        
        # Sort by volume descending, take top 100
        pairs.sort(key=lambda x: float(next(item["quoteVolume"] for item in data if item["symbol"] == x)), reverse=True)
        return pairs[:100]
    except Exception as e:
        print(f"Error fetching pairs: {e}")
        return []

def get_klines(symbol, interval="1m", limit=100):
    try:
        res = requests.get(f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}")
        data = res.json()
        df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close", "volume", "close_time", "qav", "num_trades", "taker_base_vol", "taker_quote_vol", "ignore"])
        df["close"] = df["close"].astype(float)
        df["high"] = df["high"].astype(float)
        df["low"] = df["low"].astype(float)
        return df
    except Exception as e:
        print(f"Error fetching klines for {symbol}: {e}")
        return None

def calculate_indicators(df):
    if df is None or len(df) < 30:
        return None
    
    # Bollinger Bands
    bb = ta.bbands(df["close"], length=20, std=2)
    if bb is None: return None
    df = pd.concat([df, bb], axis=1)
    
    # MACD
    macd = ta.macd(df["close"])
    if macd is not None:
        df = pd.concat([df, macd], axis=1)
        
    # MA20
    df["ma20"] = ta.sma(df["close"], length=20)
    
    # Parabolic SAR
    psar = ta.psar(df["high"], df["low"], df["close"])
    if psar is not None:
        df = pd.concat([df, psar], axis=1)
        
    return df.iloc[-1]

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
        "reason": reason
    }
    
    if side == "buy":
        state["cash"] -= (notional + fee)
        if symbol not in state["positions"]:
            state["positions"][symbol] = {
                "qty": 0, "avgCost": 0, "entries": 0, 
                "entry1_price": 0, "entry2_price": 0, 
                "step_pct": 0, "partial_done": False, 
                "jojo_qty": 0, "jojo_avg_cost": 0
            }
        
        pos = state["positions"][symbol]
        total_cost = (pos["qty"] * pos["avgCost"]) + notional
        pos["qty"] += qty
        pos["avgCost"] = total_cost / pos["qty"]
        
    elif side == "sell":
        state["cash"] += (notional - fee)
        pos = state["positions"][symbol]
        
        # Calculate realized PnL
        pnl = (price - pos["avgCost"]) * qty - fee
        state["realizedPnl"] += pnl
        
        pos["qty"] -= qty
        if pos["qty"] <= 1e-8:
            del state["positions"][symbol]
            
    state["trades"].append(trade)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {side.upper()} {qty:.4f} {symbol} @ {price:.4f} | Reason: {reason}")

def run_cycle():
    state = load_state()
    prices = {}
    
    # Clean up cooldowns
    now = int(time.time() * 1000)
    state["cooldowns"] = {k: v for k, v in state.get("cooldowns", {}).items() if v > now}
    
    open_symbols = list(state["positions"].keys())
    
    if len(open_symbols) > 0:
        # Manage existing position (1 coin at a time)
        symbol = open_symbols[0]
        pos = state["positions"][symbol]
        
        df = get_klines(symbol)
        if df is None: return
        current_price = df["close"].iloc[-1]
        prices[symbol] = current_price
        
        ind = calculate_indicators(df)
        if ind is None: return
        
        # Exits
        # 1. Catastrophic stop (after E3)
        if pos["entries"] >= 3 and (pos["avgCost"] - current_price) / pos["avgCost"] >= CATASTROPHIC_STOP_PCT:
            execute_trade(state, symbol, "sell", pos["qty"], current_price, "catastrophic_stop")
            state["cooldowns"][symbol] = now + 10 * 60 * 1000 # 10 min cooldown
            save_state(state)
            save_status(state, prices)
            return
            
        # 2. Partial TP
        if not pos["partial_done"] and current_price >= pos["avgCost"] * (1 + PARTIAL_TP_PCT):
            sell_qty = pos["qty"] * 0.75
            execute_trade(state, symbol, "sell", sell_qty, current_price, "partial_tp")
            pos["partial_done"] = True
            
        # 3. Jojo TP
        if pos["jojo_qty"] > 0 and current_price >= pos["jojo_avg_cost"] * (1 + JOJO_TP_PCT):
            execute_trade(state, symbol, "sell", pos["jojo_qty"], current_price, "jojo_tp")
            pos["jojo_qty"] = 0
            pos["jojo_avg_cost"] = 0
            
        # 4. Jojo SL
        if pos["jojo_qty"] > 0 and current_price <= pos["jojo_avg_cost"] * (1 - JOJO_SL_PCT):
            execute_trade(state, symbol, "sell", pos["jojo_qty"], current_price, "jojo_sl")
            pos["jojo_qty"] = 0
            pos["jojo_avg_cost"] = 0
            
        # 5. MA20 Exit
        if pos["partial_done"] and current_price < ind["ma20"] and pos["qty"] > 0:
            execute_trade(state, symbol, "sell", pos["qty"], current_price, "ma20_exit")
            save_state(state)
            save_status(state, prices)
            return
            
        # Entries (Ladder)
        if pos["entries"] == 1 and current_price <= pos["entry1_price"] * (1 - pos["step_pct"]/100):
            # Entry 2 (25%)
            budget = INITIAL_BUDGET * 0.25
            qty = budget / current_price
            if state["cash"] >= budget:
                execute_trade(state, symbol, "buy", qty, current_price, "entry_2")
                pos["entries"] = 2
                pos["entry2_price"] = current_price
                
        elif pos["entries"] == 2 and current_price <= pos["entry2_price"] * (1 - pos["step_pct"]/100):
            # Entry 3 (50%)
            budget = INITIAL_BUDGET * 0.50
            qty = budget / current_price
            if state["cash"] >= budget:
                execute_trade(state, symbol, "buy", qty, current_price, "entry_3")
                pos["entries"] = 3
                
        # Jojo Add
        if pos["partial_done"] and pos["jojo_qty"] == 0:
            if current_price < pos["avgCost"] * 0.999: # ~0.1% below
                # Check PSAR and MACD bullish
                psar_col = [c for c in ind.index if c.startswith("PSARl_")]
                macd_col = [c for c in ind.index if c.startswith("MACDh_")] # Histogram
                
                if psar_col and macd_col:
                    psar_val = ind[psar_col[0]]
                    macd_hist = ind[macd_col[0]]
                    
                    if current_price > psar_val and macd_hist > 0:
                        budget = min(INITIAL_BUDGET * JOJO_ADD_PCT, state["cash"] - 50)
                        if budget >= 100:
                            qty = budget / current_price
                            execute_trade(state, symbol, "buy", qty, current_price, "jojo_add")
                            pos["jojo_qty"] = qty
                            pos["jojo_avg_cost"] = current_price

    else:
        # Scan for new Entry 1
        pairs = get_top_pairs()
        for symbol in pairs:
            if symbol in state.get("cooldowns", {}): continue
            
            df = get_klines(symbol)
            if df is None: continue
            
            current_price = df["close"].iloc[-1]
            prices[symbol] = current_price
            
            ind = calculate_indicators(df)
            if ind is None: continue
            
            lower_bb = ind[[c for c in ind.index if c.startswith("BBL_")]].iloc[0]
            upper_bb = ind[[c for c in ind.index if c.startswith("BBU_")]].iloc[0]
            mid_bb = ind[[c for c in ind.index if c.startswith("BBM_")]].iloc[0]
            
            bb_width = (upper_bb - lower_bb) / mid_bb * 100
            
            if bb_width >= MIN_BB_WIDTH_E1:
                if current_price <= lower_bb * GLIJBAAN_TOLERANCE:
                    # Entry 1 (25%)
                    budget = INITIAL_BUDGET * 0.25
                    qty = budget / current_price
                    if state["cash"] >= budget:
                        execute_trade(state, symbol, "buy", qty, current_price, "entry_1")
                        pos = state["positions"][symbol]
                        pos["entries"] = 1
                        pos["entry1_price"] = current_price
                        pos["step_pct"] = max(1.8, min(3.0, bb_width))
                        break # Only 1 coin at a time

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
        time.sleep(60) # Run every minute
