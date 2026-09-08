import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { theme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { useConnectivity } from '@/lib/connectivity';
import { useI18n } from '@/lib/i18n';
import { useFieldUser } from '@/hooks/useFieldUser';
import { Icon } from '@/components/Icon';
import {
  Screen,
  AppHeader,
  AppCard,
  AppText,
  AppButton,
  StatusBadge,
  SectionHeader,
  ErrorState,
  Skeleton,
} from '@/components/ui';

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last ? null : styles.infoDivider]}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="body" style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <AppCard padded={false} animateIn>
        {children}
      </AppCard>
    </View>
  );
}

export default function ProfileScreen() {
  const { signOut } = useSession();
  const { online } = useConnectivity();
  const { t, lang, setLang, languages } = useI18n();
  const user = useFieldUser();

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to use MineX Field.', [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen scroll>
      <AppHeader title="Profile" />

      {/* identity */}
      <AppCard style={styles.identity} animateIn>
        <View style={styles.avatar}>
          {user.loading ? (
            <Skeleton width={28} height={28} radius={14} />
          ) : (
            <AppText variant="subheading" color={theme.color.accent}>
              {user.initials}
            </AppText>
          )}
        </View>
        <View style={styles.flex}>
          {user.loading ? (
            <Skeleton width="55%" height={18} />
          ) : (
            <AppText variant="subheading">{user.displayName}</AppText>
          )}
          <AppText variant="caption" tone="secondary" style={styles.identitySub}>
            {user.email}
          </AppText>
          <View style={styles.identityBadges}>
            <StatusBadge label={user.roleLabel} tone="info" dot={false} />
            {user.accountActive ? <StatusBadge label="Active" tone="safe" /> : null}
          </View>
        </View>
      </AppCard>

      {user.error ? (
        <View style={styles.section}>
          <ErrorState
            title="Unable to load your profile"
            message="We couldn't load your account details. Your session is still active."
            onRetry={user.refetch}
          />
        </View>
      ) : (
        <>
          <Section title="Account">
            <InfoRow label="Full name" value={user.displayName} />
            <InfoRow label="Email" value={user.email} />
            <InfoRow label="Employee code" value={user.employeeCode ?? 'Not set'} />
            <InfoRow
              label="Account status"
              value={user.accountActive ? 'Active' : 'Inactive'}
              last
            />
          </Section>

          <Section title="Operational Scope">
            <InfoRow label="Mine" value={user.mine.mineName} />
            <InfoRow label="Region" value={user.mine.region} />
            <InfoRow label="Subsidiary" value={user.mine.subsidiary} />
            <InfoRow label="Access scope" value={user.scopeLabel} last />
          </Section>
        </>
      )}

      <Section title={t('profile.language')}>
        {languages.map((l, i) => {
          const selected = l.code === lang;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLang(l.code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={l.label}
              style={[styles.langRow, i < languages.length - 1 ? styles.infoDivider : null]}
            >
              <AppText variant="body">
                {l.native}
                {l.native !== l.label ? `  ·  ${l.label}` : ''}
              </AppText>
              {selected ? (
                <Icon name="pass" size="sm" color={theme.color.accent} strokeWidth={2.4} />
              ) : (
                <View style={styles.radioEmpty} />
              )}
            </Pressable>
          );
        })}
      </Section>

      <Section title={t('profile.appInfo')}>
        <InfoRow label="Application" value="MineX Field" />
        <InfoRow label="Version" value={APP_VERSION} />
        <InfoRow label="Backend" value="Supabase (connected)" />
        <InfoRow
          label="Connectivity"
          value={online ? t('net.online') : t('net.offline')}
          last
        />
      </Section>

      <AppButton
        label="Sign Out"
        variant="secondary"
        icon="signOut"
        fullWidth
        onPress={confirmSignOut}
        style={styles.signOut}
      />
      <View style={styles.gap} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.status.warning.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySub: { marginTop: 2 },
  identityBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  section: { marginTop: theme.spacing[6] },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  infoDivider: { borderBottomWidth: 1, borderBottomColor: theme.color.hairline },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  radioEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: theme.color.border,
  },
  signOut: { marginTop: theme.spacing[8] },
  gap: { height: theme.spacing[8] },
});
