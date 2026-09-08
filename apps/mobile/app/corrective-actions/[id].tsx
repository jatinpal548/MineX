import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { hasPermission } from '@coalguard/config';
import type { CorrectiveActionPriority } from '@coalguard/types';
import { theme, type StatusTone } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
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
import { Icon } from '@/components/Icon';
import { ParentEvidenceStrip } from '@/components/inspection/ParentEvidenceStrip';
import { VoiceNoteRecorder } from '@/components/inspection/VoiceNoteRecorder';
import {
  getCorrectiveActionDetail,
  startCorrectiveAction,
  addCorrectiveActionNote,
  submitCorrectiveAction,
  verifyCorrectiveAction,
  rejectCorrectiveAction,
  type CorrectiveActionDetail,
} from '@/features/corrective-actions/repository';

const PRIORITY_TONE: Record<CorrectiveActionPriority, StatusTone> = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="body" style={styles.rowValue} numberOfLines={2}>
        {value || '—'}
      </AppText>
    </View>
  );
}

export default function CorrectiveActionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useFieldUser();

  const [ca, setCa] = useState<CorrectiveActionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [closureText, setClosureText] = useState('');
  const [rejectText, setRejectText] = useState('');
  const [mode, setMode] = useState<null | 'note' | 'submit' | 'reject'>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setCa(await getCorrectiveActionDetail(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the corrective action.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        setMode(null);
        setNoteText('');
        setClosureText('');
        setRejectText('');
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The action could not be completed.');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (error && !ca) {
    return (
      <Screen>
        <AppHeader title={t('nav.correctiveActions')} showBack />
        <ErrorState title={t('state.error')} message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!ca) {
    return (
      <Screen scroll>
        <AppHeader title={t('nav.correctiveActions')} showBack />
        <View style={styles.loading}>
          <Skeleton height={120} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      </Screen>
    );
  }

  const isAssignee = !!user.userId && ca.assignedToId === user.userId;
  const canVerify = user.role ? hasPermission([user.role], 'corrective_action:verify') : false;
  const canStart = isAssignee && ['assigned', 'rejected', 'overdue'].includes(ca.status);
  const canWork = isAssignee && ['assigned', 'in_progress', 'rejected', 'overdue'].includes(ca.status);
  const submitted = ca.status === 'submitted';
  const done = ca.status === 'verified' || ca.status === 'closed';

  return (
    <Screen padded={false} scroll={false}>
      <View style={styles.headerPad}>
        <AppHeader title={t('nav.correctiveActions')} showBack />
      </View>

      <ScrollView
        style={styles.scrollWrap}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          <View style={styles.titleRow}>
            <View style={[styles.prioBar, { backgroundColor: theme.color.status[PRIORITY_TONE[ca.priority]].solid }]} />
            <AppText variant="subheading" style={styles.flex}>
              {ca.title}
            </AppText>
          </View>
          <View style={styles.badgeRow}>
            <StatusBadge label={ca.priority.toUpperCase()} tone={PRIORITY_TONE[ca.priority]} />
            <StatusBadge
              label={ca.status.replace('_', ' ').toUpperCase()}
              tone={submitted ? 'warning' : done ? 'safe' : ca.status === 'rejected' ? 'critical' : 'info'}
            />
          </View>

          <AppCard>
            <Row label={t('ca.assignedTo')} value={ca.assignedToName ?? '—'} />
            <Row label={t('ca.created')} value={formatDateTime(ca.createdAt)} />
            <Row label={t('ca.dueDate')} value={ca.dueDate ? formatDateTime(ca.dueDate) : '—'} />
            {ca.mineName ? <Row label={t('review.mine')} value={ca.mineName} /> : null}
          </AppCard>

          {ca.description ? (
            <View style={styles.section}>
              <SectionHeader title={t('obs.description')} />
              <AppText variant="body" tone="secondary" style={styles.para}>
                {ca.description}
              </AppText>
            </View>
          ) : null}

          {ca.observation ? (
            <View style={styles.section}>
              <SectionHeader title={t('ca.relatedObservation')} />
              <AppCard>
                <AppText variant="bodyStrong">{ca.observation.title}</AppText>
                {ca.observationDescription ? (
                  <AppText variant="caption" tone="secondary" style={styles.para}>
                    {ca.observationDescription}
                  </AppText>
                ) : null}
              </AppCard>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title={t('obs.evidence')} />
            {user.mine.mineId && user.userId ? (
              <ParentEvidenceStrip
                parent={{ kind: 'corrective_action', correctiveActionId: ca.id }}
                mineId={user.mine.mineId}
                uploadedBy={user.userId}
                editable={canWork}
              />
            ) : null}
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('obs.voiceNote')} />
            {user.mine.mineId && user.userId ? (
              <VoiceNoteRecorder
                parent={{ kind: 'corrective_action', correctiveActionId: ca.id }}
                mineId={user.mine.mineId}
                uploadedBy={user.userId}
                editable={canWork}
              />
            ) : null}
          </View>

          {ca.closureNotes ? (
            <View style={styles.section}>
              <SectionHeader title={t('ca.closureNotes')} />
              <AppText variant="caption" tone="secondary" style={styles.para}>
                {ca.closureNotes}
              </AppText>
            </View>
          ) : null}
          {ca.rejectionReason ? (
            <View style={styles.section}>
              <SectionHeader title={t('ca.rejectionReason')} />
              <AppText variant="caption" color={theme.color.status.critical.text} style={styles.para}>
                {ca.rejectionReason}
              </AppText>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title={t('ca.activity')} />
            <View style={styles.timeline}>
              {ca.timeline.map((ev) => (
                <View key={ev.key} style={styles.tlRow}>
                  <View style={styles.tlDot} />
                  <View style={styles.flex}>
                    <AppText variant="caption">{ev.label}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {formatDateTime(ev.at)}
                    </AppText>
                    {ev.note ? (
                      <AppText variant="caption" tone="secondary" style={styles.para}>
                        “{ev.note}”
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* inline inputs */}
          {mode === 'note' ? (
            <AppCard>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder={t('ca.addNote')}
                placeholderTextColor={theme.color.textSecondary}
                multiline
                style={styles.input}
              />
              <AppButton
                label={busy === 'note' ? t('state.loading') : t('ca.addNote')}
                icon="completed"
                disabled={busy !== null || noteText.trim().length < 2}
                onPress={() => run('note', () => addCorrectiveActionNote(ca, noteText, user.userId ?? ''))}
              />
            </AppCard>
          ) : null}
          {mode === 'submit' ? (
            <AppCard>
              <TextInput
                value={closureText}
                onChangeText={setClosureText}
                placeholder={t('ca.closureNotes')}
                placeholderTextColor={theme.color.textSecondary}
                multiline
                style={styles.input}
              />
              <AppButton
                label={busy === 'submit' ? t('state.loading') : t('ca.submitForVerification')}
                icon="completed"
                disabled={busy !== null}
                onPress={() => run('submit', () => submitCorrectiveAction(ca, closureText, user.userId ?? ''))}
              />
            </AppCard>
          ) : null}
          {mode === 'reject' ? (
            <AppCard>
              <TextInput
                value={rejectText}
                onChangeText={setRejectText}
                placeholder={t('ca.rejectionReason')}
                placeholderTextColor={theme.color.textSecondary}
                multiline
                style={styles.input}
              />
              <AppButton
                label={busy === 'reject' ? t('state.loading') : t('ca.reject')}
                icon="fail"
                variant="secondary"
                disabled={busy !== null || rejectText.trim().length < 3}
                onPress={() => run('reject', () => rejectCorrectiveAction(ca, rejectText, user.userId ?? ''))}
              />
            </AppCard>
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

      {/* footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[3] }]}>
        {submitted && !canVerify ? (
          <View style={styles.awaiting}>
            <Icon name="clock" size="sm" color={theme.color.status.warning.text} />
            <AppText variant="caption" color={theme.color.status.warning.text}>
              {t('ca.awaitingManager')}
            </AppText>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          {canStart ? (
            <AppButton
              label={t('ca.updateProgress')}
              icon="sync"
              size="lg"
              fullWidth
              disabled={busy !== null}
              onPress={() => run('start', () => startCorrectiveAction(ca, user.userId ?? ''))}
            />
          ) : null}
          {canWork ? (
            <>
              <View style={styles.footerBtn}>
                <AppButton
                  label={t('ca.addNote')}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onPress={() => setMode(mode === 'note' ? null : 'note')}
                />
              </View>
              <View style={styles.footerBtn}>
                <AppButton
                  label={t('ca.submitForVerification')}
                  size="lg"
                  fullWidth
                  onPress={() => setMode(mode === 'submit' ? null : 'submit')}
                />
              </View>
            </>
          ) : null}
          {submitted && canVerify ? (
            <>
              <View style={styles.footerBtn}>
                <AppButton
                  label={t('ca.reject')}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={busy !== null}
                  onPress={() => setMode(mode === 'reject' ? null : 'reject')}
                />
              </View>
              <View style={styles.footerBtn}>
                <AppButton
                  label={t('ca.verify')}
                  size="lg"
                  fullWidth
                  disabled={busy !== null}
                  onPress={() => run('verify', () => verifyCorrectiveAction(ca, user.userId ?? ''))}
                />
              </View>
            </>
          ) : null}
          {!canStart && !canWork && !(submitted && canVerify) && !submitted ? (
            <AppText variant="caption" tone="secondary" style={styles.note}>
              {t('ca.notPermitted')}
            </AppText>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerPad: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[2] },
  scrollWrap: { flex: 1 },
  scrollContent: { padding: theme.spacing[5], paddingBottom: theme.spacing[10], gap: theme.spacing[4] },
  loading: { gap: theme.spacing[3], padding: theme.spacing[5] },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] },
  prioBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 24 },
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
  input: {
    minHeight: 72,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceRaised,
    color: theme.color.textPrimary,
    padding: theme.spacing[3],
    fontSize: theme.fontSize.sm,
    textAlignVertical: 'top',
    marginBottom: theme.spacing[3],
  },

  timeline: { gap: theme.spacing[3] },
  tlRow: { flexDirection: 'row', gap: theme.spacing[3] },
  tlDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.accent, marginTop: 6 },

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
    gap: theme.spacing[2],
  },
  awaiting: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], justifyContent: 'center' },
  footerRow: { flexDirection: 'row', gap: theme.spacing[3], alignItems: 'center' },
  footerBtn: { flex: 1 },
  note: { flex: 1, textAlign: 'center' },
});
