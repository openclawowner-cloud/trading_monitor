import fs from 'fs';
import path from 'path';
import { BYBIT_TELEMETRY_ROOT } from '../config';
import type { BybitAgentMode, BybitRegistryAgent } from '../types';

function getAgentsPath(): string {
  return path.join(BYBIT_TELEMETRY_ROOT, 'agents.json');
}

function normalizeMode(value: unknown): BybitAgentMode {
  if (value === 'paper_exchange' || value === 'paper_local') return value;
  return 'paper_local';
}

export function normalizeBybitRegistryAgent(raw: unknown): BybitRegistryAgent | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== 'string' || !id.trim()) return null;
  const mode = normalizeMode(o.mode);
  const enabled = o.enabled === false ? false : true;
  const extra: Record<string, unknown> = { ...o };
  delete extra.id;
  delete extra.mode;
  delete extra.enabled;
  return { id: id.trim(), mode, enabled, extra };
}

export function readBybitRegistry(): BybitRegistryAgent[] {
  const p = getAgentsPath();
  if (!fs.existsSync(p)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: BybitRegistryAgent[] = [];
  for (const row of parsed) {
    const n = normalizeBybitRegistryAgent(row);
    if (n) out.push(n);
  }
  return out;
}

export function findBybitRegistryAgent(agentId: string): BybitRegistryAgent | null {
  const id = agentId.trim();
  if (!id) return null;
  return readBybitRegistry().find((a) => a.id === id) ?? null;
}

function readRawRegistry(): Record<string, unknown>[] {
  const p = getAgentsPath();
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
      : [];
  } catch {
    return [];
  }
}

function writeRawRegistry(rows: Record<string, unknown>[]): void {
  const p = getAgentsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(rows, null, 2), 'utf8');
}

export function updateBybitAgent(agentId: string, patch: Record<string, unknown>): boolean {
  const id = agentId.trim();
  if (!id) return false;
  const rows = readRawRegistry();
  const idx = rows.findIndex((r) => typeof r.id === 'string' && r.id === id);
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], ...patch };
  writeRawRegistry(rows);
  return true;
}
