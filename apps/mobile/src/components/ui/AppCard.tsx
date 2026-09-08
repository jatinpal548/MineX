import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';
import { PressableScale } from './PressableScale';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  /** styles for the card SURFACE (padding, gap, inner content layout). */
  style?: StyleProp<ViewStyle>;
  /**
   * styles for the OUTER element (width, flex, margin) - i.e. how the card sits
   * inside its parent. Needed when a pressable card is a flex/grid child, so the
   * sizing lands on the real layout node instead of the inner surface.
   */
  containerStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** subtle raised look for primary tiles */
  raised?: boolean;
  /** left accent stripe colour (optional) */
  accent?: string;
  /** fade/rise in on mount */
  animateIn?: boolean;
  accessibilityLabel?: string;
}

/**
 * The card surface used throughout the app: refined 1px border, small radius,
 * restrained elevation. Becomes pressable (with the scale micro-interaction)
 * when `onPress` is provided.
 *
 * Layout: pass `containerStyle` for how the card sits in its parent (width,
 * flex, margin) and `style` for the surface itself (padding, gap, content).
 * When not pressable the two are equivalent.
 */
export function AppCard({
  children,
  onPress,
  style,
  containerStyle,
  padded = true,
  raised = false,
  accent,
  animateIn = false,
  accessibilityLabel,
}: Props) {
  const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animateIn ? 6 : 0)).current;

  useEffect(() => {
    if (!animateIn) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: theme.duration.base,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: theme.duration.base,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animateIn, opacity, translateY]);

  const surface = (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: raised ? theme.color.surfaceRaised : theme.color.surface },
        raised ? theme.shadow.sm : null,
        padded ? styles.padded : null,
        // pressable: fill the sized wrapper. non-pressable: apply outer layout here.
        onPress ? styles.fill : containerStyle,
        style,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={containerStyle}
      >
        {surface}
      </PressableScale>
    );
  }
  return surface;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
  },
  fill: { width: '100%', alignSelf: 'stretch' },
  padded: { padding: theme.spacing[4] },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});
