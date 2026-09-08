import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}

/** Simple, consistent screen header used on secondary screens. */
export function AppHeader({ title, subtitle, showBack = false, onBack, right }: Props) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack ? (
          <IconButton
            icon="back"
            accessibilityLabel="Go back"
            onPress={onBack ?? (() => router.back())}
          />
        ) : null}
        <View style={styles.titles}>
          <AppText variant="heading">{title}</AppText>
          {subtitle ? (
            <AppText variant="caption" tone="secondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: theme.spacing[5],
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], flexShrink: 1 },
  titles: { flexShrink: 1, gap: 2 },
});
