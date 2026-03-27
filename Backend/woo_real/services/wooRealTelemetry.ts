import fs from 'fs';
import path from 'path';
import { WOO_REAL_TELEMETRY_ROOT } from '../config';
import type { WooRealAgentRuntimeStatus, WooRealAgentTelemetryRead, WooRealLatestStatus, WooRealPaperState } from '../types';
import { isWooRealSupervisorPidAliveSync } from './wooRealSupervisorController';

export const WOO_REAL_STALE_THRESHOLD_MS = 360_000;

function maybeReadJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function asStatusRecord(data: unknown): WooRealLatestStatus | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as WooRealLatestStatus;
}

function asPaperRecord(data: unknown): WooRealPaperState | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as WooRealPaperState;
}

function isSafeRelativeAgentId(id: string): boolean {
  if (!id) return false;
  return !id.includes('..') && !id.includes('/') && !id.includes('\\');
}

export function getWooRealAgentTelemetryBaseDir(agentId: string): string {
  return path.join(WOO_REAL_TELEMETRY_ROOT, agentId.trim());
}

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

export function readWooRealAgentTelemetry(agentId: string): WooRealAgentTelemetryRead {
  const safeId = agentId.trim();
  if (!isSafeRelativeAgentId(safeId)) {
    return { latestStatus: null, paperState: null };
  }
  const base = getWooRealAgentTelemetryBaseDir(safeId);
  const statusPath = path.join(base, 'latest_status.json');
  const statePath = path.join(base, 'paper_state.json');
  return {
    latestStatus: asStatusRecord(maybeReadJson(statusPath)),
    paperState: asPaperRecord(maybeReadJson(statePath))
  };
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isWooRealAgentProcessAliveSync(agentDirId: string): boolean {
  const pidPath = path.join(getWooRealAgentTelemetryBaseDir(agentDirId), 'agent.pid');
  if (!fs.existsSync(pidPath)) return false;
  let pid = NaN;
  try {
    const first = fs.readFileSync(pidPath, 'utf8').trim().split('\n')[0];
    pid = parseInt(first, 10);
  } catch {
    return false;
  }
  return isPidAlive(pid);
}

export function deriveWooRealAgentRuntimeStatus(
  agentId: string,
  telemetry: WooRealAgentTelemetryRead,
  nowMs: number = Date.now()
): WooRealAgentRuntimeStatus {
  const ts = extractTelemetryTimestamp((telemetry.latestStatus ?? telemetry.paperState) as Record<string, unknown> | null);
  if (ts === null) return 'offline';
  if (ts > nowMs + 60_000) return 'unknown';
  const timestampFresh = nowMs - ts <= WOO_REAL_STALE_THRESHOLD_MS;
  if (!timestampFresh) return 'stale';
  if (isWooRealSupervisorPidAliveSync()) return 'running';
  return isWooRealAgentProcessAliveSync(agentId) ? 'running' : 'offline';
}
