import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RiskLevel } from '@coalguard/types';
import { theme, type StatusTone } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getOnline } from '@/lib/connectivity';
import { useFieldUser } from '@/hooks/useFieldUser';
import {
  Screen,
  AppHeader,
  AppCard,
  AppText,
  StatusBadge,
  SectionHeader,
  EmptyState,
  SkeletonCard,
} from '@/components/ui';
import { Icon } from '@/components/Icon';

/* ------------------------------ helpers ------------------------------ */

const RISK_TONE: Record<RiskLevel, StatusTone> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};
const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
const RISK_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

const CA_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  submitted: 'Submitted',
  verified: 'Verified',
  closed: 'Closed',
  overdue: 'Overdue',
  rejected: 'Needs rework',
};
const CA_STATUS_TONE: Record<string, StatusTone> = {
  open: 'highRisk',
  assigned: 'info',
  in_progress: 'info',
  submitted: 'warning',
  verified: 'safe',
  closed: 'neutral',
  overdue: 'critical',
  rejected: 'critical',
};

const ACTIVE_CA = ['open', 'assigned', 'in_progress', 'submitted', 'overdue', 'rejected'];
const ACTIVE_OBS = ['open', 'action_required', 'in_progress'];

function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  return { text: `Due in ${days}d`, overdue: false };
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: RiskLevel;
  dueDate: string | null;
  observationTitle: string | null;
  observationRisk: RiskLevel | null;
}
interface AlertRow {
  id: string;
  title: string;
  risk: RiskLevel;
  category: string | null;
  createdAt: string;
}

/* ------------------------------ screen ------------------------------ */

export default function AlertsScreen() {
  const user = useFieldUser();
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const load = useCallback(async () => {
    if (!user.userId) return;
    if (!getOnline()) {
      setOffline(true);
      setLoading(false);
      return;
    }
    setOffline(false);
    setError(false);
    try {
      const [caRes, obsRes] = await Promise.all([
        supabase
          .from('corrective_actions')
          .select(
            `id, title, status, priority, due_date,
             observation:observations!corrective_actions_observation_id_fkey(title, risk)`,
          )
          .eq('assigned_to', user.userId)
          .in('status', ACTIVE_CA)
          .order('due_date', { ascending: true })
          .limit(50),
        supabase
          .from('observations')
          .select('id, title, risk, category, created_at')
          .in('risk', ['high', 'critical'])
          .in('status', ACTIVE_OBS)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (caRes.error || obsRes.error) {
        setError(true);
      } else {
        const caRows = (caRes.data ?? []) as Record<string, unknown>[];
        setTasks(
          caRows
            .map((r) => {
              const obs = (Array.isArray(r.observation) ? r.observation[0] : r.observation) as
                | { title?: string; risk?: RiskLevel }
                | null;
              return {
                id: r.id as string,
                title: r.title as string,
                status: r.status as string,
                priority: (r.priority as RiskLevel) ?? 'medium',
                dueDate: (r.due_date as string) ?? null,
                observationTitle: obs?.title ?? null,
                observationRisk: obs?.risk ?? null,
              };
            })
            .sort(
              (a, b) =>
                RISK_RANK[b.priority] - RISK_RANK[a.priority] ||
                (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
            ),
        );
        setAlerts(
          ((obsRes.data ?? []) as Record<string, unknown>[])
            .map((r) => ({
              id: r.id as string,
              title: r.title as string,
              risk: (r.risk as RiskLevel) ?? 'high',
              category: (r.category as string) ?? null,
              createdAt: r.created_at as string,
            }))
            .sort((a, b) => RISK_RANK[b.risk] - RISK_RANK[a.risk]),
        );
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshing = loading || user.loading;

  return (
    <Screen scroll refreshing={refreshing} onRefresh={load}>
      <AppHeader title="Alerts" subtitle="Your assigned actions and mine risk signals" />

      {/* -------- my assigned actions -------- */}
      <View style={styles.section}>
        <SectionHeader title="My Assigned Actions" />
        {loading ? (
          <View style={styles.list}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : offline ? (
          <AppCard style={styles.infoCard}>
            <Icon name="offline" size="sm" color={theme.color.status.warning.text} />
            <AppText variant="caption" tone="secondary" style={styles.flex}>
              You are offline. Assigned actions will load when you reconnect.
            </AppText>
          </AppCard>
        ) : error ? (
          <AppCard style={styles.infoCard}>
            <Icon name="warning" size="sm" color={theme.color.status.warning.text} />
            <AppText variant="caption" tone="secondary" style={styles.flex}>
              Couldn&apos;t load your actions. Pull to refresh.
            </AppText>
          </AppCard>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="completed"
            title="Nothing assigned"
            message="Corrective actions a manager assigns to you will appear here."
          />
        ) : (
          <View style={styles.list}>
            {tasks.map((t) => {
              const due = dueLabel(t.dueDate);
              return (
                <AppCard key={t.id} style={styles.card} animateIn>
                  <View style={styles.titleRow}>
                    <AppText variant="bodyStrong" style={styles.flex}>
                      {t.title}
                    </AppText>
                    <StatusBadge
                      label={CA_STATUS_LABEL[t.status] ?? t.status}
                      tone={CA_STATUS_TONE[t.status] ?? 'neutral'}
                    />
                  </View>
                  {t.observationTitle ? (
                    <AppText variant="caption" tone="secondary" style={styles.desc}>
                      Finding: {t.observationTitle}
                    </AppText>
                  ) : null}
                  <View style={styles.metaRow}>
                    <StatusBadge
                      label={`${RISK_LABEL[t.priority]} priority`}
                      tone={RISK_TONE[t.priority]}
                    />
                    {due ? (
                      <AppText
                        variant="caption"
                        color={
                          due.overdue
                            ? theme.color.status.critical.text
                            : theme.color.textSecondary
                        }
                      >
                        {due.text}
                      </AppText>
                    ) : null}
                  </View>
                </AppCard>
              );
            })}
          </View>
        )}
      </View>

      {/* -------- mine risk signals -------- */}
      <View style={styles.section}>
        <SectionHeader title="Critical & High Risk" />
        {loading ? (
          <View style={styles.list}>
            <SkeletonCard lines={1} />
          </View>
        ) : alerts.length === 0 && !offline && !error ? (
          <EmptyState
            icon="completed"
            title="No open high-risk findings"
            message="Unresolved high and critical observations for your mine show here."
          />
        ) : (
          <View style={styles.list}>
            {alerts.map((a) => {
              const c = theme.color.status[RISK_TONE[a.risk]];
              return (
                <AppCard key={a.id} style={styles.card} animateIn>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: c.tint }]}>
                      <Icon
                        name={a.risk === 'critical' ? 'critical' : 'warning'}
                        size="sm"
                        color={c.text}
                      />
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.titleRow}>
                        <AppText variant="bodyStrong" style={styles.flex}>
                          {a.title}
                        </AppText>
                        <StatusBadge label={RISK_LABEL[a.risk]} tone={RISK_TONE[a.risk]} />
                      </View>
                      <AppText variant="caption" tone="secondary" style={styles.desc}>
                        {a.category ?? 'Observation'}
                      </AppText>
                    </View>
                  </View>
                </AppCard>
              );
            })}
          </View>
        )}
      </View>

      <AppText variant="caption" tone="secondary" style={styles.notice}>
        Live data for {user.mine.mineName}. Update progress on an assigned action from MineX
        Command.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginTop: theme.spacing[6] },
  list: { gap: theme.spacing[3] },
  card: { gap: theme.spacing[2] },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  row: { flexDirection: 'row', gap: theme.spacing[3] },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  desc: { marginTop: 2, lineHeight: 18 },
  notice: { marginTop: theme.spacing[6], marginBottom: theme.spacing[4] },
});
