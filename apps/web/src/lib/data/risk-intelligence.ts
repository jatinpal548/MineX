/**
 * AI-Assisted Risk Intelligence (dashboard).
 *
 * This is deterministic analytics over live Supabase data — NOT a trained ML
 * model. Every number is calculated from real rows; the narrative lines are
 * templated from those numbers. Labelled "AI-Assisted Risk Analysis" /
 * "Simulated AI" in the UI.
 */
import type { CorrectiveActionStatus, ObservationStatus, RiskLevel } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { getComplianceRegister } from './compliance';

const ACTIVE_OBS: ObservationStatus[] = ['open', 'action_required', 'in_progress'];

export interface RiskIntelSignal {
  key: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  text: string;
}

export interface EscalationSummary {
  critical: number;
  overdue: number;
  dueSoon: number;
  awaitingVerification: number;
}

export interface RiskIntelligence {
  riskDistribution: { risk: RiskLevel; count: number }[];
  topCategories: { category: string; count: number; critical: number }[];
  recurringCategories: { category: string; count: number }[];
  openCriticalHigh: number;
  overdueActions: number;
  complianceAtRisk: number;
  envBreaches: number;
  equipmentDown: number;
  maintenanceOverdue: number;
  escalation: EscalationSummary;
  signals: RiskIntelSignal[];
}

function isOverdue(due: string | null, status: string): boolean {
  if (!due) return false;
  if (status === 'verified' || status === 'closed') return false;
  return new Date(due).getTime() < Date.now();
}
function isDueSoon(due: string | null, status: string): boolean {
  if (!due) return false;
  if (status === 'verified' || status === 'closed') return false;
  const d = new Date(due).getTime() - Date.now();
  return d >= 0 && d <= 7 * 86_400_000;
}

export async function getRiskIntelligence(opts?: { mineId?: string }): Promise<RiskIntelligence> {
  const supabase = await createClient();
  const mineId = opts?.mineId;

  const obsQ = supabase.from('observations').select('risk, status, category, created_at').limit(5000);
  const caQ = supabase.from('corrective_actions').select('status, priority, due_date').limit(5000);
  const envQ = supabase.from('environmental_readings').select('is_breach, recorded_at').limit(2000);
  const eqQ = supabase.from('equipment').select('status').limit(1000);
  const mtQ = supabase.from('maintenance_records').select('status, scheduled_for').limit(2000);

  const [obsR, caR, envR, eqR, mtR, compliance] = await Promise.all([
    mineId ? obsQ.eq('mine_id', mineId) : obsQ,
    mineId ? caQ.eq('mine_id', mineId) : caQ,
    mineId ? envQ.eq('mine_id', mineId) : envQ,
    mineId ? eqQ.eq('mine_id', mineId) : eqQ,
    mineId ? mtQ.eq('mine_id', mineId) : mtQ,
    getComplianceRegister({ mineId }),
  ]);

  const obs = (obsR.data ?? []) as {
    risk: RiskLevel;
    status: ObservationStatus;
    category: string | null;
    created_at: string;
  }[];
  const ca = (caR.data ?? []) as {
    status: CorrectiveActionStatus;
    priority: RiskLevel;
    due_date: string | null;
  }[];
  const env = (envR.data ?? []) as { is_breach: boolean }[];
  const eq = (eqR.data ?? []) as { status: string }[];
  const mt = (mtR.data ?? []) as { status: string; scheduled_for: string | null }[];

  const riskDistribution = (['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((risk) => ({
    risk,
    count: obs.filter((o) => o.risk === risk).length,
  }));

  const catMap = new Map<string, { count: number; critical: number }>();
  for (const o of obs) {
    const c = o.category ?? 'Uncategorised';
    const cur = catMap.get(c) ?? { count: 0, critical: 0 };
    cur.count += 1;
    if (o.risk === 'critical' || o.risk === 'high') cur.critical += 1;
    catMap.set(c, cur);
  }
  const topCategories = [...catMap.entries()]
    .map(([category, v]) => ({ category, count: v.count, critical: v.critical }))
    .sort((a, b) => b.critical - a.critical || b.count - a.count)
    .slice(0, 5);
  const recurringCategories = [...catMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([category, v]) => ({ category, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const openCriticalHigh = obs.filter(
    (o) => ACTIVE_OBS.includes(o.status) && (o.risk === 'critical' || o.risk === 'high'),
  ).length;
  const overdueActions = ca.filter((c) => isOverdue(c.due_date, c.status)).length;
  const complianceAtRisk =
    compliance.kpis.atRisk + compliance.kpis.nonCompliant + compliance.kpis.overdue;
  const envBreaches = env.filter((e) => e.is_breach).length;
  const equipmentDown = eq.filter((e) => e.status === 'maintenance' || e.status === 'breakdown').length;
  const maintenanceOverdue = mt.filter(
    (m) => m.status !== 'completed' && m.scheduled_for && new Date(m.scheduled_for).getTime() < Date.now(),
  ).length;

  const escalation: EscalationSummary = {
    critical: obs.filter((o) => ACTIVE_OBS.includes(o.status) && o.risk === 'critical').length,
    overdue: overdueActions,
    dueSoon: ca.filter((c) => isDueSoon(c.due_date, c.status)).length,
    awaitingVerification: ca.filter((c) => c.status === 'submitted').length,
  };

  /* ------------------------- narrative signals ------------------------- */
  const signals: RiskIntelSignal[] = [];
  const topCat = topCategories[0];
  if (topCat && topCat.critical > 0) {
    signals.push({
      key: 'top-category',
      severity: 'high',
      text: `${topCat.category} is currently the highest-risk category (${topCat.critical} high/critical finding${topCat.critical === 1 ? '' : 's'}).`,
    });
  }
  if (escalation.critical > 0) {
    signals.push({
      key: 'open-critical',
      severity: 'critical',
      text: `${escalation.critical} critical observation${escalation.critical === 1 ? '' : 's'} remain open and unresolved at this scope.`,
    });
  } else if (openCriticalHigh > 0) {
    signals.push({
      key: 'open-high',
      severity: 'high',
      text: `${openCriticalHigh} high-risk finding${openCriticalHigh === 1 ? '' : 's'} still open — review corrective-action progress.`,
    });
  }
  if (overdueActions > 0) {
    signals.push({
      key: 'overdue-ca',
      severity: 'high',
      text: `${overdueActions} corrective action${overdueActions === 1 ? ' is' : 's are'} past due date and should be escalated.`,
    });
  }
  if (recurringCategories.length > 0) {
    const r = recurringCategories[0]!;
    signals.push({
      key: 'recurring',
      severity: 'medium',
      text: `Recurring hazard pattern: ${r.category} has been raised ${r.count} times — treat as a systemic issue, not isolated events.`,
    });
  }
  if (complianceAtRisk > 0) {
    signals.push({
      key: 'compliance',
      severity: 'high',
      text: `${complianceAtRisk} statutory requirement${complianceAtRisk === 1 ? ' is' : 's are'} at risk or overdue — compliance-linked risk is elevated.`,
    });
  }
  if (envBreaches > 0) {
    signals.push({
      key: 'env',
      severity: 'medium',
      text: `${envBreaches} environmental reading${envBreaches === 1 ? '' : 's'} above threshold require review (dust / noise / emissions).`,
    });
  }
  if (maintenanceOverdue > 0 || equipmentDown > 0) {
    signals.push({
      key: 'equipment',
      severity: 'medium',
      text: `Equipment maintenance risk: ${equipmentDown} unit${equipmentDown === 1 ? '' : 's'} down / in maintenance${maintenanceOverdue > 0 ? `, ${maintenanceOverdue} job(s) past schedule` : ''}.`,
    });
  }
  if (signals.length === 0) {
    signals.push({
      key: 'clear',
      severity: 'info',
      text: 'No elevated risk signals for this scope. Continue routine inspections and monitoring.',
    });
  }

  return {
    riskDistribution,
    topCategories,
    recurringCategories,
    openCriticalHigh,
    overdueActions,
    complianceAtRisk,
    envBreaches,
    equipmentDown,
    maintenanceOverdue,
    escalation,
    signals,
  };
}
