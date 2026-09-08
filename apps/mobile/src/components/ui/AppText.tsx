import { Text, type TextProps, type TextStyle } from 'react-native';
import { theme } from '@/lib/theme';

type Variant = keyof typeof theme.type;
type Tone = 'primary' | 'secondary' | 'inverse' | 'brand' | 'accent';

const TONE: Record<Tone, string> = {
  primary: theme.color.textPrimary,
  secondary: theme.color.textSecondary,
  inverse: theme.color.textInverse,
  brand: theme.color.brand,
  accent: theme.color.accent,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  color?: string;
  center?: boolean;
}

/**
 * The only text primitive in the app. Enforces the typographic scale from
 * `theme.type` so headings/body/labels stay consistent everywhere.
 */
export function AppText({
  variant = 'body',
  tone = 'primary',
  color,
  center,
  style,
  ...rest
}: AppTextProps) {
  const base: TextStyle = {
    ...theme.type[variant],
    color: color ?? TONE[tone],
    ...(center ? { textAlign: 'center' } : null),
  };
  return <Text style={[base, style]} {...rest} />;
}
