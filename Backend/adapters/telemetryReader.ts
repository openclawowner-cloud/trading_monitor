import fs from 'fs';
import path from 'path';
import { TELEMETRY_ROOT } from '../utils/config';

export interface RawTelemetry {
  status: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}

export function readAgentTelemetry(agentId: string): RawTelemetry | null {
  try {
    const agentDir = path.join(TELEMETRY_ROOT, agentId);
    if (!fs.existsSync(agentDir)) return null;

    const statusPath = path.join(agentDir, 'latest_status.json');
    const statePath = path.join(agentDir, 'paper_state.json');

    const status = fs.existsSync(statusPath)
      ? (JSON.parse(fs.readFileSync(statusPath, 'utf8')) as Record<string, unknown>)
      : null;
    const state = fs.existsSync(statePath)
      ? (JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>)
      : null;

    return { status, state };
  } catch (e) {
    console.error(`Error reading telemetry for ${agentId}:`, e);
    return null;
  }
}

export function getTelemetryFileTimestamps(agentId: string): { statusMs: number | null; stateMs: number | null } {
  const agentDir = path.join(TELEMETRY_ROOT, agentId);
  const statusPath = path.join(agentDir, 'latest_status.json');
  const statePath = path.join(agentDir, 'paper_state.json');

  let statusMs: number | null = null;
  let stateMs: number | null = null;
  if (fs.existsSync(statusPath)) {
    const s = fs.statSync(statusPath);
    statusMs = s.mtimeMs;
  }
  if (fs.existsSync(statePath)) {
    const s = fs.statSync(statePath);
    stateMs = s.mtimeMs;
  }
  return { statusMs, stateMs };
}
