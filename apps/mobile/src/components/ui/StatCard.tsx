import { StyleSheet, View } from 'react-native';
import { theme, type StatusTone } from '@/lib/theme';
import { AppText } from './AppText';
import { AppCard } from './AppCard';
import { Icon, type IconName } from '@/components/Icon';

interface Props {
  value: number | string;
  label: string;
  icon: IconName;
  tone?: StatusTone;
}

/** Compact KPI tile used in "Today's Activity". Three fit across a ~360dp phone. */
export function StatCard({ value, label, icon, tone = 'neutral' }: Props) {
  const c = theme.color.status[tone];
  return (
    <AppCard style={styles.card} padded={false} animateIn>
      <View style={[styles.iconWrap, { backgroundColor: c.tint }]}>
        <Icon name={icon} size="sm" color={c.text} />
      </View>
      <AppText variant="kpi" style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {typeof value === 'number' ? value.toString().padStart(2, '0') : value}
      </AppText>
      <AppText
        variant="caption"
        tone="secondary"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 108,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1],
  },
  value: { marginTop: theme.spacing[1] },
});
