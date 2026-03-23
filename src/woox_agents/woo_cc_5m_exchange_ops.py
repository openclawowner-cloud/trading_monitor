"""
WOO signed spot: sync balances into paper_state-shaped positions and place MARKET orders.
Used when WOOX_EXCHANGE_TRADING=true + WOOX_API_KEY / WOOX_API_SECRET are set.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Callable


def woo_spot_base_quote(woo_sym: str) -> tuple[str, str]:
    s = woo_sym.strip().upper()
    if not s.startswith("SPOT_"):
        raise ValueError(f"expected SPOT_* symbol, got {woo_sym!r}")
    body = s[5:]
    parts = body.split("_")
    if len(parts) < 2:
        raise ValueError(f"invalid WOO spot symbol: {woo_sym!r}")
    quote = parts[-1]
    base = "_".join(parts[:-1])
    return base, quote


def sync_state_from_exchange(
    client: WooSignedClient,
    woo_symbol: str,
    state: dict[str, Any],
    pair_internal: str,
    mark_price: float,
) -> bool:
    try:
        base, quote = woo_spot_base_quote(woo_symbol)
    except ValueError:
        return False
    qrow = client.get_balance_row(quote)
    brow = client.get_balance_row(base)
    if qrow is None or brow is None:
        return False

    def _f(row: dict[str, Any] | None, key: str, default: str = "0") -> float:
        if not row:
            return 0.0
        try:
            return float(row.get(key, default) or 0)
        except (TypeError, ValueError):
            return 0.0

    state["cash"] = _f(qrow, "availableBalance")
    b_avail = _f(brow, "availableBalance")

    if b_avail > 1e-8:
        prev = state.get("positions", {}).get(pair_internal, {})
        avg = _f(brow, "averageOpenPrice")
        if avg <= 0:
            avg = _f(brow, "markPrice") or float(mark_price)
        state.setdefault("positions", {})
        state["positions"][pair_internal] = {
            "qty": b_avail,
            "avgCost": avg,
            "entries": int(prev.get("entries", 1) or 1),
            "entry1_price": float(prev.get("entry1_price", 0.0) or 0.0),
            "entry2_price": float(prev.get("entry2_price", 0.0) or 0.0),
            "entry3_price": float(prev.get("entry3_price", 0.0) or 0.0),
            "step_pct": float(prev.get("step_pct", 0.0) or 0.0),
        }
    else:
        state.get("positions", {}).pop(pair_internal, None)

    return True


def _append_trade(
    state: dict[str, Any],
    pair: str,
    side: str,
    qty: float,
    price: float,
    fee: float,
    reason: str,
    decision_context: dict[str, Any] | None,
    *,
    exchange_meta: dict[str, Any] | None = None,
) -> None:
    trade: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "pair": pair,
        "side": side,
        "qty": qty,
        "price": price,
        "fee": fee,
        "reason": reason,
        "venue": "woox_live",
    }
    if decision_context:
        trade["decision_context"] = decision_context
    if exchange_meta:
        trade["exchange"] = exchange_meta
    state.setdefault("trades", []).append(trade)


def exchange_buy_budget(
    client: WooSignedClient,
    woo_symbol: str,
    state: dict[str, Any],
    pair: str,
    budget_usdt: float,
    fill_price_estimate: float,
    reason: str,
    decision_context: dict[str, Any] | None,
    record_decision: Callable[..., None],
    log_fn: Callable[[str], None],
    fee_rate: float,
) -> bool:
    if budget_usdt <= 0 or fill_price_estimate <= 0:
        return False
    old_qty = float(state.get("positions", {}).get(pair, {}).get("qty", 0) or 0.0)
    old_cash = float(state.get("cash", 0) or 0.0)
    cid = int(time.time() * 1000) % 9_007_199_254_740_991
    amt = f"{budget_usdt:.8f}"
    res = client.place_market_buy_amount(woo_symbol, amt, client_order_id=cid)
    if not res or res.get("success") is not True:
        record_decision(state, pair, "error", f"exchange_buy_failed: {res!r}", decision_context or {})
        return False

    if not sync_state_from_exchange(client, woo_symbol, state, pair, fill_price_estimate):
        record_decision(state, pair, "error", "exchange_sync_failed_after_buy", decision_context or {})
        return False

    new_qty = float(state.get("positions", {}).get(pair, {}).get("qty", 0) or 0.0)
    delta = max(0.0, new_qty - old_qty)
    notional = delta * fill_price_estimate if delta > 0 else budget_usdt
    fee = notional * fee_rate
    _append_trade(
        state,
        pair,
        "buy",
        delta if delta > 0 else budget_usdt / fill_price_estimate,
        fill_price_estimate,
        fee,
        reason,
        decision_context,
        exchange_meta={"clientOrderId": cid, "responseSuccess": True},
    )
    record_decision(state, pair, "buy", reason, decision_context or {})
    cash_delta = float(state.get("cash", 0) or 0.0) - old_cash
    log_fn(
        f"[WOO LIVE] BUY ~{budget_usdt:.4f} {woo_symbol} est@{fill_price_estimate:.6f} "
        f"Δbase≈{delta:.6f} Δcash≈{cash_delta:.4f} | {reason}"
    )
    state.setdefault("positions", {}).setdefault(pair, {})
    return True


def exchange_sell_all(
    client: WooSignedClient,
    woo_symbol: str,
    state: dict[str, Any],
    pair: str,
    qty: float,
    fill_price_estimate: float,
    avg_cost: float,
    reason: str,
    decision_context: dict[str, Any] | None,
    record_decision: Callable[..., None],
    log_fn: Callable[[str], None],
    fee_rate: float,
) -> bool:
    if qty <= 1e-8 or fill_price_estimate <= 0:
        return False
    cid = int(time.time() * 1000) % 9_007_199_254_740_991
    qstr = f"{qty:.8f}"
    res = client.place_market_sell_quantity(woo_symbol, qstr, client_order_id=cid)
    if not res or res.get("success") is not True:
        record_decision(state, pair, "error", f"exchange_sell_failed: {res!r}", decision_context or {})
        return False

    notional = qty * fill_price_estimate
    fee = notional * fee_rate
    pnl = (fill_price_estimate - avg_cost) * qty - fee
    state["realizedPnl"] = float(state.get("realizedPnl", 0) or 0) + pnl

    if not sync_state_from_exchange(client, woo_symbol, state, pair, fill_price_estimate):
        record_decision(state, pair, "error", "exchange_sync_failed_after_sell", decision_context or {})
        return False

    _append_trade(
        state,
        pair,
        "sell",
        qty,
        fill_price_estimate,
        fee,
        reason,
        decision_context,
        exchange_meta={"clientOrderId": cid, "responseSuccess": True, "pnlJournal": round(pnl, 6)},
    )
    record_decision(state, pair, "sell", reason, decision_context or {})
    log_fn(f"[WOO LIVE] SELL {qty:.6f} {woo_symbol} est@{fill_price_estimate:.6f} pnl~{pnl:.4f} | {reason}")
    return True
