-- 0007_realtime.sql — Realtime for MineX Command
--
-- Makes the Command Center live. Two parts:
--
-- 1. Ensure every table the dashboard cares about is in the `supabase_realtime`
--    publication so Postgres WAL changes flow to subscribed clients. Supabase
--    adds tables to this publication by default, but being explicit makes the
--    dependency visible and survives project resets that rebuild publications.
--
-- 2. `REPLICA IDENTITY FULL` so INSERT/UPDATE payloads carry the full row, not
--    just the primary key. Today the client only needs the *fact* of a change
--    (it re-fetches through RLS), but full payloads let us show live updates
--    without a round-trip later and make optimistic UI possible.
--
-- Additive + idempotent. Safe to re-run.

ALTER TABLE public.inspections REPLICA IDENTITY FULL;
ALTER TABLE public.inspection_items REPLICA IDENTITY FULL;
ALTER TABLE public.observations REPLICA IDENTITY FULL;
ALTER TABLE public.corrective_actions REPLICA IDENTITY FULL;
ALTER TABLE public.evidence REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.compliance_records REPLICA IDENTITY FULL;
ALTER TABLE public.compliance_documents REPLICA IDENTITY FULL;
ALTER TABLE public.environmental_readings REPLICA IDENTITY FULL;
ALTER TABLE public.equipment REPLICA IDENTITY FULL;
ALTER TABLE public.maintenance_records REPLICA IDENTITY FULL;
ALTER TABLE public.grievances REPLICA IDENTITY FULL;
ALTER TABLE public.attendance REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.inspections,
  public.inspection_items,
  public.observations,
  public.corrective_actions,
  public.evidence,
  public.notifications,
  public.audit_logs,
  public.compliance_records,
  public.compliance_documents,
  public.environmental_readings,
  public.equipment,
  public.maintenance_records,
  public.grievances,
  public.attendance;