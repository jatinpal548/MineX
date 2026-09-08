import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Icon } from '@/components/Icon';

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * Human-readable error surface. It never shows technical details or stack
 * traces - just a clear message and a recovery action.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Please check your connection and try again.',
  onRetry,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name="warning" size="xl" color={theme.color.status.warning.text} strokeWidth={1.5} />
      </View>
      <AppText variant="subheading" center>
        {title}
      </AppText>
      <AppText variant="body" tone="secondary" center style={styles.message}>
        {message}
      </AppText>
      {onRetry ? (
        <AppButton
          label="Try Again"
          onPress={onRetry}
          variant="secondary"
          icon="sync"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[12],
    gap: theme.spacing[3],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.status.warning.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1],
  },
  message: { maxWidth: 300 },
  action: { alignSelf: 'center', marginTop: theme.spacing[2] },
});
