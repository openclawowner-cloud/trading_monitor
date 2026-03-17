import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Incident } from '../types/api';

interface AlertBannerProps {
  incidents: Incident[];
  killSwitchActive?: boolean;
  onDismiss?: () => void;
}

export function AlertBanner({ incidents, killSwitchActive, onDismiss }: AlertBannerProps) {
  const showKillSwitch = killSwitchActive;
  const showIncidents = incidents.length > 0;
  if (!showKillSwitch && !showIncidents) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {showKillSwitch && (
            <p className="text-sm text-amber-200 font-medium">
              Kill switch is active. Trading is blocked.
            </p>
          )}
          {showIncidents && (
            <ul className="mt-1 text-sm text-zinc-300 space-y-1">
              {incidents.slice(0, 5).map((i, idx) => (
                <li key={idx}>
                  {i.agentId && <span className="font-mono text-zinc-500">{i.agentId}: </span>}
                  {i.reason} — {i.recommendedAction}
                </li>
              ))}
              {incidents.length > 5 && (
                <li className="text-zinc-500">+{incidents.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 text-sm"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
