'use client';

import { Radio, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { RealtimeStatus } from '@/lib/realtime/useRealtime';

const STATUS_CONFIG: Record<
  RealtimeStatus,
  { label: string; tone: string; dot: string; icon: typeof Radio }
> = {
  live: {
    label: 'LIVE',
    tone: 'border-safe-600/30 bg-safe-50 text-safe-700 dark:bg-safe-950/40 dark:text-safe-400',
    dot: 'bg-safe-600 animate-pulse',
    icon: Radio,
  },
  connecting: {
    label: 'CONNECTING',
    tone: 'border-warning-600/30 bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400',
    dot: 'bg-warning-600 animate-spin',
    icon: RefreshCw,
  },
  offline: {
    label: 'OFFLINE',
    tone: 'border-border bg-surface-muted text-secondary',
    dot: 'bg-secondary',
    icon: WifiOff,
  },
  error: {
    label: 'RECONNECTING',
    tone: 'border-critical-600/30 bg-critical-50 text-critical-700 dark:bg-critical-950/40 dark:text-critical-400',
    dot: 'bg-critical-600 animate-pulse',
    icon: WifiOff,
  },
};

export function RealtimeBadge({
  status,
  lastEventAt,
  compact = false,
  className,
}: {
  status: RealtimeStatus;
  lastEventAt?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wider transition-colors',
        c.tone,
        className,
      )}
      title={
        lastEventAt
          ? `Connected to realtime stream. Last event at ${new Date(lastEventAt).toLocaleTimeString()}`
          : `Realtime connection state: ${status}`
      }
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      {!compact ? <span>{c.label}</span> : null}
    </span>
  );
}