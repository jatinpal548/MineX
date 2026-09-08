/**
 * Device connectivity.
 *
 * Milestone 1 scope: show the user a truthful ONLINE / OFFLINE state. It uses
 * `@react-native-community/netinfo` (a small, Expo-supported library) to reflect
 * the real network state. It does NOT sync anything yet - the offline queue and
 * sync engine are a later milestone.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface ConnectivityValue {
  /** true when the device has a working internet connection. */
  online: boolean;
  /** false until the first NetInfo result arrives. */
  resolved: boolean;
}

const ConnectivityContext = createContext<ConnectivityValue>({ online: true, resolved: false });

// Module-scoped mirror so non-React code (the sync engine) can read connectivity
// without a hook. Kept in sync by ConnectivityProvider.
let _online = true;
/** Current connectivity, readable outside React. */
export function getOnline(): boolean {
  return _online;
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectivityValue>({ online: true, resolved: false });

  useEffect(() => {
    const apply = (isConnected: boolean | null, reachable: boolean | null) => {
      // treat "unknown reachability" as online to avoid false OFFLINE flashes
      const online = Boolean(isConnected) && reachable !== false;
      _online = online;
      setState({ online, resolved: true });
    };
    NetInfo.fetch().then((s) => apply(s.isConnected, s.isInternetReachable));
    const unsubscribe = NetInfo.addEventListener((s) =>
      apply(s.isConnected, s.isInternetReachable),
    );
    return unsubscribe;
  }, []);

  const value = useMemo(() => state, [state]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  return useContext(ConnectivityContext);
}
