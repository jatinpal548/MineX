import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/**
 * Entry route. Sends the user to the Field app or the sign-in screen based on
 * the current Supabase session. The animated splash is handled in _layout.tsx.
 */
export default function Index() {
  const { session, loading } = useSession();
  if (loading) return null;
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
