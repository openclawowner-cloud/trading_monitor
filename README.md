# Trading Monitor

Professional crypto trading monitor dashboard: backend (telemetry, reconciliation, REST API) and frontend (KPIs, agent grid, detail panel, filters, alerts).

## Structure

- **Backend/** — Domain, services, adapters, routes, utils. REST API for agents, config, reconciliation, lifecycle.
- **Frontend/** — React SPA: top stats bar, filter bar, alert banner, agent cards, agent detail panel (Overview, Positions, Trades, Diagnostics, Reconciliation, Lifecycle).
- **server.ts** — Root entry: Express app (Backend API) + Vite dev middleware or static `Frontend/dist` in production.

## Prerequisites

Node.js 18+

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `TELEMETRY_ROOT` (default: `./trading-live`) and optional vars.
3. Ensure `trading-live/agents.json` and agent telemetry dirs (e.g. `trading-live/<agentId>/latest_status.json`, `paper_state.json`) exist.
4. Run: `npm run dev` — API + frontend at `http://localhost:3000`.

## Build

- `npm run build` — Builds frontend into `Frontend/dist`.
- `npm run start` — Runs server (use after build or with `tsx` for TS); serves API and `Frontend/dist` when `NODE_ENV=production`.

## Ubuntu Deploy

- Linux deployment assets are in `deploy/ubuntu`.
- See `deploy/ubuntu/README.md` for:
  - systemd setup
  - env expectations
  - update-safe rollout via `deploy/ubuntu/update.sh`

## API (summary)

- `GET /api/config` — Kill switch, stale threshold, version/capabilities.
- `GET /api/trading/live/agents` — Agents list (enriched with status, PnL, incidents).
- `GET /api/trading/live/agent/:id` — Agent detail + reconciliation.
- `GET /api/trading/live/agent/:id/reconciliation` — Reconciliation result.
- `POST /api/trading/live/agent/:id/heartbeat` — Heartbeat.
- `POST /api/trading/live/agent/:id/enable|disable|reset|validate|archive` — Lifecycle.

## Poorten / Ports

Er wordt **één poort** gebruikt voor zowel frontend als backend:

| Wat        | Waar geconfigureerd | Standaard |
|-----------|----------------------|-----------|
| **Server** (API + frontend) | `server.ts` → `process.env.PORT` | **3000** |
| **Env**   | `.env` of `.env.example` → `PORT=3000` | 3000 |

- **Backend (API):** wordt door dezelfde Express-server op die poort geëxposeerd (`/api/...`).
- **Frontend:** in development via Vite-middleware op dezelfde poort; in productie als static files van dezelfde server.
- De frontend (`Frontend/src/api/client.ts`) gebruikt relatieve URLs (`/api`), dus altijd dezelfde host en poort als de pagina.

Om een andere poort te gebruiken: zet in `.env` bijvoorbeeld `PORT=4000`. Er is geen aparte frontend- of backend-poort.

---

## Env (see .env.example)

`PORT`, `TELEMETRY_ROOT`, `KILL_SWITCH_ACTIVE`, `KILL_SWITCH_MODE`, `RECON_*`, `STALE_THRESHOLD_MINUTES`, `RISK_EXPOSURE_LIMIT_USD`.
