import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { Icon } from '@/components/Icon';
import { useConnectivity } from '@/lib/connectivity';

interface Props {
  /** compact = header chip; full = banner with the sync note. */
  variant?: 'compact' | 'full';
}

/**
 * Truthful connectivity indicator. It NEVER claims a sync happened - offline
 * simply explains that changes will sync later (that engine is a later milestone).
 */
export function ConnectivityBadge({ variant = 'compact' }: Props) {
  const { online } = useConnectivity();
  const tone = online ? theme.color.status.safe : theme.color.status.warning;
  const label = online ? 'Online' : 'Offline';

  if (variant === 'full') {
    return (
      <View style={[styles.banner, { backgroundColor: tone.tint, borderColor: tone.solid }]}>
        <View style={styles.bannerRow}>
          {online ? (
            <View style={[styles.dot, { backgroundColor: tone.solid }]} />
          ) : (
            <Icon name="offline" size="sm" color={tone.text} />
          )}
          <AppText variant="label" color={tone.text}>
            {label}
          </AppText>
        </View>
        {!online ? (
          <AppText variant="caption" tone="secondary" style={styles.note}>
            Changes will sync when connection is restored.
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.chip, { backgroundColor: tone.tint }]}>
      {online ? (
        <View style={[styles.dot, { backgroundColor: tone.solid }]} />
      ) : (
        <Icon name="offline" size="xs" color={tone.text} />
      )}
      <AppText variant="caption" color={tone.text} style={styles.chipText}>
        {label.toUpperCase()}
      </AppText>
    </View>
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
  chipText: { fontWeight: '700', letterSpacing: 0.5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  banner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  note: { marginLeft: theme.spacing[1] },
});
