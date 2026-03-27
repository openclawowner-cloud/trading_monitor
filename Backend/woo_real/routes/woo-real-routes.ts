import { Router } from 'express';
import { allowDebugEndpoints } from '../../services/supervisorController';
import { computeChartIndicators, validateCandlesQuery } from '../../services/candlesService';
import { toWooSpotSymbol } from '../../woox/symbol/mapWooxSymbol';
import {
  WOO_REAL_ENABLED,
  WOO_REAL_ENABLE_STAGING_TRADING,
  WOO_REAL_SIGNED_API_CONFIGURED,
  WOO_REAL_TELEMETRY_ROOT
} from '../config';
import { fetchWooPublicCandles } from '../../woox/services/wooPublicCandles';
import { loadWooRealSignedClientFromEnv } from '../services/wooRealSignedClient';
import {
  findWooRealRegistryAgent,
  isWooRealPaperExchangeAllowed,
  readWooRealRegistry,
  updateWooRealAgent
} from '../services/wooRealRegistry';
import {
  getWooRealSupervisorStatus,
  requestWooRealAgentRestart,
  startWooRealSupervisor,
  stopWooRealSupervisor
} from '../services/wooRealSupervisorController';
import { mapWooRealAgentToDashboardItem } from '../services/wooRealDashboardAdapter';
import { deriveWooRealAgentRuntimeStatus, readWooRealAgentTelemetry } from '../services/wooRealTelemetry';
import { hardResetAgentState } from '../../services/agentReset';
import { requestAgentManualSell, setAgentPaused } from '../../services/agentControl';

export const wooRealRoutes = Router();

wooRealRoutes.use((_req, res, next) => {
  if (!WOO_REAL_ENABLED) {
    return res.status(403).json({ ok: false, error: 'WOO Real is disabled' });
  }
  next();
});

wooRealRoutes.get('/capabilities', (_req, res) => {
  res.json({
    enabled: WOO_REAL_ENABLED,
    paper_local: true,
    paper_exchange: WOO_REAL_ENABLE_STAGING_TRADING,
    spot: true,
    perps: false,
    signed_api_configured: WOO_REAL_SIGNED_API_CONFIGURED
  });
});

wooRealRoutes.get('/account/balances', async (req, res) => {
  const client = loadWooRealSignedClientFromEnv();
  if (!client) {
    return res.status(400).json({ ok: false, error: 'WOO Real API key/secret not configured' });
  }
  const token = typeof req.query.token === 'string' ? req.query.token : undefined;
  const result = await client.getBalances(token);
  if (!result.ok) {
    return res.status(502).json({ ok: false, rows: [], error: result.error ?? 'signed_balance_failed' });
  }
  res.json({ ok: true, rows: result.rows });
});

wooRealRoutes.get('/supervisor', async (_req, res) => {
  try {
    const status = await getWooRealSupervisorStatus();
    res.json(status);
  } catch {
    res.status(500).json({ error: 'Failed to read WOO Real supervisor status' });
  }
});

wooRealRoutes.post('/supervisor/start', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    const result = await startWooRealSupervisor();
    res.json(result);
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to start WOO Real supervisor' });
  }
});

wooRealRoutes.post('/supervisor/stop', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    await stopWooRealSupervisor();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to stop WOO Real supervisor' });
  }
});

wooRealRoutes.post('/supervisor/restart/:id', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const agentId = req.params.id?.trim();
  if (!agentId) return res.status(400).json({ ok: false, message: 'Missing agent id' });
  const agent = findWooRealRegistryAgent(agentId);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: agentId });
  try {
    await requestWooRealAgentRestart(agent.id);
    res.json({ ok: true, agentId: agent.id });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to queue restart request' });
  }
});

wooRealRoutes.get('/dashboard-agents', (_req, res) => {
  try {
    const agents = readWooRealRegistry();
    res.json(agents.map((agent) => mapWooRealAgentToDashboardItem(agent, readWooRealAgentTelemetry(agent.id))));
  } catch {
    res.json([]);
  }
});

wooRealRoutes.get('/agents', (_req, res) => {
  try {
    const agents = readWooRealRegistry();
    const items = agents.map((agent) => {
      const telemetry = readWooRealAgentTelemetry(agent.id);
      return {
        agent,
        runtimeStatus: deriveWooRealAgentRuntimeStatus(agent.id, telemetry),
        modeAllowed: isWooRealPaperExchangeAllowed(agent.mode)
      };
    });
    res.json({ agents: items });
  } catch {
    res.json({ agents: [] });
  }
});

wooRealRoutes.get('/agent/:id/reconciliation', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  res.json({
    positionOk: true,
    cashOk: true,
    pnlOk: true,
    checks: [{ name: 'woo_real_reconciliation', ok: true, detail: 'paper mode baseline' }],
    mismatchDetails: []
  });
});

wooRealRoutes.get('/agent/:id', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  const telemetry = readWooRealAgentTelemetry(agent.id);
  res.json({
    agent,
    latestStatus: telemetry.latestStatus,
    paperState: telemetry.paperState,
    runtimeStatus: deriveWooRealAgentRuntimeStatus(agent.id, telemetry),
    modeAllowed: isWooRealPaperExchangeAllowed(agent.mode)
  });
});

wooRealRoutes.post('/agent/:id/heartbeat', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: agent.id, receivedAt: new Date().toISOString(), payload: req.body ?? {} });
});

wooRealRoutes.post('/agent/:id/enable', (req, res) => {
  const ok = updateWooRealAgent(req.params.id, { enabled: true });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: true });
});

wooRealRoutes.post('/agent/:id/disable', (req, res) => {
  const ok = updateWooRealAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: false });
});

wooRealRoutes.post('/agent/:id/reset', (req, res) => {
  const ok = updateWooRealAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, reset: 'soft', enabled: false });
});

wooRealRoutes.post('/agent/:id/reset-hard', (req, res) => {
  const ok = updateWooRealAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const hardReset = hardResetAgentState(WOO_REAL_TELEMETRY_ROOT, req.params.id);
  res.json({
    ok: hardReset.ok,
    agentId: req.params.id,
    reset: 'hard',
    enabled: false,
    removedFiles: hardReset.removedFiles
  });
});

wooRealRoutes.post('/agent/:id/validate', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({
    ok: true,
    agentId: agent.id,
    validation: {
      reconciliation: {
        positionOk: true,
        cashOk: true,
        pnlOk: true,
        checks: [{ name: 'woo_real_reconciliation', ok: true, detail: 'paper mode baseline' }],
        mismatchDetails: []
      }
    }
  });
});

wooRealRoutes.post('/agent/:id/archive', (req, res) => {
  const ok = updateWooRealAgent(req.params.id, { archived: true, enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, archived: true });
});

wooRealRoutes.post('/agent/:id/pause', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const paused = Boolean((req.body as { paused?: unknown } | undefined)?.paused);
  const control = setAgentPaused(WOO_REAL_TELEMETRY_ROOT, agent.id, paused);
  res.json({ ok: true, agentId: agent.id, paused: Boolean(control.paused) });
});

wooRealRoutes.post('/agent/:id/manual-sell', (req, res) => {
  const agent = findWooRealRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  requestAgentManualSell(WOO_REAL_TELEMETRY_ROOT, agent.id);
  res.json({ ok: true, agentId: agent.id, manualSellQueued: true });
});

wooRealRoutes.get('/candles', async (req, res) => {
  const q = validateCandlesQuery(
    String(req.query.symbol ?? ''),
    String(req.query.interval ?? '5m'),
    req.query.limit != null ? String(req.query.limit) : undefined
  );
  if (q.ok === false) {
    return res.status(q.status).json({ error: q.error });
  }
  const mapping = toWooSpotSymbol(q.symbol);
  if (!mapping) {
    return res.status(400).json({ error: 'Unrecognized symbol for WOO Real spot chart (e.g. BTCUSDT)' });
  }
  try {
    const candles = await fetchWooPublicCandles(mapping.wooSymbol, q.interval, q.limit);
    const indicators = computeChartIndicators(candles);
    res.set('Cache-Control', 'private, max-age=10');
    res.json({
      symbol: q.symbol,
      interval: q.interval,
      candles,
      indicators,
      venue: 'woox',
      wooSymbol: mapping.wooSymbol
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch WOO Real candles';
    res.status(502).json({ error: msg });
  }
});
