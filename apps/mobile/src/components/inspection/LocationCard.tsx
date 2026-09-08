/**
 * Field location card. Shows the TRUE GPS state - never fabricates coordinates.
 *
 * The parent owns the `LocationResult` (it needs the coords for the observation
 * write) and passes a `onCapture` that runs `captureLocation()`.
 */
import { Linking, StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { AppText, AppButton, AppCard, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { openSystemSettings } from '@/lib/media/permissions';
import type { LocationResult } from '@/lib/media/types';

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LocationCard({
  location,
  capturing,
  onCapture,
}: {
  location: LocationResult | null;
  capturing: boolean;
  onCapture: () => void;
}) {
  const { t } = useI18n();
  const status = location?.status ?? 'idle';
  const hasCoords =
    status === 'captured' &&
    typeof location?.latitude === 'number' &&
    typeof location?.longitude === 'number';

  const openMap = () => {
    if (!hasCoords) return;
    const { latitude, longitude } = location!;
    // OpenStreetMap - no API key, opens in the browser or a maps app
    const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <AppCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Icon
            name={hasCoords ? 'location' : status === 'idle' ? 'location' : 'locationOff'}
            size="sm"
            color={hasCoords ? theme.color.status.safe.text : theme.color.textSecondary}
          />
          <AppText variant="bodyStrong">
            {hasCoords
              ? t('loc.captured')
              : capturing
                ? t('loc.capturing')
                : status === 'denied' || status === 'blocked'
                  ? t('loc.denied')
                  : status === 'timeout'
                    ? t('loc.timeout')
                    : status === 'unavailable'
                      ? t('loc.unavailable')
                      : t('loc.notCaptured')}
          </AppText>
        </View>
        {hasCoords ? <StatusBadge label="GPS" tone="safe" dot={false} /> : null}
      </View>

      {hasCoords ? (
        <View style={styles.detail}>
          <AppText variant="body" style={styles.coords} selectable>
            {location!.latitude!.toFixed(6)}, {location!.longitude!.toFixed(6)}
          </AppText>
          {typeof location?.accuracy === 'number' ? (
            <AppText variant="caption" tone="secondary">
              {t('loc.accuracy', { m: Math.round(location.accuracy) })}
            </AppText>
          ) : null}
          {location?.capturedAt ? (
            <AppText variant="caption" tone="secondary">
              {t('loc.capturedAt', { time: fmtTime(location.capturedAt) })}
            </AppText>
          ) : null}
        </View>
      ) : status === 'denied' || status === 'blocked' ? (
        <AppText variant="caption" tone="secondary">
          {status === 'blocked' ? t('loc.blockedHint') : t('loc.deniedHint')}
        </AppText>
      ) : status === 'timeout' ? (
        <AppText variant="caption" tone="secondary">
          {t('loc.timeoutHint')}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        {status === 'blocked' ? (
          <AppButton
            label={t('action.enableLocation')}
            variant="secondary"
            icon="location"
            onPress={openSystemSettings}
            disabled={capturing}
          />
        ) : (
          <AppButton
            label={
              capturing
                ? t('loc.capturing')
                : hasCoords || status === 'timeout' || status === 'unavailable'
                  ? t('action.retryGps')
                  : t('action.captureGps')
            }
            variant={hasCoords ? 'ghost' : 'secondary'}
            icon={hasCoords ? 'sync' : 'location'}
            onPress={onCapture}
            disabled={capturing}
          />
        )}
        {hasCoords ? (
          <AppButton
            label={t('action.viewOnMap')}
            variant="ghost"
            icon="mine"
            onPress={openMap}
          />
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], flex: 1 },
  detail: { gap: theme.spacing[1] },
  coords: { letterSpacing: 0.3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
});
