/**
 * Overview dashboard data — ONE consolidated fetch.
 *
 * Previously the page called six data functions (getDashboardData +
 * getAiRiskInsights + getRiskIntelligence + getComplianceSnapshot +
 * getOperationsData + getRiskMapData). Together they re-queried `observations`
 * ~8×, `corrective_actions` 4×, `compliance` 3×, `equipment`/`env`/`maintenance`
 * 2× each — ~26 Supabase round-trips per load.
 *
 * This module now fetches each base table ONCE (one Promise.all), then derives
 * every dashboard section in memory. ~9 round-trips. Every number is still a
 * real tally from Supabase; RLS + the optional `mineId` scope still apply. The
 * per-page functions (`getRiskIntelligence`, `getOperationsData`,
 * `getRiskMapData`) are untouched — other routes keep using them.
 */
import { cache } from 'react';
import { analyzeObservation } from '@coalguard/ai';
import type { CorrectiveActionStatus, ObservationStatus, RiskLevel } from '@coalguard/types';
import { RISK_LEVELS } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import {
  CA_PENDING_STATUSES,
  OBSERVATION_OPEN_STATUSES,
  compareRiskDesc,
} from '@/lib/status';
import { getComplianceRegister } from './compliance';
import type { AiRiskInsight } from './ai-insights';
import type { RiskIntelligence, RiskIntelSignal } from './risk-intelligence';
import type { RiskMapPoint } from './risk-map';

const ACTIVE_RISK_STATUSES: ObservationStatus[] = ['open', 'action_required', 'in_progress'];
const DAY_MS = 86_400_000;

/* --------------------------------- shapes -------------------------------- */

export interface DashboardKpis {
  totalInspections: number;
  openObservations: number;
  highCriticalRisks: number;
  pendingCorrectiveActions: number;
  compliance: {
    total: number;
    compliant: number;
    label: string;
    tone: 'safe' | 'warning' | 'critical' | 'neutral';
  };
}

export interface PriorityFinding {
  id: string;
  title: string;
  risk: RiskLevel;
  status: ObservationStatus;
  category: string | null;
  createdAt: string;
  mineName: string | null;
  coords: { lat: number; lng: number } | null;
  inspection: { id: string; title: string } | null;
  inspectorName: string | null;
  assigneeName: string | null;
  correctiveActionStatus: CorrectiveActionStatus | null;
  evidenceCount: number;
}

export type ActivityKind =
  | 'inspection_submitted'
  | 'inspection_created'
  | 'observation_created'
  | 'evidence_uploaded'
  | 'corrective_action_assigned'
  | 'corrective_action_updated';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  description: string;
  actor: string | null;
  timestamp: string;
  mineName: string | null;
  href: string | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  inspectionTrend: { date: string }[];
  riskDistribution: { risk: RiskLevel; label: string; count: number }[];
  observationStatus: { status: ObservationStatus; count: number }[];
  correctiveActionStatus: { status: CorrectiveActionStatus; count: number }[];
  priorityFindings: PriorityFinding[];
  activity: ActivityItem[];
  hasAnyData: boolean;

  /* consolidated extras (previously separate data functions) */
  aiInsights: AiRiskInsight[];
  intel: Pick<
    RiskIntelligence,
    'escalation' | 'signals' | 'recurringCategories' | 'envBreaches' | 'equipmentDown'
  >;
  compliance: {
    total: number;
    compliant: number;
    dueSoon: number;
    atRisk: number;
    nonCompliant: number;
    overdue: number;
  };
  ops: { equipmentTotal: number; operational: number; breaches: number };
  riskMap: { center: { lat: number; lng: number } | null; points: RiskMapPoint[] };
}

function rel<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/* -------------------------- AI insight headline ------------------------- */
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

const isOverdue = (due: string | null, status: string) =>
  !!due && status !== 'verified' && status !== 'closed' && new Date(due).getTime() < Date.now();
const isDueSoon = (due: string | null, status: string) => {
  if (!due || status === 'verified' || status === 'closed') return false;
  const d = new Date(due).getTime() - Date.now();
  return d >= 0 && d <= 7 * DAY_MS;
};

/* ------------------------------- main ---------------------------------- */

/** Share the overview and supporting queries within each server render. */
const startDashboardQueries = cache(async (mineId: string | undefined) => {
  const supabase = await createClient();
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    mineId ? q.eq('mine_id', mineId) : q;

  const inspQ = scope(
    supabase
      .from('inspections')
      .select(
        `id, title, status, created_at, started_at, submitted_at,
         mine:mines!inspections_mine_id_fkey(name),
         inspector:profiles!inspections_inspector_id_fkey(full_name)`,
      )
      .order('created_at', { ascending: false })
      .limit(500),
  );

  const obsQ = scope(
    supabase
      .from('observations')
      .select(
        `id, title, description, risk, status, category, created_at, gps_latitude, gps_longitude,
         mine:mines!observations_mine_id_fkey(name),
         inspection:inspections!observations_inspection_id_fkey(id, title),
         raised_by_profile:profiles!observations_raised_by_fkey(full_name),
         corrective_actions(status, assignee:profiles!corrective_actions_assigned_to_fkey(full_name)),
         evidence(count)`,
      )
      .order('created_at', { ascending: false })
      .limit(500),
  );

  const caQ = scope(
    supabase
      .from('corrective_actions')
      .select(
        `id, title, status, priority, due_date, created_at, updated_at, assigned_at, observation_id,
         mine:mines!corrective_actions_mine_id_fkey(name),
         assignee:profiles!corrective_actions_assigned_to_fkey(full_name)`,
      )
      .order('updated_at', { ascending: false })
      .limit(500),
  );

  const eviQ = scope(
    supabase
      .from('evidence')
      .select(
        `id, created_at, is_simulated, observation_id, evidence_type,
         mine:mines!evidence_mine_id_fkey(name),
         uploader:profiles!evidence_uploaded_by_fkey(full_name)`,
      )
      .order('created_at', { ascending: false })
      .limit(8),
  );

  const envQ = scope(supabase.from('environmental_readings').select('is_breach').limit(2000));
  const eqQ = scope(supabase.from('equipment').select('status').limit(1000));
  const mtQ = scope(
    supabase.from('maintenance_records').select('status, scheduled_for').limit(2000),
  );
  const mineQ = mineId
    ? supabase.from('mines').select('name, latitude, longitude').eq('id', mineId).maybeSingle()
    : Promise.resolve({ data: null });

  return {
    overview: Promise.all([inspQ, obsQ, caQ, envQ, getComplianceRegister({ mineId })]),
    supporting: [eviQ, eqQ, mtQ, mineQ] as const,
  };
});

export const getDashboardOverview = cache(async (mineId: string | undefined) => {
  const { overview } = await startDashboardQueries(mineId);
  const [inspR, obsR, caR, envR, register] = await overview;
  const inspections = (inspR.data ?? []) as Record<string, unknown>[];
  const observations = (obsR.data ?? []) as Record<string, unknown>[];
  const cas = (caR.data ?? []) as Record<string, unknown>[];
  const env = (envR.data ?? []) as { is_breach: boolean }[];

  /* ------------------------------- KPIs ------------------------------- */
  const openObservations = observations.filter((o) =>
    OBSERVATION_OPEN_STATUSES.includes(o.status as ObservationStatus),
  ).length;
  const highCriticalRisks = observations.filter(
    (o) =>
      ['high', 'critical'].includes(o.risk as string) &&
      ACTIVE_RISK_STATUSES.includes(o.status as ObservationStatus),
  ).length;
  const pendingCorrectiveActions = cas.filter((c) =>
    CA_PENDING_STATUSES.includes(c.status as CorrectiveActionStatus),
  ).length;

  const rk = register.kpis;
  let compLabel = 'No data';
  let compTone: DashboardKpis['compliance']['tone'] = 'neutral';
  if (rk.total > 0) {
    if (rk.nonCompliant > 0) {
      compLabel = 'Non-compliant';
      compTone = 'critical';
    } else if (rk.atRisk > 0) {
      compLabel = 'At risk';
      compTone = 'warning';
    } else if (rk.compliant === rk.total) {
      compLabel = 'Compliant';
      compTone = 'safe';
    } else {
      compLabel = 'Pending review';
      compTone = 'warning';
    }
  }

  const kpis: DashboardKpis = {
    totalInspections: inspections.length,
    openObservations,
    highCriticalRisks,
    pendingCorrectiveActions,
    compliance: { total: rk.total, compliant: rk.compliant, label: compLabel, tone: compTone },
  };

  const overdueActions = cas.filter((c) =>
    isOverdue(c.due_date as string | null, c.status as string),
  ).length;
  const envBreaches = env.filter((e) => e.is_breach).length;

  const escalation = {
    critical: observations.filter(
      (o) => ACTIVE_RISK_STATUSES.includes(o.status as ObservationStatus) && o.risk === 'critical',
    ).length,
    overdue: overdueActions,
    dueSoon: cas.filter((c) => isDueSoon(c.due_date as string | null, c.status as string)).length,
    awaitingVerification: cas.filter((c) => c.status === 'submitted').length,
  };

  return { kpis, escalation, envBreaches, inspections, observations, cas, rk };
});

const loadDashboardData = cache(async (mineId: string | undefined): Promise<DashboardData> => {
  const [overview, [eviR, eqR, mtR, mineR]] = await Promise.all([
    getDashboardOverview(mineId),
    startDashboardQueries(mineId).then(({ supporting }) => Promise.all(supporting)),
  ]);
  const { kpis, escalation, envBreaches, inspections, observations, cas, rk } = overview;
  const { highCriticalRisks, openObservations, pendingCorrectiveActions } = kpis;
  const overdueActions = escalation.overdue;
  const evidence = (eviR.data ?? []) as Record<string, unknown>[];
  const equipment = (eqR.data ?? []) as { status: string }[];
  const maintenance = (mtR.data ?? []) as { status: string; scheduled_for: string | null }[];
  const mineRow = (mineR as { data: { name?: string; latitude?: number; longitude?: number } | null })
    .data;

  /* --------------------------- inspection trend --------------------- */
  // Use the most meaningful lifecycle timestamp; exclude cancelled drafts.
  const inspectionTrend = inspections
    .filter((r) => r.status !== 'cancelled')
    .map((r) => ({
      date:
        (r.submitted_at as string) ?? (r.started_at as string) ?? (r.created_at as string),
    }))
    .filter((r) => !!r.date);

  /* ---------------------------- breakdowns ------------------------- */
  const riskDistribution = RISK_LEVELS.map((risk) => ({
    risk,
    label: risk.charAt(0).toUpperCase() + risk.slice(1),
    count: observations.filter((o) => o.risk === risk).length,
  }));

  const obsStatusCounts = new Map<ObservationStatus, number>();
  for (const o of observations) {
    const s = o.status as ObservationStatus;
    obsStatusCounts.set(s, (obsStatusCounts.get(s) ?? 0) + 1);
  }
  const observationStatus = [...obsStatusCounts.entries()].map(([status, count]) => ({
    status,
    count,
  }));

  const caStatusCounts = new Map<CorrectiveActionStatus, number>();
  for (const c of cas) {
    const s = c.status as CorrectiveActionStatus;
    caStatusCounts.set(s, (caStatusCounts.get(s) ?? 0) + 1);
  }
  const correctiveActionStatus = [...caStatusCounts.entries()].map(([status, count]) => ({
    status,
    count,
  }));

  /* -------------------------- priority findings ------------------- */
  const priorityFindings: PriorityFinding[] = observations
    .filter(
      (r) =>
        ACTIVE_RISK_STATUSES.includes(r.status as ObservationStatus) &&
        ['critical', 'high', 'medium'].includes(r.risk as string),
    )
    .map((r) => {
      const ca = rel(r.corrective_actions as unknown) as
        | { status: CorrectiveActionStatus; assignee: { full_name?: string } | null }
        | null;
      const insp = rel(r.inspection as unknown) as { id: string; title: string } | null;
      const mine = rel(r.mine as unknown) as { name?: string } | null;
      const raisedBy = rel(r.raised_by_profile as unknown) as { full_name?: string } | null;
      const evi = rel(r.evidence as unknown) as { count?: number } | null;
      const lat = r.gps_latitude as number | null;
      const lng = r.gps_longitude as number | null;
      return {
        id: r.id as string,
        title: r.title as string,
        risk: r.risk as RiskLevel,
        status: r.status as ObservationStatus,
        category: (r.category as string) ?? null,
        createdAt: r.created_at as string,
        mineName: mine?.name ?? null,
        coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
        inspection: insp ? { id: insp.id, title: insp.title } : null,
        inspectorName: raisedBy?.full_name ?? null,
        assigneeName: ca?.assignee?.full_name ?? null,
        correctiveActionStatus: ca?.status ?? null,
        evidenceCount: evi?.count ?? 0,
      };
    })
    .sort(
      (a, b) =>
        compareRiskDesc(a.risk, b.risk) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 8);

  /* ---------------------------- activity -------------------------- */
  const activity: ActivityItem[] = [];
  for (const r of inspections.slice(0, 8)) {
    const mine = rel(r.mine as unknown) as { name?: string } | null;
    const who = rel(r.inspector as unknown) as { full_name?: string } | null;
    const submitted = r.submitted_at as string | null;
    activity.push({
      id: `insp-${r.id as string}`,
      kind: submitted ? 'inspection_submitted' : 'inspection_created',
      description: submitted
        ? `Inspection submitted: ${r.title as string}`
        : `Inspection started: ${r.title as string}`,
      actor: who?.full_name ?? null,
      timestamp: submitted ?? (r.created_at as string),
      mineName: mine?.name ?? null,
      href: `/inspections/${r.id as string}`,
    });
  }
  for (const r of observations.slice(0, 8)) {
    const mine = rel(r.mine as unknown) as { name?: string } | null;
    const who = rel(r.raised_by_profile as unknown) as { full_name?: string } | null;
    activity.push({
      id: `obs-${r.id as string}`,
      kind: 'observation_created',
      description: `Observation raised: ${r.title as string}`,
      actor: who?.full_name ?? null,
      timestamp: r.created_at as string,
      mineName: mine?.name ?? null,
      href: `/observations/${r.id as string}`,
    });
  }
  for (const r of evidence) {
    const mine = rel(r.mine as unknown) as { name?: string } | null;
    const who = rel(r.uploader as unknown) as { full_name?: string } | null;
    const obsId = r.observation_id as string | null;
    const isVoice = r.evidence_type === 'voice_note';
    activity.push({
      id: `evi-${r.id as string}`,
      kind: 'evidence_uploaded',
      description: isVoice
        ? 'Voice note captured'
        : (r.is_simulated as boolean)
          ? 'Simulated field evidence uploaded'
          : 'Field evidence uploaded',
      actor: who?.full_name ?? null,
      timestamp: r.created_at as string,
      mineName: mine?.name ?? null,
      href: obsId ? `/observations/${obsId}` : null,
    });
  }
  for (const r of cas.slice(0, 8)) {
    const mine = rel(r.mine as unknown) as { name?: string } | null;
    const who = rel(r.assignee as unknown) as { full_name?: string } | null;
    const assignedAt = r.assigned_at as string | null;
    const caStatus = r.status as CorrectiveActionStatus;
    const title = r.title as string;
    const verb =
      caStatus === 'verified' || caStatus === 'closed'
        ? 'verified & closed'
        : caStatus === 'rejected'
          ? 'rejected'
          : caStatus === 'submitted'
            ? 'submitted for verification'
            : assignedAt
              ? 'assigned'
              : 'updated';
    activity.push({
      id: `ca-${r.id as string}`,
      kind: verb === 'assigned' ? 'corrective_action_assigned' : 'corrective_action_updated',
      description: `Corrective action ${verb}: ${title}`,
      actor: who?.full_name ?? null,
      timestamp: (r.updated_at as string) ?? (r.created_at as string),
      mineName: mine?.name ?? null,
      href: `/corrective-actions/${r.id as string}`,
    });
  }
  activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const activityTop = activity.slice(0, 12);

  /* --------------------------- AI insights ----------------------- */
  const aiInsights: AiRiskInsight[] = observations
    .filter(
      (r) =>
        ACTIVE_RISK_STATUSES.includes(r.status as ObservationStatus) &&
        ['critical', 'high', 'medium'].includes(r.risk as string),
    )
    .slice(0, 30)
    .map((r) => {
      const a = analyzeObservation({
        title: r.title as string,
        description: (r.description as string) ?? null,
        category: (r.category as string) ?? null,
      });
      const text = `${r.title} ${(r.description as string) ?? ''} ${(r.category as string) ?? ''}`;
      return {
        observationId: r.id as string,
        title: r.title as string,
        risk: r.risk as RiskLevel,
        headline: headlineFor(text, r.risk as RiskLevel),
        consequence: a.consequence,
        recommendedAction: a.recommendedAction,
        confidence: a.confidence,
      };
    })
    .sort((x, y) => compareRiskDesc(x.risk, y.risk))
    .slice(0, 4);

  /* -------------------- risk intelligence (subset) --------------- */
  const catMap = new Map<string, { count: number; critical: number }>();
  for (const o of observations) {
    const c = (o.category as string) ?? 'Uncategorised';
    const cur = catMap.get(c) ?? { count: 0, critical: 0 };
    cur.count += 1;
    if (o.risk === 'critical' || o.risk === 'high') cur.critical += 1;
    catMap.set(c, cur);
  }
  const topCategories = [...catMap.entries()]
    .map(([category, v]) => ({ category, count: v.count, critical: v.critical }))
    .sort((a, b) => b.critical - a.critical || b.count - a.count);
  const recurringCategories = [...catMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([category, v]) => ({ category, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const complianceAtRisk = rk.atRisk + rk.nonCompliant + rk.overdue;
  const equipmentDown = equipment.filter(
    (e) => e.status === 'maintenance' || e.status === 'breakdown',
  ).length;
  const equipmentTotal = equipment.length;
  const operational = equipment.filter((e) => e.status === 'operational').length;
  const maintenanceOverdue = maintenance.filter(
    (m) =>
      m.status !== 'completed' &&
      m.scheduled_for &&
      new Date(m.scheduled_for).getTime() < Date.now(),
  ).length;

  const signals: RiskIntelSignal[] = [];
  const topCat = topCategories[0];
  if (topCat && topCat.critical > 0)
    signals.push({
      key: 'top-category',
      severity: 'high',
      text: `${topCat.category} is currently the highest-risk category (${topCat.critical} high/critical finding${topCat.critical === 1 ? '' : 's'}).`,
    });
  if (escalation.critical > 0)
    signals.push({
      key: 'open-critical',
      severity: 'critical',
      text: `${escalation.critical} critical observation${escalation.critical === 1 ? '' : 's'} remain open and unresolved at this scope.`,
    });
  else if (highCriticalRisks > 0)
    signals.push({
      key: 'open-high',
      severity: 'high',
      text: `${highCriticalRisks} high-risk finding${highCriticalRisks === 1 ? '' : 's'} still open — review corrective-action progress.`,
    });
  if (overdueActions > 0)
    signals.push({
      key: 'overdue-ca',
      severity: 'high',
      text: `${overdueActions} corrective action${overdueActions === 1 ? ' is' : 's are'} past due date and should be escalated.`,
    });
  if (recurringCategories.length > 0)
    signals.push({
      key: 'recurring',
      severity: 'medium',
      text: `Recurring hazard pattern: ${recurringCategories[0]!.category} has been raised ${recurringCategories[0]!.count} times — treat as a systemic issue, not isolated events.`,
    });
  if (complianceAtRisk > 0)
    signals.push({
      key: 'compliance',
      severity: 'high',
      text: `${complianceAtRisk} statutory requirement${complianceAtRisk === 1 ? ' is' : 's are'} at risk or overdue — compliance-linked risk is elevated.`,
    });
  if (envBreaches > 0)
    signals.push({
      key: 'env',
      severity: 'medium',
      text: `${envBreaches} environmental reading${envBreaches === 1 ? '' : 's'} above threshold require review (dust / noise / emissions).`,
    });
  if (maintenanceOverdue > 0 || equipmentDown > 0)
    signals.push({
      key: 'equipment',
      severity: 'medium',
      text: `Equipment maintenance risk: ${equipmentDown} unit${equipmentDown === 1 ? '' : 's'} down / in maintenance${maintenanceOverdue > 0 ? `, ${maintenanceOverdue} job(s) past schedule` : ''}.`,
    });
  if (signals.length === 0)
    signals.push({
      key: 'clear',
      severity: 'info',
      text: 'No elevated risk signals for this scope. Continue routine inspections and monitoring.',
    });

  /* ---------------------------- risk map ------------------------- */
  const mapPoints: RiskMapPoint[] = [];
  for (const r of observations) {
    const lat = r.gps_latitude as number | null;
    const lng = r.gps_longitude as number | null;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const mine = rel(r.mine as unknown) as { name?: string } | null;
    mapPoints.push({
      id: r.id as string,
      title: r.title as string,
      risk: r.risk as RiskLevel,
      category: (r.category as string) ?? null,
      status: r.status as ObservationStatus,
      createdAt: r.created_at as string,
      mineName: mine?.name ?? null,
      lat,
      lng,
    });
  }
  mapPoints.sort((a, b) => compareRiskDesc(a.risk, b.risk));

  let mapCenter: { lat: number; lng: number } | null = null;
  if (mineRow && typeof mineRow.latitude === 'number' && typeof mineRow.longitude === 'number') {
    mapCenter = { lat: mineRow.latitude, lng: mineRow.longitude };
  } else if (mapPoints.length > 0) {
    mapCenter = {
      lat: mapPoints.reduce((s, p) => s + p.lat, 0) / mapPoints.length,
      lng: mapPoints.reduce((s, p) => s + p.lng, 0) / mapPoints.length,
    };
  }

  const hasAnyData =
    inspections.length > 0 ||
    openObservations > 0 ||
    pendingCorrectiveActions > 0 ||
    inspectionTrend.length > 0 ||
    activityTop.length > 0;

  return {
    kpis,
    inspectionTrend,
    riskDistribution,
    observationStatus,
    correctiveActionStatus,
    priorityFindings,
    activity: activityTop,
    hasAnyData,
    aiInsights,
    intel: { escalation, signals, recurringCategories, envBreaches, equipmentDown },
    compliance: {
      total: rk.total,
      compliant: rk.compliant,
      dueSoon: rk.dueSoon,
      atRisk: rk.atRisk,
      nonCompliant: rk.nonCompliant,
      overdue: rk.overdue,
    },
    ops: { equipmentTotal, operational, breaches: envBreaches },
    riskMap: { center: mapCenter, points: mapPoints },
  };
});

export function getDashboardData(opts?: { mineId?: string }): Promise<DashboardData> {
  return loadDashboardData(opts?.mineId);
}
