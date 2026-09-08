/**
 * Organisation hierarchy + scope logic.
 *
 *   Corporate -> Subsidiary -> Region -> Mine -> Department -> User
 *
 * A user's "scope" is the node in that tree they are attached to (via a row in
 * `role_assignments`). They may see a resource only if the resource's mine sits
 * at or below one of their scope nodes.
 *
 * This mirrors the SQL helper `public.user_mine_ids()` in
 * supabase/migrations/0002_rls.sql - keep the two in sync.
 */

import type { OrgScopeLevel, RoleAssignment } from '@coalguard/types';

export const ORG_LEVEL_ORDER: OrgScopeLevel[] = [
  'corporate',
  'subsidiary',
  'region',
  'mine',
  'department',
];

/** Lower number = higher up the tree (broader access). */
export function orgLevelRank(level: OrgScopeLevel): number {
  return ORG_LEVEL_ORDER.indexOf(level);
}

/** Where a resource lives in the tree. `mineId` is enough to place most rows. */
export interface ResourceScope {
  subsidiaryId?: string | null;
  regionId?: string | null;
  mineId?: string | null;
  departmentId?: string | null;
}

/** A single scope node a user is attached to. */
export interface UserScopeNode {
  level: OrgScopeLevel;
  subsidiaryId?: string | null;
  regionId?: string | null;
  mineId?: string | null;
  departmentId?: string | null;
}

export function roleAssignmentToScopeNode(a: RoleAssignment): UserScopeNode {
  return {
    level: a.scope_level,
    subsidiaryId: a.subsidiary_id,
    regionId: a.region_id,
    mineId: a.mine_id,
    departmentId: a.department_id,
  };
}

/**
 * Is `resource` at or below the single scope node `node`?
 *
 * NOTE: region/subsidiary containment needs the org tree (which region belongs
 * to which subsidiary, etc). Phase 0 can only answer confidently when the
 * relevant ids are present on BOTH sides. For anything broader we defer to the
 * database, where `user_mine_ids()` does the real join. This function is a
 * client-side hint for hiding UI, not a security boundary.
 */
export function isWithinScopeNode(node: UserScopeNode, resource: ResourceScope): boolean {
  switch (node.level) {
    case 'corporate':
      return true;
    case 'subsidiary':
      return !!node.subsidiaryId && node.subsidiaryId === resource.subsidiaryId;
    case 'region':
      return !!node.regionId && node.regionId === resource.regionId;
    case 'mine':
      return !!node.mineId && node.mineId === resource.mineId;
    case 'department':
      return (
        !!node.departmentId &&
        node.departmentId === resource.departmentId &&
        (!resource.mineId || resource.mineId === node.mineId)
      );
    default:
      return false;
  }
}

/** True if ANY of the user's scope nodes contains the resource. */
export function isWithinScope(nodes: UserScopeNode[], resource: ResourceScope): boolean {
  return nodes.some((n) => isWithinScopeNode(n, resource));
}

/** The broadest dashboard a set of scope nodes should unlock. */
export function broadestScopeLevel(nodes: UserScopeNode[]): OrgScopeLevel | null {
  if (nodes.length === 0) return null;
  return nodes.reduce<OrgScopeLevel>((best, n) => {
    return orgLevelRank(n.level) < orgLevelRank(best) ? n.level : best;
  }, 'department');
}
