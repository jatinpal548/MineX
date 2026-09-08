import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { analyzeObservation } from '@coalguard/ai/observation';
import type { RiskLevel } from '@coalguard/types';
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
import { saveQuickObservationOffline } from '@/features/inspection/offlineRepo';

const RISKS: { value: RiskLevel; tone: StatusTone; label: string }[] = [
  { value: 'critical', tone: 'critical', label: 'Critical' },
  { value: 'high', tone: 'highRisk', label: 'High' },
  { value: 'medium', tone: 'warning', label: 'Medium' },
  { value: 'low', tone: 'safe', label: 'Low' },
];

export default function QuickObservationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useFieldUser();
  const obsId = useRef(newId()).current;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [risk, setRisk] = useState<RiskLevel>('medium');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [ai, setAi] = useState<{ risk: RiskLevel; consequence: string; action: string } | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'ai'>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length >= 3;
  const mineId = user.mine.mineId;

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
    try {
      const a = analyzeObservation({
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
      });
      setAi({ risk: a.risk, consequence: a.consequence, action: a.recommendedAction });
      setRisk(a.risk);
    } finally {
      setBusy(null);
    }
  }, [canSave, title, description, category, t]);

  const persist = useCallback(async () => {
    if (!mineId || !user.userId) throw new Error('Missing mine context.');
    const a = ai
      ? analyzeObservation({
          title: title.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
        })
      : null;
    await saveQuickObservationOffline({
      id: obsId,
      mineId,
      departmentId: user.mine.departmentId,
      raisedBy: user.userId,
      title: title.trim() || 'Untitled observation',
      description: description.trim(),
      category: category.trim() || null,
      risk,
      gpsLatitude: location?.status === 'captured' ? (location.latitude ?? null) : null,
      gpsLongitude: location?.status === 'captured' ? (location.longitude ?? null) : null,
      ai: a
        ? {
            risk: a.risk,
            rationale: a.rationale,
            recommendations: a.recommendations,
            consequence: a.consequence,
            recommendedAction: a.recommendedAction,
          }
        : null,
    });
  }, [mineId, user.userId, user.mine.departmentId, obsId, title, description, category, risk, location, ai]);

  const onSave = useCallback(async () => {
    if (!canSave || !mineId || !user.userId) {
      setError(t('incident.needTitle'));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await persist();
      Alert.alert(t('obs.quick'), t('checklist.savedLocally'), [
        { text: t('action.close'), onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the observation.');
      setBusy(null);
    }
  }, [canSave, mineId, user.userId, persist, router, t]);

  const online = getOnline();
  const ready = !!mineId && !!user.userId;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS === 'ios'}>
        <View style={styles.headerPad}>
          <AppHeader
            title={t('obs.quick')}
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
          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('obs.fieldTitle')}
            </AppText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('incident.titlePlaceholder')}
              placeholderTextColor={theme.color.textSecondary}
              style={styles.input}
              accessibilityLabel={t('obs.fieldTitle')}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('obs.risk')}
            </AppText>
            <View style={styles.chips}>
              {RISKS.map((r) => {
                const sel = r.value === risk;
                const c = theme.color.status[r.tone];
                return (
                  <PressableScale
                    key={r.value}
                    onPress={() => setRisk(r.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={r.label}
                    style={[styles.chip, sel ? { backgroundColor: c.tint, borderColor: c.solid } : null]}
                  >
                    <AppText variant="bodyStrong" color={sel ? c.text : theme.color.textSecondary}>
                      {r.label}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('obs.category')}
            </AppText>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. Electrical Safety"
              placeholderTextColor={theme.color.textSecondary}
              style={styles.input}
              accessibilityLabel={t('obs.category')}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label" tone="secondary">
              {t('obs.description')}
            </AppText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('incident.descriptionPlaceholder')}
              placeholderTextColor={theme.color.textSecondary}
              multiline
              style={[styles.input, styles.multiline]}
              accessibilityLabel={t('obs.description')}
            />
          </View>

          <View style={styles.field}>
            <SectionHeader title={t('obs.location')} />
            <LocationCard location={location} capturing={gpsBusy} onCapture={onCaptureGps} />
          </View>

          <View style={styles.field}>
            <SectionHeader title={t('obs.evidence')} />
            {ready ? (
              <ParentEvidenceStrip
                parent={{ kind: 'observation', observationId: obsId, groupId: obsId }}
                mineId={mineId!}
                uploadedBy={user.userId!}
                location={location}
                ensureParent={persist}
              />
            ) : null}
          </View>

          <View style={styles.field}>
            <SectionHeader title={t('obs.voiceNote')} />
            {ready ? (
              <VoiceNoteRecorder
                parent={{ kind: 'observation', inspectionId: obsId, observationId: obsId }}
                resolveParent={async () => {
                  await persist();
                  return { kind: 'observation', inspectionId: obsId, observationId: obsId };
                }}
                mineId={mineId!}
                uploadedBy={user.userId!}
              />
            ) : null}
          </View>

          <View style={styles.field}>
            <SectionHeader title={t('ai.assisted')} />
            {ai ? (
              <AppCard style={styles.aiCard}>
                <View style={styles.aiHead}>
                  <StatusBadge
                    label={ai.risk.toUpperCase()}
                    tone={RISKS.find((r) => r.value === ai.risk)?.tone ?? 'warning'}
                  />
                  <StatusBadge label={t('ai.simulated')} tone="neutral" dot={false} />
                </View>
                <AppText variant="label" tone="secondary">
                  {t('ai.recommended')}
                </AppText>
                <AppText variant="body" style={styles.aiText}>
                  {ai.action}
                </AppText>
                <AppText variant="label" tone="secondary">
                  {t('ai.hazard')}
                </AppText>
                <AppText variant="body" tone="secondary" style={styles.aiText}>
                  {ai.consequence}
                </AppText>
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
            label={busy === 'save' ? t('state.loading') : t('action.save')}
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
  aiCard: { gap: theme.spacing[2] },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  aiText: { lineHeight: 18 },
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
