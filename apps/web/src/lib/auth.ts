import { redirect } from 'next/navigation';
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

/** Load the signed-in user with their profile + role assignments. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
}

/** Use at the top of a protected page/layout. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
