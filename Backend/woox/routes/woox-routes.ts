import { Router } from 'express';
import { allowDebugEndpoints } from '../../services/supervisorController';
import { defaultWooXRestClient } from '../client/WooXRestClient';
import {
  WOOX_API_BASE,
  WOOX_ENABLE_STAGING_TRADING,
  WOOX_SIGNED_API_CONFIGURED
} from '../config';
import { fromWooSymbol, toWooSpotSymbol } from '../symbol/mapWooxSymbol';
import { extractRulesFromInstrument } from '../validation/instrumentRules';
import {
  findWooxRegistryAgent,
  isPaperExchangeAllowed,
  readWooxRegistry
} from '../services/wooxRegistry';
import {
  getWooxSupervisorStatus,
  requestWooxAgentRestart,
  startWooxSupervisor,
  stopWooxSupervisor
} from '../services/wooxSupervisorController';
import {
  buildWooxDashboardAgentDetail,
  mapWooxAgentToDashboardItem
} from '../services/wooxDashboardAdapter';
import {
  deriveWooxAgentRuntimeStatus,
  readWooxAgentTelemetry
} from '../services/wooxTelemetry';
import type { WooAgentListItem, WooCapabilitiesResponse, WooSymbolMappingResult } from '../types';
import { requestAgentManualSell, setAgentPaused } from '../../services/agentControl';
import { WOOX_TELEMETRY_ROOT } from '../config';

export const wooxRoutes = Router();

/** Map query param to WOO listing symbol (SPOT_* or PERP_*), else compact → SPOT. */
function resolveInstrumentMapping(param: string): WooSymbolMappingResult | null {
  const decoded = decodeURIComponent(param.trim());
  if (!decoded) return null;
  return fromWooSymbol(decoded) ?? toWooSpotSymbol(decoded);
}

wooxRoutes.get('/capabilities', (_req, res) => {
  const body: WooCapabilitiesResponse = {
    paper_local: true,
    paper_exchange: WOOX_ENABLE_STAGING_TRADING,
    spot: true,
    perps: false,
    signed_api_configured: WOOX_SIGNED_API_CONFIGURED
  };
  res.json(body);
});

/** Debug: list instruments (optional ?symbol=SPOT_BTC_USDT, ?limit=n cap default 200). */
wooxRoutes.get('/instruments', async (req, res) => {
  try {
    const symbol =
      typeof req.query.symbol === 'string' && req.query.symbol.trim()
        ? req.query.symbol.trim()
        : undefined;
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
    const cap = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;
    const result = await defaultWooXRestClient.getInstruments(symbol ? { symbol } : undefined);
    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        count: 0,
        rows: [],
        error: result.error,
        apiBase: WOOX_API_BASE
      });
    }
    const rows = symbol ? result.rows : result.rows.slice(0, cap);
    res.json({
      ok: true,
      count: rows.length,
      rows,
      timestamp: result.timestamp,
      apiBase: WOOX_API_BASE
    });
  } catch {
    res.status(500).json({ ok: false, count: 0, rows: [], error: 'unexpected_error' });
  }
});

/** Debug: single instrument + derived rules (symbol may be BTCUSDT, BTC/USDT, or SPOT_BTC_USDT). */
wooxRoutes.get('/instrument/:symbol', async (req, res) => {
  try {
    const mapping = resolveInstrumentMapping(req.params.symbol || '');
    if (!mapping) {
      return res.status(400).json({ ok: false, error: 'Unrecognized symbol format' });
    }
    const result = await defaultWooXRestClient.getInstruments({ symbol: mapping.wooSymbol });
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error, mapping });
    }
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Instrument not found', mapping });
    }
    const rules = extractRulesFromInstrument(row);
    res.json({ ok: true, mapping, instrument: row, rules });
  } catch {
    res.status(500).json({ ok: false, error: 'unexpected_error' });
  }
});

/** Debug: show mapping helpers for a path segment (encode / as %2F). */
wooxRoutes.get('/symbol-map/:symbol', (req, res) => {
  const raw = decodeURIComponent((req.params.symbol || '').trim());
  if (!raw) {
    return res.status(400).json({ ok: false, error: 'empty_symbol' });
  }
  res.json({
    ok: true,
    input: raw,
    toSpot: toWooSpotSymbol(raw),
    fromWoo: fromWooSymbol(raw)
  });
});

/** Chart candles: GET /api/woox/candles (registered on app in Backend/server.ts). */

wooxRoutes.get('/supervisor', async (_req, res) => {
  try {
    const status = await getWooxSupervisorStatus();
    res.json(status);
  } catch {
    res.status(500).json({ error: 'Failed to read WOO supervisor status' });
  }
});

wooxRoutes.post('/supervisor/start', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await startWooxSupervisor();
    res.json({ ok: result.ok, message: result.message });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to start WOO supervisor' });
  }
});

wooxRoutes.post('/supervisor/stop', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    await stopWooxSupervisor();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to stop WOO supervisor' });
  }
});

wooxRoutes.post('/supervisor/restart/:id', async (req, res) => {
  if (!allowDebugEndpoints(req as any)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  const agentId = req.params.id?.trim();
  if (!agentId) {
    return res.status(400).json({ ok: false, message: 'Missing agent id' });
  }
  const agent = findWooxRegistryAgent(agentId);
  if (!agent) {
    return res.status(404).json({ ok: false, error: 'Agent not found', id: agentId });
  }
  try {
    await requestWooxAgentRestart(agent.id);
    res.json({ ok: true, agentId: agent.id });
  } catch {
    res.status(500).json({ ok: false, message: 'Failed to queue restart request' });
  }
});

/** Dashboard cards: same field shape as GET /api/trading/live/agents rows (WOO telemetry only). */
wooxRoutes.get('/dashboard-agents', (_req, res) => {
  try {
    const agents = readWooxRegistry();
    const rows = agents.map((agent) => {
      const telemetry = readWooxAgentTelemetry(agent.id);
      return mapWooxAgentToDashboardItem(agent, telemetry);
    });
    res.json(rows);
  } catch {
    res.json([]);
  }
});

/** Read-only: one WOO dashboard agent with summary, paper metrics, last 50 trades. */
wooxRoutes.get('/dashboard-agent/:agentId', (req, res) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId.trim() : '';
  if (!agentId) {
    return res.status(400).json({ error: 'Missing agent id' });
  }
  const agent = findWooxRegistryAgent(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found', id: agentId });
  }
  try {
    const telemetry = readWooxAgentTelemetry(agent.id);
    const detail = buildWooxDashboardAgentDetail(agent, telemetry);
    res.set('Cache-Control', 'private, no-store');
    res.json(detail);
  } catch {
    res.status(500).json({ error: 'Failed to build dashboard detail' });
  }
});

wooxRoutes.get('/agents', (_req, res) => {
  try {
    const agents = readWooxRegistry();
    const items: WooAgentListItem[] = agents.map((agent) => {
      const telemetry = readWooxAgentTelemetry(agent.id);
      const runtimeStatus = deriveWooxAgentRuntimeStatus(telemetry);
      const modeAllowed = isPaperExchangeAllowed(agent.mode);
      return { agent, runtimeStatus, modeAllowed };
    });
    res.json({ agents: items });
  } catch {
    res.json({ agents: [] });
  }
});

wooxRoutes.get('/agent/:id', (req, res) => {
  const agent = findWooxRegistryAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found', id: req.params.id });
  }
  const telemetry = readWooxAgentTelemetry(agent.id);
  const runtimeStatus = deriveWooxAgentRuntimeStatus(telemetry);
  const modeAllowed = isPaperExchangeAllowed(agent.mode);
  res.json({
    agent,
    latestStatus: telemetry.latestStatus,
    paperState: telemetry.paperState,
    runtimeStatus,
    modeAllowed
  });
});

wooxRoutes.post('/agent/:id/pause', (req, res) => {
  const agent = findWooxRegistryAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  }
  const paused = Boolean((req.body as { paused?: unknown } | undefined)?.paused);
  const control = setAgentPaused(WOOX_TELEMETRY_ROOT, agent.id, paused);
  res.json({ ok: true, agentId: agent.id, paused: Boolean(control.paused) });
});

wooxRoutes.post('/agent/:id/manual-sell', (req, res) => {
  const agent = findWooxRegistryAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ ok: false, error: 'Agent not found', id: req.params.id });
  }
  requestAgentManualSell(WOOX_TELEMETRY_ROOT, agent.id);
  res.json({ ok: true, agentId: agent.id, manualSellQueued: true });
});
