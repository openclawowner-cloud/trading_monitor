import fs from 'fs';
import path from 'path';
import { TELEMETRY_ROOT } from '../utils/config';

export interface RawTelemetry {
  status: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}

function readJsonObjectFile(filePath: string, agentId: string, label: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error(`Telemetry ${label} for ${agentId} is not a JSON object: ${filePath}`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    console.error(`Telemetry ${label} parse failed for ${agentId} (${filePath}):`, e);
    return null;
  }
}

export function readAgentTelemetry(agentId: string): RawTelemetry | null {
  const agentDir = path.join(TELEMETRY_ROOT, agentId);
  if (!fs.existsSync(agentDir)) return null;

  const statusPath = path.join(agentDir, 'latest_status.json');
  const statePath = path.join(agentDir, 'paper_state.json');

  const status = readJsonObjectFile(statusPath, agentId, 'status');
  const state = readJsonObjectFile(statePath, agentId, 'state');

  return { status, state };
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
