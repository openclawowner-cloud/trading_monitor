import React from 'react';
import { Archive, AlertTriangle, CheckCircle, Clock, ServerCrash, Square } from 'lucide-react';
import type { AgentStatus } from '../types/api';
import { STATUS_STYLES } from '../constants/statusStyles';

const STATUS_ICONS: Record<AgentStatus, React.ReactNode> = {
  running: <CheckCircle className="w-3 h-3" />,
  stale: <Clock className="w-3 h-3" />,
  offline: <ServerCrash className="w-3 h-3" />,
  error: <AlertTriangle className="w-3 h-3" />,
  disabled: <Square className="w-3 h-3" />,
  archived: <Archive className="w-3 h-3" />
};

interface StatusBadgeProps {
  status: AgentStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.offline;
  const icon = STATUS_ICONS[status] ?? STATUS_ICONS.offline;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border capitalize ${style} ${className}`}
      title={status}
    >
      {icon}
      {status}
    </span>
  );
}
