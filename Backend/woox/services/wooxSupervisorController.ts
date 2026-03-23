import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { spawnSync } from 'child_process';
import { WOOX_TELEMETRY_ROOT } from '../config';
import type { WooxSupervisorAgentState, WooxSupervisorStatusResponse } from '../types';

const SUPERVISOR_SCRIPT = path.join(process.cwd(), 'scripts', 'agent-supervisor.cjs');

/** Last start/stop/restart failure message for observability (never contains secrets). */
let lastWooxSupervisorError: string | null = null;

function getSupervisorPidPath(): string {
  return path.join(WOOX_TELEMETRY_ROOT, 'supervisor.pid');
}

function getSupervisorStatePath(): string {
  return path.join(WOOX_TELEMETRY_ROOT, 'supervisor-state.json');
}

function getRestartRequestPath(): string {
  return path.join(WOOX_TELEMETRY_ROOT, 'supervisor-restart-request.json');
}

function getAgentsRegistryPath(): string {
  return path.join(WOOX_TELEMETRY_ROOT, 'agents.json');
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

function killPidWithFallback(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (!isPidAlive(pid)) return false;
  const isWindows = process.platform === 'win32';
  try {
    // First attempt: generic Node kill.
    process.kill(pid, 'SIGTERM');
    if (!isPidAlive(pid)) return true;
  } catch (_) {}
  if (isWindows) {
    try {
      const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return r.status === 0 || !isPidAlive(pid);
    } catch (_) {
      return !isPidAlive(pid);
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {}
  return !isPidAlive(pid);
}

function readWooxRegistryAgentIds(): string[] {
  const registryPath = getAgentsRegistryPath();
  if (!fs.existsSync(registryPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const id = (row as Record<string, unknown>).id;
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
    return ids;
  } catch {
    return [];
  }
}

function scanWindowsAgentPidsByCommandLine(): number[] {
  if (process.platform !== 'win32') return [];
  try {
    const out = execSync('wmic process get ProcessId,CommandLine', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const pids = new Set<number>();
    for (const line of lines) {
      if (
        line.includes('reference_heartbeat.py') ||
        line.includes('paper_spot_bot.py')
      ) {
        const m = line.match(/(\d+)\s*$/);
        if (!m) continue;
        const pid = parseInt(m[1], 10);
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    // WMIC may be unavailable on newer Windows; fallback to CIM via PowerShell.
    try {
      const ps =
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*reference_heartbeat.py*' -or $_.CommandLine -like '*paper_spot_bot.py*') } | Select-Object -ExpandProperty ProcessId";
      const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const pids = out
        .split(/\r?\n/)
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      return [...new Set(pids)];
    } catch {
      return [];
    }
  }
}

function stopWooxManagedAgents(): void {
  const ids = readWooxRegistryAgentIds();
  const killed = new Set<number>();
  const pidMissing: string[] = [];
  const pidInvalid: string[] = [];
  let pidFilesWithValidPid = 0;
  let registryKillSuccess = 0;
  for (const id of ids) {
    const pidPath = path.join(WOOX_TELEMETRY_ROOT, id, 'agent.pid');
    if (!fs.existsSync(pidPath)) {
      pidMissing.push(id);
      continue;
    }
    let pid = NaN;
    try {
      const first = fs.readFileSync(pidPath, 'utf8').trim().split('\n')[0];
      pid = parseInt(first, 10);
    } catch (_) {}
    if (!Number.isInteger(pid) || pid <= 0) {
      pidInvalid.push(id);
      continue;
    }
    pidFilesWithValidPid += 1;
    if (killPidWithFallback(pid)) {
      killed.add(pid);
      registryKillSuccess += 1;
    }
  }
  // Extra fallback for orphaned processes that no longer have fresh pid files.
  const fallbackPids = scanWindowsAgentPidsByCommandLine();
  let fallbackKilled = 0;
  for (const pid of fallbackPids) {
    if (killPidWithFallback(pid)) {
      killed.add(pid);
      fallbackKilled += 1;
    }
  }
  console.log('[woox] stop managed agents', {
    registryAgentCount: ids.length,
    pidFilesWithValidPid,
    stoppedUniquePids: killed.size,
    stoppedFromPidFiles: registryKillSuccess,
    fallbackScanMatches: fallbackPids.length,
    fallbackKilled,
    pidMissingAgentIds: pidMissing,
    pidInvalidAgentIds: pidInvalid
  });
}

/** Synchronous PID-file check for hot paths that cannot await (e.g. agent list). */
export function isWooxSupervisorPidAliveSync(): boolean {
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

export async function isWooxSupervisorRunning(): Promise<boolean> {
  return isWooxSupervisorPidAliveSync();
}

export async function startWooxSupervisor(): Promise<{ ok: boolean; message?: string }> {
  if (await isWooxSupervisorRunning()) {
    lastWooxSupervisorError = null;
    return { ok: true, message: 'WOO supervisor already running' };
  }
  if (!fs.existsSync(SUPERVISOR_SCRIPT)) {
    const msg = 'Supervisor script not found';
    lastWooxSupervisorError = msg;
    return { ok: false, message: msg };
  }
  try {
    fs.mkdirSync(WOOX_TELEMETRY_ROOT, { recursive: true });
  } catch {
    const msg = 'Failed to ensure WOO telemetry directory';
    lastWooxSupervisorError = msg;
    return { ok: false, message: msg };
  }
  let child;
  try {
    child = spawn(process.execPath, [SUPERVISOR_SCRIPT], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      env: { ...process.env, TELEMETRY_ROOT: WOOX_TELEMETRY_ROOT }
    });
  } catch {
    const msg = 'Failed to spawn WOO supervisor';
    lastWooxSupervisorError = msg;
    return { ok: false, message: msg };
  }
  if (!child.pid || !isPidAlive(child.pid)) {
    const msg = 'WOO supervisor did not start correctly';
    lastWooxSupervisorError = msg;
    return { ok: false, message: msg };
  }
  child.unref();
  lastWooxSupervisorError = null;
  console.log('[woox] supervisor start requested', { telemetryRoot: WOOX_TELEMETRY_ROOT });
  return { ok: true };
}

export async function stopWooxSupervisor(): Promise<void> {
  const pidPath = getSupervisorPidPath();
  if (!fs.existsSync(pidPath)) {
    // Even without a supervisor pid, we still clean up orphaned WOO agents.
    stopWooxManagedAgents();
    lastWooxSupervisorError = null;
    return;
  }
  let pid: number;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    pid = parseInt(content[0], 10);
  } catch {
    try {
      fs.unlinkSync(pidPath);
    } catch (_) {}
    stopWooxManagedAgents();
    lastWooxSupervisorError = null;
    return;
  }
  if (!isPidAlive(pid)) {
    try {
      fs.unlinkSync(pidPath);
    } catch (_) {}
    stopWooxManagedAgents();
    lastWooxSupervisorError = null;
    return;
  }
  // Stop detached supervisor process; agent cleanup runs right after.
  killPidWithFallback(pid);
  console.log('[woox] supervisor stop signaled', { pid });
  lastWooxSupervisorError = null;
  setTimeout(() => {
    try {
      if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
    } catch (_) {}
    stopWooxManagedAgents();
  }, 1000);
}

/**
 * Merges into supervisor-restart-request.json using the same shape as agent-supervisor.cjs
 * expects: { agentIds: string[] } or legacy { agentId: string }.
 */
export async function requestWooxAgentRestart(agentId: string): Promise<void> {
  const requestPath = getRestartRequestPath();
  const safeAgentId = agentId.trim();
  if (!safeAgentId) return;
  let data: { agentIds?: string[]; agentId?: string } = {};
  if (fs.existsSync(requestPath)) {
    try {
      data = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as typeof data;
    } catch (_) {}
  }
  const rawIds = data.agentIds || (data.agentId != null ? [data.agentId] : []);
  const ids = rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (!ids.includes(safeAgentId)) ids.push(safeAgentId);
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, JSON.stringify({ agentIds: ids }, null, 2), 'utf8');
  console.log('[woox] supervisor restart request queued', { agentId: safeAgentId });
}

export async function getWooxSupervisorStatus(): Promise<WooxSupervisorStatusResponse> {
  const running = await isWooxSupervisorRunning();
  const pidPath = getSupervisorPidPath();
  const statePath = getSupervisorStatePath();
  const paths = {
    pidFile: pidPath,
    stateFile: statePath,
    restartRequestFile: getRestartRequestPath()
  };
  let supervisorPid: number | null = null;
  if (fs.existsSync(pidPath)) {
    try {
      const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
      supervisorPid = parseInt(content[0], 10) || null;
    } catch (_) {}
  }
  const empty = (): WooxSupervisorStatusResponse => ({
    running,
    supervisorPid,
    telemetryRoot: WOOX_TELEMETRY_ROOT,
    paths,
    updatedAt: null,
    agents: {},
    lastError: lastWooxSupervisorError
  });
  if (!fs.existsSync(statePath)) return empty();
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      supervisorPid?: number;
      updatedAt?: number;
      agents?: Record<string, WooxSupervisorAgentState>;
    };
    const effectivePid = raw.supervisorPid ?? supervisorPid;
    // State file can lag behind process lifecycle; keep running=true only when PID is alive.
    const runningFinal = running && (effectivePid != null ? isPidAlive(effectivePid) : false);
    const agents =
      raw.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents) ? raw.agents : {};
    return {
      running: runningFinal,
      supervisorPid: effectivePid ?? null,
      telemetryRoot: WOOX_TELEMETRY_ROOT,
      paths,
      updatedAt: raw.updatedAt ?? null,
      agents,
      lastError: lastWooxSupervisorError
    };
  } catch {
    return empty();
  }
}
