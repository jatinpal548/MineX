import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { CorrectiveActionPriority } from '@coalguard/types';
import { theme, type StatusTone } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { getOnline } from '@/lib/connectivity';
import {
  AppHeader,
  AppText,
  AppCard,
  StatusBadge,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import {
  listCorrectiveActions,
  summarise,
  type CorrectiveActionRow,
  type CorrectiveActionSummary,
} from '@/features/corrective-actions/repository';

const PRIORITY_TONE: Record<CorrectiveActionPriority, StatusTone> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};
const PRIORITY_LABEL: Record<CorrectiveActionPriority, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  verified: 'Verified',
  closed: 'Closed',
  overdue: 'Overdue',
  rejected: 'Needs rework',
};

function Summary({ s }: { s: CorrectiveActionSummary }) {
  const { t } = useI18n();
  const cells: { label: string; value: number; tone: string }[] = [
    { label: t('ca.open'), value: s.open, tone: theme.color.textPrimary },
    { label: t('ca.overdue'), value: s.overdue, tone: theme.color.status.critical.text },
    { label: t('ca.dueSoon'), value: s.dueSoon, tone: theme.color.status.warning.text },
    { label: t('ca.awaitingVerification'), value: s.awaitingVerification, tone: theme.color.status.info.text },
  ];
  return (
    <View style={styles.summaryRow}>
      {cells.map((c) => (
        <AppCard key={c.label} style={styles.summaryCell}>
          <AppText variant="title" color={c.value > 0 ? c.tone : theme.color.textSecondary}>
            {c.value}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={2} style={styles.summaryLabel}>
            {c.label}
          </AppText>
        </AppCard>
      ))}
    </View>
  );
}

function dueText(row: CorrectiveActionRow, t: (k: string, p?: Record<string, string | number>) => string) {
  if (row.overdue && row.daysToDue !== null) return t('ca.overdueByDays', { n: Math.abs(row.daysToDue) });
  if (row.daysToDue === 0) return t('ca.dueToday');
  if (row.daysToDue !== null && row.daysToDue > 0) return t('ca.dueInDays', { n: row.daysToDue });
  return null;
}

export default function CorrectiveActionsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useFieldUser();
  const [rows, setRows] = useState<CorrectiveActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user.userId) return;
      if (isRefresh) setRefreshing(true);
      if (!getOnline()) {
        setOffline(true);
        setRefreshing(false);
        return;
      }
      setOffline(false);
      setError(null);
      try {
        setRows(await listCorrectiveActions({ assignedToMe: user.userId }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load corrective actions.');
      } finally {
        setRefreshing(false);
      }
    },
    [user.userId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const summary = rows ? summarise(rows) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerWrap}>
        <AppHeader title={t('nav.correctiveActions')} showBack />
      </View>

      {rows === null && !error && !offline ? (
        <View style={styles.stateWrap}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : offline ? (
        <View style={styles.stateWrap}>
          <EmptyState icon="offline" title={t('state.offline')} message={t('state.offlineHint')} />
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <ErrorState title={t('state.error')} message={error} onRetry={() => load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.color.textSecondary} />
          }
        >
          {summary ? <Summary s={summary} /> : null}

          {(rows ?? []).length === 0 ? (
            <EmptyState icon="completed" title={t('ca.noneAssigned')} message={t('ca.noneHint')} />
          ) : (
            <View style={styles.list}>
              {(rows ?? []).map((row) => {
                const due = dueText(row, t);
                return (
                  <AppCard
                    key={row.id}
                    style={styles.card}
                    onPress={() => router.push(`/corrective-actions/${row.id}`)}
                    accessibilityLabel={row.title}
                  >
                    <View style={styles.cardTop}>
                      <View
                        style={[styles.prioBar, { backgroundColor: theme.color.status[PRIORITY_TONE[row.priority]].solid }]}
                      />
                      <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
                        {row.title}
                      </AppText>
                    </View>
                    <View style={styles.badgeRow}>
                      <StatusBadge label={PRIORITY_LABEL[row.priority]} tone={PRIORITY_TONE[row.priority]} />
                      <StatusBadge
                        label={STATUS_LABEL[row.status] ?? row.status}
                        tone={
                          row.status === 'submitted'
                            ? 'warning'
                            : row.status === 'rejected' || row.status === 'overdue'
                              ? 'critical'
                              : row.status === 'verified' || row.status === 'closed'
                                ? 'safe'
                                : 'info'
                        }
                      />
                      {due ? (
                        <AppText
                          variant="caption"
                          color={row.overdue ? theme.color.status.critical.text : theme.color.textSecondary}
                        >
                          {due}
                        </AppText>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      {row.mineName ? (
                        <View style={styles.metaItem}>
                          <Icon name="mine" size="xs" color={theme.color.textSecondary} />
                          <AppText variant="caption" tone="secondary">
                            {row.mineName}
                          </AppText>
                        </View>
                      ) : null}
                      {row.observation ? (
                        <View style={styles.metaItem}>
                          <Icon name="warning" size="xs" color={theme.color.textSecondary} />
                          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.obsText}>
                            {row.observation.title}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  </AppCard>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  headerWrap: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  stateWrap: { flex: 1, padding: theme.spacing[5], gap: theme.spacing[3] },
  content: { padding: theme.spacing[5], gap: theme.spacing[4], paddingBottom: theme.spacing[10] },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  summaryCell: {
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'flex-start',
    gap: theme.spacing[1],
  },
  summaryLabel: { lineHeight: 15 },

  list: { gap: theme.spacing[3] },
  card: { gap: theme.spacing[2] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] },
  prioBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 20 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing[2] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], maxWidth: '100%' },
  obsText: { flexShrink: 1 },
});
