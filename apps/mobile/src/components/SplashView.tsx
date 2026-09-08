import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { Wordmark } from '@/components/brand/Wordmark';
import { AppText } from '@/components/ui/AppText';

const TAGLINE = 'Field-to-boardroom compliance intelligence.';

/**
 * Branded launch screen. Logo settles in, tagline fades up, then `onFinish`
 * fires. Kept short (~1.1s) so startup stays fast.
 */
export function SplashView({ onFinish }: { onFinish: () => void }) {
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.94)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 360, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(taglineY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(420),
    ]).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [markOpacity, markScale, taglineOpacity, taglineY, onFinish]);

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
        <Wordmark size={52} />
      </Animated.View>
      <Animated.View style={{ opacity: taglineOpacity, transform: [{ translateY: taglineY }] }}>
        <AppText variant="caption" tone="secondary" center style={styles.tagline}>
          {TAGLINE}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.background,
    gap: theme.spacing[5],
  },
  tagline: { maxWidth: 260 },
});
