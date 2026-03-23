# WOO X MVP (geisoleerd)

Deze notitie beschrijft de huidige WOO MVP in deze repo.  
Scope is **paper-local**, **spot-only**, met publieke market data.

## Wat zit er nu in

- Backend WOO module onder `Backend/woox/`
  - capabilities, agents, agent detail, supervisor endpoints
  - publieke instruments/symbol-map debug endpoints
- Losse WOO runtime-root: `trading-live-woox/`
- Losse WOO agents:
  - `src/woox_agents/reference_heartbeat.py`
  - `src/woox_agents/paper_spot_bot.py`
- Frontend WOO pagina: `/woox`

## Isolatie t.o.v. Binance

- WOO heeft eigen API-prefix: `/api/woox`
- WOO gebruikt eigen telemetry root: `trading-live-woox/`
- WOO agents staan los van `src/agents/`
- Bestaande Binance routes/flows blijven apart onder `/api/trading/live`

## Belangrijke paden

- Backend:
  - `Backend/woox/routes/woox-routes.ts`
  - `Backend/woox/services/wooxSupervisorController.ts`
  - `Backend/woox/services/wooxTelemetry.ts`
  - `Backend/woox/client/WooXRestClient.ts`
- Frontend:
  - `Frontend/src/woox/WooBotsPage.tsx`
  - `Frontend/src/api/wooxClient.ts`
- Agents/runtime:
  - `src/woox_agents/reference_heartbeat.py`
  - `src/woox_agents/paper_spot_bot.py`
  - `trading-live-woox/agents.json`

## Relevante env vars (WOO)

- `WOOX_TELEMETRY_ROOT` (default: `<repo>/trading-live-woox`)
- `WOOX_API_BASE` (default: `https://api.woox.io`)
- `WOOX_ENABLE_STAGING_TRADING` (default false; alleen gating)
- `WOOX_BOT_SYMBOL` (default `SPOT_BTC_USDT`)
- `WOOX_BOT_INTERVAL_SEC` (default `5` voor paper bot)
- `WOOX_BOT_INITIAL_CASH` (default `1000`)
- `WOOX_BOT_FEE_BPS` (default `10`)

## Handmatig testen (compact)

1. Start app: `npm run dev`
2. Check capabilities: `GET /api/woox/capabilities`
3. Check supervisor status: `GET /api/woox/supervisor`
4. Open UI: `/woox`
5. Start supervisor via UI (of endpoint)
6. Controleer agents:
   - `GET /api/woox/agents`
   - `GET /api/woox/agent/woox-ref-1`
   - `GET /api/woox/agent/woox-paper-spot-1`
7. Controleer telemetry files:
   - `trading-live-woox/woox-ref-1/latest_status.json`
   - `trading-live-woox/woox-paper-spot-1/paper_state.json`
8. Stop supervisor en bevestig statusverandering (`running` -> `stale/offline` na verloop)

## Buiten scope (bewust)

- Signed/private WOO API calls
- Live trading of order placement naar exchange
- Perps/futures
- Gedeelde exchange-abstraction refactor over Binance + WOO
