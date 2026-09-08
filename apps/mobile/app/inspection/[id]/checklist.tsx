import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { formatClock } from '@/lib/datetime';
import {
  AppHeader,
  AppText,
  AppButton,
  AppCard,
  StatusBadge,
  ConnectivityBadge,
  ErrorState,
  Skeleton,
  IconButton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useInspection } from '@/features/inspection/InspectionContext';
import { deleteDraftOffline, saveResponsesOffline } from '@/features/inspection/offlineRepo';
import { SyncBadge } from '@/components/inspection/SyncBadge';
import {
  computeProgress,
  type ChecklistResponse,
  type DraftChecklistItem,
} from '@/features/inspection/types';

const RESPONSES: {
  value: ChecklistResponse;
  label: string;
  icon: 'pass' | 'fail' | 'na';
  tone: 'safe' | 'highRisk' | 'neutral';
}[] = [
  { value: 'ok', label: 'Pass', icon: 'pass', tone: 'safe' },
  { value: 'not_ok', label: 'Fail', icon: 'fail', tone: 'highRisk' },
  { value: 'na', label: 'N/A', icon: 'na', tone: 'neutral' },
];

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { draft, loading, saving, error, load, setResponse, setNotes, saveProgress } =
    useInspection();
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState(false);

  // load (or reload) this inspection
  useEffect(() => {
    if (id && draft?.id !== id) void load(id);
  }, [id, draft?.id, load]);

  // best-effort save on unmount so a back-swipe never loses answers
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(
    () => () => {
      const d = draftRef.current;
      if (d && d.status === 'in_progress') {
        void saveResponsesOffline(d.id, d.items).catch(() => {});
      }
    },
    [],
  );

  const progress = useMemo(() => computeProgress(draft?.items ?? []), [draft?.items]);

  // If this inspection is no longer an editable draft, leave the checklist for
  // its detail view. This MUST run as an effect - calling router.replace during
  // render triggers "Cannot update a component while rendering a different one".
  const notEditable = !!draft && draft.status !== 'in_progress';
  useEffect(() => {
    if (notEditable && draft) router.replace(`/inspection/${draft.id}/detail`);
  }, [notEditable, draft, router]);

  const onReview = useCallback(async () => {
    const ok = await saveProgress();
    if (ok) setLastSavedAt(new Date());
    if (ok && id) router.push(`/inspection/${id}/review`);
  }, [saveProgress, router, id]);

  const onSave = useCallback(async () => {
    const ok = await saveProgress();
    if (ok) setLastSavedAt(new Date());
    return ok;
  }, [saveProgress]);

  const onSaveExit = useCallback(async () => {
    await onSave();
    router.replace('/inspections');
  }, [onSave, router]);

  const onDelete = useCallback(() => {
    Alert.alert(t('delete.title'), t('delete.body'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('action.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          setDeleting(true);
          try {
            await deleteDraftOffline(id);
            router.replace('/inspections');
          } catch (e) {
            setDeleting(false);
            Alert.alert(
              t('state.error'),
              e instanceof Error ? e.message : 'Could not delete the inspection.',
            );
          }
        },
      },
    ]);
  }, [id, router, t]);

  const goToObservation = useCallback(
    (itemId: string) => {
      if (!id) return;
      router.push({ pathname: '/inspection/[id]/observation', params: { id, itemId } });
    },
    [router, id],
  );

  /* --------------------------- loading / error --------------------------- */

  if (loading || (!draft && !error)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <AppHeader title="Inspection" showBack />
        </View>
        <View style={styles.statePad}>
          <Skeleton height={64} />
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !draft) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <AppHeader title="Inspection" showBack />
        </View>
        <View style={styles.statePad}>
          <ErrorState
            title="Couldn't open the inspection"
            message={error ?? 'The inspection could not be loaded.'}
            onRetry={() => id && load(id)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (draft.status !== 'in_progress') {
    // the effect above navigates to the detail view; render nothing meanwhile
    return null;
  }

  const pct = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;

  /* -------------------------------- main -------------------------------- */
  //
  // Layout:
  //   SafeAreaView (top/left/right insets)
  //     KeyboardAvoidingView (iOS only; Android uses windowSoftInputMode=adjustResize)
  //       View header                    - fixed, intrinsic height
  //       ScrollView (flex: 1)           - the ONLY scroll region
  //       View footer                    - fixed sibling, its own layout space,
  //                                        lifted above the nav bar by insets.bottom
  //
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS === 'ios'}>
        {/* header + progress - fixed, above the scroll region */}
        <View style={styles.header}>
          <AppHeader
            title={draft.templateName}
            subtitle={t('checklist.answered', {
              answered: progress.answered,
              total: progress.total,
            })}
            showBack
            right={
              <View style={styles.headerRight}>
                <View style={styles.headerBadges}>
                  <SyncBadge />
                  <ConnectivityBadge variant="compact" />
                </View>
                <IconButton
                  icon="remove"
                  accessibilityLabel={t('action.deleteDraft')}
                  onPress={onDelete}
                  disabled={deleting}
                />
              </View>
            }
          />
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <View style={styles.countRow}>
            <Count label={t('checklist.passed')} value={progress.passed} tone="safe" />
            <Count label={t('checklist.failed')} value={progress.failed} tone="highRisk" />
            <Count label={t('checklist.na')} value={progress.na} tone="neutral" />
            {lastSavedAt ? (
              <AppText variant="caption" tone="secondary" style={styles.lastSaved}>
                {t('checklist.lastSaved', { time: formatClock(lastSavedAt) })}
              </AppText>
            ) : null}
          </View>
        </View>

        {/* the checklist - the only scrolling region, bounded between header and footer */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          overScrollMode="always"
        >
          {draft.items.map((item, index) => (
            <View key={item.id} style={index > 0 ? styles.itemGap : undefined}>
              <ChecklistItemCard
                item={item}
                index={index}
                onRespond={setResponse}
                onNotes={setNotes}
                onObservation={goToObservation}
              />
            </View>
          ))}
        </ScrollView>

        {/* footer - a real flex sibling (never overlays the list); its bottom
            padding carries the Android gesture-bar inset so the buttons clear it */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[3] }]}>
          <View style={styles.footerNoteRow}>
            {progress.mandatoryRemaining > 0 ? (
              <>
                <Icon name="warning" size="xs" color={theme.color.status.warning.text} />
                <AppText
                  variant="caption"
                  color={theme.color.status.warning.text}
                  numberOfLines={1}
                  style={styles.flex}
                >
                  {t('checklist.requiredRemaining', { n: progress.mandatoryRemaining })}
                </AppText>
              </>
            ) : (
              <>
                <Icon name="pass" size="xs" color={theme.color.status.safe.text} />
                <AppText
                  variant="caption"
                  color={theme.color.status.safe.text}
                  numberOfLines={1}
                  style={styles.flex}
                >
                  {t('checklist.allAnswered')}
                </AppText>
              </>
            )}
          </View>
          <View style={styles.footerRow}>
            <View style={styles.footerBtn}>
              <AppButton
                label={saving ? t('state.loading') : t('action.saveExit')}
                variant="secondary"
                size="lg"
                icon="sync"
                fullWidth
                onPress={onSaveExit}
                disabled={saving || deleting}
              />
            </View>
            <View style={styles.footerBtn}>
              <AppButton
                label={t('action.continue')}
                size="lg"
                icon="chevronRight"
                fullWidth
                onPress={onReview}
                disabled={saving || deleting || progress.answered === 0}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ------------------------------ subcomponents ------------------------- */

function Count({
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
    <View style={styles.count}>
      <AppText variant="bodyStrong" color={c.text}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const ChecklistItemCard = memo(function ChecklistItemCard({
  item,
  index,
  onRespond,
  onNotes,
  onObservation,
}: {
  item: DraftChecklistItem;
  index: number;
  onRespond: (itemId: string, r: ChecklistResponse) => void;
  onNotes: (itemId: string, n: string) => void;
  onObservation: (itemId: string) => void;
}) {
  return (
    <AppCard style={styles.itemCard}>
      <AppText variant="caption" tone="secondary">
        {item.section.toUpperCase()} - {index + 1}
        {item.isMandatory ? ' - REQUIRED' : ''}
      </AppText>
      <AppText variant="bodyStrong" style={styles.prompt}>
        {item.prompt}
      </AppText>
      {item.guidance ? (
        <AppText variant="caption" tone="secondary" style={styles.guidance}>
          {item.guidance}
        </AppText>
      ) : null}

      <View style={styles.responseRow}>
        {RESPONSES.map((r) => {
          const selected = item.response === r.value;
          const c = theme.color.status[r.tone];
          return (
            <PressableScale
              key={r.value}
              onPress={() => onRespond(item.id, r.value)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              accessibilityState={{ selected }}
              style={[
                styles.responseBtn,
                { borderWidth: selected ? 1.5 : 1 },
                selected
                  ? { backgroundColor: c.tint, borderColor: c.solid }
                  : { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border },
              ]}
            >
              <Icon
                name={r.icon}
                size="sm"
                color={selected ? c.text : theme.color.textSecondary}
                strokeWidth={selected ? 2.4 : 2}
              />
              <AppText
                variant="bodyStrong"
                numberOfLines={1}
                color={selected ? c.text : theme.color.textSecondary}
                style={styles.responseLabel}
              >
                {r.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      <TextInput
        value={item.notes}
        onChangeText={(n) => onNotes(item.id, n)}
        placeholder="Add a note (optional)"
        placeholderTextColor={theme.color.textSecondary}
        multiline
        style={styles.notesInput}
        accessibilityLabel={`Note for ${item.prompt}`}
      />

      {item.response === 'not_ok' ? (
        item.observationId ? (
          <PressableScale
            onPress={() => onObservation(item.id)}
            accessibilityRole="button"
            accessibilityLabel="Edit observation"
            style={styles.obsLinked}
          >
            <StatusBadge label="Observation added" tone="highRisk" />
            <AppText variant="caption" color={theme.color.accent}>
              Edit
            </AppText>
          </PressableScale>
        ) : (
          <AppButton
            label="Add observation"
            variant="secondary"
            icon="add"
            onPress={() => onObservation(item.id)}
            style={styles.obsBtn}
          />
        )
      ) : null}
    </AppCard>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },

  header: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.color.hairline,
    gap: theme.spacing[2],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.color.accent },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  headerBadges: { alignItems: 'flex-end', gap: theme.spacing[1] },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing[4] },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing[1] },
  lastSaved: { marginLeft: 'auto' },

  statePad: { flex: 1, padding: theme.spacing[5], gap: theme.spacing[3] },

  list: { flex: 1 },
  listContent: { padding: theme.spacing[5], paddingBottom: theme.spacing[4] },
  itemGap: { marginTop: theme.spacing[3] },

  itemCard: { gap: theme.spacing[2] },
  prompt: { lineHeight: 22 },
  guidance: { lineHeight: 18 },
  responseRow: { flexDirection: 'row', gap: theme.spacing[2], marginTop: theme.spacing[2] },
  responseBtn: {
    flex: 1,
    minHeight: theme.control.lg,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  responseLabel: { fontWeight: '600' },
  notesInput: {
    minHeight: 44,
    maxHeight: 110,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceRaised,
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
  obsBtn: { alignSelf: 'flex-start', marginTop: theme.spacing[2] },
  obsLinked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing[2],
  },

  footer: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
    backgroundColor: theme.color.surface,
    gap: theme.spacing[3],
  },
  footerNoteRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  footerRow: { flexDirection: 'row', gap: theme.spacing[3] },
  footerBtn: { flex: 1 },
});
