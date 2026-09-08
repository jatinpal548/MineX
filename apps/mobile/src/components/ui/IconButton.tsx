import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from './PressableScale';

interface Props {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  color?: string;
  variant?: 'plain' | 'bordered';
  disabled?: boolean;
}

/** Square, icon-only control with a full 44pt touch target. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = theme.color.textPrimary,
  variant = 'plain',
  disabled = false,
}: Props) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        variant === 'bordered'
          ? {
              borderWidth: 1,
              borderColor: theme.color.border,
              backgroundColor: theme.color.surface,
            }
          : null,
      ]}
    >
      <View style={styles.center}>
        <Icon name={icon} size="md" color={color} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { width: 44, height: 44, borderRadius: theme.radius.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
