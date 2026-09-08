/**
 * Single source of truth for "who may do what" on a corrective action.
 * Used BOTH by the detail page (to render the panel) and by every server
 * action (to enforce). The server actions never trust the client's view of
 * this - they recompute it from the signed-in session + the DB row.
 */
import { hasPermission } from '@coalguard/config';
import type { CorrectiveActionStatus, UserRole } from '@coalguard/types';

export interface CaContext {
  status: CorrectiveActionStatus;
  assignedTo: string | null;
}

export interface CaCapabilities {
  canAssign: boolean;
  canManageStatus: boolean;
  canSubmit: boolean;
  canVerify: boolean;
  canAddEvidence: boolean;
  isAssignee: boolean;
  isTerminal: boolean;
}

const OWNER_WORKABLE: CorrectiveActionStatus[] = [
  'assigned',
  'in_progress',
  'rejected',
  'overdue',
];
const ASSIGNABLE: CorrectiveActionStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'rejected',
  'overdue',
];

export function caCapabilities(
  roles: UserRole[],
  userId: string,
  ca: CaContext,
): CaCapabilities {
  const assignPerm = hasPermission(roles, 'corrective_action:assign');
  const verifyPerm = hasPermission(roles, 'corrective_action:verify');
  const isAssignee = !!ca.assignedTo && ca.assignedTo === userId;
  const isTerminal = ca.status === 'verified' || ca.status === 'closed';

  return {
    canAssign: assignPerm && !isTerminal && ASSIGNABLE.includes(ca.status),
    canManageStatus:
      (assignPerm || isAssignee) &&
      !isTerminal &&
      (ca.status === 'assigned' || ca.status === 'in_progress' || ca.status === 'rejected'),
    canSubmit: isAssignee && OWNER_WORKABLE.includes(ca.status),
    canVerify: verifyPerm && ca.status === 'submitted',
    canAddEvidence: (isAssignee || assignPerm || verifyPerm) && !isTerminal,
    isAssignee,
    isTerminal,
  };
}

/** Status values a manager/owner may move an *active* action to, given its current one. */
export function allowedStatusTargets(
  current: CorrectiveActionStatus,
): CorrectiveActionStatus[] {
  switch (current) {
    case 'assigned':
      return ['in_progress'];
    case 'in_progress':
      return ['assigned'];
    case 'rejected':
    case 'overdue':
      return ['in_progress'];
    default:
      return [];
  }
}
