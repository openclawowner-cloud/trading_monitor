import { Router } from 'express';
import { getCategorizedAgents, updateAgent, archiveAgent, readRegistry } from '../services/agent-registry';
import { runReconciliation } from '../services/reconciliationService';
import { readAgentTelemetry, getTelemetryFileTimestamps } from '../adapters/telemetryReader';
import { buildIncidentsForAgent } from '../services/incidents';
import { STALE_THRESHOLD_MINUTES } from '../utils/config';
import {
  startSupervisor,
  stopSupervisor,
  requestAgentRestart,
  getSupervisorStatus,
  allowDebugEndpoints
} from '../services/supervisorController';
import { backfillTradesPnL } from '../utils/backfillTradesPnL';

export const tradingRoutes = Router();

const STALE_MS = STALE_THRESHOLD_MINUTES * 60 * 1000;

// Supervisor routes first so they are never shadowed by parametric routes
tradingRoutes.get('/supervisor/ping', (_req, res) => res.json({ ok: true, msg: 'pong' }));
tradingRoutes.get('/supervisor/status', async (_req, res) => {
  try {
    const status = await getSupervisorStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get supervisor status' });
  }
});

tradingRoutes.post('/supervisor/start', async (req, res) => {
  if (!allowDebugEndpoints(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await startSupervisor();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Failed to start supervisor' });
  }
});

tradingRoutes.post('/supervisor/stop', async (req, res) => {
  if (!allowDebugEndpoints(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await stopSupervisor();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to stop supervisor' });
  }
});

tradingRoutes.post('/supervisor/restart/:agentId', async (req, res) => {
  if (!allowDebugEndpoints(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { agentId } = req.params;
  try {
    await requestAgentRestart(agentId);
    res.json({ ok: true, agentId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to request agent restart' });
  }
});

function deriveStatus(agentId: string, telemetry: ReturnType<typeof readAgentTelemetry>, lastModifiedMs: number | null): 'running' | 'stale' | 'offline' | 'error' | 'disabled' | 'archived' {
  const agentFromRegistry = readRegistry().find((a: Record<string, unknown>) => a.id === agentId) as Record<string, unknown> | undefined;
  const enabled = agentFromRegistry?.enabled !== false;
  if (agentFromRegistry?.archived) return 'archived';
  if (!enabled) return 'disabled';
  if (!telemetry?.status && !telemetry?.state) return 'offline';
  if (lastModifiedMs === null) return 'offline';
  if (Date.now() - lastModifiedMs > STALE_MS) return 'stale';
  return 'running';
}

tradingRoutes.get('/agents', (_req, res) => {
  const agents = getCategorizedAgents({ includeTestAgents: false });
  const enrichedAgents = agents.map((agent: Record<string, unknown>) => {
    const agentId = String(agent.id);
    const telemetry = readAgentTelemetry(agentId);
    const { statusMs, stateMs } = getTelemetryFileTimestamps(agentId);
    const lastModifiedMs = statusMs ?? stateMs ?? null;
    const status = deriveStatus(agentId, telemetry, lastModifiedMs);

    let pnl = 0;
    let unrealizedPnl: number | undefined;
    let openPositions = 0;
    let cash = 0;
    let equity = 0;
    let reconciliationOk = true;
    let mismatchDetails: Array<{ symbol: string }> = [];

    if (telemetry?.status || telemetry?.state) {
      const scoreboard = (telemetry.status?.scoreboard || telemetry.state) as Record<string, unknown>;
      pnl = Number(scoreboard?.realizedPnl ?? 0);
      unrealizedPnl = scoreboard?.unrealizedPnl !== undefined ? Number(scoreboard.unrealizedPnl) : undefined;
      cash = Number(scoreboard?.cash ?? 0);
      equity = Number(scoreboard?.equity ?? 0);
      const positions = (telemetry.status?.positions || telemetry.state?.positions || {}) as Record<string, unknown>;
      openPositions = Object.keys(positions).filter((k) => k.endsWith('_qty') || (typeof positions[k] === 'object' && positions[k] !== null)).length;
      const recon = runReconciliation(agentId, telemetry.status, telemetry.state);
      reconciliationOk = recon.positionOk && recon.cashOk && recon.pnlOk;
      mismatchDetails = recon.mismatchDetails?.map((m) => ({ symbol: m.symbol })) ?? [];
    }

    const incidents = buildIncidentsForAgent(agentId, {
      hasTelemetry: !!telemetry?.status || !!telemetry?.state,
      status,
      reconciliationOk,
      lastModifiedMs,
      staleThresholdMs: STALE_MS,
      mismatchDetails
    });

    return {
      agentId,
      name: agent.name ?? agentId,
      strategy: agent.strategy ?? '—',
      regime: agent.regime ?? 'Any',
      mode: agent.mode ?? 'paper',
      enabled: agent.enabled !== false,
      status,
      telemetryAvailable: !!telemetry?.status || !!telemetry?.state,
      lastModifiedMs,
      activityStatus: status,
      category: agent.category ?? 'default',
      openPositions,
      unrealizedPnl,
      realizedPnl: pnl,
      pnl,
      cash,
      equity,
      reconciliationOk,
      incidents,
      lastUpdate: lastModifiedMs ? new Date(lastModifiedMs).toISOString() : null
    };
  });
  res.json(enrichedAgents);
});

tradingRoutes.get('/agent/:agentId', (req, res) => {
  const { agentId } = req.params;
  const telemetry = readAgentTelemetry(agentId);
  if (!telemetry) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const recon = runReconciliation(agentId, telemetry.status, telemetry.state);
  const registryAgent = readRegistry().find((a: Record<string, unknown>) => a.id === agentId) as Record<string, unknown> | undefined;
  const rawState = telemetry.state as Record<string, unknown> | null;
  const stateForResponse =
    rawState && Array.isArray(rawState.trades)
      ? { ...rawState, trades: backfillTradesPnL(rawState.trades) }
      : telemetry.state;
  res.json({
    status: telemetry.status,
    state: stateForResponse,
    reconciliation: {
      positionOk: recon.positionOk,
      cashOk: recon.cashOk,
      pnlOk: recon.pnlOk,
      checks: recon.checks,
      mismatchDetails: recon.mismatchDetails
    },
    agent: registryAgent ?? { id: agentId }
  });
});

tradingRoutes.get('/agent/:agentId/reconciliation', (req, res) => {
  const { agentId } = req.params;
  const telemetry = readAgentTelemetry(agentId);
  if (!telemetry) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const result = runReconciliation(agentId, telemetry.status, telemetry.state);
  res.json(result);
});

tradingRoutes.post('/agent/:agentId/heartbeat', (req, res) => {
  const { agentId } = req.params;
  const payload = req.body as Record<string, unknown>;
  // Idempotent: just acknowledge. Could persist to a heartbeat store later.
  res.json({ ok: true, agentId, receivedAt: new Date().toISOString(), payload: payload ?? {} });
});

tradingRoutes.post('/agent/:agentId/enable', (req, res) => {
  const { agentId } = req.params;
  updateAgent(agentId, { enabled: true });
  res.json({ ok: true, agentId, enabled: true });
});

tradingRoutes.post('/agent/:agentId/disable', (req, res) => {
  const { agentId } = req.params;
  updateAgent(agentId, { enabled: false });
  res.json({ ok: true, agentId, enabled: false });
});

tradingRoutes.post('/agent/:agentId/reset', (req, res) => {
  const { agentId } = req.params;
  updateAgent(agentId, { enabled: false });
  res.json({ ok: true, agentId, reset: true, enabled: false });
});

tradingRoutes.post('/agent/:agentId/validate', (req, res) => {
  const { agentId } = req.params;
  const telemetry = readAgentTelemetry(agentId);
  if (!telemetry) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const recon = runReconciliation(agentId, telemetry.status, telemetry.state);
  res.json({ ok: true, agentId, validation: { reconciliation: recon } });
});

tradingRoutes.post('/agent/:agentId/archive', (req, res) => {
  const { agentId } = req.params;
  archiveAgent(agentId);
  res.json({ ok: true, agentId, archived: true });
});
