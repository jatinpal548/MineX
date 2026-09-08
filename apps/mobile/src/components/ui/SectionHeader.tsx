import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { Icon } from '@/components/Icon';
import { PressableScale } from './PressableScale';

interface Props {
  title: string;
  /** optional right-side text action, e.g. "View all" */
  actionLabel?: string;
  onActionPress?: () => void;
  /** optional small trailing node (e.g. a "Demo data" badge) */
  trailing?: React.ReactNode;
}

export function SectionHeader({ title, actionLabel, onActionPress, trailing }: Props) {
  return (
    <View style={styles.row}>
      <AppText variant="label" tone="secondary">
        {title}
      </AppText>
      <View style={styles.right}>
        {trailing}
        {actionLabel ? (
          <PressableScale
            onPress={onActionPress}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={styles.action}
          >
            <AppText variant="caption" tone="secondary">
              {actionLabel}
            </AppText>
            <Icon name="chevronRight" size="xs" color={theme.color.textSecondary} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[3],
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
