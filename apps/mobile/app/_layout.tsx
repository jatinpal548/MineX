import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { I18nProvider } from '@/lib/i18n';
import { ConnectivityProvider } from '@/lib/connectivity';
import { SyncProvider } from '@/features/inspection/SyncProvider';
import { SplashView } from '@/components/SplashView';

// Keep the native (OS) splash up until the JS is ready, so there is no white flash.
void SplashScreen.preventAutoHideAsync();

/** Redirects the user in/out of the authenticated area when the session changes. */
function useAuthRedirect(ready: boolean) {
  const { session } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const group = segments[0];
    const inApp = group === '(app)';
    const inAuth = group === '(auth)';

    if (!session && inApp) router.replace('/sign-in');
    else if (session && inAuth) router.replace('/home');
  }, [ready, session, segments, router]);
}

function RootNavigator() {
  const { loading } = useSession();
  const [introDone, setIntroDone] = useState(false);
  const ready = introDone && !loading;

  useAuthRedirect(ready);

  const onIntroFinish = useCallback(() => setIntroDone(true), []);

  if (!ready) {
    return <SplashView onFinish={onIntroFinish} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.color.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="inspection" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="incident" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="observation" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="corrective-actions" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Native splash can go now - our animated SplashView (same background) covers the handoff.
    void SplashScreen.hideAsync();
  }, []);

  return (
    // `initialMetrics` seeds window insets SYNCHRONOUSLY from the native module,
    // so useSafeAreaInsets()/SafeAreaView return correct values on the very first
    // render - including deep inside nested native-stack screens. Without this the
    // bottom inset can read 0 and sticky footers render behind the Android nav bar.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="dark" />
      <I18nProvider>
        <SessionProvider>
          <ConnectivityProvider>
            <SyncProvider>
              <RootNavigator />
            </SyncProvider>
          </ConnectivityProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
