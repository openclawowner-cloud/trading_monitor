"""
Simple WOO spot paper-local bot.

- Signals from public WOO candles.
- Fills from public WOO best bid/ask.
- No signed calls, no exchange orders.
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
from decimal import Decimal, InvalidOperation, ROUND_DOWN
from typing import Any, Optional


def _d(value: str, default: str = "0") -> Decimal:
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _agent_dir() -> str:
    out = (os.environ.get("AGENT_OUT_DIR") or "").strip()
    if out:
        return out
    root = (os.environ.get("TELEMETRY_ROOT") or "").strip() or os.path.join(
        os.getcwd(), "trading-live-woox"
    )
    aid = (os.environ.get("WOOX_BOT_AGENT_ID") or "woox-paper-spot-1").strip()
    return os.path.join(root, aid)


def _agent_id() -> str:
    return os.path.basename(os.path.normpath(_agent_dir())) or "woox-paper-spot-1"


def _woo_base_url() -> str:
    return (os.environ.get("WOOX_API_BASE") or "https://api.woox.io").strip().rstrip("/")


def _symbol() -> str:
    return (os.environ.get("WOOX_BOT_SYMBOL") or "SPOT_BTC_USDT").strip() or "SPOT_BTC_USDT"


def _interval_sec() -> int:
    try:
        val = int((os.environ.get("WOOX_BOT_INTERVAL_SEC") or "5").strip())
    except ValueError:
        val = 5
    return max(2, val)


def _fee_rate() -> Decimal:
    """Fee multiplier: fee = fill_price * fill_qty * fee_rate  (fee_rate = feeBps / 10000)."""
    bps = _d((os.environ.get("WOOX_BOT_FEE_BPS") or "10").strip(), "10")
    if bps < Decimal("0"):
        bps = Decimal("0")
    if bps > Decimal("10000"):
        bps = Decimal("10000")
    return bps / Decimal("10000")


def _trade_fee(fill_price: Decimal, fill_qty: Decimal, fee_rate: Decimal) -> Decimal:
    """fee = price * qty * (feeBps / 10000)."""
    if fill_price <= Decimal("0") or fill_qty <= Decimal("0"):
        return Decimal("0")
    return fill_price * fill_qty * fee_rate


def _max_buy_qty_all_in(cash: Decimal, ask: Decimal, fee_rate: Decimal) -> Decimal:
    """
    Max qty such that ask*qty + fee <= cash with fee = ask*qty*fee_rate
    => ask*qty*(1+fee_rate) <= cash.
    """
    if cash <= Decimal("0") or ask <= Decimal("0"):
        return Decimal("0")
    unit = ask * (Decimal("1") + fee_rate)
    q = (cash / unit).quantize(Decimal("0.00000001"), rounding=ROUND_DOWN)
    return q if q > Decimal("0") else Decimal("0")


def _initial_cash() -> Decimal:
    return _d((os.environ.get("WOOX_BOT_INITIAL_CASH") or "1000").strip(), "1000")


def atomic_write_json(path: str, obj: Any) -> None:
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


def _http_get_json(url: str, timeout_sec: int = 8) -> Optional[dict[str, Any]]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "woox-paper-spot-bot/1.0 (public-only)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
        payload = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        return None
    if isinstance(payload, dict):
        return payload
    return None


def fetch_candle_closes(symbol: str, limit: int = 30) -> list[Decimal]:
    """
    Public WOO candles endpoint:
      GET /v3/public/kline?symbol=SPOT_BTC_USDT&type=1m&limit=30
    Expected shape:
      { "success": true, "data": { "rows": [ { "close": "<string|number>", ... }, ... ] } }
    """
    q = urllib.parse.urlencode({"symbol": symbol, "type": "1m", "limit": str(limit)})
    url = f"{_woo_base_url()}/v3/public/kline?{q}"
    payload = _http_get_json(url)
    if not payload or payload.get("success") is not True:
        return []
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    rows = data.get("rows")
    if not isinstance(rows, list):
        return []
    closes: list[Decimal] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        close_val = row.get("close")
        if isinstance(close_val, (str, int, float)):
            try:
                closes.append(Decimal(str(close_val)))
            except InvalidOperation:
                continue
    # API often returns newest-first; reverse to oldest->newest for SMA clarity.
    closes.reverse()
    return closes


def fetch_best_bid_ask(symbol: str) -> tuple[Optional[Decimal], Optional[Decimal]]:
    """
    Public WOO orderbook endpoint:
      GET /v3/public/orderbook?symbol=SPOT_BTC_USDT&maxLevel=1
    Expected shape:
      { "success": true, "data": { "bids": [{"price":"..."}], "asks": [{"price":"..."}] } }
    """
    q = urllib.parse.urlencode({"symbol": symbol, "maxLevel": "1"})
    url = f"{_woo_base_url()}/v3/public/orderbook?{q}"
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
    bid_raw = b0.get("price")
    ask_raw = a0.get("price")
    try:
        bid = Decimal(str(bid_raw)) if bid_raw is not None else None
        ask = Decimal(str(ask_raw)) if ask_raw is not None else None
        return (bid, ask)
    except InvalidOperation:
        return (None, None)


def sma(values: list[Decimal], window: int) -> Optional[Decimal]:
    if len(values) < window:
        return None
    segment = values[-window:]
    if not segment:
        return None
    return sum(segment) / Decimal(window)


def derive_signal(closes: list[Decimal]) -> str:
    fast = sma(closes, 5)
    slow = sma(closes, 20)
    if fast is None or slow is None:
        return "hold"
    if fast > slow:
        return "buy"
    if fast < slow:
        return "sell"
    return "hold"


def _str_money(v: Decimal) -> str:
    return format(v.quantize(Decimal("0.00000001"), rounding=ROUND_DOWN), "f")


def _non_negative(v: Decimal) -> Decimal:
    return v if v >= Decimal("0") else Decimal("0")


MAX_TRADE_HISTORY = 200


def _safe_trade_list(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out


def _append_trade(trades: list[dict[str, Any]], trade: dict[str, Any]) -> list[dict[str, Any]]:
    trades.append(trade)
    if len(trades) > MAX_TRADE_HISTORY:
        return trades[-MAX_TRADE_HISTORY:]
    return trades


def _trade_metrics_from_history(trades: list[dict[str, Any]]) -> dict[str, str]:
    sell_trades = [t for t in trades if str(t.get("side", "")).lower() == "sell"]
    trade_count = Decimal(len(sell_trades))
    win_count = Decimal(0)
    loss_count = Decimal(0)
    wins_sum = Decimal(0)
    losses_sum = Decimal(0)

    for t in sell_trades:
        rpnl = _d(str(t.get("realizedPnl", "0")), "0")
        if rpnl > Decimal("0"):
            win_count += Decimal("1")
            wins_sum += rpnl
        elif rpnl < Decimal("0"):
            loss_count += Decimal("1")
            losses_sum += rpnl

    if trade_count > Decimal("0"):
        win_rate = win_count / trade_count
    else:
        win_rate = Decimal("0")

    avg_win = wins_sum / win_count if win_count > Decimal("0") else Decimal("0")
    avg_loss = losses_sum / loss_count if loss_count > Decimal("0") else Decimal("0")

    return {
        "tradeCount": _str_money(trade_count),
        "winCount": _str_money(win_count),
        "lossCount": _str_money(loss_count),
        "winRate": _str_money(win_rate),
        "avgWin": _str_money(avg_win),
        "avgLoss": _str_money(avg_loss),
    }


def load_state(path: str, initial_cash: Decimal) -> dict[str, Any]:
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                obj = json.load(f)
            if isinstance(obj, dict):
                return obj
        except (OSError, json.JSONDecodeError):
            pass
    return {
        "schemaVersion": 1,
        "venue": "woox",
        "timestamp": int(time.time() * 1000),
        "mode": "paper_local",
        "symbol": _symbol(),
        "cashBalance": _str_money(initial_cash),
        "positionQty": "0",
        "positionEntryPrice": None,
        "equity": _str_money(initial_cash),
        "realizedPnl": "0",
        "unrealizedPnl": "0",
        "trades": [],
        "tradeCount": "0",
        "winCount": "0",
        "lossCount": "0",
        "winRate": "0",
        "avgWin": "0",
        "avgLoss": "0",
        "fillCount": 0,
    }


def main() -> None:
    agent_dir = _agent_dir()
    agent_id = _agent_id()
    symbol = _symbol()
    interval_sec = _interval_sec()
    fee_rate = _fee_rate()
    os.makedirs(agent_dir, exist_ok=True)

    status_path = os.path.join(agent_dir, "latest_status.json")
    state_path = os.path.join(agent_dir, "paper_state.json")

    state = load_state(state_path, _initial_cash())
    cash = _non_negative(_d(str(state.get("cashBalance", "1000")), "1000"))
    qty = _non_negative(_d(str(state.get("positionQty", "0")), "0"))
    entry = state.get("positionEntryPrice")
    entry_price = _d(str(entry), "0") if entry is not None else None
    if entry_price is not None and entry_price <= Decimal("0"):
        entry_price = None
    if qty <= Decimal("0"):
        qty = Decimal("0")
        entry_price = None
    realized = _d(str(state.get("realizedPnl", "0")), "0")
    fill_count = int(state.get("fillCount", state.get("tradeCount", 0)) or 0)
    trades = _safe_trade_list(state.get("trades"))
    last_price = _d("0")

    try:
        while True:
            now_ms = int(time.time() * 1000)
            closes = fetch_candle_closes(symbol, limit=30)
            signal = derive_signal(closes)

            bid, ask = fetch_best_bid_ask(symbol)
            if bid is not None and ask is not None and bid > Decimal("0") and ask > Decimal("0"):
                last_price = (bid + ask) / Decimal("2")
            elif closes:
                last_price = closes[-1]
            elif qty > Decimal("0") and entry_price is not None and entry_price > Decimal("0"):
                # Keep valuation stable if market fetch fails while position is open.
                last_price = entry_price

            # paper-local fill rules (no real orders):
            # - buy fills at best ask: cash -= (ask*qty + fee), fee = ask*qty*fee_rate
            # - sell fills at best bid: cash += (bid*qty - fee), realized += (bid-entry)*qty - fee
            if qty == Decimal("0") and signal == "buy" and ask is not None and ask > Decimal("0") and cash > Decimal("0"):
                fill_qty = _max_buy_qty_all_in(cash, ask, fee_rate)
                if fill_qty > Decimal("0"):
                    fee_buy = _trade_fee(ask, fill_qty, fee_rate)
                    cost = ask * fill_qty + fee_buy
                    cash = _non_negative(cash - cost)
                    qty = fill_qty
                    entry_price = ask
                    fill_count += 1
                    trades = _append_trade(
                        trades,
                        {
                            "side": "buy",
                            "price": _str_money(ask),
                            "qty": _str_money(fill_qty),
                            "fee": _str_money(fee_buy),
                            "timestamp": now_ms,
                        },
                    )
            elif qty > Decimal("0") and signal == "sell" and bid is not None and bid > Decimal("0") and entry_price is not None and entry_price > Decimal("0"):
                sell_qty = qty
                fee_sell = _trade_fee(bid, sell_qty, fee_rate)
                proceeds = bid * sell_qty - fee_sell
                # Incremental realized on this close: (exit - entry) * qty - fee on exit
                sell_realized = (bid - entry_price) * sell_qty - fee_sell
                realized += sell_realized
                cash = _non_negative(cash + proceeds)
                qty = Decimal("0")
                entry_price = None
                fill_count += 1
                trades = _append_trade(
                    trades,
                    {
                        "side": "sell",
                        "price": _str_money(bid),
                        "qty": _str_money(sell_qty),
                        "fee": _str_money(fee_sell),
                        "timestamp": now_ms,
                        "realizedPnl": _str_money(sell_realized),
                    },
                )

            cash = _non_negative(cash)
            qty = _non_negative(qty)
            if qty <= Decimal("0"):
                qty = Decimal("0")
                entry_price = None

            mark = last_price
            if mark <= Decimal("0") and qty > Decimal("0") and entry_price is not None and entry_price > Decimal("0"):
                mark = entry_price

            unrealized = Decimal("0")
            if qty > Decimal("0") and entry_price is not None and entry_price > Decimal("0") and mark > Decimal("0"):
                unrealized = (mark - entry_price) * qty

            equity = _non_negative(cash + qty * mark)
            metrics = _trade_metrics_from_history(trades)

            latest_status = {
                "schemaVersion": 1,
                "venue": "woox",
                "timestamp": now_ms,
                "status": "running",
                "mode": "paper_local",
                "symbol": symbol,
                "source": "woox-public",
                "lastPrice": _str_money(last_price),
                "signal": signal,
                "positionSide": "long" if qty > Decimal("0") else "flat",
                "agentId": agent_id,
            }
            paper_state = {
                "schemaVersion": 1,
                "venue": "woox",
                "timestamp": now_ms,
                "mode": "paper_local",
                "symbol": symbol,
                "cashBalance": _str_money(cash),
                "positionQty": _str_money(qty),
                "positionEntryPrice": _str_money(entry_price) if entry_price is not None else None,
                "equity": _str_money(equity),
                "realizedPnl": _str_money(realized),
                "unrealizedPnl": _str_money(unrealized),
                "trades": trades,
                "tradeCount": metrics["tradeCount"],
                "winCount": metrics["winCount"],
                "lossCount": metrics["lossCount"],
                "winRate": metrics["winRate"],
                "avgWin": metrics["avgWin"],
                "avgLoss": metrics["avgLoss"],
                "fillCount": fill_count,
                "source": "woox-public",
            }

            atomic_write_json(status_path, latest_status)
            atomic_write_json(state_path, paper_state)
            time.sleep(interval_sec)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="backslashreplace")
    except Exception:
        pass
    main()
