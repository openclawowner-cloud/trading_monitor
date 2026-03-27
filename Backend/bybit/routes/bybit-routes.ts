import { Router } from 'express';
import { allowDebugEndpoints } from '../../services/supervisorController';
import { computeChartIndicators, validateCandlesQuery } from '../../services/candlesService';
import { BYBIT_API_BASE, BYBIT_ENABLED } from '../config';
import {
  findBybitRegistryAgent,
  readBybitRegistry,
  updateBybitAgent
} from '../services/bybitRegistry';
import {
  getBybitSupervisorStatus,
  requestBybitAgentRestart,
  startBybitSupervisor,
  stopBybitSupervisor
} from '../services/bybitSupervisorController';
import { mapBybitAgentToDashboardItem } from '../services/bybitDashboardAdapter';
import { deriveBybitAgentRuntimeStatus, readBybitAgentTelemetry } from '../services/bybitTelemetry';
import { fetchBybitPublicCandles } from '../services/bybitPublicCandles';
import { requestAgentManualSell, setAgentPaused } from '../../services/agentControl';
import { BYBIT_TELEMETRY_ROOT } from '../config';
import { hardResetAgentState } from '../../services/agentReset';

export const bybitRoutes = Router();

bybitRoutes.use((_req, res, next) => {
  if (!BYBIT_ENABLED) return res.status(403).json({ ok: false, error: 'Bybit is disabled' });
  next();
});

bybitRoutes.get('/capabilities', (_req, res) => {
  res.json({
    enabled: BYBIT_ENABLED,
    paper_local: true,
    paper_exchange: false,
    spot: true,
    perps: false,
    signed_api_configured: false,
    api_base: BYBIT_API_BASE
  });
});

bybitRoutes.get('/supervisor', async (_req, res) => {
  try {
    res.json(await getBybitSupervisorStatus());
  } catch {
    res.status(500).json({ error: 'Failed to read Bybit supervisor status' });
  }
});
bybitRoutes.post('/supervisor/start', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    res.json(await startBybitSupervisor());
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to start Bybit supervisor' });
  }
});
bybitRoutes.post('/supervisor/stop', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    await stopBybitSupervisor();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to stop Bybit supervisor' });
  }
});
bybitRoutes.post('/supervisor/restart/:id', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const agentId = req.params.id?.trim();
  if (!agentId) return res.status(400).json({ ok: false, message: 'Missing agent id' });
  const agent = findBybitRegistryAgent(agentId);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: agentId });
  try {
    await requestBybitAgentRestart(agent.id);
    res.json({ ok: true, agentId: agent.id });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to queue restart request' });
  }
});

bybitRoutes.get('/dashboard-agents', (_req, res) => {
  try {
    const agents = readBybitRegistry();
    res.json(agents.map((agent) => mapBybitAgentToDashboardItem(agent, readBybitAgentTelemetry(agent.id))));
  } catch {
    res.json([]);
  }
});
bybitRoutes.get('/agents', (_req, res) => {
  try {
    const agents = readBybitRegistry();
    res.json({
      agents: agents.map((agent) => {
        const telemetry = readBybitAgentTelemetry(agent.id);
        return {
          agent,
          runtimeStatus: deriveBybitAgentRuntimeStatus(agent.id, telemetry),
          modeAllowed: true
        };
      })
    });
  } catch {
    res.json({ agents: [] });
  }
});

bybitRoutes.get('/agent/:id', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  const telemetry = readBybitAgentTelemetry(agent.id);
  res.json({
    agent,
    latestStatus: telemetry.latestStatus,
    paperState: telemetry.paperState,
    runtimeStatus: deriveBybitAgentRuntimeStatus(agent.id, telemetry),
    modeAllowed: true
  });
});
bybitRoutes.get('/agent/:id/reconciliation', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  res.json({
    positionOk: true,
    cashOk: true,
    pnlOk: true,
    checks: [{ name: 'bybit_reconciliation', ok: true, detail: 'paper mode baseline' }],
    mismatchDetails: []
  });
});
bybitRoutes.post('/agent/:id/heartbeat', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: agent.id, receivedAt: new Date().toISOString(), payload: req.body ?? {} });
});
bybitRoutes.post('/agent/:id/enable', (req, res) => {
  const ok = updateBybitAgent(req.params.id, { enabled: true });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: true });
});
bybitRoutes.post('/agent/:id/disable', (req, res) => {
  const ok = updateBybitAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: false });
});
bybitRoutes.post('/agent/:id/reset', (req, res) => {
  const ok = updateBybitAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, reset: 'soft', enabled: false });
});
bybitRoutes.post('/agent/:id/reset-hard', (req, res) => {
  const ok = updateBybitAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const hardReset = hardResetAgentState(BYBIT_TELEMETRY_ROOT, req.params.id);
  res.json({
    ok: hardReset.ok,
    agentId: req.params.id,
    reset: 'hard',
    enabled: false,
    removedFiles: hardReset.removedFiles
  });
});
bybitRoutes.post('/agent/:id/validate', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({
    ok: true,
    agentId: agent.id,
    validation: {
      reconciliation: {
        positionOk: true,
        cashOk: true,
        pnlOk: true,
        checks: [{ name: 'bybit_reconciliation', ok: true, detail: 'paper mode baseline' }],
        mismatchDetails: []
      }
    }
  });
});
bybitRoutes.post('/agent/:id/archive', (req, res) => {
  const ok = updateBybitAgent(req.params.id, { archived: true, enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, archived: true });
});

bybitRoutes.post('/agent/:id/pause', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const paused = Boolean((req.body as { paused?: unknown } | undefined)?.paused);
  const control = setAgentPaused(BYBIT_TELEMETRY_ROOT, agent.id, paused);
  res.json({ ok: true, agentId: agent.id, paused: Boolean(control.paused) });
});

bybitRoutes.post('/agent/:id/manual-sell', (req, res) => {
  const agent = findBybitRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  requestAgentManualSell(BYBIT_TELEMETRY_ROOT, agent.id);
  res.json({ ok: true, agentId: agent.id, manualSellQueued: true });
});

bybitRoutes.get('/candles', async (req, res) => {
  const q = validateCandlesQuery(
    String(req.query.symbol ?? ''),
    String(req.query.interval ?? '5m'),
    req.query.limit != null ? String(req.query.limit) : undefined
  );
  if (q.ok === false) return res.status(q.status).json({ error: q.error });
  try {
    const candles = await fetchBybitPublicCandles(q.symbol, q.interval, q.limit);
    const indicators = computeChartIndicators(candles);
    res.set('Cache-Control', 'private, max-age=10');
    res.json({
      symbol: q.symbol,
      interval: q.interval,
      candles,
      indicators,
      venue: 'bybit'
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch Bybit candles';
    res.status(502).json({ error: msg });
  }
});
