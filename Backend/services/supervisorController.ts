import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { TELEMETRY_ROOT } from '../utils/config';

const SUPERVISOR_SCRIPT = path.join(process.cwd(), 'scripts', 'agent-supervisor.cjs');

function getSupervisorPidPath(): string {
  return path.join(TELEMETRY_ROOT, 'supervisor.pid');
}

function getSupervisorStatePath(): string {
  return path.join(TELEMETRY_ROOT, 'supervisor-state.json');
}

function getRestartRequestPath(): string {
  return path.join(TELEMETRY_ROOT, 'supervisor-restart-request.json');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function isSupervisorRunning(): Promise<boolean> {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) return false;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    const pid = parseInt(content[0], 10);
    return !isNaN(pid) && isPidAlive(pid);
  } catch {
    return false;
  }
}

export async function startSupervisor(): Promise<{ ok: boolean; message?: string }> {
  if (await isSupervisorRunning()) {
    return { ok: true, message: 'Supervisor already running' };
  }
  if (!fs.existsSync(SUPERVISOR_SCRIPT)) {
    return { ok: false, message: 'Supervisor script not found' };
  }
  const child = spawn(process.execPath, [SUPERVISOR_SCRIPT], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    env: { ...process.env, TELEMETRY_ROOT }
  });
  child.unref();
  return { ok: true };
}

export async function stopSupervisor(): Promise<void> {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) return;
  let pid: number;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    pid = parseInt(content[0], 10);
  } catch {
    try { fs.unlinkSync(pidPath); } catch (_) {}
    return;
  }
  if (!isPidAlive(pid)) {
    try { fs.unlinkSync(pidPath); } catch (_) {}
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (_) {}
  setTimeout(() => {
    try { if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath); } catch (_) {}
  }, 1000);
}

export async function requestAgentRestart(agentId: string): Promise<void> {
  const requestPath = getRestartRequestPath();
  let data: { agentIds?: string[]; agentId?: string } = {};
  if (fs.existsSync(requestPath)) {
    try {
      data = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    } catch (_) {}
  }
  const ids = data.agentIds || (data.agentId != null ? [data.agentId] : []);
  if (!ids.includes(agentId)) ids.push(agentId);
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, JSON.stringify({ agentIds: ids }, null, 2), 'utf8');
}

export interface SupervisorAgentState {
  displayName: string;
  pid: number | null;
  startedAt: number | null;
  lastRestartAt: number | null;
  restartCountInWindow: number;
  rateLimited: boolean;
  isStale: boolean;
  statusMtime: number | null;
}

export interface SupervisorStatus {
  supervisorRunning: boolean;
  supervisorPid: number | null;
  updatedAt: number | null;
  agents: Record<string, SupervisorAgentState>;
}

export async function getSupervisorStatus(): Promise<SupervisorStatus> {
  const running = await isSupervisorRunning();
  const statePath = getSupervisorStatePath();
  const pidPath = getSupervisorPidPath();
  let supervisorPid: number | null = null;
  if (fs.existsSync(pidPath)) {
    try {
      const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
      supervisorPid = parseInt(content[0], 10) || null;
    } catch (_) {}
  }
  let state: SupervisorStatus = {
    supervisorRunning: running,
    supervisorPid,
    updatedAt: null,
    agents: {}
  };
  if (fs.existsSync(statePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      state = {
        supervisorRunning: running,
        supervisorPid: raw.supervisorPid ?? supervisorPid,
        updatedAt: raw.updatedAt ?? null,
        agents: raw.agents ?? {}
      };
    } catch (_) {}
  }
  return state;
}

export function allowDebugEndpoints(req: { query?: { debug_token?: string }; headers?: Record<string, string | undefined> }): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const token = process.env.DEBUG_TOKEN;
  if (!token) return true;
  const provided = req.query?.debug_token || req.headers?.['x-debug-token'];
  return provided === token;
}
