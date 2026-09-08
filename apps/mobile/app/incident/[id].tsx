import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { UiSeverity } from '@/features/incident/types';
import { theme, type StatusTone } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { getOnline } from '@/lib/connectivity';
import { formatDateTime } from '@/lib/datetime';
import {
  Screen,
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  SectionHeader,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { ParentEvidenceStrip } from '@/components/inspection/ParentEvidenceStrip';
import { VoiceNoteRecorder } from '@/components/inspection/VoiceNoteRecorder';
import { fetchIncidentDetail, type IncidentDetail } from '@/features/incident/repository';
import { getIncidentDraftLocal } from '@/features/incident/offlineRepo';
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL } from '@/features/incident/types';

const SEV_TONE: Record<UiSeverity, StatusTone> = {
  critical: 'critical',
  high: 'highRisk',
  medium: 'warning',
  low: 'safe',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="body" style={styles.rowValue} numberOfLines={3}>
        {value || '—'}
      </AppText>
    </View>
  );
}

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const user = useFieldUser();
  const [inc, setInc] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLocal, setPendingLocal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      if (getOnline()) {
        const remote = await fetchIncidentDetail(id).catch(() => null);
        if (remote) {
          setInc(remote);
          setPendingLocal(false);
          return;
        }
      }
      const local = await getIncidentDraftLocal(id);
      if (local) {
        setInc(local);
        setPendingLocal(true);
      } else {
        setError('This incident could not be found.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the incident.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !inc) {
    return (
      <Screen>
        <AppHeader title={t('nav.incidents')} showBack />
        <ErrorState title={t('state.error')} message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!inc) {
    return (
      <Screen scroll>
        <AppHeader title={t('nav.incidents')} showBack />
        <View style={styles.loading}>
          <Skeleton height={120} />
          <Skeleton height={90} />
        </View>
      </Screen>
    );
  }

  const openMap = () => {
    if (!inc.gps) return;
    void Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${inc.gps.lat}&mlon=${inc.gps.lng}#map=17/${inc.gps.lat}/${inc.gps.lng}`,
    ).catch(() => {});
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppHeader title={t('nav.incidents')} showBack />

      <AppText variant="subheading">{inc.title}</AppText>
      <View style={styles.badgeRow}>
        <StatusBadge label={inc.severity.toUpperCase()} tone={SEV_TONE[inc.severity]} />
        <StatusBadge label={INCIDENT_TYPE_LABEL[inc.type]} tone="neutral" dot={false} />
        <StatusBadge
          label={INCIDENT_STATUS_LABEL[inc.status].toUpperCase()}
          tone={inc.status === 'closed' ? 'safe' : inc.status === 'reported' ? 'highRisk' : 'info'}
          dot={false}
        />
        {pendingLocal ? <StatusBadge label={t('sync.queued').toUpperCase()} tone="warning" dot={false} /> : null}
      </View>

      <AppCard>
        <Row label={t('incident.reporter')} value={inc.reporterName ?? user.displayName} />
        <Row label={t('review.mine')} value={inc.mineName ?? user.mine.mineName} />
        <Row label={t('incident.time')} value={formatDateTime(inc.reportedAt)} />
      </AppCard>

      {inc.description ? (
        <View style={styles.section}>
          <SectionHeader title={t('incident.description')} />
          <AppText variant="body" tone="secondary" style={styles.para}>
            {inc.description}
          </AppText>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={t('obs.location')} />
        {inc.gps ? (
          <AppCard style={styles.locCard}>
            <AppText variant="body" selectable>
              {inc.gps.lat.toFixed(6)}, {inc.gps.lng.toFixed(6)}
            </AppText>
            <AppButton label={t('action.viewOnMap')} variant="ghost" icon="mine" onPress={openMap} />
          </AppCard>
        ) : (
          <AppText variant="caption" tone="secondary">
            {t('loc.notCaptured')}
          </AppText>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('obs.evidence')} />
        {user.mine.mineId && user.userId ? (
          <ParentEvidenceStrip
            parent={{ kind: 'incident', incidentId: inc.id }}
            mineId={user.mine.mineId}
            uploadedBy={user.userId}
            editable={false}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('obs.voiceNote')} />
        {user.mine.mineId && user.userId ? (
          <VoiceNoteRecorder
            parent={{ kind: 'incident', incidentId: inc.id }}
            mineId={user.mine.mineId}
            uploadedBy={user.userId}
            editable={false}
          />
        ) : null}
      </View>

      {inc.ai ? (
        <View style={styles.section}>
          <SectionHeader title={t('ai.assisted')} />
          <AppCard style={styles.aiCard}>
            <View style={styles.badgeRow}>
              {inc.ai.risk ? (
                <StatusBadge
                  label={String(inc.ai.risk).toUpperCase()}
                  tone={SEV_TONE[(inc.ai.risk as UiSeverity) in SEV_TONE ? (inc.ai.risk as UiSeverity) : 'medium']}
                />
              ) : null}
              {inc.ai.simulated ? <StatusBadge label={t('ai.simulated')} tone="neutral" dot={false} /> : null}
            </View>
            {inc.ai.recommendedAction ? (
              <View>
                <AppText variant="label" tone="secondary">
                  {t('ai.recommended')}
                </AppText>
                <AppText variant="body" style={styles.para}>
                  {inc.ai.recommendedAction}
                </AppText>
              </View>
            ) : null}
            {inc.ai.consequence ? (
              <View>
                <AppText variant="label" tone="secondary">
                  {t('ai.hazard')}
                </AppText>
                <AppText variant="body" tone="secondary" style={styles.para}>
                  {inc.ai.consequence}
                </AppText>
              </View>
            ) : null}
          </AppCard>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: theme.spacing[5], gap: theme.spacing[4], paddingBottom: theme.spacing[10] },
  loading: { gap: theme.spacing[3], padding: theme.spacing[5] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  section: { gap: theme.spacing[2] },
  para: { lineHeight: 18 },
  locCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing[2] },
  voiceCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  aiCard: { gap: theme.spacing[3] },
});
