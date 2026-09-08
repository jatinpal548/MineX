import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import {
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  EmptyState,
  ErrorState,
  SkeletonCard,
  IconButton,
  SectionHeader,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { InspectionListRow } from '@/features/inspection/repository';
import { deleteDraftOffline, listInspectionsOffline } from '@/features/inspection/offlineRepo';
import { SyncBadge } from '@/components/inspection/SyncBadge';
import type { RiskLevel } from '@coalguard/types';

const RISK_TONE: Record<RiskLevel, 'safe' | 'warning' | 'highRisk' | 'critical'> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};

function MetaChip({ icon, label }: { icon: React.ComponentProps<typeof Icon>['name']; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size="xs" color={theme.color.textSecondary} />
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function DraftCard({
  row,
  onPress,
  onDelete,
}: {
  row: InspectionListRow;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const answered = row.answered ?? 0;
  const total = row.itemCount ?? 0;

  return (
    <AppCard style={styles.card} accessibilityLabel={`Open ${row.templateName ?? row.title}`}>
      <View style={styles.cardTop}>
        <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
          {row.templateName ?? row.title}
        </AppText>
        <IconButton
          icon="remove"
          accessibilityLabel={t('action.deleteDraft')}
          onPress={onDelete}
        />
      </View>

      <View style={styles.badgeRow}>
        <StatusBadge label={t('list.drafts').toUpperCase()} tone="info" />
        {row.syncState === 'queued' ? (
          <StatusBadge label={t('sync.queued').toUpperCase()} tone="warning" dot={false} />
        ) : row.syncState === 'syncing' ? (
          <StatusBadge label={t('sync.syncing').toUpperCase()} tone="info" dot={false} />
        ) : row.syncState === 'failed' ? (
          <StatusBadge label={t('sync.failed').toUpperCase()} tone="critical" dot={false} />
        ) : (
          <StatusBadge label={t('checklist.savedLocally').toUpperCase()} tone="safe" dot={false} />
        )}
      </View>

      {total > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((answered / total) * 100)}%` }]} />
        </View>
      ) : null}

      <View style={styles.metaRow}>
        {total > 0 ? <MetaChip icon="pass" label={`${answered} / ${total}`} /> : null}
        <MetaChip icon="warning" label={t('list.observations', { n: row.observationCount })} />
        {row.photoCount ? <MetaChip icon="camera" label={t('list.photos', { n: row.photoCount })} /> : null}
        {row.hasLocation ? <MetaChip icon="location" label={t('list.gpsCaptured')} /> : null}
        <MetaChip icon="clock" label={t('list.startedAt', { time: formatRelativeDay(row.createdAt) })} />
      </View>

      <AppButton label={t('action.continue')} size="md" icon="chevronRight" fullWidth onPress={onPress} />
    </AppCard>
  );
}

function SubmittedCard({ row, onPress }: { row: InspectionListRow; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <AppCard
      onPress={onPress}
      accessibilityLabel={`Open ${row.templateName ?? row.title}`}
      style={styles.card}
    >
      <AppText variant="bodyStrong" numberOfLines={2}>
        {row.templateName ?? row.title}
      </AppText>
      <View style={styles.badgeRow}>
        <StatusBadge label={t('list.submitted').toUpperCase()} tone="safe" />
        {row.syncState === 'queued' || row.syncState === 'syncing' ? (
          <StatusBadge label={t('sync.queued').toUpperCase()} tone="warning" dot={false} />
        ) : row.syncState === 'failed' ? (
          <StatusBadge label={t('sync.failed').toUpperCase()} tone="critical" dot={false} />
        ) : null}
        {row.overallRisk ? (
          <StatusBadge label={row.overallRisk.toUpperCase()} tone={RISK_TONE[row.overallRisk]} />
        ) : null}
      </View>
      <View style={styles.metaRow}>
        <MetaChip icon="clock" label={formatRelativeDay(row.submittedAt ?? row.createdAt)} />
        <MetaChip icon="warning" label={t('list.observations', { n: row.observationCount })} />
      </View>
    </AppCard>
  );
}

export default function InspectionsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const tabBarHeight = useBottomTabBarHeight();
  const [rows, setRows] = useState<InspectionListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setRows(await listInspectionsOffline());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inspections.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openRow = (row: InspectionListRow) => {
    if (row.status === 'in_progress') router.push(`/inspection/${row.id}/checklist`);
    else router.push(`/inspection/${row.id}/detail`);
  };

  const confirmDelete = (row: InspectionListRow) => {
    Alert.alert(t('delete.title'), t('delete.body'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('action.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(row.id);
          try {
            await deleteDraftOffline(row.id);
            setRows((cur) => (cur ? cur.filter((r) => r.id !== row.id) : cur));
          } catch (e) {
            Alert.alert(
              t('state.error'),
              e instanceof Error ? e.message : 'Could not delete the inspection.',
            );
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const { drafts, submitted } = useMemo(() => {
    const all = rows ?? [];
    return {
      drafts: all.filter((r) => r.status === 'in_progress'),
      submitted: all.filter((r) => r.status !== 'in_progress'),
    };
  }, [rows]);

  const listBottomPad = tabBarHeight + theme.spacing[8];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerWrap}>
        <AppHeader
          title={t('tab.inspections')}
          right={
            <View style={styles.headerRight}>
              <SyncBadge />
              <AppButton
                label={t('action.start')}
                size="md"
                icon="add"
                onPress={() => router.push('/inspection/templates')}
              />
            </View>
          }
        />
      </View>

      {rows === null && !error ? (
        <View style={styles.stateWrap}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <ErrorState title={t('state.error')} message={error} onRetry={() => load()} />
        </View>
      ) : (rows?.length ?? 0) === 0 ? (
        <View style={[styles.stateWrap, styles.center]}>
          <EmptyState
            icon="inspection"
            title={t('list.noInspections')}
            message={t('list.startFirst')}
            actionLabel={t('action.startInspection')}
            onAction={() => router.push('/inspection/templates')}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={theme.color.textSecondary}
            />
          }
        >
          {drafts.length > 0 ? (
            <>
              <SectionHeader title={`${t('list.drafts')} (${drafts.length})`} />
              <View style={styles.section}>
                {drafts.map((row) => (
                  <View key={row.id} style={busyId === row.id ? styles.busy : undefined}>
                    <DraftCard
                      row={row}
                      onPress={() => openRow(row)}
                      onDelete={() => confirmDelete(row)}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {submitted.length > 0 ? (
            <>
              <SectionHeader title={`${t('list.submitted')} (${submitted.length})`} />
              <View style={styles.section}>
                {submitted.map((row) => (
                  <SubmittedCard key={row.id} row={row} onPress={() => openRow(row)} />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  headerWrap: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  headerRight: { alignItems: 'flex-end', gap: theme.spacing[1] },

  list: { flex: 1 },
  listContent: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  section: { gap: theme.spacing[3], marginBottom: theme.spacing[4] },

  stateWrap: {
    flex: 1,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[2],
    gap: theme.spacing[3],
  },
  center: { justifyContent: 'center' },
  busy: { opacity: 0.5 },

  card: { gap: theme.spacing[3] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[2] },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.color.accent },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
});
