import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { CRYPTO_COM_TELEMETRY_ROOT } from '../config';

const SUPERVISOR_SCRIPT = path.join(process.cwd(), 'scripts', 'agent-supervisor.cjs');
let lastCryptoComSupervisorError: string | null = null;

function getSupervisorPidPath(): string {
  return path.join(CRYPTO_COM_TELEMETRY_ROOT, 'supervisor.pid');
}
function getSupervisorStatePath(): string {
  return path.join(CRYPTO_COM_TELEMETRY_ROOT, 'supervisor-state.json');
}
function getRestartRequestPath(): string {
  return path.join(CRYPTO_COM_TELEMETRY_ROOT, 'supervisor-restart-request.json');
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

export function isCryptoComSupervisorPidAliveSync(): boolean {
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

export async function isCryptoComSupervisorRunning(): Promise<boolean> {
  return isCryptoComSupervisorPidAliveSync();
}

export async function startCryptoComSupervisor(): Promise<{ ok: boolean; message?: string }> {
  if (await isCryptoComSupervisorRunning()) {
    lastCryptoComSupervisorError = null;
    return { ok: true, message: 'Crypto.com supervisor already running' };
  }
  if (!fs.existsSync(SUPERVISOR_SCRIPT)) {
    lastCryptoComSupervisorError = 'Supervisor script not found';
    return { ok: false, message: lastCryptoComSupervisorError };
  }
  fs.mkdirSync(CRYPTO_COM_TELEMETRY_ROOT, { recursive: true });
  const child = spawn(process.execPath, [SUPERVISOR_SCRIPT], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    env: { ...process.env, TELEMETRY_ROOT: CRYPTO_COM_TELEMETRY_ROOT }
  });
  if (!child.pid || !isPidAlive(child.pid)) {
    lastCryptoComSupervisorError = 'Crypto.com supervisor did not start correctly';
    return { ok: false, message: lastCryptoComSupervisorError };
  }
  child.unref();
  lastCryptoComSupervisorError = null;
  return { ok: true };
}

export async function stopCryptoComSupervisor(): Promise<void> {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) return;
  let pid = NaN;
  try {
    pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim().split('\n')[0], 10);
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

export async function requestCryptoComAgentRestart(agentId: string): Promise<void> {
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

export async function getCryptoComSupervisorStatus() {
  const running = await isCryptoComSupervisorRunning();
  const pidPath = getSupervisorPidPath();
  const statePath = getSupervisorStatePath();
  let supervisorPid: number | null = null;
  if (fs.existsSync(pidPath)) {
    try {
      supervisorPid = parseInt(fs.readFileSync(pidPath, 'utf8').trim().split('\n')[0], 10) || null;
    } catch {
      // ignore
    }
  }
  if (!fs.existsSync(statePath)) {
    return {
      running,
      supervisorPid,
      telemetryRoot: CRYPTO_COM_TELEMETRY_ROOT,
      updatedAt: null,
      agents: {},
      lastError: lastCryptoComSupervisorError
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>;
    return {
      running,
      supervisorPid: Number(raw.supervisorPid) || supervisorPid,
      telemetryRoot: CRYPTO_COM_TELEMETRY_ROOT,
      updatedAt: Number(raw.updatedAt) || null,
      agents: raw.agents ?? {},
      lastError: lastCryptoComSupervisorError
    };
  } catch {
    return {
      running,
      supervisorPid,
      telemetryRoot: CRYPTO_COM_TELEMETRY_ROOT,
      updatedAt: null,
      agents: {},
      lastError: lastCryptoComSupervisorError
    };
  }
}
