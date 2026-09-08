import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { IncidentStatus } from '@coalguard/types';
import { theme, type StatusTone } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { formatRelativeDay } from '@/lib/datetime';
import {
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { listIncidentsOffline } from '@/features/incident/offlineRepo';
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  type IncidentListRow,
  type UiSeverity,
} from '@/features/incident/types';

const SEV_TONE: Record<UiSeverity, StatusTone> = {
  critical: 'critical',
  high: 'highRisk',
  medium: 'warning',
  low: 'safe',
};
const SEV_LABEL: Record<UiSeverity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const TABS: { key: 'all' | IncidentStatus; labelKey: string }[] = [
  { key: 'all', labelKey: 'state.empty' }, // replaced below
  { key: 'reported', labelKey: 'incident.tab.open' },
  { key: 'investigating', labelKey: 'incident.tab.review' },
  { key: 'action_pending', labelKey: 'incident.tab.resolved' },
  { key: 'closed', labelKey: 'incident.tab.closed' },
];

export default function MyIncidentsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useFieldUser();
  const [rows, setRows] = useState<IncidentListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'all' | IncidentStatus>('all');

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user.userId) return;
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        setRows(await listIncidentsOffline(user.userId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load incidents.');
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

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => tab === 'all' || r.status === tab),
    [rows, tab],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerWrap}>
        <AppHeader
          title={t('incident.myIncidents')}
          showBack
          right={
            <AppButton
              label={t('action.start')}
              size="md"
              icon="add"
              onPress={() => router.push('/incident/report')}
            />
          }
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map((tb) => {
          const sel = tb.key === tab;
          return (
            <AppText
              key={tb.key}
              variant="bodyStrong"
              color={sel ? theme.color.textPrimary : theme.color.textSecondary}
              onPress={() => setTab(tb.key)}
              style={[styles.tab, sel ? styles.tabSel : null]}
            >
              {tb.key === 'all' ? t('ca.open') : t(tb.labelKey)}
            </AppText>
          );
        })}
      </ScrollView>

      {rows === null && !error ? (
        <View style={styles.stateWrap}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
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
          {filtered.length === 0 ? (
            <EmptyState
              icon="critical"
              title={t('incident.none')}
              message={t('incident.noneHint')}
              actionLabel={t('incident.report')}
              onAction={() => router.push('/incident/report')}
            />
          ) : (
            <View style={styles.list}>
              {filtered.map((row) => (
                <AppCard
                  key={row.id}
                  style={styles.card}
                  onPress={() => router.push(`/incident/${row.id}`)}
                  accessibilityLabel={row.title}
                >
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {row.title}
                  </AppText>
                  <View style={styles.badgeRow}>
                    <StatusBadge label={SEV_LABEL[row.severity]} tone={SEV_TONE[row.severity]} />
                    <StatusBadge label={INCIDENT_TYPE_LABEL[row.type]} tone="neutral" dot={false} />
                    <StatusBadge
                      label={INCIDENT_STATUS_LABEL[row.status].toUpperCase()}
                      tone={row.status === 'closed' ? 'safe' : row.status === 'reported' ? 'highRisk' : 'info'}
                      dot={false}
                    />
                  </View>
                  <View style={styles.metaRow}>
                    <Meta icon="clock" label={formatRelativeDay(row.occurredAt)} />
                    <Meta
                      icon={row.hasLocation ? 'location' : 'locationOff'}
                      label={row.hasLocation ? t('list.gpsCaptured') : t('loc.notCaptured')}
                    />
                    {row.syncState ? (
                      <Meta
                        icon="sync"
                        label={
                          row.syncState === 'failed'
                            ? t('sync.failed')
                            : row.syncState === 'syncing'
                              ? t('sync.syncing')
                              : t('sync.queued')
                        }
                      />
                    ) : (
                      <Meta icon="completed" label={t('sync.synced')} />
                    )}
                  </View>
                </AppCard>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Meta({ icon, label }: { icon: React.ComponentProps<typeof Icon>['name']; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size="xs" color={theme.color.textSecondary} />
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  headerWrap: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  tabs: { flexGrow: 0 },
  tabsContent: { paddingHorizontal: theme.spacing[5], gap: theme.spacing[4], paddingVertical: theme.spacing[2] },
  tab: { paddingVertical: theme.spacing[1] },
  tabSel: { borderBottomWidth: 2, borderBottomColor: theme.color.accent },

  stateWrap: { flex: 1, padding: theme.spacing[5], gap: theme.spacing[3] },
  content: { padding: theme.spacing[5], paddingTop: theme.spacing[3], gap: theme.spacing[3], flexGrow: 1 },
  list: { gap: theme.spacing[3] },
  card: { gap: theme.spacing[2] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing[2] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
});
