import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { AppText, AppButton, AppCard, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatClock } from '@/lib/datetime';
import { SIMULATED_EVIDENCE_LABEL } from '@coalguard/config';
import { pickFromLibrary } from '@/lib/media/pick';
import { captureLocation, formatCoords } from '@/lib/location/capture';
import type { LocationResult, PendingImage } from '@/lib/media/types';
import {
  deleteEvidence,
  listEvidence,
  signedUrl,
  type EvidenceRow,
} from '@/features/inspection/evidence';
import {
  addEvidenceOffline,
  cancelEvidenceOffline,
  type LocalEvidence,
} from '@/features/inspection/offlineRepo';
import { CameraCaptureModal } from './CameraCaptureModal';
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer';

interface Props {
  inspectionId: string;
  mineId: string;
  uploadedBy: string;
  /** existing observation id, or null if it hasn't been created yet */
  observationId: string | null;
  /** creates the observation on demand and returns its id */
  ensureObservation: () => Promise<string>;
  onCountChange?: (count: number) => void;
}

const LOCATION_MESSAGE: Record<LocationResult['status'], string> = {
  captured: 'Location captured',
  denied: 'Location permission denied',
  blocked: 'Location blocked - enable it in Settings',
  unavailable: 'Location unavailable',
  timeout: 'Location timed out',
  idle: 'Location not captured',
};

export function EvidenceCapture({
  inspectionId,
  mineId,
  uploadedBy,
  observationId,
  ensureObservation,
  onCountChange,
}: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<EvidenceRow[]>([]);
  const [locals, setLocals] = useState<LocalEvidence[]>([]);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [location, setLocation] = useState<LocationResult>({ status: 'idle' });
  const [busy, setBusy] = useState<null | 'pick' | 'upload' | 'gps'>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // resolve signed URLs for server-side evidence once, share with thumbs + viewer
  useEffect(() => {
    let cancelled = false;
    for (const row of items) {
      if (urls[row.id]) continue;
      signedUrl(row.storagePath)
        .then((u) => {
          if (!cancelled && u) setUrls((prev) => ({ ...prev, [row.id]: u }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [items, urls]);

  const viewerPhotos: ViewerPhoto[] = useMemo(() => {
    const fromServer: ViewerPhoto[] = items
      .filter((r) => urls[r.id])
      .map((r) => ({
        key: r.id,
        uri: urls[r.id]!,
        label: r.isSimulated ? t('evi.simulated') : null,
      }));
    const fromLocal: ViewerPhoto[] = locals.map((l) => ({
      key: l.id,
      uri: l.localUri,
      label: l.isSimulated ? `${t('evi.simulated')} · ${t('evi.queued')}` : t('evi.queued'),
    }));
    return [...fromServer, ...fromLocal];
  }, [items, locals, urls, t]);

  // load already-attached evidence
  useEffect(() => {
    if (!observationId) return;
    let cancelled = false;
    listEvidence(observationId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          // server rows that synced replace their local placeholders
          setLocals((prev) => {
            const serverIds = new Set(rows.map((r) => r.id));
            const remaining = prev.filter((l) => !serverIds.has(l.id));
            onCountChange?.(rows.length + remaining.length);
            return remaining;
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [observationId, onCountChange]);

  // when a photo is picked/taken, start fetching GPS in the background
  const receiveImage = useCallback((img: PendingImage) => {
    setError(null);
    setPending(img);
    setLocation({ status: 'idle' });
    setBusy('gps');
    captureLocation()
      .then(setLocation)
      .finally(() => setBusy(null));
  }, []);

  const pick = useCallback(
    async (simulated: boolean) => {
      setBusy('pick');
      setError(null);
      const outcome = await pickFromLibrary(simulated);
      setBusy(null);
      if (outcome.image) receiveImage(outcome.image);
      else if (outcome.error === 'permission-blocked')
        setError('Photo access is blocked. Enable it in Settings to upload evidence.');
      else if (outcome.error === 'failed') setError('Could not open the photo library.');
    },
    [receiveImage],
  );

  const attach = useCallback(async () => {
    if (!pending) return;
    setBusy('upload');
    setError(null);
    try {
      const obsId = await ensureObservation();
      const rec = await addEvidenceOffline({
        image: pending,
        mineId,
        inspectionId,
        observationId: obsId,
        uploadedBy,
        location:
          location.status === 'captured'
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy ?? null,
              }
            : null,
      });
      const nextLocals = [...locals, rec];
      setLocals(nextLocals);
      onCountChange?.(items.length + nextLocals.length);
      setPending(null);
      setLocation({ status: 'idle' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the evidence.');
    } finally {
      setBusy(null);
    }
  }, [
    pending,
    ensureObservation,
    mineId,
    inspectionId,
    uploadedBy,
    location,
    items,
    locals,
    onCountChange,
  ]);

  const removeLocal = useCallback(
    async (rec: LocalEvidence) => {
      await cancelEvidenceOffline(rec.id, rec.localUri).catch(() => {});
      const next = locals.filter((l) => l.id !== rec.id);
      setLocals(next);
      onCountChange?.(items.length + next.length);
    },
    [locals, items, onCountChange],
  );

  const remove = useCallback(
    async (row: EvidenceRow) => {
      try {
        await deleteEvidence({ id: row.id, storagePath: row.storagePath });
        const next = items.filter((i) => i.id !== row.id);
        setItems(next);
        onCountChange?.(next.length);
      } catch {
        setError('Could not remove the evidence.');
      }
    },
    [items, onCountChange],
  );

  const retryGps = useCallback(() => {
    setBusy('gps');
    captureLocation()
      .then(setLocation)
      .finally(() => setBusy(null));
  }, []);

  return (
    <View style={styles.wrap}>
      {/* attached evidence */}
      {items.length > 0 || locals.length > 0 ? (
        <>
          <AppText variant="label" tone="secondary">
            {t('evi.count', { n: items.length + locals.length })}
          </AppText>
          <View style={styles.grid}>
            {items.map((row) => {
              const idx = viewerPhotos.findIndex((p) => p.key === row.id);
              return (
                <AttachedThumb
                  key={row.id}
                  row={row}
                  url={urls[row.id] ?? null}
                  onRemove={() => remove(row)}
                  onOpen={idx >= 0 ? () => setViewerIndex(idx) : undefined}
                />
              );
            })}
            {locals.map((rec) => {
              const idx = viewerPhotos.findIndex((p) => p.key === rec.id);
              return (
                <LocalThumb
                  key={rec.id}
                  rec={rec}
                  onRemove={() => removeLocal(rec)}
                  onOpen={idx >= 0 ? () => setViewerIndex(idx) : undefined}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {/* pending (picked, not yet attached) */}
      {pending ? (
        <AppCard style={styles.pendingCard}>
          <View style={styles.pendingRow}>
            <Image source={{ uri: pending.uri }} style={styles.pendingThumb} />
            <View style={styles.pendingMeta}>
              {pending.simulated ? (
                <StatusBadge label={SIMULATED_EVIDENCE_LABEL} tone="warning" dot={false} />
              ) : (
                <AppText variant="caption" tone="secondary">
                  {pending.source === 'camera' ? 'Camera photo' : 'From library'}
                </AppText>
              )}
              <AppText variant="caption" tone="secondary">
                Taken {formatClock(new Date(pending.capturedAt))}
              </AppText>
              <View style={styles.locRow}>
                <Icon
                  name={location.status === 'captured' ? 'location' : 'locationOff'}
                  size="xs"
                  color={
                    location.status === 'captured'
                      ? theme.color.status.safe.text
                      : theme.color.textSecondary
                  }
                />
                <AppText
                  variant="caption"
                  color={
                    location.status === 'captured'
                      ? theme.color.status.safe.text
                      : theme.color.textSecondary
                  }
                >
                  {busy === 'gps'
                    ? 'Getting location...'
                    : location.status === 'captured'
                      ? formatCoords(location.latitude, location.longitude)
                      : LOCATION_MESSAGE[location.status]}
                </AppText>
              </View>
            </View>
          </View>

          {location.status !== 'captured' && busy !== 'gps' ? (
            <AppButton
              label="Retry location"
              variant="ghost"
              icon="location"
              onPress={retryGps}
              style={styles.retryLoc}
            />
          ) : null}

          <View style={styles.pendingActions}>
            <View style={styles.pendingBtn}>
              <AppButton
                label="Remove"
                variant="secondary"
                icon="remove"
                fullWidth
                onPress={() => {
                  setPending(null);
                  setLocation({ status: 'idle' });
                }}
                disabled={busy === 'upload'}
              />
            </View>
            <View style={styles.pendingBtn}>
              <AppButton
                label={busy === 'upload' ? 'Uploading...' : 'Attach evidence'}
                icon="completed"
                fullWidth
                onPress={attach}
                disabled={busy === 'upload'}
              />
            </View>
          </View>
        </AppCard>
      ) : null}

      {/* capture actions */}
      {!pending ? (
        <View style={styles.actions}>
          <View style={styles.actionBtn}>
            <AppButton
              label="Capture Photo"
              icon="camera"
              fullWidth
              onPress={() => setCameraOpen(true)}
              disabled={busy !== null}
            />
          </View>
          <View style={styles.actionBtn}>
            <AppButton
              label="Upload Evidence"
              variant="secondary"
              icon="image"
              fullWidth
              onPress={() => pick(false)}
              disabled={busy !== null}
            />
          </View>
        </View>
      ) : null}
      {!pending ? (
        <AppButton
          label="Add simulated image (demo)"
          variant="ghost"
          icon="ai"
          onPress={() => pick(true)}
          disabled={busy !== null}
          style={styles.simBtn}
        />
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="critical" size="xs" color={theme.color.status.critical.text} />
          <AppText variant="caption" color={theme.color.status.critical.text} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      <CameraCaptureModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(img) => {
          setCameraOpen(false);
          receiveImage(img);
        }}
      />

      {viewerIndex !== null ? (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          visible
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}

function ThumbFrame({
  onOpen,
  onRemove,
  children,
}: {
  onOpen?: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'imagebutton' : undefined}
      accessibilityLabel="Open photo"
      style={styles.thumbWrap}
    >
      {children}
      <PressableScale
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove evidence"
        style={styles.thumbRemove}
      >
        <Icon name="close" size="xs" color="#ffffff" />
      </PressableScale>
    </PressableScale>
  );
}

function LocalThumb({
  rec,
  onRemove,
  onOpen,
}: {
  rec: LocalEvidence;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  return (
    <ThumbFrame onOpen={onOpen} onRemove={onRemove}>
      <Image source={{ uri: rec.localUri }} style={styles.thumb} />
      <View style={[styles.simTag, styles.queuedTag]}>
        <AppText variant="caption" color="#ffffff" style={styles.simTagText}>
          {rec.isSimulated ? 'SIMULATED · QUEUED' : 'QUEUED'}
        </AppText>
      </View>
    </ThumbFrame>
  );
}

function AttachedThumb({
  row,
  url,
  onRemove,
  onOpen,
}: {
  row: EvidenceRow;
  url: string | null;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  return (
    <ThumbFrame onOpen={onOpen} onRemove={onRemove}>
      {url ? (
        <Image source={{ uri: url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbLoading]}>
          <ActivityIndicator color={theme.color.textSecondary} size="small" />
        </View>
      )}
      {row.isSimulated ? (
        <View style={styles.simTag}>
          <AppText variant="caption" color="#ffffff" style={styles.simTagText}>
            SIMULATED
          </AppText>
        </View>
      ) : null}
    </ThumbFrame>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[3] },
  flex: { flex: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  thumbWrap: { width: 96, height: 96, borderRadius: theme.radius.md, overflow: 'hidden' },
  thumb: { width: 96, height: 96, backgroundColor: theme.color.surfaceRaised },
  thumbLoading: { alignItems: 'center', justifyContent: 'center' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.status.warning.text,
    paddingVertical: 3,
    alignItems: 'center',
  },
  simTagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  queuedTag: { backgroundColor: theme.color.status.info.text },

  pendingCard: { gap: theme.spacing[3] },
  pendingRow: { flexDirection: 'row', gap: theme.spacing[3] },
  pendingThumb: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceRaised,
  },
  pendingMeta: { flex: 1, gap: theme.spacing[1], justifyContent: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  retryLoc: { alignSelf: 'flex-start' },
  pendingActions: { flexDirection: 'row', gap: theme.spacing[3] },
  pendingBtn: { flex: 1 },

  actions: { flexDirection: 'row', gap: theme.spacing[3] },
  actionBtn: { flex: 1 },
  simBtn: { alignSelf: 'flex-start' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    backgroundColor: theme.color.status.critical.tint,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
  },
});
