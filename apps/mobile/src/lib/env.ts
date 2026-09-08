/**
 * Mobile env access. Only EXPO_PUBLIC_* variables exist in the bundle.
 * Expo inlines these at build time from `.env`.
 *
 * NOTE: no secrets here. The Supabase anon key and the web API base URL are
 * both safe to ship. The service-role key and any AI provider key stay on the
 * server and are never referenced by the mobile app.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Base URL of the CoalGuard Command web app (hosts the secure AI route). */
  webApiUrl: (process.env.EXPO_PUBLIC_WEB_API_URL ?? '').replace(/\/+$/, ''),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** When false, AI risk analysis runs the on-device heuristic fallback. */
export const isWebApiConfigured = Boolean(env.webApiUrl);
