import { Sparkles } from 'lucide-react';
import type { RiskIntelSignal } from '@/lib/data/risk-intelligence';

const DOT: Record<RiskIntelSignal['severity'], string> = {
  critical: 'bg-critical-600',
  high: 'bg-high-risk-600',
  medium: 'bg-warning-600',
  info: 'bg-safe-600',
};

export function AiRiskIntelligence({
  signals,
  recurring,
}: {
  signals: RiskIntelSignal[];
  recurring: { category: string; count: number }[];
}) {
  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-1.5 rounded-sm bg-surface-muted px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-secondary">
        <Sparkles className="h-3 w-3" strokeWidth={2} />
        AI-Assisted Risk Analysis · Simulated intelligence
      </p>

      <ul className="space-y-2.5">
        {signals.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[s.severity]}`} />
            <p className="text-sm text-primary">{s.text}</p>
          </li>
        ))}
      </ul>

      {recurring.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="cg-label">Recurring hazard categories</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recurring.map((r) => (
              <span
                key={r.category}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-primary"
              >
                {r.category}
                <span className="rounded-full bg-surface-muted px-1.5 text-[11px] text-secondary">
                  {r.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
