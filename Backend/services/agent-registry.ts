import fs from 'fs';
import path from 'path';

const TELEMETRY_ROOT = process.env.TELEMETRY_ROOT || path.join(process.cwd(), 'trading-live');

function getRegistryPath(): string {
  return path.join(TELEMETRY_ROOT, 'agents.json');
}

export function getCategorizedAgents(options: { includeTestAgents?: boolean } = {}) {
  const agents = readRegistry();
  if (!options.includeTestAgents) {
    return agents.filter((a: { isTest?: boolean }) => !a.isTest);
  }
  return agents;
}

export function readRegistry(): Array<Record<string, unknown>> {
  try {
    const registryPath = getRegistryPath();
    if (fs.existsSync(registryPath)) {
      return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading registry:', e);
  }
  return [];
}

export function createAgent(agent: Record<string, unknown>) {
  const agents = readRegistry();
  agents.push(agent);
  fs.writeFileSync(getRegistryPath(), JSON.stringify(agents, null, 2));
}

export function updateAgent(agentId: string, updates: Record<string, unknown>) {
  const agents = readRegistry();
  const index = agents.findIndex((a: Record<string, unknown>) => a.id === agentId);
  if (index !== -1) {
    agents[index] = { ...agents[index], ...updates };
    fs.writeFileSync(getRegistryPath(), JSON.stringify(agents, null, 2));
  }
}

export function archiveAgent(agentId: string) {
  const agents = readRegistry();
  const index = agents.findIndex((a: Record<string, unknown>) => a.id === agentId);
  if (index !== -1) {
    const archived = agents.splice(index, 1)[0];
    fs.writeFileSync(getRegistryPath(), JSON.stringify(agents, null, 2));

    const archivedPath = path.join(TELEMETRY_ROOT, 'archived-agents.json');
    const archivedAgents = fs.existsSync(archivedPath)
      ? JSON.parse(fs.readFileSync(archivedPath, 'utf8'))
      : [];
    archivedAgents.push(archived);
    fs.writeFileSync(archivedPath, JSON.stringify(archivedAgents, null, 2));
  }
}

export function getTelemetryRoot(): string {
  return TELEMETRY_ROOT;
}
