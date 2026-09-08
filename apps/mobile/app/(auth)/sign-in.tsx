import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import { Screen, AppText, AppButton, IconButton } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Wordmark } from '@/components/brand/Wordmark';

/** Turn a raw Supabase auth error into a calm, human sentence. */
function humaniseAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (m.includes('email not confirmed')) return 'This account has not been confirmed yet.';
  if (m.includes('network') || m.includes('fetch')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return 'Sign-in failed. Please try again.';
}

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function onSubmit() {
    setError(null);
    if (!isSupabaseConfigured) {
      setError('App not configured. Add your Supabase keys to apps/mobile/.env and restart.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(humaniseAuthError(authError.message));
        return;
      }
      // Session listener in _layout will redirect; nudge it for responsiveness.
      router.replace('/home');
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.brandBlock}>
            <Wordmark size={48} layout="inline" />
            <AppText variant="body" tone="secondary" style={styles.tagline}>
              Field-to-boardroom compliance intelligence.
            </AppText>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <AppText variant="label" tone="secondary">
                Email
              </AppText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@company.com"
                placeholderTextColor={theme.color.textSecondary}
                style={styles.input}
                accessibilityLabel="Email"
              />
            </View>

            <View style={styles.field}>
              <AppText variant="label" tone="secondary">
                Password
              </AppText>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  placeholder="Enter your password"
                  placeholderTextColor={theme.color.textSecondary}
                  style={[styles.input, styles.passwordInput]}
                  accessibilityLabel="Password"
                  onSubmitEditing={() => canSubmit && onSubmit()}
                />
                <View style={styles.toggle}>
                  <IconButton
                    icon={showPassword ? 'eyeOff' : 'eye'}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((v) => !v)}
                    color={theme.color.textSecondary}
                  />
                </View>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Icon name="critical" size="sm" color={theme.color.status.critical.text} />
                <AppText
                  variant="caption"
                  color={theme.color.status.critical.text}
                  style={styles.flex}
                >
                  {error}
                </AppText>
              </View>
            ) : null}

            <AppButton
              label="Sign In"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={styles.submit}
            />
          </View>

          <AppText variant="caption" tone="secondary" center style={styles.footer}>
            MineX Field - authorised personnel only.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: theme.spacing[6],
    justifyContent: 'center',
    gap: theme.spacing[10],
  },
  brandBlock: { gap: theme.spacing[4] },
  tagline: { maxWidth: 300 },
  form: { gap: theme.spacing[4] },
  field: { gap: theme.spacing[2] },
  input: {
    height: theme.control.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing[4],
    fontSize: theme.fontSize.md,
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: theme.control.lg },
  toggle: { position: 'absolute', right: theme.spacing[1] },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    backgroundColor: theme.color.status.critical.tint,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
  },
  submit: { marginTop: theme.spacing[2] },
  footer: { position: 'absolute', bottom: theme.spacing[6], left: 0, right: 0 },
});
