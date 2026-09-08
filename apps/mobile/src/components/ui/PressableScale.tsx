import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '@/lib/theme';

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** how far it scales down on press (0.97 = subtle). */
  activeScale?: number;
}

/**
 * A Pressable that gently scales down while pressed. This is the single
 * "button press" micro-interaction used across the app (buttons, cards, tiles).
 * Uses the built-in Animated API - no extra animation library.
 */
export function PressableScale({ children, style, activeScale = 0.97, disabled, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: theme.duration.fast,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => !disabled && to(activeScale)}
      onPressOut={() => to(1)}
      {...rest}
    >
      <Animated.View
        style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : null]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
