import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Profile, RoleAssignment } from '@coalguard/types';
import { permissionsForRoles, type Permission } from '@coalguard/config';
import { createClient } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
  roles: RoleAssignment[];
  permissions: Permission[];
}

export const getVerifiedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Load the signed-in user with their profile + role assignments. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('role_assignments').select('*').eq('profile_id', user.id),
  ]);

  const roleList = (roles ?? []) as RoleAssignment[];

  return {
    id: user.id,
    email: user.email ?? '',
    profile: (profile as Profile | null) ?? null,
    roles: roleList,
    permissions: permissionsForRoles(roleList.map((r) => r.role)),
  };
});

/** Use at the top of a protected page/layout. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
