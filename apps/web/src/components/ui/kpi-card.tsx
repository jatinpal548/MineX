import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/status';

const TONE_ACCENT: Record<Tone, string> = {
  neutral: 'text-secondary',
  safe: 'text-safe-600',
  warning: 'text-warning-600',
  'high-risk': 'text-high-risk-600',
  critical: 'text-critical-600',
  info: 'text-info-600',
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="cg-card p-5 transition-shadow hover:shadow-overlay">
      <div className="flex items-center justify-between">
        <p className="cg-label">{label}</p>
        {Icon ? <Icon className={cn('h-4 w-4', TONE_ACCENT[tone])} strokeWidth={1.75} /> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-primary">
        {value}
      </p>
      {hint ? <p className={cn('mt-1 text-xs', TONE_ACCENT[tone])}>{hint}</p> : null}
    </div>
  );
}
