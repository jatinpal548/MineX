import { StyleSheet, View } from 'react-native';
import { theme, type StatusTone } from '@/lib/theme';
import { AppText } from './AppText';

interface Props {
  label: string;
  tone?: StatusTone;
  /** show the leading status dot */
  dot?: boolean;
}

/** Small pill communicating a status. Colour always carries meaning. */
export function StatusBadge({ label, tone = 'neutral', dot = true }: Props) {
  const c = theme.color.status[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.tint }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: c.solid }]} /> : null}
      <AppText variant="caption" color={c.text} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontWeight: '600', letterSpacing: 0.3 },
});
