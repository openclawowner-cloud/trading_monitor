import fs from 'fs';
import path from 'path';

export interface AgentControlState {
  paused?: boolean;
  manualSell?: boolean;
  updatedAt?: number;
}

function readControlFile(controlPath: string): AgentControlState {
  if (!fs.existsSync(controlPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(controlPath, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as AgentControlState;
  } catch {
    return {};
  }
}

function writeControlFile(controlPath: string, state: AgentControlState): void {
  fs.mkdirSync(path.dirname(controlPath), { recursive: true });
  fs.writeFileSync(controlPath, JSON.stringify(state, null, 2), 'utf8');
}

function controlPathFor(telemetryRoot: string, agentId: string): string {
  return path.join(telemetryRoot, agentId, 'control.json');
}

export function setAgentPaused(telemetryRoot: string, agentId: string, paused: boolean): AgentControlState {
  const controlPath = controlPathFor(telemetryRoot, agentId);
  const next: AgentControlState = {
    ...readControlFile(controlPath),
    paused,
    updatedAt: Date.now()
  };
  writeControlFile(controlPath, next);
  return next;
}

export function requestAgentManualSell(telemetryRoot: string, agentId: string): AgentControlState {
  const controlPath = controlPathFor(telemetryRoot, agentId);
  const next: AgentControlState = {
    ...readControlFile(controlPath),
    manualSell: true,
    updatedAt: Date.now()
  };
  writeControlFile(controlPath, next);
  return next;
}
