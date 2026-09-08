/**
 * Holds the ONE active inspection draft while the inspector moves between the
 * checklist, observation and review screens.
 *
 * All reads/writes go through `offlineRepo` (Milestone 2B-2): writes land in
 * SQLite + the sync queue instantly and reconcile with Supabase when online, so
 * a killed app resumes from disk and capture never blocks on the network.
 * `load()` reconstructs the draft from the server (online) or the local
 * snapshot + un-synced edits (offline).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ChecklistResponse, DraftObservation, InspectionDraft } from './types';
import { loadDraftOffline, saveResponsesOffline, submitInspectionOffline } from './offlineRepo';

interface InspectionContextValue {
  draft: InspectionDraft | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  load: (inspectionId: string) => Promise<void>;
  setResponse: (itemId: string, response: ChecklistResponse) => void;
  setNotes: (itemId: string, notes: string) => void;
  saveProgress: () => Promise<boolean>;
  mergeObservation: (obs: DraftObservation) => void;
  submit: () => Promise<{ draft: InspectionDraft; synced: boolean } | null>;
  clear: () => void;
}

const InspectionCtx = createContext<InspectionContextValue | undefined>(undefined);

export function InspectionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedId = useRef<string | null>(null);

  const load = useCallback(async (inspectionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadDraftOffline(inspectionId);
      setDraft(next);
      loadedId.current = inspectionId;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the inspection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const setResponse = useCallback((itemId: string, response: ChecklistResponse) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            items: d.items.map((it) => (it.id === itemId ? { ...it, response } : it)),
          }
        : d,
    );
  }, []);

  const setNotes = useCallback((itemId: string, notes: string) => {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, notes } : it)) } : d,
    );
  }, []);

  const saveProgress = useCallback(async () => {
    if (!draft) return false;
    setSaving(true);
    setError(null);
    try {
      await saveResponsesOffline(draft.id, draft.items);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const mergeObservation = useCallback((obs: DraftObservation) => {
    setDraft((d) => {
      if (!d) return d;
      const others = d.observations.filter((o) => o.id !== obs.id);
      return {
        ...d,
        observations: [...others, obs],
        items: d.items.map((it) =>
          it.id === obs.inspectionItemId ? { ...it, observationId: obs.id } : it,
        ),
      };
    });
  }, []);

  const submit = useCallback(async () => {
    if (!draft) return null;
    setSaving(true);
    setError(null);
    try {
      const result = await submitInspectionOffline(draft);
      const submittedDraft: InspectionDraft = { ...draft, status: 'submitted' };
      setDraft(submittedDraft);
      return { draft: submittedDraft, synced: result.synced };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the inspection.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const clear = useCallback(() => {
    setDraft(null);
    setError(null);
    loadedId.current = null;
  }, []);

  const value = useMemo<InspectionContextValue>(
    () => ({
      draft,
      loading,
      saving,
      error,
      load,
      setResponse,
      setNotes,
      saveProgress,
      mergeObservation,
      submit,
      clear,
    }),
    [
      draft,
      loading,
      saving,
      error,
      load,
      setResponse,
      setNotes,
      saveProgress,
      mergeObservation,
      submit,
      clear,
    ],
  );

  return <InspectionCtx.Provider value={value}>{children}</InspectionCtx.Provider>;
}

export function useInspection(): InspectionContextValue {
  const ctx = useContext(InspectionCtx);
  if (!ctx) throw new Error('useInspection must be used inside <InspectionProvider>');
  return ctx;
}
