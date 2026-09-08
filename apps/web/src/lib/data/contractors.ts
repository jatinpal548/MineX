/**
 * Contractor management data. RLS-scoped SSR client.
 *
 * Real tables: `contractors`, `contractor_workers`. A contractor's
 * "compliance / risk status" is derived transparently from its workforce
 * records (induction done, medical validity) and contract dates — no invented
 * operational facts.
 */
import { createClient } from '@/lib/supabase/server';
import type { Tone } from '@/lib/status';
import { one } from './shared';

export type ContractorRisk = 'compliant' | 'watch' | 'high' | 'critical';

export const CONTRACTOR_RISK_META: Record<ContractorRisk, { label: string; tone: Tone }> = {
  compliant: { label: 'Compliant', tone: 'safe' },
  watch: { label: 'Watch', tone: 'warning' },
  high: { label: 'High risk', tone: 'high-risk' },
  critical: { label: 'Critical', tone: 'critical' },
};

export interface ContractorWorkerRow {
  id: string;
  fullName: string;
  designation: string | null;
  inductionDone: boolean;
  inductionDate: string | null;
  medicalValidUntil: string | null;
  medicalState: 'valid' | 'expiring' | 'expired' | 'unknown';
  isActive: boolean;
}

export interface ContractorRow {
  id: string;
  name: string;
  registrationNo: string;
  mineName: string | null;
  contactPerson: string | null;
  phone: string | null;
  scopeOfWork: string | null;
  isActive: boolean;
  contractStart: string | null;
  contractEnd: string | null;
  contractState: 'active' | 'expiring' | 'expired' | 'open';
  workerCount: number;
  activeWorkers: number;
  inductionGaps: number;
  medicalIssues: number;
  risk: ContractorRisk;
}

const DAY = 86_400_000;

function medicalState(until: string | null): ContractorWorkerRow['medicalState'] {
  if (!until) return 'unknown';
  const d = new Date(until).getTime();
  if (Number.isNaN(d)) return 'unknown';
  const days = (d - Date.now()) / DAY;
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

function contractState(start: string | null, end: string | null): ContractorRow['contractState'] {
  if (!end) return start ? 'active' : 'open';
  const days = (new Date(end).getTime() - Date.now()) / DAY;
  if (Number.isNaN(days)) return 'open';
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'active';
}

function scoreRisk(c: {
  isActive: boolean;
  contractState: ContractorRow['contractState'];
  inductionGaps: number;
  medicalExpired: number;
  medicalExpiring: number;
}): ContractorRisk {
  if (!c.isActive) return 'watch';
  if (c.medicalExpired > 0 || c.inductionGaps > 0 || c.contractState === 'expired') return 'critical';
  if (c.contractState === 'expiring' || c.medicalExpiring > 0) return 'high';
  return 'compliant';
}

export async function listContractors(opts?: { mineId?: string }): Promise<ContractorRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from('contractors')
    .select(
      `id, name, registration_no, contact_person, phone, scope_of_work, is_active,
       contract_start, contract_end,
       mine:mines!contractors_mine_id_fkey(name),
       contractor_workers(id, induction_done, medical_valid_until, is_active)`,
    )
    .order('name', { ascending: true })
    .limit(200);
  if (opts?.mineId) q = q.eq('mine_id', opts.mineId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const workers = (r.contractor_workers ?? []) as {
      id: string;
      induction_done: boolean;
      medical_valid_until: string | null;
      is_active: boolean;
    }[];
    const active = workers.filter((w) => w.is_active);
    const inductionGaps = active.filter((w) => !w.induction_done).length;
    const medExpired = active.filter((w) => medicalState(w.medical_valid_until) === 'expired').length;
    const medExpiring = active.filter(
      (w) => medicalState(w.medical_valid_until) === 'expiring',
    ).length;
    const cs = contractState(r.contract_start as string | null, r.contract_end as string | null);
    return {
      id: r.id as string,
      name: r.name as string,
      registrationNo: r.registration_no as string,
      mineName: (one(r.mine as unknown) as { name?: string } | null)?.name ?? null,
      contactPerson: (r.contact_person as string) ?? null,
      phone: (r.phone as string) ?? null,
      scopeOfWork: (r.scope_of_work as string) ?? null,
      isActive: Boolean(r.is_active),
      contractStart: (r.contract_start as string) ?? null,
      contractEnd: (r.contract_end as string) ?? null,
      contractState: cs,
      workerCount: workers.length,
      activeWorkers: active.length,
      inductionGaps,
      medicalIssues: medExpired + medExpiring,
      risk: scoreRisk({
        isActive: Boolean(r.is_active),
        contractState: cs,
        inductionGaps,
        medicalExpired: medExpired,
        medicalExpiring: medExpiring,
      }),
    };
  });
}

export interface ContractorDetail extends ContractorRow {
  workers: ContractorWorkerRow[];
}

export async function getContractorDetail(id: string): Promise<ContractorDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contractors')
    .select(
      `id, name, registration_no, contact_person, phone, scope_of_work, is_active,
       contract_start, contract_end,
       mine:mines!contractors_mine_id_fkey(name),
       contractor_workers(id, full_name, designation, induction_done, induction_date, medical_valid_until, is_active)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const rawWorkers = (data.contractor_workers ?? []) as {
    id: string;
    induction_done: boolean;
    medical_valid_until: string | null;
    is_active: boolean;
  }[];
  const activeW = rawWorkers.filter((w) => w.is_active);
  const inductionGaps = activeW.filter((w) => !w.induction_done).length;
  const medExpired = activeW.filter(
    (w) => medicalState(w.medical_valid_until) === 'expired',
  ).length;
  const medExpiring = activeW.filter(
    (w) => medicalState(w.medical_valid_until) === 'expiring',
  ).length;
  const cs = contractState(
    data.contract_start as string | null,
    data.contract_end as string | null,
  );
  const summary: ContractorRow = {
    id: data.id as string,
    name: data.name as string,
    registrationNo: data.registration_no as string,
    mineName: (one(data.mine as unknown) as { name?: string } | null)?.name ?? null,
    contactPerson: (data.contact_person as string) ?? null,
    phone: (data.phone as string) ?? null,
    scopeOfWork: (data.scope_of_work as string) ?? null,
    isActive: Boolean(data.is_active),
    contractStart: (data.contract_start as string) ?? null,
    contractEnd: (data.contract_end as string) ?? null,
    contractState: cs,
    workerCount: rawWorkers.length,
    activeWorkers: activeW.length,
    inductionGaps,
    medicalIssues: medExpired + medExpiring,
    risk: scoreRisk({
      isActive: Boolean(data.is_active),
      contractState: cs,
      inductionGaps,
      medicalExpired: medExpired,
      medicalExpiring: medExpiring,
    }),
  };

  const workers: ContractorWorkerRow[] = (
    (data.contractor_workers ?? []) as Record<string, unknown>[]
  )
    .map((w) => ({
      id: w.id as string,
      fullName: w.full_name as string,
      designation: (w.designation as string) ?? null,
      inductionDone: Boolean(w.induction_done),
      inductionDate: (w.induction_date as string) ?? null,
      medicalValidUntil: (w.medical_valid_until as string) ?? null,
      medicalState: medicalState(w.medical_valid_until as string | null),
      isActive: Boolean(w.is_active),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { ...summary, workers };
}

export interface ContractorKpis {
  total: number;
  active: number;
  atRisk: number;
  totalWorkers: number;
  inductionGaps: number;
  medicalIssues: number;
}

export function contractorKpis(rows: ContractorRow[]): ContractorKpis {
  return {
    total: rows.length,
    active: rows.filter((r) => r.isActive).length,
    atRisk: rows.filter((r) => r.risk === 'high' || r.risk === 'critical').length,
    totalWorkers: rows.reduce((s, r) => s + r.workerCount, 0),
    inductionGaps: rows.reduce((s, r) => s + r.inductionGaps, 0),
    medicalIssues: rows.reduce((s, r) => s + r.medicalIssues, 0),
  };
}
