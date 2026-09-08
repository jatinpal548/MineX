/**
 * Local, offline-safe cache of the resolved field-user context
 * (who is signed in + which mine they operate).
 *
 * `useFieldUser` resolves this from Supabase when online. Persisting the last
 * successful result here lets the inspection workflow keep working after a
 * force-quit + cold start while offline - without this, `mineId` came back
 * `null` and the app behaved as if the user had no mine assignment.
 *
 * Stored with AsyncStorage (already used for the Supabase auth session). It
 * holds NO secrets - only profile/role/mine metadata the signed-in user is
 * already allowed to read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrgScopeLevel, UserRole } from '@coalguard/types';
import type { MineContext } from '@/data/mineContext';

const KEY = 'coalguard.fieldUser.v1';

export interface FieldUserCache {
  userId: string;
  fullName: string | null;
  employeeCode: string | null;
  accountActive: boolean;
  role: UserRole | null;
  scopeLevel: OrgScopeLevel | null;
  mine: MineContext;
}

/** Last resolved context for `userId`, or null if there is none / it belongs to another user. */
export async function loadFieldUserCache(userId: string): Promise<FieldUserCache | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FieldUserCache> | null;
    if (!parsed || parsed.userId !== userId || !parsed.mine) return null;
    return parsed as FieldUserCache;
  } catch {
    return null;
  }
}

/** Persist the freshly resolved context. Best-effort - a write failure is non-fatal. */
export async function saveFieldUserCache(value: FieldUserCache): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

export async function clearFieldUserCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
