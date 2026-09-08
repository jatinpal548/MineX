import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { theme } from '@/lib/theme';
import { getGreeting } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import type { IconName } from '@/components/Icon';
import {
  Screen,
  AppText,
  AppCard,
  SectionHeader,
  StatCard,
  StatusBadge,
  ConnectivityBadge,
  Skeleton,
  SkeletonCard,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { SyncBadge } from '@/components/inspection/SyncBadge';
import {
  ACTIVITY_LABEL,
  ACTIVITY_TONE,
  DEMO_DATA_LABEL,
  DEMO_DATA_NOTICE,
  DEMO_RECENT_ACTIVITY,
  DEMO_TODAY_METRICS,
} from '@/data/demoContent';

interface QuickAction {
  key: string;
  labelKey: string;
  icon: IconName;
  href: Href;
}
const QUICK_ACTIONS: QuickAction[] = [
  { key: 'start_inspection', labelKey: 'action.startInspection', icon: 'inspection', href: '/inspection/templates' },
  { key: 'quick_observation', labelKey: 'obs.quick', icon: 'warning', href: '/observation/quick' },
  { key: 'report_incident', labelKey: 'action.reportIncident', icon: 'critical', href: '/incident' },
  { key: 'corrective_actions', labelKey: 'nav.correctiveActions', icon: 'tasks', href: '/corrective-actions' },
  { key: 'alerts', labelKey: 'tab.alerts', icon: 'alerts', href: '/alerts' },
];

// Must match the Screen wrapper's horizontal padding.
const SCREEN_H_PADDING = theme.spacing[5];
const GRID_GAP = theme.spacing[3];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useFieldUser();
  const greeting = useMemo(() => getGreeting(), []);

  // Responsive 2-column width, derived from the real viewport (no hardcoded px).
  const { width } = useWindowDimensions();
  const quickCardWidth = Math.floor((width - SCREEN_H_PADDING * 2 - GRID_GAP) / 2);

  const startInspection = () => router.push('/inspection/templates');

  return (
    <Screen
      scroll
      refreshing={user.loading}
      onRefresh={user.refetch}
      contentStyle={styles.scrollContent}
    >
      {/* ---------- header ---------- */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <AppText variant="caption" tone="secondary">
            {greeting}
          </AppText>
          {user.loading ? (
            <Skeleton width="70%" height={28} style={styles.nameSkeleton} />
          ) : (
            <AppText variant="title" numberOfLines={1}>
              {user.displayName}
            </AppText>
          )}
          <AppText variant="caption" tone="secondary" style={styles.role} numberOfLines={1}>
            {user.roleLabel}
          </AppText>
        </View>
        <View style={styles.headerBadges}>
          <SyncBadge />
          <ConnectivityBadge variant="compact" />
        </View>
      </View>

      {/* ---------- mine context ---------- */}
      <AppCard style={styles.contextCard} animateIn>
        <View style={styles.contextRow}>
          <View style={styles.contextIcon}>
            <Icon name="mine" size="sm" color={theme.color.accent} />
          </View>
          <View style={styles.contextText}>
            {user.loading ? (
              <Skeleton width="55%" height={16} />
            ) : (
              <AppText variant="bodyStrong" numberOfLines={1}>
                {user.mine.mineName}
              </AppText>
            )}
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {user.mine.region} - {user.mine.subsidiary}
            </AppText>
          </View>
          {user.mine.isDemo ? (
            <StatusBadge label={DEMO_DATA_LABEL} tone="neutral" dot={false} />
          ) : null}
        </View>
        <View style={styles.gpsRow}>
          <Icon name="location" size="xs" color={theme.color.textSecondary} />
          <AppText variant="caption" tone="secondary" style={styles.flex}>
            GPS standby - location capture arrives with the inspection workflow.
          </AppText>
        </View>
      </AppCard>

      {user.error ? (
        <PressableScale
          onPress={user.refetch}
          style={styles.retryRow}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
        >
          <Icon name="sync" size="xs" color={theme.color.status.warning.text} />
          <AppText variant="caption" color={theme.color.status.warning.text} style={styles.flex}>
            Couldn&apos;t refresh your profile. Tap to try again.
          </AppText>
        </PressableScale>
      ) : null}

      {/* ---------- hero: start inspection ---------- */}
      <PressableScale
        onPress={startInspection}
        accessibilityRole="button"
        accessibilityLabel="Start inspection"
        style={styles.heroWrap}
      >
        <AppCard raised accent={theme.color.accent} style={styles.hero} animateIn>
          <View style={styles.heroIcon}>
            <Icon name="inspection" size="lg" color={theme.color.accent} />
          </View>
          <AppText variant="heading">Start Inspection</AppText>
          <AppText variant="body" tone="secondary" style={styles.heroText}>
            Guided checklist, observations, AI risk analysis and sign-off.
          </AppText>
          <View style={styles.heroCta}>
            <AppText variant="label" color={theme.color.accent}>
              Choose a template
            </AppText>
            <Icon name="chevronRight" size="sm" color={theme.color.accent} />
          </View>
        </AppCard>
      </PressableScale>

      {/* ---------- quick actions ---------- */}
      <View style={styles.section}>
        <SectionHeader title={t('home.quickActions')} />
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((action) => (
            <AppCard
              key={action.key}
              containerStyle={{ width: quickCardWidth }}
              style={styles.quickCard}
              padded={false}
              onPress={() => router.push(action.href)}
              accessibilityLabel={t(action.labelKey)}
            >
              <View style={styles.quickIcon}>
                <Icon name={action.icon} size="sm" color={theme.color.textPrimary} />
              </View>
              <AppText variant="bodyStrong" style={styles.quickLabel} numberOfLines={2}>
                {t(action.labelKey)}
              </AppText>
            </AppCard>
          ))}
        </View>
      </View>

      {/* ---------- today's activity ---------- */}
      <View style={styles.section}>
        <SectionHeader
          title="Today's Activity"
          trailing={<StatusBadge label={DEMO_DATA_LABEL} tone="neutral" dot={false} />}
        />
        {user.loading ? (
          <View style={styles.metricRow}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} lines={1} style={styles.metricSkeleton} />
            ))}
          </View>
        ) : (
          <View style={styles.metricRow}>
            {DEMO_TODAY_METRICS.map((m) => (
              <StatCard key={m.key} value={m.value} label={m.label} icon={m.icon} tone={m.tone} />
            ))}
          </View>
        )}
      </View>

      {/* ---------- recent activity ---------- */}
      <View style={styles.section}>
        <SectionHeader title="Recent Activity" />
        <AppCard padded={false} animateIn>
          {DEMO_RECENT_ACTIVITY.map((item, i) => (
            <View key={item.id} style={[styles.activityRow, i > 0 ? styles.rowDivider : null]}>
              <View style={styles.activityIcon}>
                <Icon name={item.icon} size="sm" color={theme.color.textSecondary} />
              </View>
              <View style={styles.activityText}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {item.location} - {item.time}
                </AppText>
              </View>
              <StatusBadge label={ACTIVITY_LABEL[item.status]} tone={ACTIVITY_TONE[item.status]} />
            </View>
          ))}
        </AppCard>
      </View>

      <AppText variant="caption" tone="secondary" style={styles.notice}>
        {DEMO_DATA_NOTICE}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing[10] },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] },
  headerBadges: { alignItems: 'flex-end', gap: theme.spacing[1] },
  headerText: { flex: 1, minWidth: 0 },
  nameSkeleton: { marginTop: 6 },
  role: { marginTop: 4 },

  contextCard: { marginTop: theme.spacing[5], gap: theme.spacing[3] },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  contextText: { flex: 1, minWidth: 0 },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.status.warning.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.color.hairline,
    paddingTop: theme.spacing[3],
  },

  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.status.warning.tint,
  },

  heroWrap: { marginTop: theme.spacing[5] },
  hero: { gap: theme.spacing[2], paddingLeft: theme.spacing[5] },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.status.warning.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1],
  },
  heroText: { marginBottom: theme.spacing[1] },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },

  section: { marginTop: theme.spacing[8] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  quickCard: {
    minHeight: 112,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { width: '100%', textAlign: 'center', lineHeight: 20 },

  metricRow: { flexDirection: 'row', gap: theme.spacing[3] },
  metricSkeleton: { flex: 1, minWidth: 0 },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.color.hairline },
  activityText: { flex: 1, minWidth: 0 },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: { marginTop: theme.spacing[6] },
});
