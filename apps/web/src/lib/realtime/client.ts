'use client';

import { createBrowserClient } from '@supabase/ssr';
import { assertPublicEnv, publicEnv } from '@/lib/env';

/**
 * A dedicated Supabase browser client for realtime subscriptions.
 *
 * Separated from the data-access client so subscriptions keep their own
 * websocket connection and never interfere with SSR fetches. The anon key is
 * sufficient: realtime is row-filtered by RLS exactly like a normal query, so a
 * subscriber only ever receives changes to rows their session may already see.
 * No secret ever reaches this client.
 */

type RealtimeClient = ReturnType<typeof createBrowserClient>;

let singleton: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  assertPublicEnv();
  if (singleton) return singleton;
  singleton = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    realtime: {
      // Subscribe to the public schema only. The `public` schema is where all
      // application tables live; `storage`/`auth` changes are not relevant here.
      dbSchema: 'public',
    },
  });
  return singleton;
}