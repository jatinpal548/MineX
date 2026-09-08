import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { AiRiskInsight } from '@/lib/data/ai-insights';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskTag } from '@/components/ui/status-badge';

export function AiRiskInsights({ insights }: { insights: AiRiskInsight[] }) {
  if (insights.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No active risk signals"
        message="AI insights appear here when unresolved high-risk observations are present."
        compact
      />
    );
  }

  return (
    <ul className="space-y-3">
      {insights.map((i) => (
        <li key={i.observationId} className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-start gap-2.5">
            <RiskTag risk={i.risk} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/observations/${i.observationId}`}
                className="block text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
              >
                {i.headline}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs text-secondary">{i.consequence}</p>
              <p className="mt-1.5 text-xs text-primary">
                <span className="font-medium">Recommended: </span>
                {i.recommendedAction}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
