export interface VersionInfo {
  version: string;
  capabilities: string[];
}

export function getVersionInfo(): VersionInfo {
  return {
    version: process.env.npm_package_version || '1.0.0',
    capabilities: [
      'agents',
      'agent-detail',
      'reconciliation',
      'config',
      'heartbeat',
      'lifecycle',
      'alerts'
    ]
  };
}
