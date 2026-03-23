import fs from 'fs';
import path from 'path';
import type { WooRegistryAgent, WooxAgentTelemetryRead } from '../types';
import { deriveWooxAgentRuntimeStatus, getWooxAgentTelemetryBaseDir } from './wooxTelemetry';

/** Row shape compatible with frontend `AgentListItem` (dashboard cards). */
export interface WooxDashboardAgentRow {
  agentId: string;
  name: string;
  strategy: string;
  regime: string;
  mode: string;
  enabled: boolean;
  status: 'running' | 'stale' | 'offline' | 'disabled' | 'error' | 'archived';
  telemetryAvailable: boolean;
  lastModifiedMs: number | null;
  activityStatus: 'running' | 'stale' | 'offline' | 'disabled' | 'error' | 'archived';
  category: string;
  openPositions: number;
  unrealizedPnl?: number;
  realizedPnl: number;
  pnl: number;
  cash: number;
  equity: number;
  reconciliationOk: boolean;
  incidents: unknown[];
  lastUpdate: string | null;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getWooxTelemetryLastModifiedMs(agentId: string): number | null {
  const base = getWooxAgentTelemetryBaseDir(agentId.trim());
  let max = 0;
  let found = false;
  for (const f of ['latest_status.json', 'paper_state.json']) {
    const p = path.join(base, f);
    try {
      if (fs.existsSync(p)) {
        max = Math.max(max, fs.statSync(p).mtimeMs);
        found = true;
      }
    } catch {
      /* ignore */
    }
  }
  return found ? max : null;
}

function mapRuntimeToCardStatus(
  runtime: ReturnType<typeof deriveWooxAgentRuntimeStatus>
): 'running' | 'stale' | 'offline' {
  if (runtime === 'unknown') return 'offline';
  return runtime;
}

/**
 * Maps WOO registry agent + telemetry files to a trading-dashboard-compatible list row.
 * Supports paper_spot_bot paper_state, reference_heartbeat paper_state, and scoreboard on latest_status (fallback).
 */
export function mapWooxAgentToDashboardItem(
  agent: WooRegistryAgent,
  telemetry: WooxAgentTelemetryRead
): WooxDashboardAgentRow {
  const agentId = agent.id;
  const extra = agent.extra ?? {};
  const name = typeof extra.name === 'string' && extra.name.trim() ? extra.name.trim() : agentId;
  const strategy = typeof extra.strategy === 'string' && extra.strategy.trim() ? extra.strategy.trim() : '—';
  const regime = typeof extra.regime === 'string' && extra.regime.trim() ? extra.regime.trim() : 'Any';
  const enabled = agent.enabled !== false;

  const ps = telemetry.paperState as Record<string, unknown> | null;
  const st = telemetry.latestStatus as Record<string, unknown> | null;

  let cash = 0;
  let equity = 0;
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let openPositions = 0;

  const isPaperSpotShape = ps != null && (ps.cashBalance != null || ps.positionQty != null);
  const isHeartbeatShape = ps != null && Array.isArray(ps.positions);

  if (isPaperSpotShape) {
    cash = num(ps.cashBalance);
    equity = num(ps.equity);
    realizedPnl = num(ps.realizedPnl);
    unrealizedPnl = num(ps.unrealizedPnl);
    openPositions = num(ps.positionQty) > 0 ? 1 : 0;
  } else if (isHeartbeatShape) {
    const bal = num(ps.balance);
    cash = bal;
    equity = bal;
    realizedPnl = 0;
    unrealizedPnl = 0;
    openPositions = 0;
  } else {
    const scoreboard = (st?.scoreboard ?? ps) as Record<string, unknown> | undefined;
    if (scoreboard && typeof scoreboard === 'object' && !Array.isArray(scoreboard)) {
      cash = num(scoreboard.cash);
      equity = num(scoreboard.equity);
      realizedPnl = num(scoreboard.realizedPnl);
      unrealizedPnl =
        scoreboard.unrealizedPnl !== undefined && scoreboard.unrealizedPnl !== null
          ? num(scoreboard.unrealizedPnl)
          : 0;
      const positions = (st?.positions ?? ps?.positions) as Record<string, unknown> | undefined;
      if (positions && typeof positions === 'object' && !Array.isArray(positions)) {
        openPositions = Object.keys(positions).filter(
          (k) => k.endsWith('_qty') || (typeof positions[k] === 'object' && positions[k] !== null)
        ).length;
      }
    }
  }

  const pnl = realizedPnl + unrealizedPnl;

  const telemetryAvailable = telemetry.latestStatus != null || telemetry.paperState != null;
  const lastModifiedMs = getWooxTelemetryLastModifiedMs(agentId);

  const runtime = deriveWooxAgentRuntimeStatus(telemetry);
  const derived = enabled ? mapRuntimeToCardStatus(runtime) : 'disabled';
  const status = enabled ? derived : 'disabled';
  const activityStatus = status;

  const lastUpdate = lastModifiedMs != null ? new Date(lastModifiedMs).toISOString() : null;

  return {
    agentId,
    name,
    strategy,
    regime,
    mode: 'paper',
    enabled,
    status,
    telemetryAvailable,
    lastModifiedMs,
    activityStatus,
    category: 'woox',
    openPositions,
    unrealizedPnl,
    realizedPnl,
    pnl,
    cash,
    equity,
    reconciliationOk: true,
    incidents: [],
    lastUpdate
  };
}

const DASHBOARD_TRADES_RESPONSE_CAP = 50;

export interface WooxDashboardTradeRow {
  side: 'buy' | 'sell';
  price: string;
  qty: string;
  fee: string;
  timestamp: number;
  realizedPnl?: string;
}

export interface WooxDashboardAgentDetailResponse {
  agent: {
    agentId: string;
    name: string;
    enabled: boolean;
    status: WooxDashboardAgentRow['status'];
  };
  summary: {
    cash: number;
    equity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    pnl: number;
    openPositions: number;
  };
  metrics: {
    tradeCount: number;
    winCount: number;
    lossCount: number;
    winRate: string;
    avgWin: string;
    avgLoss: string;
  };
  trades: WooxDashboardTradeRow[];
}

function metricNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function metricStr(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '0';
}

function parseTradesFromPaperState(ps: Record<string, unknown> | null): WooxDashboardTradeRow[] {
  if (!ps) return [];
  const raw = ps.trades;
  if (!Array.isArray(raw)) return [];
  const out: WooxDashboardTradeRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const side = t.side === 'buy' || t.side === 'sell' ? t.side : null;
    if (!side) continue;
    const price = typeof t.price === 'string' ? t.price : String(t.price ?? '0');
    const qty = typeof t.qty === 'string' ? t.qty : String(t.qty ?? '0');
    const fee = typeof t.fee === 'string' ? t.fee : String(t.fee ?? '0');
    const ts = t.timestamp;
    const timestamp =
      typeof ts === 'number' && Number.isFinite(ts)
        ? ts
        : typeof ts === 'string' && ts.trim()
          ? Number(ts) || 0
          : 0;
    const row: WooxDashboardTradeRow = { side, price, qty, fee, timestamp };
    if (side === 'sell' && t.realizedPnl != null) {
      row.realizedPnl = typeof t.realizedPnl === 'string' ? t.realizedPnl : String(t.realizedPnl);
    }
    out.push(row);
  }
  return out.length <= DASHBOARD_TRADES_RESPONSE_CAP ? out : out.slice(-DASHBOARD_TRADES_RESPONSE_CAP);
}

function metricsFromPaperState(ps: Record<string, unknown> | null): WooxDashboardAgentDetailResponse['metrics'] {
  if (!ps) {
    return {
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      winRate: '0',
      avgWin: '0',
      avgLoss: '0'
    };
  }
  return {
    tradeCount: metricNum(ps.tradeCount),
    winCount: metricNum(ps.winCount),
    lossCount: metricNum(ps.lossCount),
    winRate: metricStr(ps.winRate),
    avgWin: metricStr(ps.avgWin),
    avgLoss: metricStr(ps.avgLoss)
  };
}

/** Read-only WOO dashboard detail: summary from card row logic + trades/metrics from paper_state.json. */
export function buildWooxDashboardAgentDetail(
  agent: WooRegistryAgent,
  telemetry: WooxAgentTelemetryRead
): WooxDashboardAgentDetailResponse {
  const row = mapWooxAgentToDashboardItem(agent, telemetry);
  const ps = telemetry.paperState as Record<string, unknown> | null;
  return {
    agent: {
      agentId: row.agentId,
      name: row.name,
      enabled: row.enabled,
      status: row.status
    },
    summary: {
      cash: row.cash,
      equity: row.equity,
      realizedPnl: row.realizedPnl,
      unrealizedPnl: row.unrealizedPnl ?? 0,
      pnl: row.pnl,
      openPositions: row.openPositions
    },
    metrics: metricsFromPaperState(ps),
    trades: parseTradesFromPaperState(ps)
  };
}
