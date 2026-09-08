import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { formatDateTime } from '@/lib/datetime';
import {
  Screen,
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  SectionHeader,
  StatusBadge,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useInspection } from '@/features/inspection/InspectionContext';
import { computeProgress } from '@/features/inspection/types';
import type { RiskLevel } from '@coalguard/types';

const RISK_TONE: Record<RiskLevel, 'safe' | 'warning' | 'highRisk' | 'critical'> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useFieldUser();
  const { draft, loading, saving, error, load, submit } = useInspection();

  useEffect(() => {
    if (id) void load(id);
    // re-fetch on entry so the summary reflects the server, not just local edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const progress = useMemo(() => computeProgress(draft?.items ?? []), [draft?.items]);

  // Once submitted, move on to the confirmation screen - as an EFFECT, never
  // during render (that throws "Cannot update a component while rendering...").
  const isSubmitted = draft?.status === 'submitted';
  useEffect(() => {
    if (isSubmitted && draft) router.replace(`/inspection/${draft.id}/submitted`);
  }, [isSubmitted, draft, router]);

  if (loading || (!draft && !error)) {
    return (
      <Screen scroll>
        <AppHeader title="Review" showBack />
        <View style={styles.loading}>
          <Skeleton height={120} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      </Screen>
    );
  }

  if (error || !draft) {
    return (
      <Screen>
        <AppHeader title="Review" showBack />
        <ErrorState
          title="Couldn't load the review"
          message={error ?? 'Please go back and try again.'}
          onRetry={() => id && load(id)}
        />
      </Screen>
    );
  }

  if (draft.status === 'submitted') {
    // the effect above navigates to the submitted screen; render nothing meanwhile
    return null;
  }

  const canSubmit = progress.mandatoryRemaining === 0 && !saving;
  const actionCount = draft.observations.filter((o) => o.correctiveActionId).length;
  const locatedCount = draft.observations.filter((o) => o.hasLocation).length;
  const photoTotal = draft.observations.reduce((s, o) => s + (o.evidenceCount ?? 0), 0);
  const voiceTotal = draft.observations.reduce((s, o) => s + (o.voiceCount ?? 0), 0);

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + theme.spacing[8] }}>
      <AppHeader title={t('review.reviewSubmit')} subtitle={t('review.subtitle')} showBack />

      {/* INSPECTION */}
      <SectionHeader title={t('review.inspection')} />
      <AppCard style={styles.card}>
        <Row label={t('review.template')} value={draft.templateName} />
        <Row label={t('review.mine')} value={user.mine.mineName} />
        <Row label={t('review.inspector')} value={user.displayName} />
        <Row label={t('review.started')} value={formatDateTime(draft.startedAt)} />
        <Row
          label={t('review.progress')}
          value={t('checklist.answered', { answered: progress.answered, total: progress.total })}
          last
        />
      </AppCard>

      {/* CHECKLIST */}
      <SectionHeader title={t('review.checklist')} />
      <View style={styles.tallyRow}>
        <Tally label={t('checklist.passed')} value={progress.passed} tone="safe" />
        <Tally label={t('checklist.failed')} value={progress.failed} tone="highRisk" />
        <Tally label={t('checklist.na')} value={progress.na} tone="neutral" />
      </View>

      {/* OBSERVATIONS */}
      <SectionHeader title={t('review.observations', { n: draft.observations.length })} />
      {draft.observations.length === 0 ? (
        <AppCard style={styles.card}>
          <AppText variant="caption" tone="secondary">
            No observations raised.
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
              {o.aiRationale ? (
                <AppText
                  variant="caption"
                  tone="secondary"
                  numberOfLines={3}
                  style={styles.obsText}
                >
                  {o.aiRationale}
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
                    {o.hasLocation ? 'Location captured' : 'No location'}
                  </AppText>
                </View>
                {o.correctiveActionId ? (
                  <StatusBadge label="Corrective action proposed" tone="warning" dot={false} />
                ) : null}
                {o.aiSimulated ? (
                  <AppText variant="caption" tone="secondary">
                    AI: simulated
                  </AppText>
                ) : null}
              </View>
            </AppCard>
          ))}
        </View>
      )}

      {/* EVIDENCE */}
      <SectionHeader title={t('review.evidence')} />
      <AppCard style={styles.card}>
        <View style={styles.locRow}>
          <Icon name="image" size="sm" color={theme.color.textSecondary} />
          <AppText variant="caption" tone="secondary">
            {t('review.photos', { n: photoTotal })} · {t('review.voiceNotes', { n: voiceTotal })}
          </AppText>
        </View>
      </AppCard>

      {/* LOCATION */}
      <SectionHeader title={t('obs.location')} />
      <AppCard style={styles.card}>
        <View style={styles.locRow}>
          <Icon
            name={locatedCount > 0 ? 'location' : 'locationOff'}
            size="sm"
            color={locatedCount > 0 ? theme.color.status.safe.text : theme.color.textSecondary}
          />
          <AppText
            variant="caption"
            color={locatedCount > 0 ? theme.color.status.safe.text : theme.color.textSecondary}
          >
            {draft.observations.length === 0
              ? 'No observations to locate.'
              : locatedCount > 0
                ? `Captured on ${locatedCount} of ${draft.observations.length} observation${draft.observations.length === 1 ? '' : 's'}.`
                : 'Not captured.'}
          </AppText>
        </View>
      </AppCard>

      {/* CORRECTIVE ACTIONS */}
      {actionCount > 0 ? (
        <>
          <SectionHeader title="Corrective Actions" />
          <AppCard style={styles.card}>
            <AppText variant="caption" tone="secondary">
              {actionCount} corrective action{actionCount === 1 ? '' : 's'} proposed. Status: open -
              awaiting manager assignment.
            </AppText>
          </AppCard>
        </>
      ) : null}

      {/* SUBMIT */}
      {progress.mandatoryRemaining > 0 ? (
        <AppText variant="caption" color={theme.color.status.warning.text} style={styles.gateNote}>
          {progress.mandatoryRemaining} required check
          {progress.mandatoryRemaining === 1 ? '' : 's'} must be answered before you can submit.
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" color={theme.color.status.critical.text} style={styles.gateNote}>
          {error}
        </AppText>
      ) : null}

      <AppButton
        label={saving ? t('state.loading') : t('action.submit')}
        icon="completed"
        fullWidth
        disabled={!canSubmit}
        onPress={async () => {
          const result = await submit();
          if (result) {
            router.replace({
              pathname: '/inspection/[id]/submitted',
              params: { id: result.draft.id, synced: result.synced ? '1' : '0' },
            });
          }
        }}
        style={styles.submit}
      />
      <AppButton
        label={t('action.saveExit')}
        variant="ghost"
        fullWidth
        disabled={saving}
        onPress={() => router.replace('/inspections')}
        style={styles.saveExit}
      />
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

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'safe' | 'highRisk' | 'neutral';
}) {
  const c = theme.color.status[tone];
  return (
    <AppCard style={styles.tally}>
      <AppText variant="kpi" color={c.text}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </AppCard>
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

  tallyRow: { flexDirection: 'row', gap: theme.spacing[3] },
  tally: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: theme.spacing[1] },

  obsList: { gap: theme.spacing[3] },
  obsCard: { gap: theme.spacing[2] },
  obsHead: { flexDirection: 'row', gap: theme.spacing[2], alignItems: 'flex-start' },
  obsText: { lineHeight: 18 },
  obsMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3], alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },

  locRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },

  gateNote: { marginTop: theme.spacing[4] },
  submit: { marginTop: theme.spacing[4] },
  saveExit: { marginTop: theme.spacing[2] },
});
