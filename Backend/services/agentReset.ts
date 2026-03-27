import fs from 'fs';
import path from 'path';

export interface HardResetResult {
  ok: boolean;
  agentId: string;
  removedFiles: string[];
}

function isSafeRelativeAgentId(agentId: string): boolean {
  if (!agentId.trim()) return false;
  return !agentId.includes('..') && !agentId.includes('/') && !agentId.includes('\\');
}

export function hardResetAgentState(telemetryRoot: string, agentId: string): HardResetResult {
  const id = agentId.trim();
  if (!isSafeRelativeAgentId(id)) {
    return { ok: false, agentId: id, removedFiles: [] };
  }
  const agentDir = path.join(telemetryRoot, id);
  const candidates = [
    'paper_state.json',
    'latest_status.json',
    'agent.pid',
    'control.json'
  ];
  const removedFiles: string[] = [];
  for (const fileName of candidates) {
    const filePath = path.join(agentDir, fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedFiles.push(fileName);
      }
    } catch {
      // Keep reset best-effort and continue removing other files.
    }
  }
  return { ok: true, agentId: id, removedFiles };
}
