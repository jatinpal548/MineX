import { ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useSync, type SyncGlobalState } from '@/features/inspection/SyncProvider';

const MAP: Record<
  Exclude<SyncGlobalState, 'idle'>,
  { label: (n: number) => string; icon: IconName; tone: 'safe' | 'warning' | 'critical' | 'info' }
> = {
  syncing: { label: () => 'SYNCING', icon: 'sync', tone: 'info' },
  queued: { label: (n) => `${n} QUEUED`, icon: 'sync', tone: 'warning' },
  offline: { label: (n) => `OFFLINE - ${n} PENDING`, icon: 'offline', tone: 'warning' },
  failed: { label: () => 'SYNC FAILED', icon: 'warning', tone: 'critical' },
};

/** Compact, tappable sync status. Renders nothing when everything is synced. */
export function SyncBadge({ compact = true }: { compact?: boolean }) {
  const { state, summary, authExpired, syncNow, retryFailed } = useSync();
  if (state === 'idle') return null;

  const m = MAP[state];
  const c = theme.color.status[m.tone];
  const text = authExpired ? 'SIGN IN TO SYNC' : m.label(summary.total);
  const onPress = state === 'failed' ? retryFailed : syncNow;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${text}. Tap to ${state === 'failed' ? 'retry' : 'sync now'}.`}
      style={[styles.chip, { backgroundColor: c.tint }, compact ? null : styles.full]}
    >
      {state === 'syncing' ? (
        <ActivityIndicator size="small" color={c.text} />
      ) : (
        <Icon name={m.icon} size="xs" color={c.text} />
      )}
      <AppText variant="caption" color={c.text} style={styles.text}>
        {text}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  full: { alignSelf: 'flex-start' },
  text: { fontWeight: '700', letterSpacing: 0.4 },
});
