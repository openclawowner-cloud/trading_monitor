import fs from 'fs';
import path from 'path';
import type { WooRealRegistryAgent, WooRealAgentTelemetryRead } from '../types';
import { deriveWooRealAgentRuntimeStatus, getWooRealAgentTelemetryBaseDir } from './wooRealTelemetry';

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getLastModifiedMs(agentId: string): number | null {
  const base = getWooRealAgentTelemetryBaseDir(agentId.trim());
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
      // ignore
    }
  }
  return found ? max : null;
}

export function mapWooRealAgentToDashboardItem(
  agent: WooRealRegistryAgent,
  telemetry: WooRealAgentTelemetryRead
) {
  const agentId = agent.id;
  const extra = agent.extra ?? {};
  const name = typeof extra.name === 'string' && extra.name.trim() ? extra.name.trim() : agentId;
  const enabled = agent.enabled !== false;
  const archived = extra.archived === true;
  const ps = telemetry.paperState as Record<string, unknown> | null;
  const st = telemetry.latestStatus as Record<string, unknown> | null;
  const scoreboard = (st?.scoreboard ?? ps) as Record<string, unknown> | undefined;
  const cash = num(scoreboard?.cash);
  const equity = num(scoreboard?.equity);
  const realizedPnl = num(scoreboard?.realizedPnl);
  const unrealizedPnl = num(scoreboard?.unrealizedPnl);
  const pnl = realizedPnl + unrealizedPnl;
  const positions = (st?.positions ?? ps?.positions) as Record<string, unknown> | undefined;
  const openPositions = positions && typeof positions === 'object'
    ? Object.keys(positions).filter(
      (k) => k.endsWith('_qty') || (typeof positions[k] === 'object' && positions[k] !== null)
    ).length
    : 0;
  const lastModifiedMs = getLastModifiedMs(agentId);
  const runtime = deriveWooRealAgentRuntimeStatus(agentId, telemetry);
  const status = archived
    ? 'archived'
    : enabled
      ? runtime === 'unknown'
        ? 'offline'
        : runtime
      : 'disabled';
  return {
    agentId,
    name,
    strategy: typeof extra.strategy === 'string' ? extra.strategy : '—',
    regime: typeof extra.regime === 'string' ? extra.regime : 'Any',
    mode: 'paper',
    enabled,
    status,
    telemetryAvailable: telemetry.latestStatus != null || telemetry.paperState != null,
    lastModifiedMs,
    activityStatus: status,
    category: 'woo_real',
    openPositions,
    unrealizedPnl,
    realizedPnl,
    pnl,
    cash,
    equity,
    reconciliationOk: true,
    incidents: [],
    lastUpdate: lastModifiedMs ? new Date(lastModifiedMs).toISOString() : null
  };
}
