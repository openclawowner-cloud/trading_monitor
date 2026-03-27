import fs from 'fs';
import path from 'path';
import { WOO_REAL_ENABLE_STAGING_TRADING, WOO_REAL_TELEMETRY_ROOT } from '../config';
import type { WooRealAgentMode, WooRealRegistryAgent } from '../types';

function getAgentsPath(): string {
  return path.join(WOO_REAL_TELEMETRY_ROOT, 'agents.json');
}

export function isWooRealPaperExchangeAllowed(mode: WooRealAgentMode): boolean {
  if (mode === 'paper_local') return true;
  return WOO_REAL_ENABLE_STAGING_TRADING;
}

function normalizeMode(value: unknown): WooRealAgentMode {
  if (value === 'paper_exchange' || value === 'paper_local') return value;
  return 'paper_local';
}

export function normalizeWooRealRegistryAgent(raw: unknown): WooRealRegistryAgent | null {
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

export function readWooRealRegistry(): WooRealRegistryAgent[] {
  const p = getAgentsPath();
  if (!fs.existsSync(p)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: WooRealRegistryAgent[] = [];
  for (const row of parsed) {
    const n = normalizeWooRealRegistryAgent(row);
    if (n) out.push(n);
  }
  return out;
}

export function findWooRealRegistryAgent(agentId: string): WooRealRegistryAgent | null {
  const id = agentId.trim();
  if (!id) return null;
  return readWooRealRegistry().find((a) => a.id === id) ?? null;
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

export function updateWooRealAgent(agentId: string, patch: Record<string, unknown>): boolean {
  const id = agentId.trim();
  if (!id) return false;
  const rows = readRawRegistry();
  const idx = rows.findIndex((r) => typeof r.id === 'string' && r.id === id);
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], ...patch };
  writeRawRegistry(rows);
  return true;
}
