import fs from 'fs';
import path from 'path';
import { readRegistry, getTelemetryRoot } from './agent-registry';

export function detectOrphans(telemetryRoot?: string): { orphans: string[]; invalidEntries: string[] } {
  const root = telemetryRoot ?? getTelemetryRoot();
  const registry = readRegistry();
  const registryIds = new Set(registry.map((a: Record<string, unknown>) => a.id as string));

  const orphans: string[] = [];
  const invalidEntries: string[] = [];
  let dirs: string[] = [];

  if (fs.existsSync(root)) {
    dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const dir of dirs) {
      if (!registryIds.has(dir)) {
        orphans.push(dir);
      }
    }

    for (const id of Array.from(registryIds)) {
      if (!dirs.includes(id)) {
        invalidEntries.push(id);
      }
    }
  }

  return { orphans, invalidEntries };
}
