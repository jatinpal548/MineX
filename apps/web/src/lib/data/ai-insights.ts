/**
 * AI Risk Insights for the Overview dashboard.
 *
 * Reads the unresolved high/critical observations the caller can see (RLS-scoped)
 * and runs each through the shared, deterministic `analyzeObservation` helper
 * from `@coalguard/ai`. No external model, no API key, no dependency on the
 * `ai_analyses` table's row-level ownership - the insight is derived live from
 * the same observation text the inspector submitted.
 *
 * The observation DETAIL page still reads the persisted `ai_analyses` row (seeded
 * for the demo); this surface is intentionally self-contained so the dashboard
 * always has something truthful to show.
 */
import { analyzeObservation } from '@coalguard/ai';
import type { RiskLevel } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { compareRiskDesc } from '@/lib/status';

export interface AiRiskInsight {
  observationId: string;
  title: string;
  risk: RiskLevel;
  headline: string;
  consequence: string;
  recommendedAction: string;
  confidence: number;
}

const ACTIVE: string[] = ['open', 'action_required', 'in_progress'];

/** Short, board-ready headline per hazard family. */
function headlineFor(text: string, risk: RiskLevel): string {
  const t = text.toLowerCase();
  if (/tension crack|highwall|slope|overhang|loose boulder|bench|batter/.test(t))
    return 'Potential slope instability on the highwall';
  if (/ht panel|lt panel|interlock|earthing|substation|live (wire|cable)|electrocut|switchgear/.test(t))
    return 'Electrical protection control compromised';
  if (/methane|\bgas\b|inrush|inundation|firedamp/.test(t))
    return 'Atmospheric / inrush hazard flagged underground';
  if (/brake|reverse alarm|seatbelt|runaway|haul road|berm|dumper|hemm/.test(t))
    return 'Mobile equipment / haul road hazard';
  if (/ppe|helmet|glove|safety shoe|hi-viz|respirator/.test(t))
    return 'PPE compliance gap in the working area';
  if (/first[- ]?aid|rescue|emergency|fire extinguisher|hydrant/.test(t))
    return 'Emergency response readiness gap';
  return risk === 'critical' || risk === 'high'
    ? 'Elevated safety risk requires management attention'
    : 'Safety issue logged for follow-up';
}

export async function getAiRiskInsights(opts?: {
  mineId?: string;
  limit?: number;
}): Promise<AiRiskInsight[]> {
  const supabase = await createClient();
  const limit = opts?.limit ?? 4;

  let q = supabase
    .from('observations')
    .select('id, title, description, category, risk, status')
    .in('status', ACTIVE)
    .in('risk', ['critical', 'high', 'medium'])
    .order('created_at', { ascending: false })
    .limit(30);
  if (opts?.mineId) q = q.eq('mine_id', opts.mineId);

  const { data } = await q;
  const rows = (data ?? []) as {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    risk: RiskLevel;
    status: string;
  }[];

  const insights: AiRiskInsight[] = rows.map((r) => {
    const a = analyzeObservation({
      title: r.title,
      description: r.description,
      category: r.category,
    });
    const text = `${r.title} ${r.description ?? ''} ${r.category ?? ''}`;
    return {
      observationId: r.id,
      title: r.title,
      // Trust the inspector's stored risk band for the badge; use the heuristic
      // only for the narrative (headline / consequence / action).
      risk: r.risk,
      headline: headlineFor(text, r.risk),
      consequence: a.consequence,
      recommendedAction: a.recommendedAction,
      confidence: a.confidence,
    };
  });

  insights.sort((x, y) => compareRiskDesc(x.risk, y.risk));
  return insights.slice(0, limit);
}
