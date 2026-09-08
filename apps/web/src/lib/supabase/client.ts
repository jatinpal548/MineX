'use client';

import { createBrowserClient } from '@supabase/ssr';
import { assertPublicEnv, publicEnv } from '@/lib/env';

/**
 * Supabase client for Client Components (runs in the browser).
 * Uses only the public anon key - safe to ship to the browser.
 */
export function createClient() {
  assertPublicEnv();
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
