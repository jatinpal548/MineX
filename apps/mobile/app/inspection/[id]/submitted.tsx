import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { Screen, AppText, AppButton, AppCard, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useInspection } from '@/features/inspection/InspectionContext';

export default function SubmittedScreen() {
  const { id, synced } = useLocalSearchParams<{ id: string; synced?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clear } = useInspection();
  const isSynced = synced === '1';

  const goToInspections = () => {
    clear();
    router.replace('/inspections');
  };
  const viewInspection = () => {
    clear();
    router.replace(`/inspection/${id}/detail`);
  };

  return (
    <Screen>
      <View style={styles.body}>
        <View
          style={[
            styles.iconWrap,
            !isSynced && { backgroundColor: theme.color.status.warning.tint },
          ]}
        >
          <Icon
            name={isSynced ? 'completed' : 'offline'}
            size="xl"
            color={isSynced ? theme.color.status.safe.text : theme.color.status.warning.text}
            strokeWidth={2}
          />
        </View>
        <AppText variant="title" center>
          {isSynced ? 'Inspection submitted' : 'Saved offline'}
        </AppText>
        <AppText variant="body" tone="secondary" center style={styles.text}>
          {isSynced
            ? 'Your inspection is on MineX. Your mine manager can review it in MineX Command.'
            : 'Your inspection and all its evidence are saved on this device. It will sync to MineX automatically when you have a connection - nothing is lost.'}
        </AppText>
        {!isSynced ? <StatusBadge label="QUEUED FOR SYNC" tone="warning" /> : null}

        <AppCard style={styles.refCard}>
          <AppText variant="label" tone="secondary">
            Reference
          </AppText>
          <AppText variant="bodyStrong" style={styles.ref} selectable>
            {id}
          </AppText>
        </AppCard>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[3] }]}>
        <AppButton label="View inspection" variant="secondary" fullWidth onPress={viewInspection} />
        <AppButton label="Back to Inspections" fullWidth onPress={goToInspections} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing[3] },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.status.safe.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  text: { maxWidth: 320 },
  refCard: { width: '100%', marginTop: theme.spacing[4], gap: theme.spacing[1] },
  ref: { letterSpacing: 0.5 },
  footer: { gap: theme.spacing[3] },
});
