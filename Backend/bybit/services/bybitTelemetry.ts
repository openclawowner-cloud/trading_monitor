import fs from 'fs';
import path from 'path';
import { BYBIT_TELEMETRY_ROOT } from '../config';
import type {
  BybitAgentRuntimeStatus,
  BybitAgentTelemetryRead,
  BybitLatestStatus,
  BybitPaperState
} from '../types';
import { isBybitSupervisorPidAliveSync } from './bybitSupervisorController';

export const BYBIT_STALE_THRESHOLD_MS = 360_000;

function maybeReadJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}
function asStatusRecord(data: unknown): BybitLatestStatus | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as BybitLatestStatus;
}
function asPaperRecord(data: unknown): BybitPaperState | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as BybitPaperState;
}
function isSafeRelativeAgentId(id: string): boolean {
  if (!id) return false;
  return !id.includes('..') && !id.includes('/') && !id.includes('\\');
}

export function getBybitAgentTelemetryBaseDir(agentId: string): string {
  return path.join(BYBIT_TELEMETRY_ROOT, agentId.trim());
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

export function readBybitAgentTelemetry(agentId: string): BybitAgentTelemetryRead {
  const safeId = agentId.trim();
  if (!isSafeRelativeAgentId(safeId)) return { latestStatus: null, paperState: null };
  const base = getBybitAgentTelemetryBaseDir(safeId);
  return {
    latestStatus: asStatusRecord(maybeReadJson(path.join(base, 'latest_status.json'))),
    paperState: asPaperRecord(maybeReadJson(path.join(base, 'paper_state.json')))
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
function isBybitAgentProcessAliveSync(agentDirId: string): boolean {
  const pidPath = path.join(getBybitAgentTelemetryBaseDir(agentDirId), 'agent.pid');
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

export function deriveBybitAgentRuntimeStatus(
  agentId: string,
  telemetry: BybitAgentTelemetryRead,
  nowMs: number = Date.now()
): BybitAgentRuntimeStatus {
  const ts = extractTelemetryTimestamp(
    (telemetry.latestStatus ?? telemetry.paperState) as Record<string, unknown> | null
  );
  if (ts === null) return 'offline';
  if (ts > nowMs + 60_000) return 'unknown';
  const timestampFresh = nowMs - ts <= BYBIT_STALE_THRESHOLD_MS;
  if (!timestampFresh) return 'stale';
  if (isBybitSupervisorPidAliveSync()) return 'running';
  return isBybitAgentProcessAliveSync(agentId) ? 'running' : 'offline';
}
