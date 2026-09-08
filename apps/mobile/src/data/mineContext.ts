/**
 * Operational (mine) context shown around the app.
 *
 * Milestone 1: this is loaded from Supabase for real when the signed-in user has
 * a mine role assignment (see `useFieldUser`). When it cannot be resolved we
 * fall back to `DEMO_MINE_CONTEXT` below so the UI still looks complete in a demo.
 *
 * The TYPE is the contract - later milestones will populate it entirely from
 * Supabase / RBAC without screens needing to change.
 */

export interface MineContext {
  /** Real Supabase mine id when known - required to create inspections. */
  mineId: string | null;
  departmentId: string | null;
  mineName: string;
  mineCode: string;
  region: string;
  subsidiary: string;
  /** Optional finer context - not always known. */
  zone?: string;
  department?: string;
  /** true => the UI must label this as synthetic demo data. */
  isDemo: boolean;
}

// NOTE: keep this type + DEMO_MINE_CONTEXT as the single fallback contract.
// `useFieldUser` populates it from Supabase when the signed-in user has a mine
// role assignment; otherwise the demo values below keep the UI complete.

export const DEMO_MINE_CONTEXT: MineContext = {
  mineId: null,
  departmentId: null,
  mineName: 'Gevra OC Mine',
  mineCode: 'GVR',
  region: 'Korba Region',
  subsidiary: 'SECL',
  zone: 'Pit 3',
  department: 'Safety',
  isDemo: true,
};
