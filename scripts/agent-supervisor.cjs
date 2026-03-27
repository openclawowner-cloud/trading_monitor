'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TELEMETRY_ROOT = process.env.TELEMETRY_ROOT || path.join(process.cwd(), 'trading-live');
// How often the supervisor checks agents and restarts stale ones (default 30 sec)
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30 * 1000;
const STALE_MIN_MS = 15 * 60 * 1000;
const RESTART_WINDOW_MS = 10 * 60 * 1000;
const MAX_RESTARTS_IN_WINDOW = 3;
const isWindows = process.platform === 'win32';

const processes = new Map();
const restartTimestamps = new Map();
let restartRequestIds = new Set();
let stopRequestIds = new Set();
let tickTimer = null;

function getAgentsPath() {
  return path.join(TELEMETRY_ROOT, 'agents.json');
}

function getSupervisorPidPath() {
  return path.join(TELEMETRY_ROOT, 'supervisor.pid');
}

function getSupervisorStatePath() {
  return path.join(TELEMETRY_ROOT, 'supervisor-state.json');
}

function getRestartRequestPath() {
  return path.join(TELEMETRY_ROOT, 'supervisor-restart-request.json');
}

function getStopRequestPath() {
  return path.join(TELEMETRY_ROOT, 'supervisor-stop-request.json');
}

function readAgents() {
  try {
    const raw = fs.readFileSync(getAgentsPath(), 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function getManagedAgents() {
  return readAgents().filter(
    (a) => a.enabled !== false && a.supervisorManaged !== false
  );
}

function readRestartRequest() {
  const p = getRestartRequestPath();
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids = data.agentIds || (data.agentId != null ? [data.agentId] : []);
    fs.unlinkSync(p);
    return ids;
  } catch (e) {
    try { fs.unlinkSync(p); } catch (_) {}
    return [];
  }
}

function readStopRequest() {
  const p = getStopRequestPath();
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids = data.agentIds || (data.agentId != null ? [data.agentId] : []);
    fs.unlinkSync(p);
    return ids;
  } catch (e) {
    try { fs.unlinkSync(p); } catch (_) {}
    return [];
  }
}

function getStaleThresholdMs(agent) {
  if (process.env.STALE_THRESHOLD_MS) {
    return Number(process.env.STALE_THRESHOLD_MS);
  }
  const intervalSec = Number(agent.intervalSec) || 60;
  return Math.max(intervalSec * 3 * 1000, STALE_MIN_MS);
}

function isPidAlive(pid) {
  if (pid == null || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function getAgentDir(agentId) {
  return path.join(TELEMETRY_ROOT, agentId);
}

function getAgentPidPath(agentId) {
  return path.join(getAgentDir(agentId), 'agent.pid');
}

function getStatusPath(agentId) {
  return path.join(getAgentDir(agentId), 'latest_status.json');
}

function writePidFile(agentDir, pid, startedAt) {
  fs.mkdirSync(agentDir, { recursive: true });
  const pidPath = path.join(agentDir, 'agent.pid');
  fs.writeFileSync(pidPath, `${pid}\n${startedAt}`, 'utf8');
}

function readPidFile(agentDir) {
  const pidPath = path.join(agentDir, 'agent.pid');
  if (!fs.existsSync(pidPath)) return null;
  try {
    const content = fs.readFileSync(pidPath, 'utf8').trim().split('\n');
    const pid = parseInt(content[0], 10);
    const startedAt = content[1] ? parseInt(content[1], 10) : null;
    return { pid, startedAt };
  } catch (e) {
    return null;
  }
}

function recordRestart(agentId) {
  const now = Date.now();
  let list = restartTimestamps.get(agentId) || [];
  list.push(now);
  list = list.filter((t) => t > now - RESTART_WINDOW_MS);
  restartTimestamps.set(agentId, list);
}

function getRestartCountInWindow(agentId) {
  const list = restartTimestamps.get(agentId) || [];
  const now = Date.now();
  return list.filter((t) => t > now - RESTART_WINDOW_MS).length;
}

function isRateLimited(agentId) {
  return getRestartCountInWindow(agentId) >= MAX_RESTARTS_IN_WINDOW;
}

function getPythonProcessesByScript() {
  const { execSync, spawnSync } = require('child_process');
  const byScript = {};
  try {
    if (isWindows) {
      const cmd = `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ForEach-Object { $_.ProcessId.ToString() + ' ' + $_.CommandLine }`;
      // Use hidden PowerShell spawn to avoid visible CMD/PowerShell window popups on each tick.
      const ps = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', cmd],
        {
          windowsHide: true,
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore']
        }
      );
      const out = typeof ps.stdout === 'string' ? ps.stdout : '';
      const lines = out.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;
        const pid = parseInt(match[1], 10);
        const cmdline = match[2] || '';
        const pyMatch = cmdline.match(/([^\\/\s]+\.py)/);
        if (pyMatch) {
          const script = pyMatch[1];
          if (!byScript[script]) byScript[script] = [];
          byScript[script].push(pid);
        }
      }
    } else {
      const out = execSync('ps -eo pid,args', { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
      const lines = out.split(/\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        const pidMatch = trimmed.match(/^\d+/);
        if (!pidMatch) continue;
        const pid = parseInt(pidMatch[0], 10);
        if (pid === process.pid) continue;
        const pyMatch = trimmed.match(/([^\\/\s]+\.py)/);
        if (pyMatch) {
          const script = pyMatch[1];
          if (!byScript[script]) byScript[script] = [];
          byScript[script].push(pid);
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return byScript;
}

function getScriptBasename(agent) {
  const sp = agent.scriptPath || '';
  const base = path.basename(sp);
  return base || null;
}

function stopAgent(agentId) {
  const entry = processes.get(agentId);
  if (entry && entry.child) {
    try {
      entry.child.kill('SIGTERM');
    } catch (e) {
      try { entry.child.kill('SIGKILL'); } catch (_) {}
    }
    processes.delete(agentId);
    return;
  }
  const agentDir = getAgentDir(agentId);
  const pidInfo = readPidFile(agentDir);
  if (pidInfo && isPidAlive(pidInfo.pid)) {
    try {
      if (isWindows) {
        require('child_process').execSync(`taskkill /PID ${pidInfo.pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(pidInfo.pid, 'SIGTERM');
      }
    } catch (e) {
      try {
        if (!isWindows) process.kill(pidInfo.pid, 'SIGKILL');
      } catch (_) {}
    }
  }
  const pidPath = getAgentPidPath(agentId);
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
}

function startAgent(agent, forceRestart) {
  const agentId = agent.id || agent.agentId;
  if (!agentId) return;
  const agentDir = getAgentDir(agentId);
  const scriptPath = agent.scriptPath;
  const args = Array.isArray(agent.args) ? agent.args : [];
  const workingDir = path.resolve(process.cwd(), agent.workingDir || '.');
  const scriptFullPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(process.cwd(), scriptPath);
  const env = {
    ...process.env,
    AGENT_OUT_DIR: (agentDir || '').trim(),
    TELEMETRY_ROOT: (TELEMETRY_ROOT || '').trim(),
    PYTHONUNBUFFERED: '1',
  };

  // Optional per-agent env: agent.env (object) and agent.pythonPath (PYTHONPATH string)
  if (agent.env && typeof agent.env === 'object') {
    for (const [k, v] of Object.entries(agent.env)) {
      if (v != null) env[k] = String(v);
    }
  }
  if (agent.pythonPath && typeof agent.pythonPath === 'string') {
    const pyPath = agent.pythonPath.trim();
    if (pyPath) env.PYTHONPATH = env.PYTHONPATH ? pyPath + path.delimiter + env.PYTHONPATH : pyPath;
  }

  // Executable: runtimePath, or runtime if it looks like an absolute path, else PYTHON_PATH / runtime
  let cmd;
  const runtimeVal = agent.runtime || 'python';
  const isAbsolutePath = (s) => typeof s === 'string' && (path.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s));
  if (agent.runtimePath && typeof agent.runtimePath === 'string') {
    cmd = agent.runtimePath;
  } else if (runtimeVal === 'node') {
    cmd = process.execPath;
  } else if (isAbsolutePath(runtimeVal)) {
    cmd = runtimeVal;
  } else if (runtimeVal === 'python' && process.env.PYTHON_PATH) {
    cmd = process.env.PYTHON_PATH;
  } else {
    cmd = runtimeVal;
  }
  let finalCmd = cmd;
  let finalArgs = runtimeVal === 'node' ? [scriptFullPath, ...args] : [scriptFullPath, ...args];

  // With explicit Python path, run via wrapper script to normalize env/site-packages across OSes.
  if (agent.runtimePath || (runtimeVal === 'python' && process.env.PYTHON_PATH)) {
    const telemetryRoot = (TELEMETRY_ROOT || '').trim();
    const agentDirClean = (agentDir || '').trim();
    if (isWindows) {
      const batPath = path.join(process.cwd(), 'scripts', 'run-agent.bat');
      if (fs.existsSync(batPath)) {
        finalCmd = process.env.ComSpec || 'cmd.exe';
        finalArgs = ['/c', batPath, telemetryRoot, agentDirClean, cmd, scriptFullPath, ...args];
      }
    } else {
      const shPath = path.join(process.cwd(), 'scripts', 'run-agent.sh');
      if (fs.existsSync(shPath)) {
        finalCmd = '/usr/bin/env';
        finalArgs = ['bash', shPath, telemetryRoot, agentDirClean, cmd, scriptFullPath, ...args];
      }
    }
  }

  const logPath = path.join(agentDir, 'supervisor.log');
  fs.mkdirSync(agentDir, { recursive: true });
  try {
    const argsLine = [finalCmd, ...finalArgs].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    fs.writeFileSync(path.join(agentDir, 'supervisor_cmd.txt'), `cmd=${finalCmd}\ncwd=${workingDir}\nargs=${argsLine}\n`, 'utf8');
  } catch (_) {}
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const startedAt = Date.now();

  const child = spawn(finalCmd, finalArgs, {
    cwd: workingDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    windowsHide: true,
  });

  child.stdout.on('data', (data) => logStream.write(data));
  child.stderr.on('data', (data) => logStream.write(data));
  child.on('exit', (code, signal) => {
    logStream.write(`\n[exit] code=${code} signal=${signal}\n`);
    logStream.end();
    processes.delete(agentId);
  });

  writePidFile(agentDir, child.pid, startedAt);
  processes.set(agentId, { child, startedAt });
  recordRestart(agentId);
}

function tick() {
  const agents = getManagedAgents();
  const agentIds = new Set(agents.map((a) => a.id || a.agentId).filter(Boolean));

  restartRequestIds = new Set(readRestartRequest());
  stopRequestIds = new Set(readStopRequest());

  const pythonByScript = getPythonProcessesByScript();

  for (const agentId of stopRequestIds) {
    stopAgent(agentId);
  }
  for (const [aid] of processes) {
    if (!agentIds.has(aid)) stopAgent(aid);
  }

  const now = Date.now();
  const state = {
    supervisorRunning: true,
    supervisorPid: process.pid,
    updatedAt: now,
    agents: {},
  };

  for (const agent of agents) {
    const agentId = agent.id || agent.agentId;
    if (!agentId) continue;
    const agentDir = getAgentDir(agentId);
    const statusPath = getStatusPath(agentId);
    let statusMtime = null;
    if (fs.existsSync(statusPath)) {
      try {
        statusMtime = fs.statSync(statusPath).mtimeMs;
      } catch (_) {}
    }
    const staleThresholdMs = getStaleThresholdMs(agent);
    const ageMs = statusMtime == null ? Infinity : now - statusMtime;
    const isStale = ageMs > staleThresholdMs;
    const entry = processes.get(agentId);
    const pidInfo = entry && entry.child ? { pid: entry.child.pid, startedAt: entry.startedAt } : readPidFile(agentDir);
    const processAlive = pidInfo && isPidAlive(pidInfo.pid);
    const rateLimited = isRateLimited(agentId) && !restartRequestIds.has(agentId);
    const forceRestart = restartRequestIds.has(agentId);
    const shouldRestart =
      forceRestart ||
      (!processAlive && (entry || statusMtime != null)) ||
      (processAlive && isStale && !rateLimited);

    if (shouldRestart && (!rateLimited || forceRestart)) {
      stopAgent(agentId);
      startAgent(agent, forceRestart);
    } else if (!processAlive && !rateLimited) {
      const scriptBase = getScriptBasename(agent);
      let adopted = false;
      if (scriptBase && (agent.runtime || 'python') === 'python') {
        const pids = pythonByScript[scriptBase];
        const agentsWithSameScript = agents.filter((a) => getScriptBasename(a) === scriptBase);
        if (pids && pids.length === 1 && agentsWithSameScript.length === 1) {
          const adoptedPid = pids[0];
          if (isPidAlive(adoptedPid)) {
            writePidFile(agentDir, adoptedPid, now);
            processes.set(agentId, { child: null, startedAt: now, adopted: true });
            adopted = true;
          }
        }
      }
      if (!adopted) startAgent(agent);
    }

    const currentEntry = processes.get(agentId);
    const currentPidInfo = currentEntry && currentEntry.child ? { pid: currentEntry.child.pid, startedAt: currentEntry.startedAt } : readPidFile(agentDir);
    const timestamps = restartTimestamps.get(agentId);
    state.agents[agentId] = {
      displayName: agent.name || agent.displayName || agentId,
      pid: currentPidInfo ? currentPidInfo.pid : null,
      startedAt: currentPidInfo ? currentPidInfo.startedAt : null,
      lastRestartAt: timestamps && timestamps.length ? timestamps[timestamps.length - 1] : null,
      restartCountInWindow: getRestartCountInWindow(agentId),
      rateLimited: isRateLimited(agentId),
      isStale,
      statusMtime,
    };
  }

  const statePath = getSupervisorStatePath();
  const tmpPath = statePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

function runTick() {
  try {
    tick();
  } catch (e) {
    console.error('[supervisor] tick error:', e);
  }
  tickTimer = setTimeout(runTick, POLL_INTERVAL_MS);
}

function shutdown() {
  if (tickTimer) clearTimeout(tickTimer);
  for (const [agentId, entry] of processes) {
    if (entry && entry.child) {
      try {
        entry.child.kill('SIGTERM');
      } catch (_) {}
    }
  }
  processes.clear();
  const pidPath = getSupervisorPidPath();
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

fs.mkdirSync(TELEMETRY_ROOT, { recursive: true });
const pidPath = getSupervisorPidPath();
fs.writeFileSync(pidPath, `${process.pid}\n${Date.now()}`, 'utf8');

runTick();
