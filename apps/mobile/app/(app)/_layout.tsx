import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { Icon, type IconName } from '@/components/Icon';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <View
        style={[
          styles.indicator,
          { backgroundColor: focused ? theme.color.accent : 'transparent' },
        ]}
      />
      <Icon
        name={name}
        size="md"
        color={focused ? theme.color.textPrimary : theme.color.textSecondary}
        strokeWidth={focused ? 2.4 : 2}
      />
    </View>
  );
}

export default function AppTabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.textPrimary,
        tabBarInactiveTintColor: theme.color.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          // base bar height + whatever the device reserves at the bottom
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        sceneStyle: { backgroundColor: theme.color.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="inspections"
        options={{
          title: t('tab.inspections'),
          tabBarIcon: ({ focused }) => <TabIcon name="inspection" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('tab.alerts'),
          tabBarIcon: ({ focused }) => <TabIcon name="alerts" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: { alignItems: 'center', justifyContent: 'center', gap: 6, width: 48 },
  indicator: { height: 2, width: 18, borderRadius: 1 },
});
