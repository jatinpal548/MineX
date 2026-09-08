/**
 * Role catalogue for CoalGuard.
 *
 * `USER_ROLES` (the raw string list) lives in `@coalguard/types` because the
 * database enum needs it too. This file adds the *human* metadata: a label, a
 * one-line description and the organisation tier the role usually works at.
 */

import type { OrgScopeLevel, UserRole } from '@coalguard/types';
import { USER_ROLES } from '@coalguard/types';

export interface RoleDefinition {
  role: UserRole;
  label: string;
  description: string;
  /** The org tier this role is normally scoped to. */
  tier: OrgScopeLevel;
  /** Loose grouping used for UI navigation and filtering. */
  group: 'field' | 'department' | 'mine' | 'oversight' | 'corporate' | 'external' | 'platform';
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  FIELD_INSPECTOR: {
    role: 'FIELD_INSPECTOR',
    label: 'Field Inspector',
    description: 'Runs inspections in the field, captures evidence and raises observations.',
    tier: 'mine',
    group: 'field',
  },
  SAFETY_OFFICER: {
    role: 'SAFETY_OFFICER',
    label: 'Safety Officer',
    description: 'Owns safety observations, incidents and corrective actions for a mine.',
    tier: 'department',
    group: 'department',
  },
  ENVIRONMENTAL_OFFICER: {
    role: 'ENVIRONMENTAL_OFFICER',
    label: 'Environmental Officer',
    description: 'Tracks environmental readings, breaches and MoEFCC compliance.',
    tier: 'department',
    group: 'department',
  },
  MAINTENANCE_OFFICER: {
    role: 'MAINTENANCE_OFFICER',
    label: 'Maintenance Officer',
    description: 'Manages equipment health and maintenance records.',
    tier: 'department',
    group: 'department',
  },
  HR_OFFICER: {
    role: 'HR_OFFICER',
    label: 'HR Officer',
    description: 'Manages workers, contractor workforce, attendance and grievances.',
    tier: 'department',
    group: 'department',
  },
  CONTRACTOR: {
    role: 'CONTRACTOR',
    label: 'Contractor',
    description:
      'External contractor submitting workforce, inductions and action closure evidence.',
    tier: 'mine',
    group: 'external',
  },
  WORKER: {
    role: 'WORKER',
    label: 'Worker',
    description: 'Frontline worker who can view assignments and raise grievances.',
    tier: 'mine',
    group: 'field',
  },
  COMPLIANCE_OFFICER: {
    role: 'COMPLIANCE_OFFICER',
    label: 'Compliance Officer',
    description: 'Owns the compliance register and statutory submissions for a mine.',
    tier: 'mine',
    group: 'mine',
  },
  MINE_MANAGER: {
    role: 'MINE_MANAGER',
    label: 'Mine Manager',
    description: 'Reviews, assigns, escalates, verifies and closes work for a mine.',
    tier: 'mine',
    group: 'mine',
  },
  INTERNAL_AUDITOR: {
    role: 'INTERNAL_AUDITOR',
    label: 'Internal Auditor',
    description: 'Read-mostly access across scope for audit trails and compliance checks.',
    tier: 'subsidiary',
    group: 'oversight',
  },
  REGIONAL_GM: {
    role: 'REGIONAL_GM',
    label: 'Regional General Manager',
    description: 'Oversees all mines in a region; handles escalations.',
    tier: 'region',
    group: 'oversight',
  },
  SUBSIDIARY_HQ: {
    role: 'SUBSIDIARY_HQ',
    label: 'Subsidiary HQ',
    description: 'Oversight across all regions and mines of one subsidiary.',
    tier: 'subsidiary',
    group: 'corporate',
  },
  CORPORATE_HQ: {
    role: 'CORPORATE_HQ',
    label: 'Corporate HQ',
    description: 'Group-wide oversight across every subsidiary.',
    tier: 'corporate',
    group: 'corporate',
  },
  REGULATOR: {
    role: 'REGULATOR',
    label: 'Regulator',
    description: 'External statutory body (e.g. DGMS) with read access to submitted records.',
    tier: 'corporate',
    group: 'external',
  },
  SYSTEM_ADMIN: {
    role: 'SYSTEM_ADMIN',
    label: 'System Administrator',
    description: 'Platform administration: users, roles, org hierarchy and configuration.',
    tier: 'corporate',
    group: 'platform',
  },
};

export const ALL_ROLE_DEFINITIONS: RoleDefinition[] = USER_ROLES.map((r) => ROLE_DEFINITIONS[r]);

export function getRoleDefinition(role: UserRole): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}
