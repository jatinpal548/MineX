import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { theme } from '@/lib/theme';
import { formatDateTime } from '@/lib/datetime';
import {
  Screen,
  AppHeader,
  AppText,
  AppCard,
  SectionHeader,
  StatusBadge,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ParentEvidenceStrip } from '@/components/inspection/ParentEvidenceStrip';
import { loadDraftOffline } from '@/features/inspection/offlineRepo';
import { computeProgress, type InspectionDraft } from '@/features/inspection/types';
import type { RiskLevel } from '@coalguard/types';

const RISK_TONE: Record<RiskLevel, 'safe' | 'warning' | 'highRisk' | 'critical'> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};

const STATUS_TONE: Record<
  string,
  'safe' | 'warning' | 'highRisk' | 'critical' | 'info' | 'neutral'
> = {
  in_progress: 'info',
  submitted: 'safe',
  under_review: 'warning',
  closed: 'neutral',
  cancelled: 'neutral',
  planned: 'neutral',
};

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDraft(await loadDraftOffline(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the inspection.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll>
        <AppHeader title="Inspection" showBack />
        <View style={styles.loading}>
          <Skeleton height={120} />
          <Skeleton height={90} />
        </View>
      </Screen>
    );
  }

  if (error || !draft) {
    return (
      <Screen>
        <AppHeader title="Inspection" showBack />
        <ErrorState title="Couldn't load the inspection" message={error ?? ''} onRetry={load} />
      </Screen>
    );
  }

  const progress = computeProgress(draft.items);

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + theme.spacing[8] }}>
      <AppHeader
        title={draft.templateName}
        showBack
        right={
          <StatusBadge
            label={draft.status.replace('_', ' ').toUpperCase()}
            tone={STATUS_TONE[draft.status] ?? 'neutral'}
          />
        }
      />

      <AppCard style={styles.card}>
        <Row label="Status" value={draft.status.replace('_', ' ')} />
        <Row label="Started" value={formatDateTime(draft.startedAt)} />
        <Row label="Submitted" value={formatDateTime(draft.submittedAt)} />
        <Row
          label="Overall risk"
          value={draft.overallRisk ? draft.overallRisk.toUpperCase() : 'Not set'}
        />
        <Row
          label="Checklist"
          value={`${progress.passed} pass / ${progress.failed} fail / ${progress.na} N/A`}
          last
        />
      </AppCard>

      <SectionHeader title={`Observations (${draft.observations.length})`} />
      {draft.observations.length === 0 ? (
        <AppCard style={styles.card}>
          <AppText variant="caption" tone="secondary">
            No observations were raised.
          </AppText>
        </AppCard>
      ) : (
        <View style={styles.obsList}>
          {draft.observations.map((o) => (
            <AppCard key={o.id} style={styles.obsCard}>
              <View style={styles.obsHead}>
                <AppText variant="bodyStrong" style={styles.flex} numberOfLines={2}>
                  {o.title}
                </AppText>
                <StatusBadge label={o.risk.toUpperCase()} tone={RISK_TONE[o.risk]} />
              </View>
              {o.description ? (
                <AppText variant="caption" tone="secondary" numberOfLines={4}>
                  {o.description}
                </AppText>
              ) : null}
              <View style={styles.obsMeta}>
                <View style={styles.metaItem}>
                  <Icon name="image" size="xs" color={theme.color.textSecondary} />
                  <AppText variant="caption" tone="secondary">
                    {o.evidenceCount} photo{o.evidenceCount === 1 ? '' : 's'}
                  </AppText>
                </View>
                <View style={styles.metaItem}>
                  <Icon
                    name={o.hasLocation ? 'location' : 'locationOff'}
                    size="xs"
                    color={o.hasLocation ? theme.color.status.safe.text : theme.color.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    color={o.hasLocation ? theme.color.status.safe.text : theme.color.textSecondary}
                  >
                    {o.hasLocation ? 'Location' : 'No location'}
                  </AppText>
                </View>
                {o.correctiveActionId ? (
                  <StatusBadge label="Corrective action proposed" tone="warning" dot={false} />
                ) : null}
              </View>
              {o.evidenceCount > 0 ? (
                <View style={styles.evidenceBlock}>
                  <AppText variant="caption" tone="secondary">
                    Evidence
                  </AppText>
                  <ParentEvidenceStrip
                    parent={{ kind: 'observation', observationId: o.id }}
                    mineId={draft.mineId}
                    uploadedBy={draft.inspectorId}
                    editable={false}
                    captions
                  />
                </View>
              ) : null}
            </AppCard>
          ))}
        </View>
      )}

      <SectionHeader title="Location" />
      <AppCard style={styles.card}>
        <View style={styles.locRow}>
          <Icon name="location" size="sm" color={theme.color.textSecondary} />
          <AppText variant="caption" tone="secondary">
            Not captured.
          </AppText>
        </View>
      </AppCard>
    </Screen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last ? null : styles.rowDivider]}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="body" style={styles.rowValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { gap: theme.spacing[3] },
  card: { gap: theme.spacing[1] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.color.hairline },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  obsList: { gap: theme.spacing[3] },
  obsCard: { gap: theme.spacing[2] },
  evidenceBlock: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
  },
  obsMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  obsHead: { flexDirection: 'row', gap: theme.spacing[2], alignItems: 'flex-start' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
});
