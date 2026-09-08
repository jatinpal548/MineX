import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeObservation } from '@coalguard/ai/observation';
import { theme, type StatusTone } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { newId } from '@/lib/ids';
import { getOnline } from '@/lib/connectivity';
import {
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  SectionHeader,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { LocationCard } from '@/components/inspection/LocationCard';
import { ParentEvidenceStrip } from '@/components/inspection/ParentEvidenceStrip';
import { VoiceNoteRecorder } from '@/components/inspection/VoiceNoteRecorder';
import { captureLocation } from '@/lib/location/capture';
import type { LocationResult } from '@/lib/media/types';
import { saveIncidentOffline } from '@/features/incident/offlineRepo';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABEL,
  type IncidentType,
  type UiSeverity,
} from '@/features/incident/types';

const SEVERITIES: { value: UiSeverity; tone: StatusTone }[] = [
  { value: 'critical', tone: 'critical' },
  { value: 'high', tone: 'highRisk' },
  { value: 'medium', tone: 'warning' },
  { value: 'low', tone: 'safe' },
];
const SEV_LABEL: Record<UiSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const LAST_TYPE_KEY = 'coalguard.field.lastIncidentType';

export default function IncidentReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useFieldUser();

  const incidentId = useRef(newId()).current;
  const clientRef = useRef(newId()).current;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<IncidentType>('safety');
  const [severity, setSeverity] = useState<UiSeverity>('medium');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [ai, setAi] = useState<{ risk: UiSeverity; consequence: string; action: string } | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'ai'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_TYPE_KEY)
      .then((v) => {
        if (v && (INCIDENT_TYPES as readonly string[]).includes(v)) setType(v as IncidentType);
      })
      .catch(() => {});
  }, []);

  const canSave = title.trim().length >= 3;

  const onCaptureGps = useCallback(async () => {
    setGpsBusy(true);
    try {
      setLocation(await captureLocation());
    } finally {
      setGpsBusy(false);
    }
  }, []);

  const runAi = useCallback(() => {
    if (!canSave) {
      setError(t('incident.needTitle'));
      return;
    }
    setBusy('ai');
    setError(null);
    try {
      const a = analyzeObservation({
        title: title.trim(),
        description: description.trim() || null,
        category: INCIDENT_TYPE_LABEL[type],
      });
      const risk = (['low', 'medium', 'high', 'critical'] as UiSeverity[]).includes(a.risk as UiSeverity)
        ? (a.risk as UiSeverity)
        : severity;
      setAi({ risk, consequence: a.consequence, action: a.recommendedAction });
      setSeverity(risk);
    } finally {
      setBusy(null);
    }
  }, [canSave, title, description, type, severity, t]);

  const occurredAt = useRef(new Date().toISOString()).current;

  const persist = useCallback(async () => {
    if (!user.mine.mineId || !user.userId) throw new Error('Missing mine context.');
    await saveIncidentOffline({
      id: incidentId,
      clientRef,
      title: title.trim() || 'Untitled incident',
      type,
      severity,
      description: description.trim(),
      mineId: user.mine.mineId,
      reportedBy: user.userId,
      occurredAt,
      createdAt: occurredAt,
      gpsLatitude: location?.status === 'captured' ? (location.latitude ?? null) : null,
      gpsLongitude: location?.status === 'captured' ? (location.longitude ?? null) : null,
      locationAccuracy: location?.status === 'captured' ? (location.accuracy ?? null) : null,
      status: 'reported',
      aiRisk: ai?.risk ?? null,
      aiConsequence: ai?.consequence ?? null,
      aiRecommendedAction: ai?.action ?? null,
      aiSimulated: !!ai,
    });
  }, [
    user.mine.mineId,
    user.userId,
    incidentId,
    clientRef,
    title,
    type,
    severity,
    description,
    occurredAt,
    location,
    ai,
  ]);

  const onSave = useCallback(async () => {
    if (!canSave || !user.mine.mineId || !user.userId) {
      setError(t('incident.needTitle'));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await AsyncStorage.setItem(LAST_TYPE_KEY, type).catch(() => {});
      await persist();
      router.replace(`/incident/${incidentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the incident.');
      setBusy(null);
    }
  }, [canSave, persist, user.mine.mineId, user.userId, type, incidentId, router, t]);

  const online = getOnline();
  const evidenceReady = useMemo(() => !!user.mine.mineId && !!user.userId, [user.mine.mineId, user.userId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS === 'ios'}>
        <View style={styles.headerPad}>
          <AppHeader
            title={t('incident.report')}
            subtitle={user.mine.mineName}
            showBack
            right={
              <StatusBadge
                label={online ? t('net.online') : t('incident.savedOnDevice')}
                tone={online ? 'safe' : 'warning'}
              />
            }
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* title */}
          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('incident.title')}
            </AppText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('incident.titlePlaceholder')}
              placeholderTextColor={theme.color.textSecondary}
              style={styles.input}
              accessibilityLabel={t('incident.title')}
            />
          </View>

          {/* type */}
          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('incident.type')}
            </AppText>
            <View style={styles.chips}>
              {INCIDENT_TYPES.map((ty) => {
                const sel = ty === type;
                return (
                  <PressableScale
                    key={ty}
                    onPress={() => setType(ty)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={t(`incident.type.${ty}`)}
                    style={[styles.chip, sel ? styles.chipSel : null]}
                  >
                    <AppText
                      variant="bodyStrong"
                      color={sel ? theme.color.textPrimary : theme.color.textSecondary}
                    >
                      {t(`incident.type.${ty}`)}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {/* severity */}
          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('incident.severity')}
            </AppText>
            <View style={styles.chips}>
              {SEVERITIES.map((s) => {
                const sel = s.value === severity;
                const c = theme.color.status[s.tone];
                return (
                  <PressableScale
                    key={s.value}
                    onPress={() => setSeverity(s.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={SEV_LABEL[s.value]}
                    style={[
                      styles.chip,
                      sel ? { backgroundColor: c.tint, borderColor: c.solid } : null,
                    ]}
                  >
                    <AppText variant="bodyStrong" color={sel ? c.text : theme.color.textSecondary}>
                      {SEV_LABEL[s.value]}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {/* description */}
          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('incident.description')}
            </AppText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('incident.descriptionPlaceholder')}
              placeholderTextColor={theme.color.textSecondary}
              multiline
              style={[styles.input, styles.multiline]}
              accessibilityLabel={t('incident.description')}
            />
          </View>

          {/* location */}
          <View style={styles.field}>
            <SectionHeader title={t('obs.location')} />
            <LocationCard location={location} capturing={gpsBusy} onCapture={onCaptureGps} />
          </View>

          {/* evidence */}
          <View style={styles.field}>
            <SectionHeader title={t('obs.evidence')} />
            {evidenceReady ? (
              <ParentEvidenceStrip
                parent={{ kind: 'incident', incidentId }}
                mineId={user.mine.mineId!}
                uploadedBy={user.userId!}
                location={location}
                ensureParent={persist}
              />
            ) : null}
          </View>

          {/* voice note */}
          <View style={styles.field}>
            <SectionHeader title={t('obs.voiceNote')} />
            {evidenceReady ? (
              <VoiceNoteRecorder
                parent={{ kind: 'incident', incidentId }}
                resolveParent={async () => {
                  await persist();
                  return { kind: 'incident', incidentId };
                }}
                mineId={user.mine.mineId!}
                uploadedBy={user.userId!}
              />
            ) : null}
          </View>

          {/* AI */}
          <View style={styles.field}>
            <SectionHeader title={t('ai.assisted')} />
            {ai ? (
              <AppCard style={styles.aiCard}>
                <View style={styles.aiHead}>
                  <StatusBadge
                    label={SEV_LABEL[ai.risk].toUpperCase()}
                    tone={SEVERITIES.find((s) => s.value === ai.risk)?.tone ?? 'warning'}
                  />
                  <StatusBadge label={t('ai.simulated')} tone="neutral" dot={false} />
                </View>
                <View>
                  <AppText variant="label" tone="secondary">
                    {t('ai.recommended')}
                  </AppText>
                  <AppText variant="body" style={styles.aiText}>
                    {ai.action}
                  </AppText>
                </View>
                <View>
                  <AppText variant="label" tone="secondary">
                    {t('ai.hazard')}
                  </AppText>
                  <AppText variant="body" tone="secondary" style={styles.aiText}>
                    {ai.consequence}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary">
                  {t('ai.editable')}
                </AppText>
              </AppCard>
            ) : (
              <AppCard style={styles.aiCard}>
                <AppText variant="caption" tone="secondary">
                  {t('obs.runAi')}
                </AppText>
                <AppButton
                  label={busy === 'ai' ? t('state.loading') : t('obs.runAi')}
                  icon="ai"
                  variant="secondary"
                  disabled={busy !== null || !canSave}
                  onPress={runAi}
                  style={styles.aiBtn}
                />
              </AppCard>
            )}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="critical" size="sm" color={theme.color.status.critical.text} />
              <AppText variant="caption" color={theme.color.status.critical.text} style={styles.flex}>
                {error}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[3] }]}>
          <AppButton
            label={busy === 'save' ? t('state.loading') : t('incident.save')}
            icon="completed"
            size="lg"
            fullWidth
            disabled={busy !== null || !canSave}
            onPress={onSave}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  headerPad: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  content: { padding: theme.spacing[5], gap: theme.spacing[5], paddingBottom: theme.spacing[10] },

  field: { gap: theme.spacing[2] },
  input: {
    minHeight: theme.control.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.md,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceRaised,
  },
  chipSel: { backgroundColor: theme.color.status.info.tint, borderColor: theme.color.accent },

  voiceCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  aiCard: { gap: theme.spacing[3] },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  aiText: { lineHeight: 18, marginTop: 2 },
  aiBtn: { alignSelf: 'flex-start' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    backgroundColor: theme.color.status.critical.tint,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
  },
  footer: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
    backgroundColor: theme.color.surface,
  },
});
