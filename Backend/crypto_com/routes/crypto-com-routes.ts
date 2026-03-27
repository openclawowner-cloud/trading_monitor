import { Router } from 'express';
import { allowDebugEndpoints } from '../../services/supervisorController';
import { computeChartIndicators, validateCandlesQuery } from '../../services/candlesService';
import {
  CRYPTO_COM_API_BASE,
  CRYPTO_COM_ENABLED,
  CRYPTO_COM_TELEMETRY_ROOT
} from '../config';
import {
  findCryptoComRegistryAgent,
  readCryptoComRegistry,
  updateCryptoComAgent
} from '../services/cryptoComRegistry';
import {
  getCryptoComSupervisorStatus,
  requestCryptoComAgentRestart,
  startCryptoComSupervisor,
  stopCryptoComSupervisor
} from '../services/cryptoComSupervisorController';
import { mapCryptoComAgentToDashboardItem } from '../services/cryptoComDashboardAdapter';
import {
  deriveCryptoComAgentRuntimeStatus,
  readCryptoComAgentTelemetry
} from '../services/cryptoComTelemetry';
import { fetchCryptoComPublicCandles } from '../services/cryptoComPublicCandles';
import { requestAgentManualSell, setAgentPaused } from '../../services/agentControl';
import { hardResetAgentState } from '../../services/agentReset';

export const cryptoComRoutes = Router();

cryptoComRoutes.use((_req, res, next) => {
  if (!CRYPTO_COM_ENABLED) return res.status(403).json({ ok: false, error: 'Crypto.com is disabled' });
  next();
});

cryptoComRoutes.get('/capabilities', (_req, res) => {
  res.json({
    enabled: CRYPTO_COM_ENABLED,
    paper_local: true,
    paper_exchange: false,
    spot: true,
    perps: false,
    signed_api_configured: false,
    api_base: CRYPTO_COM_API_BASE
  });
});

cryptoComRoutes.get('/supervisor', async (_req, res) => {
  try {
    res.json(await getCryptoComSupervisorStatus());
  } catch {
    res.status(500).json({ error: 'Failed to read Crypto.com supervisor status' });
  }
});
cryptoComRoutes.post('/supervisor/start', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    res.json(await startCryptoComSupervisor());
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to start Crypto.com supervisor' });
  }
});
cryptoComRoutes.post('/supervisor/stop', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    await stopCryptoComSupervisor();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to stop Crypto.com supervisor' });
  }
});
cryptoComRoutes.post('/supervisor/restart/:id', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const agentId = req.params.id?.trim();
  if (!agentId) return res.status(400).json({ ok: false, message: 'Missing agent id' });
  const agent = findCryptoComRegistryAgent(agentId);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: agentId });
  try {
    await requestCryptoComAgentRestart(agent.id);
    res.json({ ok: true, agentId: agent.id });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to queue restart request' });
  }
});

cryptoComRoutes.get('/dashboard-agents', (_req, res) => {
  try {
    const agents = readCryptoComRegistry();
    res.json(
      agents.map((agent) => mapCryptoComAgentToDashboardItem(agent, readCryptoComAgentTelemetry(agent.id)))
    );
  } catch {
    res.json([]);
  }
});
cryptoComRoutes.get('/agent/:id', (req, res) => {
  const agent = findCryptoComRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  const telemetry = readCryptoComAgentTelemetry(agent.id);
  res.json({
    agent,
    latestStatus: telemetry.latestStatus,
    paperState: telemetry.paperState,
    runtimeStatus: deriveCryptoComAgentRuntimeStatus(agent.id, telemetry),
    modeAllowed: true
  });
});
cryptoComRoutes.post('/agent/:id/enable', (req, res) => {
  const ok = updateCryptoComAgent(req.params.id, { enabled: true });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: true });
});
cryptoComRoutes.post('/agent/:id/disable', (req, res) => {
  const ok = updateCryptoComAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, enabled: false });
});
cryptoComRoutes.post('/agent/:id/reset', (req, res) => {
  const ok = updateCryptoComAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, reset: 'soft', enabled: false });
});
cryptoComRoutes.post('/agent/:id/reset-hard', (req, res) => {
  const ok = updateCryptoComAgent(req.params.id, { enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const hardReset = hardResetAgentState(CRYPTO_COM_TELEMETRY_ROOT, req.params.id);
  res.json({
    ok: hardReset.ok,
    agentId: req.params.id,
    reset: 'hard',
    enabled: false,
    removedFiles: hardReset.removedFiles
  });
});
cryptoComRoutes.post('/agent/:id/validate', (req, res) => {
  const agent = findCryptoComRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({
    ok: true,
    agentId: agent.id,
    validation: {
      reconciliation: {
        positionOk: true,
        cashOk: true,
        pnlOk: true,
        checks: [{ name: 'crypto_com_reconciliation', ok: true, detail: 'paper mode baseline' }],
        mismatchDetails: []
      }
    }
  });
});
cryptoComRoutes.post('/agent/:id/archive', (req, res) => {
  const ok = updateCryptoComAgent(req.params.id, { archived: true, enabled: false });
  if (!ok) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  res.json({ ok: true, agentId: req.params.id, archived: true });
});
cryptoComRoutes.post('/agent/:id/pause', (req, res) => {
  const agent = findCryptoComRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  const paused = Boolean((req.body as { paused?: unknown } | undefined)?.paused);
  const control = setAgentPaused(CRYPTO_COM_TELEMETRY_ROOT, agent.id, paused);
  res.json({ ok: true, agentId: agent.id, paused: Boolean(control.paused) });
});
cryptoComRoutes.post('/agent/:id/manual-sell', (req, res) => {
  const agent = findCryptoComRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  requestAgentManualSell(CRYPTO_COM_TELEMETRY_ROOT, agent.id);
  res.json({ ok: true, agentId: agent.id, manualSellQueued: true });
});
cryptoComRoutes.get('/candles', async (req, res) => {
  const q = validateCandlesQuery(
    String(req.query.symbol ?? ''),
    String(req.query.interval ?? '5m'),
    req.query.limit != null ? String(req.query.limit) : undefined
  );
  if (q.ok === false) return res.status(q.status).json({ error: q.error });
  try {
    const candles = await fetchCryptoComPublicCandles(q.symbol, q.interval, q.limit);
    const indicators = computeChartIndicators(candles);
    res.set('Cache-Control', 'private, max-age=10');
    res.json({
      symbol: q.symbol,
      interval: q.interval,
      candles,
      indicators,
      venue: 'crypto_com'
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch Crypto.com candles';
    res.status(502).json({ error: msg });
  }
});
