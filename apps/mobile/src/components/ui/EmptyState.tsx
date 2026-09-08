import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Icon, type IconName } from '@/components/Icon';

interface Props {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'inspection', title, message, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size="xl" color={theme.color.textSecondary} strokeWidth={1.5} />
      </View>
      <AppText variant="subheading" center>
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" tone="secondary" center style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} icon="inspection" style={styles.action} />
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1],
  },
  message: { maxWidth: 300 },
  action: { alignSelf: 'center', marginTop: theme.spacing[2] },
});
