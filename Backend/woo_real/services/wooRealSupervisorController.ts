import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { WOO_REAL_TELEMETRY_ROOT } from '../config';

const SUPERVISOR_SCRIPT = path.join(process.cwd(), 'scripts', 'agent-supervisor.cjs');

let lastWooRealSupervisorError: string | null = null;

function getSupervisorPidPath(): string {
  return path.join(WOO_REAL_TELEMETRY_ROOT, 'supervisor.pid');
}

function getSupervisorStatePath(): string {
  return path.join(WOO_REAL_TELEMETRY_ROOT, 'supervisor-state.json');
}

function getRestartRequestPath(): string {
  return path.join(WOO_REAL_TELEMETRY_ROOT, 'supervisor-restart-request.json');
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

export function isWooRealSupervisorPidAliveSync(): boolean {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) return false;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    const pid = parseInt(content[0], 10);
    return Number.isInteger(pid) && pid > 0 && isPidAlive(pid);
  } catch {
    return false;
  }
}

export async function isWooRealSupervisorRunning(): Promise<boolean> {
  return isWooRealSupervisorPidAliveSync();
}

export async function startWooRealSupervisor(): Promise<{ ok: boolean; message?: string }> {
  if (await isWooRealSupervisorRunning()) {
    lastWooRealSupervisorError = null;
    return { ok: true, message: 'WOO Real supervisor already running' };
  }
  if (!fs.existsSync(SUPERVISOR_SCRIPT)) {
    const msg = 'Supervisor script not found';
    lastWooRealSupervisorError = msg;
    return { ok: false, message: msg };
  }
  try {
    fs.mkdirSync(WOO_REAL_TELEMETRY_ROOT, { recursive: true });
  } catch {
    const msg = 'Failed to ensure WOO Real telemetry directory';
    lastWooRealSupervisorError = msg;
    return { ok: false, message: msg };
  }
  const child = spawn(process.execPath, [SUPERVISOR_SCRIPT], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    env: { ...process.env, TELEMETRY_ROOT: WOO_REAL_TELEMETRY_ROOT }
  });
  if (!child.pid || !isPidAlive(child.pid)) {
    const msg = 'WOO Real supervisor did not start correctly';
    lastWooRealSupervisorError = msg;
    return { ok: false, message: msg };
  }
  child.unref();
  lastWooRealSupervisorError = null;
  return { ok: true };
}

export async function stopWooRealSupervisor(): Promise<void> {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) return;
  let pid = NaN;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    pid = parseInt(content[0], 10);
  } catch {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
    return;
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  setTimeout(() => {
    try {
      if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }, 1000);
}

export async function requestWooRealAgentRestart(agentId: string): Promise<void> {
  const requestPath = getRestartRequestPath();
  const safeAgentId = agentId.trim();
  if (!safeAgentId) return;
  let data: { agentIds?: string[]; agentId?: string } = {};
  if (fs.existsSync(requestPath)) {
    try {
      data = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as typeof data;
    } catch {
      // ignore
    }
  }
  const ids = (data.agentIds || (data.agentId != null ? [data.agentId] : []))
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (!ids.includes(safeAgentId)) ids.push(safeAgentId);
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, JSON.stringify({ agentIds: ids }, null, 2), 'utf8');
}

export async function getWooRealSupervisorStatus() {
  const running = await isWooRealSupervisorRunning();
  const pidPath = getSupervisorPidPath();
  const statePath = getSupervisorStatePath();
  let supervisorPid: number | null = null;
  if (fs.existsSync(pidPath)) {
    try {
      const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
      supervisorPid = parseInt(content[0], 10) || null;
    } catch {
      // ignore
    }
  }
  if (!fs.existsSync(statePath)) {
    return {
      running,
      supervisorPid,
      telemetryRoot: WOO_REAL_TELEMETRY_ROOT,
      updatedAt: null,
      agents: {},
      lastError: lastWooRealSupervisorError
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>;
    return {
      running,
      supervisorPid: Number(raw.supervisorPid) || supervisorPid,
      telemetryRoot: WOO_REAL_TELEMETRY_ROOT,
      updatedAt: Number(raw.updatedAt) || null,
      agents: raw.agents ?? {},
      lastError: lastWooRealSupervisorError
    };
  } catch {
    return {
      running,
      supervisorPid,
      telemetryRoot: WOO_REAL_TELEMETRY_ROOT,
      updatedAt: null,
      agents: {},
      lastError: lastWooRealSupervisorError
    };
  }
}
