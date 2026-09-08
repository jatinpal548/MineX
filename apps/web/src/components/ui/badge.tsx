import * as React from 'react';
import { cn } from '@/lib/cn';
import type { RiskLevel } from '@coalguard/types';

type Tone = 'neutral' | 'safe' | 'warning' | 'high-risk' | 'critical' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-secondary',
  safe: 'bg-safe-bg text-safe-600',
  warning: 'bg-warning-bg text-warning-600',
  'high-risk': 'bg-high-risk-bg text-high-risk-600',
  critical: 'bg-critical-bg text-critical-600',
  info: 'bg-info-bg text-info-600',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const riskTone: Record<RiskLevel, Tone> = {
  low: 'safe',
  medium: 'warning',
  high: 'high-risk',
  critical: 'critical',
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge tone={riskTone[risk]}>{risk.toUpperCase()}</Badge>;
}
