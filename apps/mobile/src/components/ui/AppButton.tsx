import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

// primary = CoalGuard brand dark + white text (the obvious field CTA).
// secondary = white surface + dark text + visible border.
// danger = solid critical red + white text.
const BG: Record<Variant, string> = {
  primary: theme.color.brand,
  secondary: theme.color.surface,
  ghost: 'transparent',
  danger: theme.color.status.critical.solid,
};
const FG: Record<Variant, string> = {
  primary: theme.color.textInverse,
  secondary: theme.color.textPrimary,
  ghost: theme.color.textPrimary,
  danger: theme.color.textInverse,
};
const BORDER: Record<Variant, string> = {
  primary: 'transparent',
  secondary: theme.color.border,
  ghost: theme.color.border,
  danger: 'transparent',
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const height = size === 'lg' ? theme.control.lg : theme.control.md;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          height,
          backgroundColor: BG[variant],
          borderColor: BORDER[variant],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style as ViewStyle,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={FG[variant]} size="small" />
        ) : (
          <>
            {icon ? <Icon name={icon} size="sm" color={FG[variant]} /> : null}
            <AppText variant="bodyStrong" color={FG[variant]}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing[5],
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
});
