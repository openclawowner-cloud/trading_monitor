"""
Minimal WOO X V3 signed REST (HMAC-SHA256).

Docs: timestamp + METHOD + pathWithQuery + body -> hex signature.
POST /v3/trade/order — spot MARKET (amount for BUY, quantity for SELL).
GET /v3/asset/balances?token= — balances.

Keys only via environment (never hardcode):
  WOOX_API_KEY, WOOX_API_SECRET
Optional:
  WOOX_API_BASE (default https://api.woox.io)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional


def _compact_json(obj: dict) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


class WooSignedClient:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        base_url: str | None = None,
        timeout_sec: float = 20.0,
    ) -> None:
        self.api_key = api_key.strip()
        self.api_secret = api_secret.strip()
        self.base = (base_url or os.environ.get("WOOX_API_BASE") or "https://api.woox.io").strip().rstrip("/")
        self.timeout_sec = timeout_sec

    def _sign(self, ts: str, method: str, path_with_query: str, body: str) -> str:
        payload = f"{ts}{method.upper()}{path_with_query}{body}"
        return hmac.new(
            self.api_secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict[str, str]] = None,
        body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any] | None:
        path_only = path
        if query:
            qs = urllib.parse.urlencode(query)
            path_with_q = f"{path_only}?{qs}"
        else:
            path_with_q = path_only

        body_str = _compact_json(body) if body is not None else ""
        ts = str(int(time.time() * 1000))
        sig = self._sign(ts, method, path_with_q, body_str)

        url = f"{self.base}{path_with_q}"
        headers = {
            "x-api-key": self.api_key,
            "x-api-timestamp": ts,
            "x-api-signature": sig,
            "User-Agent": "TradingMonitor-woo-signed/1.0",
        }
        data_bytes: bytes | None = None
        if method.upper() == "POST":
            headers["Content-Type"] = "application/json"
            data_bytes = body_str.encode("utf-8")

        req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                raw = resp.read().decode("utf-8")
            out = json.loads(raw)
            return out if isinstance(out, dict) else None
        except urllib.error.HTTPError as e:
            try:
                raw = e.read().decode("utf-8", errors="replace")
            except Exception:
                raw = str(e)
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else {"success": False, "_httpStatus": e.code, "_body": raw[:2000]}
            except json.JSONDecodeError:
                return {"success": False, "_httpStatus": e.code, "_body": raw[:2000]}
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            return None

    def get_balance_row(self, token: str) -> dict[str, Any] | None:
        """Returns holding row for token from GET /v3/asset/balances?token=."""
        res = self._request("GET", "/v3/asset/balances", query={"token": token.strip().upper()})
        if not res or res.get("success") is not True:
            return None
        data = res.get("data")
        if not isinstance(data, dict):
            return None
        rows = data.get("holding")
        if not isinstance(rows, list):
            return None
        t = token.strip().upper()
        for row in rows:
            if isinstance(row, dict) and str(row.get("token", "")).upper() == t:
                return row
        return {
            "token": t,
            "availableBalance": "0",
            "averageOpenPrice": "0",
            "markPrice": "0",
        }

    def place_market_buy_amount(self, symbol: str, amount_quote: str, client_order_id: int | None = None) -> dict[str, Any] | None:
        body: dict[str, Any] = {
            "symbol": symbol,
            "side": "BUY",
            "type": "MARKET",
            "amount": str(amount_quote),
        }
        if client_order_id is not None:
            body["clientOrderId"] = int(client_order_id)
        return self._request("POST", "/v3/trade/order", body=body)

    def place_market_sell_quantity(self, symbol: str, quantity_base: str, client_order_id: int | None = None) -> dict[str, Any] | None:
        body: dict[str, Any] = {
            "symbol": symbol,
            "side": "SELL",
            "type": "MARKET",
            "quantity": str(quantity_base),
        }
        if client_order_id is not None:
            body["clientOrderId"] = int(client_order_id)
        return self._request("POST", "/v3/trade/order", body=body)


def load_signed_client_from_env() -> WooSignedClient | None:
    key = (os.environ.get("WOOX_API_KEY") or "").strip()
    secret = (os.environ.get("WOOX_API_SECRET") or "").strip()
    if not key or not secret:
        return None
    return WooSignedClient(key, secret)
