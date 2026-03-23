import fs from 'fs';
import path from 'path';
import {
  PROJECT_ROOT,
  WOOX_TELEMETRY_MIRROR_FROM_TRADING_LIVE,
  WOOX_TELEMETRY_ROOT
} from '../config';
import type {
  WooAgentRuntimeStatus,
  WooLatestStatus,
  WooPaperState,
  WooxAgentTelemetryRead
} from '../types';
import { isWooxSupervisorPidAliveSync } from './wooxSupervisorController';

/** Set at read time so runtime derivation can resolve agent.pid without route changes. */
type WooxTelemetryReadInternal = WooxAgentTelemetryRead & { registryAgentId?: string };

/** Max age of status timestamp before we treat the agent as stale. */
export const STALE_THRESHOLD_MS = 30_000;

/** Mirrored `trading-live` agents (e.g. 5m cadence) — avoid marking stale between cycles. */
const MIRROR_AGENT_STALE_THRESHOLD_MS = 360_000;

/**
 * WOO supervisor agents that only refresh JSON every few minutes (`intervalSec` in registry).
 * Must be > largest such interval (e.g. 300s) so cards stay "running" between cycles.
 */
const WOO_SLOW_TELEMETRY_AGENT_IDS = new Set<string>(['WOO_CC_5M_BB_RSI']);
const WOO_SLOW_TELEMETRY_STALE_THRESHOLD_MS = 360_000;

export function maybeReadJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asStatusRecord(data: unknown): WooLatestStatus | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as WooLatestStatus;
}

function asPaperRecord(data: unknown): WooPaperState | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as WooPaperState;
}

/**
 * Picks first usable epoch ms from common field names (number or numeric string).
 */
export function extractTelemetryTimestamp(record: Record<string, unknown> | null): number | null {
  if (!record) return null;
  const keys = ['timestamp', 'updatedAt', 'ts'] as const;
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function isSafeRelativeAgentId(id: string): boolean {
  if (!id) return false;
  return !id.includes('..') && !id.includes('/') && !id.includes('\\');
}

/** Telemetry + pid files for this registry agent (WOO tree or mirrored `trading-live/`). */
export function getWooxAgentTelemetryBaseDir(agentId: string): string {
  const id = agentId.trim();
  if (!isSafeRelativeAgentId(id)) {
    return path.join(WOOX_TELEMETRY_ROOT, id);
  }
  // WOO-native strategy: never read `trading-live/CC_5M_BB_RSI` (Binance paper bot).
  if (id === 'WOO_CC_5M_BB_RSI') {
    return path.join(WOOX_TELEMETRY_ROOT, id);
  }
  if (WOOX_TELEMETRY_MIRROR_FROM_TRADING_LIVE.has(id)) {
    return path.join(PROJECT_ROOT, 'trading-live', id);
  }
  return path.join(WOOX_TELEMETRY_ROOT, id);
}

export function readWooxAgentTelemetry(agentId: string): WooxAgentTelemetryRead {
  const safeId = agentId.trim();
  if (!isSafeRelativeAgentId(safeId)) {
    return { latestStatus: null, paperState: null, registryAgentId: safeId } as WooxAgentTelemetryRead;
  }
  const base = getWooxAgentTelemetryBaseDir(safeId);
  const statusPath = path.join(base, 'latest_status.json');
  const statePath = path.join(base, 'paper_state.json');

  const statusRaw = maybeReadJson(statusPath);
  const stateRaw = maybeReadJson(statePath);
  let latestStatus = asStatusRecord(statusRaw);
  let paperState = asPaperRecord(stateRaw);

  // Prevent Binance CC_5M_BB_RSI files (wrong folder, symlink, or old mirror) from powering the WOO-native card.
  if (safeId === 'WOO_CC_5M_BB_RSI' && latestStatus) {
    const aid = typeof latestStatus.agentId === 'string' ? latestStatus.agentId.trim() : '';
    if (aid === 'CC_5M_BB_RSI') {
      latestStatus = null;
      paperState = null;
    }
  }

  return { latestStatus, paperState, registryAgentId: safeId } as WooxAgentTelemetryRead;
}

function isPidAliveLocal(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveAgentDirForPid(
  telemetry: WooxAgentTelemetryRead,
  latestStatus: WooLatestStatus
): string | undefined {
  const reg = (telemetry as WooxTelemetryReadInternal).registryAgentId?.trim();
  if (reg && isSafeRelativeAgentId(reg)) return reg;
  const fromStatus = latestStatus.agentId;
  if (typeof fromStatus === 'string') {
    const t = fromStatus.trim();
    if (t && isSafeRelativeAgentId(t)) return t;
  }
  return undefined;
}

/** When agent dir is known: agent.pid missing/invalid/dead => no managed process. */
function isWooxAgentProcessAliveSync(agentDirId: string): boolean {
  const pidPath = path.join(getWooxAgentTelemetryBaseDir(agentDirId), 'agent.pid');
  if (!fs.existsSync(pidPath)) return false;
  let pid = NaN;
  try {
    const first = fs.readFileSync(pidPath, 'utf8').trim().split('\n')[0];
    pid = parseInt(first, 10);
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return isPidAliveLocal(pid);
}

export function deriveWooxAgentRuntimeStatus(
  telemetry: WooxAgentTelemetryRead,
  nowMs: number = Date.now()
): WooAgentRuntimeStatus {
  const { latestStatus } = telemetry;
  if (!latestStatus) return 'offline';

  const registryId = ((telemetry as WooxTelemetryReadInternal).registryAgentId ?? '').trim();
  const mirror =
    registryId.length > 0 && WOOX_TELEMETRY_MIRROR_FROM_TRADING_LIVE.has(registryId);

  // Wrong venue is not valid WOO telemetry — do not trust timestamps for running/stale.
  if (!mirror && latestStatus.venue !== undefined && latestStatus.venue !== 'woox') return 'unknown';

  const ts = extractTelemetryTimestamp(latestStatus);
  if (ts === null) return 'unknown';
  // Guard against malformed future timestamps.
  if (ts > nowMs + 60_000) return 'unknown';

  const slowTelemetry =
    registryId.length > 0 && WOO_SLOW_TELEMETRY_AGENT_IDS.has(registryId);
  const staleMs = mirror
    ? MIRROR_AGENT_STALE_THRESHOLD_MS
    : slowTelemetry
      ? WOO_SLOW_TELEMETRY_STALE_THRESHOLD_MS
      : STALE_THRESHOLD_MS;
  const timestampFresh = nowMs - ts <= staleMs;
  const agentDirId = resolveAgentDirForPid(telemetry, latestStatus);
  const agentProcessAlive = agentDirId != null ? isWooxAgentProcessAliveSync(agentDirId) : null;

  // Mirrored trading-live agents: WOO supervisor state is irrelevant; use timestamp + PID under trading-live/.
  if (mirror) {
    if (!timestampFresh) return 'stale';
    if (agentProcessAlive === true) return 'running';
    if (agentProcessAlive === false) return 'offline';
    return 'stale';
  }

  if (!timestampFresh) return 'stale';

  const supervisorAlive = isWooxSupervisorPidAliveSync();
  if (supervisorAlive) return 'running';

  // Supervisor down: do not report "running" on fresh JSON alone — require a live agent PID.
  if (agentProcessAlive === true) {
    return 'running';
  }

  if (agentProcessAlive === false) {
    console.log('[woox] runtimeStatus: supervisor stopped, agent process not alive; not using running', {
      agentDirId
    });
    return 'offline';
  }

  // Supervisor down and we could not resolve agent dir for PID check — fresh telemetry is ambiguous.
  console.log('[woox] runtimeStatus: supervisor stopped, agent PID path unknown; mapping fresh telemetry to stale', {
    registryAgentId: (telemetry as WooxTelemetryReadInternal).registryAgentId
  });
  return 'stale';
}
