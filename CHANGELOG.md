# Changelog

## Overview trading metrics (historical agent data)

- Fixed Overview trading metrics for historical agent data by backfilling missing per-trade PnL on the backend read path (`GET /trading/live/agent/:agentId`) using stable chronological replay (`Backend/utils/backfillTradesPnL.ts`).
- Preserved existing frontend behavior; no API contract changes (same `state` shape; `pnl` only filled where missing).
- Safe handling for missing or equal timestamps (stable sort); silent failure on unexpected errors.
