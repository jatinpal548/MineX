/**
 * CoalGuard RBAC (Role Based Access Control) foundation.
 *
 * Two independent questions decide whether a user may do something:
 *
 *   1. CAPABILITY  - "is this role allowed to perform this action at all?"
 *                    Answered by `hasPermission()` using the map below.
 *
 *   2. SCOPE       - "is the target row inside the part of the org tree this
 *                    user is responsible for?"
 *                    Answered by `isWithinScope()` in `./org.ts`, and enforced
 *                    for real in the database by Row Level Security
 *                    (see supabase/migrations/0002_rls.sql).
 *
 * The checks here are the client/server convenience layer. RLS is the source of
 * truth - never rely on this file alone for security.
 */

import type { UserRole } from '@coalguard/types';

/* -------------------------------------------------------------------------- */
/* Permission vocabulary                                                      */
/* -------------------------------------------------------------------------- */

export const PERMISSIONS = [
  // inspections
  'inspection:create',
  'inspection:read',
  'inspection:update',
  'inspection:submit',
  'inspection:review',
  'inspection:close',
  // observations
  'observation:create',
  'observation:read',
  'observation:update',
  // evidence
  'evidence:upload',
  'evidence:read',
  // incidents
  'incident:create',
  'incident:read',
  'incident:update',
  'incident:investigate',
  // corrective actions
  'corrective_action:create',
  'corrective_action:read',
  'corrective_action:assign',
  'corrective_action:execute',
  'corrective_action:submit_closure',
  'corrective_action:verify',
  // compliance
  'compliance:read',
  'compliance:manage',
  'compliance:submit',
  // operations
  'environmental:read',
  'environmental:record',
  'equipment:read',
  'equipment:manage',
  'maintenance:read',
  'maintenance:manage',
  // people
  'worker:read',
  'worker:manage',
  'contractor:read',
  'contractor:manage',
  'attendance:read',
  'attendance:record',
  'grievance:create',
  'grievance:read',
  'grievance:manage',
  // oversight / platform
  'dashboard:mine',
  'dashboard:region',
  'dashboard:subsidiary',
  'dashboard:corporate',
  'audit_log:read',
  'ai:run',
  'notification:read',
  // administration
  'org:manage',
  'user:manage',
  'role:assign',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/* -------------------------------------------------------------------------- */
/* Reusable permission bundles                                                */
/* -------------------------------------------------------------------------- */

const READ_FIELD: Permission[] = [
  'inspection:read',
  'observation:read',
  'evidence:read',
  'incident:read',
  'corrective_action:read',
  'notification:read',
];

const OVERSIGHT_READ: Permission[] = [
  ...READ_FIELD,
  'compliance:read',
  'environmental:read',
  'equipment:read',
  'maintenance:read',
  'worker:read',
  'contractor:read',
  'attendance:read',
  'grievance:read',
  'audit_log:read',
];

/* -------------------------------------------------------------------------- */
/* Role -> permissions                                                        */
/* -------------------------------------------------------------------------- */

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  FIELD_INSPECTOR: [
    ...READ_FIELD,
    'inspection:create',
    'inspection:update',
    'inspection:submit',
    'observation:create',
    'observation:update',
    'evidence:upload',
    'incident:create',
    'corrective_action:create',
    'ai:run',
    'dashboard:mine',
  ],
  SAFETY_OFFICER: [
    ...READ_FIELD,
    'inspection:create',
    'inspection:update',
    'inspection:submit',
    'inspection:review',
    'observation:create',
    'observation:update',
    'evidence:upload',
    'incident:create',
    'incident:update',
    'incident:investigate',
    'corrective_action:create',
    'corrective_action:assign',
    'corrective_action:verify',
    'ai:run',
    'dashboard:mine',
  ],
  ENVIRONMENTAL_OFFICER: [
    ...READ_FIELD,
    'observation:create',
    'observation:update',
    'evidence:upload',
    'environmental:read',
    'environmental:record',
    'compliance:read',
    'compliance:manage',
    'compliance:submit',
    'corrective_action:create',
    'corrective_action:assign',
    'corrective_action:verify',
    'ai:run',
    'dashboard:mine',
  ],
  MAINTENANCE_OFFICER: [
    ...READ_FIELD,
    'observation:create',
    'observation:update',
    'evidence:upload',
    'equipment:read',
    'equipment:manage',
    'maintenance:read',
    'maintenance:manage',
    'corrective_action:create',
    'corrective_action:execute',
    'corrective_action:submit_closure',
    'ai:run',
    'dashboard:mine',
  ],
  HR_OFFICER: [
    'notification:read',
    'worker:read',
    'worker:manage',
    'contractor:read',
    'contractor:manage',
    'attendance:read',
    'attendance:record',
    'grievance:read',
    'grievance:manage',
    'evidence:upload',
    'dashboard:mine',
  ],
  CONTRACTOR: [
    'notification:read',
    'corrective_action:read',
    'corrective_action:execute',
    'corrective_action:submit_closure',
    'evidence:upload',
    'worker:read',
    'contractor:read',
    'attendance:read',
    'attendance:record',
  ],
  WORKER: ['notification:read', 'corrective_action:read', 'grievance:create', 'grievance:read'],
  COMPLIANCE_OFFICER: [
    ...READ_FIELD,
    'compliance:read',
    'compliance:manage',
    'compliance:submit',
    'environmental:read',
    'audit_log:read',
    'corrective_action:create',
    'corrective_action:assign',
    'corrective_action:verify',
    'evidence:upload',
    'ai:run',
    'dashboard:mine',
  ],
  MINE_MANAGER: [
    ...OVERSIGHT_READ,
    'inspection:review',
    'inspection:close',
    'observation:update',
    'incident:update',
    'incident:investigate',
    'corrective_action:create',
    'corrective_action:assign',
    'corrective_action:verify',
    'compliance:manage',
    'equipment:manage',
    'maintenance:manage',
    'worker:manage',
    'contractor:manage',
    'grievance:manage',
    'attendance:record',
    'ai:run',
    'dashboard:mine',
  ],
  INTERNAL_AUDITOR: [
    ...OVERSIGHT_READ,
    'ai:run',
    'dashboard:mine',
    'dashboard:region',
    'dashboard:subsidiary',
  ],
  REGIONAL_GM: [
    ...OVERSIGHT_READ,
    'inspection:review',
    'corrective_action:assign',
    'corrective_action:verify',
    'ai:run',
    'dashboard:mine',
    'dashboard:region',
  ],
  SUBSIDIARY_HQ: [
    ...OVERSIGHT_READ,
    'ai:run',
    'dashboard:mine',
    'dashboard:region',
    'dashboard:subsidiary',
  ],
  CORPORATE_HQ: [
    ...OVERSIGHT_READ,
    'ai:run',
    'dashboard:mine',
    'dashboard:region',
    'dashboard:subsidiary',
    'dashboard:corporate',
  ],
  REGULATOR: [
    'inspection:read',
    'observation:read',
    'incident:read',
    'compliance:read',
    'environmental:read',
    'audit_log:read',
    'dashboard:corporate',
  ],
  SYSTEM_ADMIN: [...PERMISSIONS],
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Does ANY of the user's roles grant this permission? */
export function hasPermission(roles: UserRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

/** Does ANY of the user's roles grant EVERY permission in the list? */
export function hasAllPermissions(roles: UserRole[], permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(roles, p));
}

/** The de-duplicated set of permissions across all the user's roles. */
export function permissionsForRoles(roles: UserRole[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  return [...set];
}

export function isSystemAdmin(roles: UserRole[]): boolean {
  return roles.includes('SYSTEM_ADMIN');
}
