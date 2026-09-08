import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useConnectivity } from '@/lib/connectivity';
import { useSession } from '@/lib/session';
import { clearAuthExpired, isAuthExpired, isSyncing, onSyncChange, runSync } from './syncEngine';
import { queueSummary, retryFailedOps, type QueueSummary } from './localStore';

export type SyncGlobalState = 'idle' | 'syncing' | 'queued' | 'failed' | 'offline';

interface SyncContextValue {
  state: SyncGlobalState;
  summary: QueueSummary;
  authExpired: boolean;
  online: boolean;
  syncNow: () => void;
  retryFailed: () => void;
}

const EMPTY: QueueSummary = { pending: 0, syncing: 0, failed: 0, total: 0 };
const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { online } = useConnectivity();
  const { session } = useSession();
  const [summary, setSummary] = useState<QueueSummary>(EMPTY);
  const [authExpired, setAuthExpired] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const wasOnline = useRef(online);
  const hadSession = useRef(Boolean(session));

  const refresh = useCallback(async () => {
    try {
      setSummary(await queueSummary());
      setAuthExpired(await isAuthExpired());
      setSyncing(isSyncing());
    } catch {
      /* db not ready yet */
    }
  }, []);

  // subscribe to engine changes
  useEffect(() => {
    const unsub = onSyncChange(() => void refresh());
    void refresh();
    void runSync(); // resume anything queued from a previous session
    return unsub;
  }, [refresh]);

  // reconnected -> drain
  useEffect(() => {
    if (online && !wasOnline.current) void runSync();
    wasOnline.current = online;
  }, [online]);

  // signed back in after an expiry -> clear the flag and resume
  useEffect(() => {
    const has = Boolean(session);
    if (has && !hadSession.current) {
      void (async () => {
        await clearAuthExpired();
        await refresh();
        void runSync();
      })();
    }
    hadSession.current = has;
  }, [session, refresh]);

  // periodic retry while work is outstanding
  useEffect(() => {
    if (summary.total === 0 || !online || authExpired) return;
    const t = setInterval(() => void runSync(), 8000);
    return () => clearInterval(t);
  }, [summary.total, online, authExpired]);

  const syncNow = useCallback(() => void runSync(), []);
  const retryFailed = useCallback(() => {
    void (async () => {
      await retryFailedOps();
      await refresh();
      void runSync();
    })();
  }, [refresh]);

  const state: SyncGlobalState = useMemo(() => {
    if (authExpired) return 'failed';
    if (syncing) return 'syncing';
    if (summary.failed > 0) return 'failed';
    if (summary.total > 0) return online ? 'queued' : 'offline';
    return 'idle';
  }, [authExpired, syncing, summary, online]);

  const value = useMemo<SyncContextValue>(
    () => ({ state, summary, authExpired, online, syncNow, retryFailed }),
    [state, summary, authExpired, online, syncNow, retryFailed],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
