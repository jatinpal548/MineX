import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/ui/AppText';

interface Props {
  /** height of the glyph in px */
  size?: number;
  layout?: 'stacked' | 'inline';
  tone?: 'light' | 'muted';
  style?: ViewStyle;
  showProduct?: boolean;
}

/** MineX brand blue (matches the design-system info token). */
const BRAND_BLUE = theme.color.status.info.solid;

/**
 * MineX brand lockup: the dark "Mine" wordmark with a blue "X".
 *
 * `BrandGlyph` renders the standalone "X" mark (two blue strokes) and is kept
 * exported for callers that want the mark without the wordmark.
 */
export function BrandGlyph({ size = 40, color }: { size?: number; color?: string }) {
  const s = size / 44;
  const stroke = color ?? BRAND_BLUE;
  return (
    <Svg width={28 * s} height={28 * s} viewBox="0 0 28 28" fill="none">
      <Line x1="5" y1="5" x2="23" y2="23" stroke={stroke} strokeWidth={4} strokeLinecap="round" />
      <Line x1="23" y1="5" x2="5" y2="23" stroke={stroke} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function Wordmark({
  size = 40,
  layout = 'stacked',
  tone = 'light',
  style,
  showProduct = true,
}: Props) {
  const brandColor = tone === 'muted' ? theme.color.textSecondary : theme.color.brand;
  const nameSize = Math.round(size * 0.5);

  return (
    <View
      style={[layout === 'stacked' ? styles.stacked : styles.inline, style]}
      accessibilityRole="header"
      accessibilityLabel="MineX Field"
    >
      <View style={layout === 'stacked' ? styles.textStacked : styles.textInline}>
        <AppText
          style={[styles.name, { fontSize: nameSize }]}
          numberOfLines={1}
          accessibilityLabel="MineX"
        >
          <AppText color={brandColor}>Mine</AppText>
          <AppText color={BRAND_BLUE}>X</AppText>
        </AppText>
        {showProduct ? (
          <View style={styles.productRow}>
            <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
            <AppText color={theme.color.textSecondary} style={styles.product}>
              FIELD
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stacked: { alignItems: 'center', gap: theme.spacing[2] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  textStacked: { alignItems: 'center', gap: theme.spacing[1] },
  textInline: { alignItems: 'flex-start', gap: 2 },
  name: { fontWeight: '700', letterSpacing: 0.5 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  rule: { width: 18, height: 1 },
  product: { fontSize: 11, fontWeight: '600', letterSpacing: 6 },
});
