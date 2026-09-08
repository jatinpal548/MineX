/**
 * M3B governance reads: corrective-action evidence, the audit-trail timeline,
 * and the eligible-assignee list. All through the RLS-scoped SSR client.
 */
import { createClient } from '@/lib/supabase/server';
import { one } from './shared';
import type { EvidenceItem } from './inspections';

export interface GovernanceEvent {
  id: string;
  action: string;
  label: string;
  at: string;
  actorName: string | null;
  note: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  'corrective_action.assigned': 'Assigned',
  'corrective_action.progress': 'Progress updated',
  'corrective_action.status': 'Status changed',
  'corrective_action.submitted': 'Submitted for verification',
  'corrective_action.verified': 'Verified & closed',
  'corrective_action.rejected': 'Rejected',
  'corrective_action.evidence_added': 'Closure evidence added',
};

function evidenceFromRow(r: Record<string, unknown>): EvidenceItem {
  const lat = r.gps_latitude as number | null;
  const lng = r.gps_longitude as number | null;
  return {
    id: r.id as string,
    storagePath: r.storage_path as string,
    fileName: (r.file_name as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    evidenceType: (r.evidence_type as string) ?? 'photo',
    isSimulated: Boolean(r.is_simulated),
    caption: (r.caption as string) ?? null,
    capturedAt: (r.captured_at as string) ?? null,
    coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
    observationId: (r.observation_id as string) ?? null,
  };
}

/** Evidence attached to the corrective action itself, plus its observation's evidence. */
export async function getCorrectiveActionEvidence(
  caId: string,
  observationId: string | null,
): Promise<{ closure: EvidenceItem[]; observation: EvidenceItem[] }> {
  const supabase = await createClient();
  const cols =
    'id, storage_path, file_name, mime_type, evidence_type, is_simulated, caption, captured_at, gps_latitude, gps_longitude, observation_id, corrective_action_id, created_at';

  const [closureRes, obsRes] = await Promise.all([
    supabase
      .from('evidence')
      .select(cols)
      .eq('corrective_action_id', caId)
      .order('created_at', { ascending: true }),
    observationId
      ? supabase
          .from('evidence')
          .select(cols)
          .eq('observation_id', observationId)
          .is('corrective_action_id', null)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  return {
    closure: ((closureRes.data ?? []) as Record<string, unknown>[]).map(evidenceFromRow),
    observation: ((obsRes.data ?? []) as Record<string, unknown>[]).map(evidenceFromRow),
  };
}

/** The audit-trail rows for this corrective action (scope-filtered by RLS). */
export async function getGovernanceEvents(caId: string): Promise<GovernanceEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select(
      `id, action, after, created_at,
       actor:profiles!audit_logs_actor_id_fkey(full_name)`,
    )
    .eq('entity_type', 'corrective_action')
    .eq('entity_id', caId)
    .order('created_at', { ascending: true })
    .limit(100);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const after = (r.after ?? {}) as { note?: unknown; reason?: unknown };
    const note =
      typeof after.note === 'string'
        ? after.note
        : typeof after.reason === 'string'
          ? after.reason
          : null;
    const actor = one(r.actor as unknown) as { full_name?: string } | null;
    const action = r.action as string;
    return {
      id: r.id as string,
      action,
      label: ACTION_LABEL[action] ?? action,
      at: r.created_at as string,
      actorName: actor?.full_name ?? null,
      note,
    };
  });
}

export interface EligibleAssignee {
  id: string;
  fullName: string;
  email: string | null;
}

/** Valid assignees for the action's mine (SECURITY DEFINER RPC, scope-checked). */
export async function getEligibleAssignees(caId: string): Promise<EligibleAssignee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('eligible_ca_assignees', { p_ca_id: caId });
  if (error) return [];
  return ((data ?? []) as { id: string; full_name: string; email: string | null }[]).map((r) => ({
    id: r.id,
    fullName: r.full_name || r.email || 'Unknown user',
    email: r.email ?? null,
  }));
}
