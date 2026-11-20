'use client';

import { useEffect, useMemo, useState } from 'react';
import { getRealtimeClient } from './client';

/**
 * Live connection state for the realtime layer. Rendered as a small badge in the
 * Command shell header so an operator can see at a glance whether the dashboard
 * is showing fresh data or the last snapshot fetched from the server.
 */
export type RealtimeStatus =
  | 'connecting' // websocket open requested, no first event yet
  | 'live' // connected, events flowing
  | 'offline' // websocket closed (network down / server restart / expired token)
  | 'error'; // closed with an error we did not expect

export interface RealtimeState {
  status: RealtimeStatus;
  lastEventAt: string | null;
  reconnectCount: number;
}

const INITIAL: RealtimeState = {
  status: 'connecting',
  lastEventAt: null,
  reconnectCount: 0,
};

/**
 * Subscribe to a set of Postgres change events and surface a small state object
 * to the UI. The hook does NOT re-fetch data itself — it is a signal layer. A
 * page that wants live numbers wires `state` into a `router.refresh()` call
 * (or a query-key invalidation, once client-side caching lands).
 *
 * `tables` is the union of every table whose change should be considered
 * "freshness-relevant". `mineId` narrows the channel to one mine so a user
 * scoped to a single mine does not pay for changes on every mine in the
 * database (Supabase channels are billed by simultaneous subscribers).
 */
export function useRealtime(opts: {
  tables: readonly string[];
  mineId?: string;
  enabled?: boolean;
}): RealtimeState {
  const { tables, mineId, enabled = true } = opts;

  const [state, setState] = useState<RealtimeState>(INITIAL);

  // Stable identity so the effect does not re-subscribe on every render.
  const channelName = useMemo(
    () =>
      `command-${mineId ?? 'all'}-${tables.slice().sort().join(',')}`,
    [mineId, tables],
  );

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === 'offline' ? s : { ...s, status: 'offline' }));
      return;
    }

    let cancelled = false;
    const client = getRealtimeClient();
    const channel = client.channel(channelName);

    const applyEvent = () => {
      if (cancelled) return;
      setState((s) => ({
        status: 'live',
        lastEventAt: new Date().toISOString(),
        reconnectCount: s.reconnectCount,
      }));
    };

    const onSystemError = (payload: { error?: string }) => {
      if (cancelled) return;
      setState((s) => ({
        status: 'error',
        lastEventAt: s.lastEventAt,
        reconnectCount: s.reconnectCount + 1,
      }));
      console.warn('[realtime] channel error', channelName, payload);
    };

    const onClosed = () => {
      if (cancelled) return;
      setState((s) => ({
        status: 'offline',
        lastEventAt: s.lastEventAt,
        reconnectCount: s.reconnectCount + 1,
      }));
    };

    // Subscribe to every table in the list. Supabase broadcasts INSERT/UPDATE/
    // DELETE; we treat any event on any of these tables as "data may have
    // changed" because the dashboard aggregates several tables in memory.
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        applyEvent,
      );
    }

    channel.on('system', { event: 'error' }, onSystemError);
    channel.subscribe((status, err) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        setState((s) => ({ ...INITIAL, status: 'live', reconnectCount: s.reconnectCount }));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onSystemError({ error: err?.message });
      } else if (status === 'CLOSED') {
        onClosed();
      }
    });

    return () => {
      cancelled = true;
      try {
        client.removeChannel(channel);
      } catch {
        /* ignore - client may already be tearing down */
      }
    };
  }, [channelName, enabled, tables]);

  return state;
}

/** A tiny helper for components that only need the boolean "am I live?". */
export function useIsRealtimeLive(opts: {
  tables: readonly string[];
  mineId?: string;
  enabled?: boolean;
}): boolean {
  return useRealtime(opts).status === 'live';
}