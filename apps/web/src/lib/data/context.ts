/**
 * Command Center context: the signed-in user, their primary role label and the
 * organisational scope the header should display, plus the list of mines that
 * are inside that scope (for the mine filter).
 *
 * Everything reads through the RLS-scoped SSR Supabase client. The org-hierarchy
 * tables (subsidiaries / regions / mines) are readable by any signed-in user
 * (policy `read_org_*` in 0002_rls.sql), so the mine list is narrowed HERE from
 * the user's own role_assignments - never by trusting a bare `mines` read.
 */
import { cache } from 'react';
import { getRoleDefinition } from '@coalguard/config';
import type { RoleAssignment } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, type SessionUser } from '@/lib/auth';

export interface MineOption {
  id: string;
  name: string;
  code: string;
}

export interface CommandContext {
  user: SessionUser;
  primaryRoleLabel: string;
  scopeLabel: string;
  scopeKicker: string;
  mines: MineOption[];
  canSeeAllMines: boolean;
}

function primaryAssignment(roles: RoleAssignment[]): RoleAssignment | null {
  if (roles.length === 0) return null;
  return roles.find((r) => r.is_primary) ?? roles[0] ?? null;
}

async function resolveScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  primary: RoleAssignment | null,
): Promise<{ scopeLabel: string; scopeKicker: string }> {
  if (!primary) return { scopeLabel: 'No scope assigned', scopeKicker: 'Awaiting role assignment' };

  switch (primary.scope_level) {
    case 'corporate':
      return { scopeLabel: 'All operations', scopeKicker: 'Corporate HQ' };
    case 'subsidiary': {
      const { data } = await supabase
        .from('subsidiaries')
        .select('name, code')
        .eq('id', primary.subsidiary_id ?? '')
        .maybeSingle();
      return {
        scopeLabel: data?.name ?? 'Subsidiary',
        scopeKicker: `Subsidiary HQ${data?.code ? ` · ${data.code}` : ''}`,
      };
    }
    case 'region': {
      const { data } = await supabase
        .from('regions')
        .select('name, subsidiary:subsidiaries(name, code)')
        .eq('id', primary.region_id ?? '')
        .maybeSingle();
      const sub = data?.subsidiary as { name?: string; code?: string } | null | undefined;
      return {
        scopeLabel: data?.name ?? 'Region',
        scopeKicker: `Region${sub?.code ? ` · ${sub.code}` : ''}`,
      };
    }
    case 'mine':
    case 'department': {
      const { data } = await supabase
        .from('mines')
        .select('name, code, region:regions(name, subsidiary:subsidiaries(code))')
        .eq('id', primary.mine_id ?? '')
        .maybeSingle();
      const region = data?.region as
        | { name?: string; subsidiary?: { code?: string } | null }
        | null
        | undefined;
      const bits = [
        primary.scope_level === 'department' ? 'Department' : 'Mine',
        region?.name,
        region?.subsidiary?.code,
      ].filter(Boolean);
      return { scopeLabel: data?.name ?? 'Mine', scopeKicker: bits.join(' · ') };
    }
    default:
      return { scopeLabel: 'Scoped access', scopeKicker: primary.scope_level };
  }
}

async function accessibleMines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roles: RoleAssignment[],
  isAdmin: boolean,
): Promise<{ mines: MineOption[]; all: boolean }> {
  const hasCorporate = isAdmin || roles.some((r) => r.scope_level === 'corporate');
  if (hasCorporate) {
    const { data } = await supabase.from('mines').select('id, name, code').order('name');
    return { mines: (data ?? []) as MineOption[], all: true };
  }

  const subsidiaryIds = roles
    .filter((r) => r.scope_level === 'subsidiary' && r.subsidiary_id)
    .map((r) => r.subsidiary_id as string);
  const regionIds = new Set(
    roles.filter((r) => r.scope_level === 'region' && r.region_id).map((r) => r.region_id as string),
  );
  const mineIds = new Set(
    roles
      .filter((r) => (r.scope_level === 'mine' || r.scope_level === 'department') && r.mine_id)
      .map((r) => r.mine_id as string),
  );

  if (subsidiaryIds.length > 0) {
    const { data } = await supabase.from('regions').select('id').in('subsidiary_id', subsidiaryIds);
    for (const r of data ?? []) regionIds.add(r.id as string);
  }
  if (regionIds.size > 0) {
    const { data } = await supabase.from('mines').select('id').in('region_id', [...regionIds]);
    for (const m of data ?? []) mineIds.add(m.id as string);
  }
  if (mineIds.size === 0) return { mines: [], all: false };

  const { data } = await supabase
    .from('mines')
    .select('id, name, code')
    .in('id', [...mineIds])
    .order('name');
  return { mines: (data ?? []) as MineOption[], all: false };
}

/**
 * Per-request memoised. The command layout AND several pages (dashboard, etc.)
 * all need this; `cache()` collapses those into a single auth + scope resolve
 * per render instead of one per caller.
 */
export const getCommandContext = cache(async (): Promise<CommandContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const primary = primaryAssignment(user.roles);
  const isAdmin = user.roles.some((r) => r.role === 'SYSTEM_ADMIN');

  const [{ scopeLabel, scopeKicker }, { mines, all }] = await Promise.all([
    resolveScope(supabase, primary),
    accessibleMines(supabase, user.roles, isAdmin),
  ]);

  return {
    user,
    primaryRoleLabel: primary ? getRoleDefinition(primary.role).label : 'No role assigned',
    scopeLabel,
    scopeKicker,
    mines,
    canSeeAllMines: all,
  };
});
