import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { useFieldUser } from '@/hooks/useFieldUser';
import {
  Screen,
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  SectionHeader,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useInspection } from '@/features/inspection/InspectionContext';
import {
  createCorrectiveActionOffline,
  createObservationOffline,
  saveAiAnalysisOffline,
  saveResponsesOffline,
  updateObservationOffline,
} from '@/features/inspection/offlineRepo';
import { isHighOrCritical, type DraftObservation } from '@/features/inspection/types';
import { EvidenceCapture } from '@/components/inspection/EvidenceCapture';
import { VoiceNoteRecorder } from '@/components/inspection/VoiceNoteRecorder';
import { LocationCard } from '@/components/inspection/LocationCard';
import { captureLocation } from '@/lib/location/capture';
import type { LocationResult } from '@/lib/media/types';
import { useI18n } from '@/lib/i18n';
import { classifyRisk, type RiskAnalysis } from '@/lib/ai/classifyRisk';
import type { RiskLevel } from '@coalguard/types';

const RISK_TONE: Record<RiskLevel, 'safe' | 'warning' | 'highRisk' | 'critical'> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};

export default function ObservationScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useFieldUser();
  const { t } = useI18n();
  const { draft, mergeObservation } = useInspection();

  const item = useMemo(() => draft?.items.find((i) => i.id === itemId), [draft, itemId]);
  const existing = useMemo(
    () => draft?.observations.find((o) => o.id === item?.observationId),
    [draft, item],
  );

  const [obsId, setObsId] = useState<string | null>(existing?.id ?? null);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? item?.section ?? '');
  const [risk, setRisk] = useState<RiskLevel | null>(existing?.risk ?? null);

  const [ai, setAi] = useState<RiskAnalysis | null>(
    existing?.aiRationale
      ? {
          risk: existing.risk,
          confidence: 0,
          rationale: existing.aiRationale,
          recommendations: existing.aiRecommendations,
          simulated: existing.aiSimulated,
          source: existing.aiSource ?? 'on-device',
        }
      : null,
  );
  const [aiAnalysisId, setAiAnalysisId] = useState<string | null>(existing?.aiAnalysisId ?? null);
  const [caId, setCaId] = useState<string | null>(existing?.correctiveActionId ?? null);

  const [busy, setBusy] = useState<null | 'ai' | 'ca' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const onCaptureGps = useCallback(async () => {
    setGpsBusy(true);
    setError(null);
    try {
      const result = await captureLocation();
      setLocation(result);
    } finally {
      setGpsBusy(false);
    }
  }, []);

  // Prefer the mine id already on the loaded inspection draft (survives an
  // offline cold start via the local snapshot); fall back to the user's
  // resolved mine context only when the draft has not loaded yet.
  const mineId = draft?.mineId ?? user.mine.mineId;
  const canSubmitTitle = title.trim().length >= 3;

  const buildDraftObservation = useCallback(
    (overrides: Partial<DraftObservation> = {}): DraftObservation => ({
      id: obsId ?? 'pending',
      inspectionItemId: itemId ?? null,
      checklistItemId: item?.checklistItemId ?? null,
      title: title.trim(),
      description: description.trim(),
      category: category.trim() || null,
      risk: risk ?? 'medium',
      aiAnalysisId,
      aiRationale: ai?.rationale ?? null,
      aiRecommendations: ai?.recommendations ?? [],
      aiSimulated: ai?.simulated ?? false,
      aiSource: ai?.source ?? null,
      correctiveActionId: caId,
      correctiveActionPriority: caId && risk && isHighOrCritical(risk) ? risk : null,
      evidenceCount,
      hasLocation: false,
      ...overrides,
    }),
    [
      obsId,
      itemId,
      item,
      title,
      description,
      category,
      risk,
      aiAnalysisId,
      ai,
      caId,
      evidenceCount,
    ],
  );

  /** create the observation row on first need (AI, evidence or Save). */
  const ensureObservation = useCallback(async (): Promise<string> => {
    if (obsId) return obsId;
    if (!id || !mineId || !user.userId) throw new Error('Missing inspection context.');

    // The observation's `inspection_item_id` FK points at this checklist item.
    // The checklist screen may not have flushed it to Supabase yet, so persist
    // it first (it carries a stable client id) - otherwise the insert fails
    // with a foreign-key error.
    const linkItemId = item && (item.response || item.notes.trim()) ? item.id : null;
    if (item && linkItemId) {
      await saveResponsesOffline(id, [item]);
    }

    const newObsId = await createObservationOffline({
      inspectionId: id,
      inspectionItemId: linkItemId,
      mineId,
      departmentId: user.mine.departmentId,
      raisedBy: user.userId,
      title: title.trim(),
      description: description.trim(),
      category: category.trim() || null,
    });
    setObsId(newObsId);
    mergeObservation(buildDraftObservation({ id: newObsId }));
    return newObsId;
  }, [
    obsId,
    id,
    mineId,
    user.userId,
    user.mine.departmentId,
    item,
    title,
    description,
    category,
    mergeObservation,
    buildDraftObservation,
  ]);

  const runAi = useCallback(async () => {
    if (!canSubmitTitle) {
      setError('Add a short title before running the analysis.');
      return;
    }
    setBusy('ai');
    setError(null);
    try {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        context: item?.prompt ?? null,
      };
      const result = await classifyRisk(input);
      const oId = await ensureObservation();
      const analysisId = await saveAiAnalysisOffline({
        inspectionId: id ?? '',
        observationId: oId,
        requestedBy: user.userId ?? '',
        input,
        result,
      });

      setAi(result);
      setRisk(result.risk);
      setAiAnalysisId(analysisId);
      mergeObservation(
        buildDraftObservation({ id: oId, risk: result.risk, aiAnalysisId: analysisId }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Risk analysis failed. Try again.');
    } finally {
      setBusy(null);
    }
  }, [
    id,
    canSubmitTitle,
    title,
    description,
    category,
    item,
    ensureObservation,
    user.userId,
    mergeObservation,
    buildDraftObservation,
  ]);

  const proposeCorrectiveAction = useCallback(async () => {
    if (!id || !mineId || !risk) return;
    setBusy('ca');
    setError(null);
    try {
      const oId = await ensureObservation();
      const newCaId = await createCorrectiveActionOffline({
        observationId: oId,
        inspectionId: id,
        mineId,
        title: `Corrective action: ${title.trim()}`,
        description: ai?.recommendations?.join(' ') ?? description.trim(),
        priority: risk === 'critical' ? 'critical' : 'high',
      });
      setCaId(newCaId);
      mergeObservation(buildDraftObservation({ id: oId, correctiveActionId: newCaId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the corrective action.');
    } finally {
      setBusy(null);
    }
  }, [
    id,
    mineId,
    risk,
    ensureObservation,
    title,
    ai,
    description,
    mergeObservation,
    buildDraftObservation,
  ]);

  const save = useCallback(async () => {
    if (!canSubmitTitle) {
      setError('A title of at least 3 characters is required.');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const oId = await ensureObservation();
      const gps =
        location?.status === 'captured' &&
        typeof location.latitude === 'number' &&
        typeof location.longitude === 'number'
          ? { gpsLatitude: location.latitude, gpsLongitude: location.longitude }
          : {};
      await updateObservationOffline({
        inspectionId: id ?? '',
        observationId: oId,
        mineId: mineId ?? '',
        raisedBy: user.userId ?? '',
        inspectionItemId: item && (item.response || item.notes.trim()) ? item.id : null,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || null,
        risk,
        ...gps,
      });
      mergeObservation(
        buildDraftObservation({ id: oId, hasLocation: 'gpsLatitude' in gps }),
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the observation.');
      setBusy(null);
    }
  }, [
    id,
    item,
    mineId,
    user.userId,
    canSubmitTitle,
    ensureObservation,
    title,
    description,
    category,
    risk,
    location,
    mergeObservation,
    buildDraftObservation,
    router,
  ]);

  if (!item) {
    return (
      <Screen>
        <AppHeader title={t('obs.title')} showBack />
        <AppText variant="body" tone="secondary">
          This checklist item could not be found. Go back and try again.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll={false}>
      <View style={styles.headerPad}>
        <AppHeader title={t('obs.title')} subtitle="For a failed check" showBack />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppCard style={styles.contextCard}>
          <AppText variant="caption" tone="secondary">
            {item.section.toUpperCase()}
          </AppText>
          <AppText variant="body">{item.prompt}</AppText>
        </AppCard>

        <View style={styles.field}>
          <AppText variant="label" tone="secondary">
            Title
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Exposed electrical cable near access route"
            placeholderTextColor={theme.color.textSecondary}
            style={styles.input}
            accessibilityLabel="Observation title"
          />
        </View>

        <View style={styles.field}>
          <AppText variant="label" tone="secondary">
            Description
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What did you see? Where exactly? Any immediate action taken?"
            placeholderTextColor={theme.color.textSecondary}
            multiline
            style={[styles.input, styles.multiline]}
            accessibilityLabel="Observation description"
          />
        </View>

        <View style={styles.field}>
          <AppText variant="label" tone="secondary">
            Category
          </AppText>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. Electrical Safety"
            placeholderTextColor={theme.color.textSecondary}
            style={styles.input}
            accessibilityLabel="Observation category"
          />
        </View>

        {/* -------- location -------- */}
        <View style={styles.section}>
          <SectionHeader title={t('obs.location')} />
          <LocationCard location={location} capturing={gpsBusy} onCapture={onCaptureGps} />
        </View>

        {/* -------- evidence -------- */}
        <View style={styles.section}>
          <SectionHeader
            title={t('obs.evidence')}
            trailing={
              evidenceCount > 0 ? (
                <AppText variant="caption" tone="secondary">
                  {evidenceCount} photo{evidenceCount === 1 ? '' : 's'}
                </AppText>
              ) : undefined
            }
          />
          {mineId && id ? (
            <EvidenceCapture
              inspectionId={id}
              mineId={mineId}
              uploadedBy={user.userId ?? ''}
              observationId={obsId}
              ensureObservation={ensureObservation}
              onCountChange={setEvidenceCount}
            />
          ) : (
            <AppText variant="caption" tone="secondary">
              Evidence capture needs a mine assignment.
            </AppText>
          )}
        </View>

        {/* -------- voice note -------- */}
        {mineId && id ? (
          <View style={styles.section}>
            <SectionHeader title={t('obs.voiceNote')} />
            <VoiceNoteRecorder
              parent={{ kind: 'observation', inspectionId: id, observationId: obsId ?? 'pending' }}
              resolveParent={async () => ({
                kind: 'observation',
                inspectionId: id,
                observationId: await ensureObservation(),
              })}
              mineId={mineId}
              uploadedBy={user.userId ?? ''}
            />
          </View>
        ) : null}

        {/* -------- AI risk analysis -------- */}
        <View style={styles.section}>
          <SectionHeader title={t('obs.aiRisk')} />
          {ai ? (
            <AppCard style={styles.aiCard}>
              <View style={styles.aiHead}>
                <StatusBadge label={ai.risk.toUpperCase()} tone={RISK_TONE[ai.risk]} />
                <View style={styles.aiSourceRow}>
                  <Icon name="ai" size="xs" color={theme.color.textSecondary} />
                  <AppText variant="caption" tone="secondary">
                    {ai.source === 'server' ? 'Server' : 'On-device'}
                    {ai.simulated ? ' - simulated' : ''}
                  </AppText>
                </View>
              </View>
              <AppText variant="caption" tone="secondary" style={styles.aiText}>
                {ai.rationale}
              </AppText>
              {ai.recommendations.length > 0 ? (
                <View style={styles.recs}>
                  {ai.recommendations.map((r, i) => (
                    <View key={i} style={styles.recRow}>
                      <View style={styles.recDot} />
                      <AppText variant="caption" tone="secondary" style={styles.flex}>
                        {r}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
              <AppButton
                label={busy === 'ai' ? 'Re-analysing...' : 'Re-run analysis'}
                variant="ghost"
                icon="sync"
                onPress={runAi}
                disabled={busy !== null}
                style={styles.reRun}
              />
            </AppCard>
          ) : (
            <AppCard style={styles.aiCard}>
              <AppText variant="caption" tone="secondary">
                Not analysed yet. The AI assigns the risk level from your title, description and the
                failed check.
              </AppText>
              <AppButton
                label={busy === 'ai' ? 'Analysing...' : 'Run risk analysis'}
                icon="ai"
                onPress={runAi}
                disabled={busy !== null || !canSubmitTitle}
                style={styles.reRun}
              />
            </AppCard>
          )}
        </View>

        {/* -------- corrective action (high/critical only) -------- */}
        {risk && isHighOrCritical(risk) ? (
          <View style={styles.section}>
            <SectionHeader title="Corrective Action" />
            {caId ? (
              <AppCard style={styles.aiCard}>
                <View style={styles.aiHead}>
                  <StatusBadge label="Proposed" tone="warning" />
                  <StatusBadge
                    label={(risk === 'critical' ? 'critical' : 'high').toUpperCase()}
                    tone={RISK_TONE[risk]}
                  />
                </View>
                <AppText variant="caption" tone="secondary">
                  A draft corrective action was created. Your mine manager assigns an owner and due
                  date in MineX Command.
                </AppText>
              </AppCard>
            ) : (
              <AppCard style={styles.aiCard}>
                <AppText variant="caption" tone="secondary">
                  This is a {risk} risk observation. Propose a corrective action for the mine
                  manager to assign.
                </AppText>
                <AppButton
                  label={busy === 'ca' ? 'Creating...' : 'Propose corrective action'}
                  icon="add"
                  onPress={proposeCorrectiveAction}
                  disabled={busy !== null}
                  style={styles.reRun}
                />
              </AppCard>
            )}
          </View>
        ) : null}

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
          label={busy === 'save' ? 'Saving...' : 'Save observation'}
          icon="completed"
          size="lg"
          fullWidth
          onPress={save}
          disabled={busy !== null || !canSubmitTitle}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerPad: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  content: { padding: theme.spacing[5], gap: theme.spacing[4], paddingBottom: theme.spacing[8] },

  contextCard: { gap: theme.spacing[1], backgroundColor: theme.color.surfaceRaised },
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

  section: { gap: theme.spacing[2] },
  aiCard: { gap: theme.spacing[3] },
  aiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiSourceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  aiText: { lineHeight: 18 },
  recs: { gap: theme.spacing[2] },
  recRow: { flexDirection: 'row', gap: theme.spacing[2], alignItems: 'flex-start' },
  recDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.color.accent,
    marginTop: 6,
  },
  reRun: { alignSelf: 'flex-start' },

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
