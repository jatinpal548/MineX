/**
 * SYNTHETIC DEMO CONTENT for CoalGuard Field - Milestone 1.
 *
 * Every value here is invented for the prototype. It does NOT come from a mine
 * and must always be presented in the UI with a visible "Demo data" label.
 * Later milestones replace these arrays with live Supabase queries.
 */
import type { IconName } from '@/components/Icon';
import type { StatusTone } from '@/lib/theme';

export const DEMO_DATA_LABEL = 'Demo data';
export const DEMO_DATA_NOTICE = 'Synthetic values shown for prototype purposes only.';

/* ----------------------------- today's activity -------------------------- */

export interface MetricCard {
  key: string;
  label: string;
  value: number;
  icon: IconName;
  tone: StatusTone;
}

export const DEMO_TODAY_METRICS: MetricCard[] = [
  { key: 'inspections', label: 'Inspections', value: 4, icon: 'inspection', tone: 'info' },
  { key: 'open_actions', label: 'Open Actions', value: 2, icon: 'tasks', tone: 'warning' },
  { key: 'high_risk', label: 'High Risk', value: 1, icon: 'warning', tone: 'highRisk' },
];

/* ------------------------------ recent activity ------------------------- */

export type ActivityStatus = 'completed' | 'high_risk' | 'warning' | 'info';

export interface ActivityItem {
  id: string;
  title: string;
  location: string;
  time: string;
  status: ActivityStatus;
  icon: IconName;
}

export const DEMO_RECENT_ACTIVITY: ActivityItem[] = [
  {
    id: 'act-1',
    title: 'Safety Inspection',
    location: 'Pit 3',
    time: '09:42 AM',
    status: 'completed',
    icon: 'inspection',
  },
  {
    id: 'act-2',
    title: 'Electrical Observation',
    location: 'Workshop',
    time: '08:17 AM',
    status: 'high_risk',
    icon: 'electrical',
  },
  {
    id: 'act-3',
    title: 'Dust Monitoring',
    location: 'Crusher Zone',
    time: 'Yesterday',
    status: 'warning',
    icon: 'dust',
  },
];

/* ---------------------------------- alerts ----------------------------- */

export type AlertSeverity = 'critical' | 'high_risk' | 'warning' | 'info';

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  meta: string;
  severity: AlertSeverity;
  icon: IconName;
}

export const DEMO_ALERTS: AlertItem[] = [
  {
    id: 'alert-1',
    title: 'High Risk Observation',
    description: 'Electrical hazard reported near the workshop distribution board.',
    meta: 'Zone 04 - Today',
    severity: 'high_risk',
    icon: 'electrical',
  },
  {
    id: 'alert-2',
    title: 'Corrective Action Due',
    description: 'Maintenance action for conveyor guarding is due tomorrow.',
    meta: 'Conveyor Area - Due in 1 day',
    severity: 'warning',
    icon: 'tasks',
  },
  {
    id: 'alert-3',
    title: 'Compliance Reminder',
    description: 'Inspection documentation for this week is due for submission.',
    meta: 'Compliance - Due soon',
    severity: 'info',
    icon: 'documents',
  },
];

/* -------------------- status tone lookups (shared) -------------------- */

export const ACTIVITY_TONE: Record<ActivityStatus, StatusTone> = {
  completed: 'safe',
  high_risk: 'highRisk',
  warning: 'warning',
  info: 'info',
};

export const ACTIVITY_LABEL: Record<ActivityStatus, string> = {
  completed: 'Completed',
  high_risk: 'High Risk',
  warning: 'Warning',
  info: 'Info',
};

export const ALERT_TONE: Record<AlertSeverity, StatusTone> = {
  critical: 'critical',
  high_risk: 'highRisk',
  warning: 'warning',
  info: 'info',
};

export const ALERT_LABEL: Record<AlertSeverity, string> = {
  critical: 'Critical',
  high_risk: 'High Risk',
  warning: 'Warning',
  info: 'Info',
};
