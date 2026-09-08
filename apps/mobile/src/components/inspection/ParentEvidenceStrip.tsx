/**
 * Compact evidence strip for an INCIDENT or CORRECTIVE ACTION parent.
 *
 * Deliberately separate from `EvidenceCapture` (which is observation-coupled and
 * part of the inspection flow) so that flow is never at risk. Same underlying
 * pipeline: `pickFromLibrary` / `CameraCaptureModal` -> `addParentEvidenceOffline`
 * -> sync queue -> `uploadPreparedEvidence`. Full-screen `PhotoViewer` on tap.
 * SIMULATED FIELD EVIDENCE / Queued labels preserved.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { AppText, AppButton } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { pickFromLibrary } from '@/lib/media/pick';
import { captureLocation } from '@/lib/location/capture';
import type { LocationResult } from '@/lib/media/types';
import { listEvidenceFor, signedUrl, type EvidenceRow } from '@/features/inspection/evidence';
import { addParentEvidenceOffline, cancelEvidenceOffline, type LocalEvidence } from '@/features/inspection/offlineRepo';
import { CameraCaptureModal } from './CameraCaptureModal';
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer';

type Parent =
  | { kind: 'incident'; incidentId: string }
  | { kind: 'corrective_action'; correctiveActionId: string }
  | { kind: 'observation'; observationId: string; groupId?: string };

export function ParentEvidenceStrip({
  parent,
  mineId,
  uploadedBy,
  editable = true,
  captions = false,
  location,
  ensureParent,
}: {
  parent: Parent;
  mineId: string;
  uploadedBy: string;
  editable?: boolean;
  /** show each stored photo's caption beneath its thumbnail (read-only history) */
  captions?: boolean;
  location?: LocationResult | null;
  /** persist + queue the parent (incident) row before the first photo, so the
   *  evidence FK / dependency exists. No-op for parents that already exist. */
  ensureParent?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [server, setServer] = useState<EvidenceRow[]>([]);
  const [locals, setLocals] = useState<LocalEvidence[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'pick' | 'cam'>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const parentId =
    parent.kind === 'incident'
      ? parent.incidentId
      : parent.kind === 'corrective_action'
        ? parent.correctiveActionId
        : parent.observationId;

  useEffect(() => {
    let alive = true;
    listEvidenceFor(
      parent.kind === 'incident'
        ? { incidentId: parent.incidentId }
        : parent.kind === 'corrective_action'
          ? { correctiveActionId: parent.correctiveActionId }
          : { observationId: parent.observationId },
    )
      .then((rows) => {
        if (!alive) return;
        setServer(rows);
        setLocals((prev) => prev.filter((l) => !rows.some((r) => r.id === l.id)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // parentId already encodes both incidentId and correctiveActionId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.kind, parentId]);

  useEffect(() => {
    let alive = true;
    for (const r of server) {
      if (urls[r.id]) continue;
      signedUrl(r.storagePath)
        .then((u) => alive && u && setUrls((p) => ({ ...p, [r.id]: u })))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [server, urls]);

  const photos: ViewerPhoto[] = useMemo(() => {
    const s = server
      .filter((r) => urls[r.id])
      .map((r) => ({ key: r.id, uri: urls[r.id]!, label: r.isSimulated ? t('evi.simulated') : null }));
    const l = locals.map((x) => ({
      key: x.id,
      uri: x.localUri,
      label: x.isSimulated ? `${t('evi.simulated')} · ${t('evi.queued')}` : t('evi.queued'),
    }));
    return [...s, ...l];
  }, [server, locals, urls, t]);

  const attach = useCallback(
    async (img: Parameters<typeof addParentEvidenceOffline>[0]['image']) => {
      setError(null);
      try {
        if (ensureParent) await ensureParent();
        let loc = location ?? null;
        if (!loc || loc.status !== 'captured') {
          loc = await captureLocation().catch(() => null);
        }
        const rec = await addParentEvidenceOffline({
          image: img,
          mineId,
          uploadedBy,
          parent,
          location:
            loc && loc.status === 'captured'
              ? { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy ?? null }
              : null,
        });
        setLocals((p) => [...p, rec]);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('evi.uploadFailed'));
      }
    },
    [mineId, uploadedBy, parent, location, ensureParent, t],
  );

  const pick = useCallback(
    async (simulated: boolean) => {
      setBusy('pick');
      const outcome = await pickFromLibrary(simulated);
      setBusy(null);
      if (outcome.image) void attach(outcome.image);
      else if (outcome.error === 'permission-blocked') setError(t('evi.noPhoto'));
      else if (outcome.error === 'failed') setError(t('evi.cameraUnavailable'));
    },
    [attach, t],
  );

  const removeLocal = useCallback(async (rec: LocalEvidence) => {
    await cancelEvidenceOffline(rec.id, rec.localUri).catch(() => {});
    setLocals((p) => p.filter((l) => l.id !== rec.id));
  }, []);

  return (
    <View style={styles.wrap}>
      {photos.length > 0 ? (
        <View style={styles.grid}>
          {server
            .filter((r) => photos.some((p) => p.key === r.id))
            .map((r) => {
              const idx = photos.findIndex((p) => p.key === r.id);
              const thumb = (
                <PressableScale
                  key={r.id}
                  onPress={() => setViewerIndex(idx)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Open photo"
                  style={styles.thumbWrap}
                >
                  <Image source={{ uri: urls[r.id]! }} style={styles.thumb} />
                  {r.isSimulated ? <Sim label="SIMULATED" /> : null}
                </PressableScale>
              );
              if (!captions) return thumb;
              return (
                <View key={r.id} style={styles.cell}>
                  {thumb}
                  {r.isSimulated ? (
                    <AppText variant="caption" color={theme.color.status.warning.text} style={styles.cellSim}>
                      {t('evi.simulated')}
                    </AppText>
                  ) : null}
                  {r.caption ? (
                    <AppText variant="caption" tone="secondary" numberOfLines={3}>
                      {r.caption}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          {locals.map((l) => {
            const idx = photos.findIndex((p) => p.key === l.id);
            return (
              <PressableScale
                key={l.id}
                onPress={() => setViewerIndex(idx)}
                accessibilityRole="imagebutton"
                accessibilityLabel="Open photo"
                style={styles.thumbWrap}
              >
                <Image source={{ uri: l.localUri }} style={styles.thumb} />
                <Sim label={l.isSimulated ? 'SIMULATED · QUEUED' : 'QUEUED'} tone="info" />
                {editable ? (
                  <PressableScale
                    onPress={() => removeLocal(l)}
                    accessibilityRole="button"
                    accessibilityLabel={t('evi.remove')}
                    style={styles.remove}
                  >
                    <Icon name="close" size="xs" color="#ffffff" />
                  </PressableScale>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      ) : editable ? null : (
        <AppText variant="caption" tone="secondary">
          {t('evi.none')}
        </AppText>
      )}

      {editable ? (
        <>
          <View style={styles.actions}>
            <View style={styles.actionBtn}>
              <AppButton
                label={t('action.camera')}
                icon="camera"
                fullWidth
                onPress={() => setCameraOpen(true)}
                disabled={busy !== null}
              />
            </View>
            <View style={styles.actionBtn}>
              <AppButton
                label={t('action.gallery')}
                variant="secondary"
                icon="image"
                fullWidth
                onPress={() => pick(false)}
                disabled={busy !== null}
              />
            </View>
          </View>
          <AppButton
            label="Add simulated image (demo)"
            variant="ghost"
            icon="ai"
            onPress={() => pick(true)}
            disabled={busy !== null}
            style={styles.simBtn}
          />
        </>
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
          void attach(img);
        }}
      />
      {viewerIndex !== null ? (
        <PhotoViewer photos={photos} initialIndex={viewerIndex} visible onClose={() => setViewerIndex(null)} />
      ) : null}
    </View>
  );
}

function Sim({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'info' }) {
  return (
    <View
      style={[
        styles.simTag,
        { backgroundColor: theme.color.status[tone].text },
      ]}
    >
      <AppText variant="caption" color="#ffffff" style={styles.simTagText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[3] },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  cell: { width: 150, gap: theme.spacing[1] },
  cellSim: { fontWeight: '700', letterSpacing: 0.3 },
  thumbWrap: { width: 96, height: 96, borderRadius: theme.radius.md, overflow: 'hidden' },
  thumb: { width: 96, height: 96, backgroundColor: theme.color.surfaceRaised },
  remove: {
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
  simTag: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 3, alignItems: 'center' },
  simTagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
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
