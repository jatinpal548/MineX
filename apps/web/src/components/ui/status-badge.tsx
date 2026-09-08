import type {
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  InspectionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { Badge } from '@/components/ui/badge';
import {
  CA_STATUS_META,
  INSPECTION_STATUS_META,
  OBSERVATION_STATUS_META,
  RISK_META,
} from '@/lib/status';

export function RiskTag({ risk }: { risk: RiskLevel }) {
  const m = RISK_META[risk];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function InspectionStatusTag({ status }: { status: InspectionStatus }) {
  const m = INSPECTION_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ObservationStatusTag({ status }: { status: ObservationStatus }) {
  const m = OBSERVATION_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function CorrectiveActionStatusTag({ status }: { status: CorrectiveActionStatus }) {
  const m = CA_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const PRIORITY_TONE: Record<CorrectiveActionPriority, 'safe' | 'warning' | 'high-risk' | 'critical'> =
  {
    low: 'safe',
    medium: 'warning',
    high: 'high-risk',
    critical: 'critical',
  };

export function PriorityTag({ priority }: { priority: CorrectiveActionPriority }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}
