/**
 * Reusable voice-note recorder. Real microphone via expo-av. No fake waveform.
 *
 * States: idle -> recording (live timer) -> recorded (local, queued) OR synced.
 * Playback works for the local file (offline) and, once synced, via a short-lived
 * signed URL. Attaches through the existing evidence pipeline
 * (evidence_type = 'voice_note') - see offlineRepo.addVoiceNoteOffline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { analyzeObservation } from '@coalguard/ai/observation';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { AppText, AppButton, AppCard, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { transcribeVoiceNote } from '@/lib/ai/transcribe';
import {
  cancelActiveRecording,
  formatDuration,
  recordingStatus,
  startRecording,
  stopRecording,
} from '@/lib/media/audio';
import {
  deleteEvidence,
  listVoiceNotesFor,
  signedUrl,
  type EvidenceRow,
} from '@/features/inspection/evidence';
import {
  addVoiceNoteOffline,
  cancelVoiceNoteOffline,
  type LocalVoiceNote,
} from '@/features/inspection/offlineRepo';

type Parent =
  | { kind: 'observation'; inspectionId: string; observationId: string }
  | { kind: 'incident'; incidentId: string }
  | { kind: 'corrective_action'; correctiveActionId: string };

function parentLookup(parent: Parent) {
  return parent.kind === 'observation'
    ? { observationId: parent.observationId }
    : parent.kind === 'incident'
      ? { incidentId: parent.incidentId }
      : { correctiveActionId: parent.correctiveActionId };
}

export function VoiceNoteRecorder({
  parent,
  resolveParent,
  mineId,
  uploadedBy,
  editable = true,
  onChange,
}: {
  parent: Parent;
  /** Called just before the first save to materialise a lazily-created parent
   *  (e.g. an observation that only exists once evidence/AI is added). */
  resolveParent?: () => Promise<Parent>;
  mineId: string;
  uploadedBy: string;
  editable?: boolean;
  onChange?: (has: boolean) => void;
}) {
  const { t } = useI18n();
  const [synced, setSynced] = useState<EvidenceRow | null>(null);
  const [local, setLocal] = useState<LocalVoiceNote | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [txState, setTxState] = useState<'idle' | 'loading' | 'unavailable' | 'done'>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [txSimulated, setTxSimulated] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ hazard: string; action: string; risk: string } | null>(
    null,
  );

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sound = useRef<Audio.Sound | null>(null);

  const parentId =
    parent.kind === 'observation'
      ? parent.observationId
      : parent.kind === 'incident'
        ? parent.incidentId
        : parent.correctiveActionId;

  // load an already-synced voice note for this parent
  useEffect(() => {
    let alive = true;
    listVoiceNotesFor(parentLookup(parent))
      .then((rows) => {
        if (alive && rows.length > 0) setSynced(rows[rows.length - 1] ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.kind, parentId]);

  useEffect(() => {
    onChange?.(!!synced || !!local);
  }, [synced, local, onChange]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      void sound.current?.unloadAsync();
      void cancelActiveRecording();
    };
  }, []);

  const beginRecording = useCallback(async () => {
    setError(null);
    const res = await startRecording();
    if (!res.ok) {
      setError(
        res.reason === 'permission'
          ? t('voice.micDenied')
          : res.reason === 'busy'
            ? t('voice.busy')
            : t('voice.recordFailed'),
      );
      return;
    }
    setRecording(true);
    setElapsed(0);
    timer.current = setInterval(async () => {
      setElapsed(await recordingStatus());
    }, 300);
  }, [t]);

  const finishRecording = useCallback(async () => {
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    const rec = await stopRecording();
    if (!rec || rec.durationMs < 400) {
      setError(t('voice.tooShort'));
      return;
    }
    try {
      const p = resolveParent ? await resolveParent() : parent;
      const saved = await addVoiceNoteOffline({ recording: rec, mineId, uploadedBy, parent: p });
      setLocal(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('voice.recordFailed'));
    }
  }, [mineId, uploadedBy, parent, resolveParent, t]);

  const togglePlay = useCallback(async () => {
    setError(null);
    // resolve a playable uri
    let uri: string | null = local?.localUri ?? null;
    if (!uri && synced) uri = await signedUrl(synced.storagePath);
    if (!uri) {
      setError(t('voice.playFailed'));
      return;
    }
    try {
      if (sound.current) {
        const st = await sound.current.getStatusAsync();
        if (st.isLoaded && st.isPlaying) {
          await sound.current.pauseAsync();
          setPlaying(false);
          return;
        }
        if (st.isLoaded) {
          await sound.current.replayAsync();
          setPlaying(true);
          return;
        }
      }
      setLoadingPlay(true);
      const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      sound.current = s;
      s.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        setPlaying(status.isPlaying);
        if (status.didJustFinish) setPlaying(false);
      });
      setPlaying(true);
    } catch {
      setError(t('voice.playFailed'));
    } finally {
      setLoadingPlay(false);
    }
  }, [local, synced, t]);

  const runTranscribe = useCallback(async () => {
    if (!synced) return;
    setTxState('loading');
    const r = await transcribeVoiceNote(synced.id);
    if (!r.available || !r.text) {
      setTxState('unavailable');
      return;
    }
    setTranscript(r.text);
    setTxSimulated(r.simulated);
    // AI summary from the transcript - reuse the existing deterministic helper
    const a = analyzeObservation({ title: r.text, description: null, category: null });
    setAiSummary({ hazard: a.consequence, action: a.recommendedAction, risk: a.risk });
    setTxState('done');
  }, [synced]);

  const remove = useCallback(async () => {
    void sound.current?.unloadAsync();
    sound.current = null;
    setPlaying(false);
    if (local) {
      await cancelVoiceNoteOffline(local.id, local.localUri).catch(() => {});
      setLocal(null);
    } else if (synced) {
      await deleteEvidence({ id: synced.id, storagePath: synced.storagePath }).catch(() => {});
      setSynced(null);
    }
  }, [local, synced]);

  const has = !!local || !!synced;
  const durationLabel = local ? formatDuration(local.durationMs) : '';

  /* ------------------------------ render ------------------------------ */

  if (recording) {
    return (
      <AppCard style={styles.card}>
        <View style={styles.row}>
          <View style={styles.recDot} />
          <AppText variant="bodyStrong" color={theme.color.status.critical.text}>
            {t('voice.recording')} {formatDuration(elapsed)}
          </AppText>
        </View>
        <AppButton
          label={t('voice.stop')}
          icon="fail"
          variant="secondary"
          onPress={finishRecording}
        />
      </AppCard>
    );
  }

  if (has) {
    return (
      <AppCard style={styles.card}>
        <View style={styles.row}>
          <Icon name="ai" size="sm" color={theme.color.accent} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('obs.voiceNote')}
            {durationLabel ? ` · ${durationLabel}` : ''}
          </AppText>
          {local ? <StatusBadge label={t('sync.queued')} tone="warning" dot={false} /> : null}
        </View>
        <View style={styles.actions}>
          <AppButton
            label={loadingPlay ? t('state.loading') : playing ? t('voice.pause') : t('voice.play')}
            icon={playing ? 'clock' : 'chevronRight'}
            onPress={togglePlay}
            disabled={loadingPlay}
          />
          {editable ? (
            <>
              <AppButton
                label={t('voice.reRecord')}
                variant="secondary"
                icon="retake"
                onPress={async () => {
                  await remove();
                  await beginRecording();
                }}
              />
              <AppButton
                label={t('action.delete')}
                variant="ghost"
                icon="remove"
                onPress={remove}
              />
            </>
          ) : null}
        </View>

        {synced ? (
          <View style={styles.txBlock}>
            {txState === 'idle' ? (
              <AppButton
                label={t('voice.transcribe')}
                variant="ghost"
                icon="ai"
                onPress={runTranscribe}
              />
            ) : txState === 'loading' ? (
              <AppText variant="caption" tone="secondary">
                {t('voice.transcribing')}
              </AppText>
            ) : txState === 'unavailable' ? (
              <AppText variant="caption" tone="secondary">
                {t('voice.transcriptUnavailable')}
              </AppText>
            ) : (
              <>
                <View style={styles.row}>
                  <AppText variant="label" tone="secondary">
                    {t('voice.transcript')}
                  </AppText>
                  {txSimulated ? (
                    <StatusBadge label={t('voice.simulatedTranscript')} tone="neutral" dot={false} />
                  ) : null}
                </View>
                <AppText variant="body" style={styles.txText}>
                  {transcript}
                </AppText>
                {aiSummary ? (
                  <View style={styles.aiBlock}>
                    <View style={styles.row}>
                      <AppText variant="label" tone="secondary">
                        {t('ai.assisted')}
                      </AppText>
                      <StatusBadge label={t('ai.simulated')} tone="neutral" dot={false} />
                    </View>
                    <AppText variant="caption" tone="secondary" style={styles.txText}>
                      {t('ai.recommended')}: {aiSummary.action}
                    </AppText>
                    <AppText variant="caption" tone="secondary" style={styles.txText}>
                      {t('ai.hazard')}: {aiSummary.hazard}
                    </AppText>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {error ? (
          <AppText variant="caption" color={theme.color.status.critical.text}>
            {error}
          </AppText>
        ) : null}
      </AppCard>
    );
  }

  if (!editable) {
    return (
      <AppText variant="caption" tone="secondary">
        {t('voice.none')}
      </AppText>
    );
  }

  return (
    <View style={styles.wrap}>
      <AppButton
        label={t('voice.record')}
        icon="ai"
        variant="secondary"
        onPress={beginRecording}
      />
      {error ? (
        <AppText variant="caption" color={theme.color.status.critical.text}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[2] },
  flex: { flex: 1 },
  card: { gap: theme.spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.color.status.critical.solid,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  txBlock: {
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
    paddingTop: theme.spacing[2],
  },
  txText: { lineHeight: 18 },
  aiBlock: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
    paddingTop: theme.spacing[2],
  },
});
