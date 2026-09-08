import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Supabase client for the field app.
 *
 * - Auth tokens are persisted with AsyncStorage so the user stays signed in.
 * - `detectSessionInUrl: false` because there is no browser URL on native.
 * - Offline: inspection writes go through the local SQLite store + sync engine
 *   (src/lib/db + src/features/inspection/{localStore,syncEngine}.ts) rather than
 *   calling this client directly while offline.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
