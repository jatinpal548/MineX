/**
 * Environment access for the web app.
 *
 * - `publicEnv`  : values that are safe in the browser bundle (NEXT_PUBLIC_*).
 * - `serverEnv()`: secrets. Throws if called from the browser or if missing.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export function assertPublicEnv(): void {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to apps/web/.env.local and fill it in.',
    );
  }
}

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must never be called in the browser.');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return {
    supabaseUrl: publicEnv.supabaseUrl,
    serviceRoleKey,
    aiProvider: process.env.AI_PROVIDER ?? 'mock',
  };
}
