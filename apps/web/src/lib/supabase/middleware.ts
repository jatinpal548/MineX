import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PROTECTED_PREFIXES = [
  '/dashboard', '/inspections', '/observations', '/corrective-actions', '/risk-map',
  '/compliance', '/documents', '/contractors', '/attendance', '/grievances',
  '/mine-operations', '/reports', '/notifications', '/profile', '/settings',
];

/**
 * Keeps the Supabase auth session fresh on every request and guards the
 * authenticated area. Wired up in `src/middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isLogin = pathname === '/login';
  if (!isProtected && !isLogin) return response;

  // If env is not configured yet, don't crash the whole site - just pass through.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh expired credentials here so any updated cookies can be written.
  // The command layout, report handler and server actions verify identity with
  // getUser(), and Supabase applies RLS to the data queries.
  const { data: { session } } = await supabase.auth.getSession();
  if (isProtected && session) return response;

  const url = request.nextUrl.clone();
  if (isProtected) {
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  } else {
    if (!session) return response;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return response;
    url.pathname = '/dashboard';
    url.search = '';
  }

  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
