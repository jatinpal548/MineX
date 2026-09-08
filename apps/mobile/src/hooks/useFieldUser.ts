/**
 * `useFieldUser` - the one hook screens use to get "who is signed in and where".
 *
 * It combines:
 *   - the Supabase auth session (email, id)          -> from useSession()
 *   - the `profiles` row                             -> Supabase
 *   - the user's role assignment (role + org scope)  -> Supabase
 *   - the mine / region / subsidiary for that scope  -> Supabase (org tables are
 *                                                       readable by any signed-in
 *                                                       user per our RLS policy)
 *
 * Offline: the last successfully resolved context is cached locally
 * (`fieldUserCache`). On mount we hydrate from that cache FIRST so a cold start
 * with no connection still knows the user's mine; if online we then refresh
 * from Supabase in the background and update the cache. Only a user who has
 * genuinely never resolved a context (no cache) falls back to
 * `DEMO_MINE_CONTEXT`. Nothing here is hard-coded per-user.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrgScopeLevel, UserRole } from '@coalguard/types';
import { getRoleDefinition } from '@coalguard/config';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { getOnline } from '@/lib/connectivity';
import { DEMO_MINE_CONTEXT, type MineContext } from '@/data/mineContext';
import { loadFieldUserCache, saveFieldUserCache, type FieldUserCache } from './fieldUserCache';

interface FieldUser {
  loading: boolean;
  error: boolean;
  refetch: () => void;

  userId: string | null;
  email: string;
  displayName: string;
  initials: string;
  employeeCode: string | null;
  accountActive: boolean;

  role: UserRole | null;
  roleLabel: string;
  scopeLevel: OrgScopeLevel | null;
  scopeLabel: string;

  mine: MineContext;
}

const SCOPE_LABEL: Record<OrgScopeLevel, string> = {
  corporate: 'Corporate-wide access',
  subsidiary: 'Subsidiary-level access',
  region: 'Region-level access',
  mine: 'Mine-level access',
  department: 'Department-level access',
};

function deriveName(fullName: string | undefined | null, email: string): string {
  const trimmed = (fullName ?? '').trim();
  if (trimmed) return trimmed;
  const local = email.split('@')[0] ?? 'User';
  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function toInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || 'U';
}

export function useFieldUser(): FieldUser {
  const { session } = useSession();
  const user = session?.user ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  const [fullName, setFullName] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState<string | null>(null);
  const [accountActive, setAccountActive] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [scopeLevel, setScopeLevel] = useState<OrgScopeLevel | null>(null);
  const [mine, setMine] = useState<MineContext>(DEMO_MINE_CONTEXT);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);

    const apply = (ctx: FieldUserCache) => {
      setFullName(ctx.fullName);
      setEmployeeCode(ctx.employeeCode);
      setAccountActive(ctx.accountActive);
      setRole(ctx.role);
      setScopeLevel(ctx.scopeLevel);
      setMine(ctx.mine);
    };

    (async () => {
      // 1. hydrate from the local cache first so the workflow is usable offline
      const cached = await loadFieldUserCache(user.id);
      if (cancelled) return;
      if (cached) apply(cached);

      // 2. offline: rely on the cached context. Only surface an error if there
      //    is genuinely nothing cached (never resolved while online).
      if (!getOnline()) {
        if (!cancelled) {
          setError(!cached);
          setLoading(false);
        }
        return;
      }

      // 3. online: refresh from Supabase, then update the cache.
      try {
        const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, employee_code, is_active')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('role_assignments')
            .select('role, scope_level, mine_id, department_id, is_primary')
            .eq('profile_id', user.id)
            .order('is_primary', { ascending: false }),
        ]);
        if (pErr || rErr) throw pErr ?? rErr;
        if (cancelled) return;

        const primary = (roles ?? [])[0] as
          | {
              role: UserRole;
              scope_level: OrgScopeLevel;
              mine_id: string | null;
              department_id: string | null;
            }
          | undefined;

        let mine: MineContext = DEMO_MINE_CONTEXT;
        if (primary?.mine_id) {
          const { data: mineRow, error: mErr } = await supabase
            .from('mines')
            .select(
              'name, code, region:region_id ( name, subsidiary:subsidiary_id ( name, code ) )',
            )
            .eq('id', primary.mine_id)
            .maybeSingle();
          if (mErr) throw mErr;
          if (cancelled) return;

          if (mineRow) {
            const region = (
              mineRow as {
                region?: { name?: string; subsidiary?: { name?: string; code?: string } };
              }
            ).region;
            mine = {
              mineId: primary.mine_id,
              departmentId: primary.department_id ?? null,
              mineName: (mineRow.name as string) ?? DEMO_MINE_CONTEXT.mineName,
              mineCode: (mineRow.code as string) ?? DEMO_MINE_CONTEXT.mineCode,
              region: region?.name ?? DEMO_MINE_CONTEXT.region,
              subsidiary:
                region?.subsidiary?.code ??
                region?.subsidiary?.name ??
                DEMO_MINE_CONTEXT.subsidiary,
              isDemo: false,
            };
          } else if (cached && cached.mine.mineId === primary.mine_id) {
            // the mine row read came back empty - keep the last known good one
            mine = cached.mine;
          }
        } else if (cached?.mine.mineId) {
          // fresh read returned no assignment but we have a last known good
          // mine - prefer it over the null-id demo context
          mine = cached.mine;
        }

        const ctx: FieldUserCache = {
          userId: user.id,
          fullName: (profile?.full_name as string) ?? null,
          employeeCode: (profile?.employee_code as string) ?? null,
          accountActive: profile?.is_active !== false,
          role: primary?.role ?? null,
          scopeLevel: primary?.scope_level ?? null,
          mine,
        };
        if (cancelled) return;
        apply(ctx);
        setError(false);
        void saveFieldUserCache(ctx);
      } catch {
        // network / transient failure while online: keep the cached context if
        // we have one; only report an error when there is nothing to fall back on
        if (!cancelled) setError(!cached);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return useMemo<FieldUser>(() => {
    const email = user?.email ?? '';
    const displayName = deriveName(fullName, email);
    return {
      loading,
      error,
      refetch,
      userId: user?.id ?? null,
      email,
      displayName,
      initials: toInitials(displayName),
      employeeCode,
      accountActive,
      role,
      roleLabel: role ? getRoleDefinition(role).label : 'No role assigned',
      scopeLevel,
      scopeLabel: scopeLevel ? SCOPE_LABEL[scopeLevel] : 'Awaiting role assignment',
      mine,
    };
  }, [
    user,
    fullName,
    employeeCode,
    accountActive,
    role,
    scopeLevel,
    mine,
    loading,
    error,
    refetch,
  ]);
}
