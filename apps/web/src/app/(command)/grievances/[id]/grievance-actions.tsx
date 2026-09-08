'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MessageSquare, Search } from 'lucide-react';
import type { GrievanceStatus } from '@coalguard/types';
import { Button } from '@/components/ui/button';
import {
  acknowledgeGrievance,
  closeGrievance,
  resolveGrievance,
  startGrievanceReview,
  type ActionResult,
} from './actions';

const ERR: Record<string, string> = {
  unauthorized: 'Your session has expired. Sign in again.',
  forbidden: 'You do not have permission to manage grievances.',
  not_found: 'This grievance is no longer available to you.',
  invalid_transition: 'That status change is not allowed from the current state.',
  note_required: 'A resolution note of at least 5 characters is required.',
  update_failed: 'The change could not be saved — refresh and retry.',
  server_error: 'Something went wrong on the server. Try again.',
  invalid_request: 'Invalid request.',
};

export function GrievanceActions({
  id,
  status,
  canManage,
}: {
  id: string;
  status: GrievanceStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'resolve' | 'close'>(null);
  const [note, setNote] = useState('');

  if (!canManage) {
    return (
      <p className="text-sm text-secondary">
        You have read-only access to this grievance. Status changes are made by the HR officer or
        mine manager.
      </p>
    );
  }
  if (status === 'closed') {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-safe-600">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Grievance closed.
      </p>
    );
  }

  const run = (fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setDialog(null);
        setNote('');
        router.refresh();
      } else {
        setError(ERR[res.error] ?? res.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === 'open' ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => acknowledgeGrievance(id))}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Acknowledge
          </Button>
        ) : null}
        {status === 'acknowledged' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => startGrievanceReview(id))}
          >
            <Search className="h-4 w-4" strokeWidth={2} />
            Start Review
          </Button>
        ) : null}
        {(status === 'acknowledged' || status === 'investigating') && dialog !== 'resolve' ? (
          <Button size="sm" disabled={pending} onClick={() => setDialog('resolve')}>
            <MessageSquare className="h-4 w-4" strokeWidth={2} />
            Resolve
          </Button>
        ) : null}
        {status === 'resolved' && dialog !== 'close' ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog('close')}>
            Close
          </Button>
        ) : null}
      </div>

      {dialog === 'resolve' ? (
        <div className="rounded-md border border-border p-3">
          <label className="cg-label" htmlFor="grv-resolve">
            Resolution note (required)
          </label>
          <textarea
            id="grv-resolve"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-graphite-400"
            placeholder="What was done to resolve the grievance?"
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={pending || note.trim().length < 5}
              onClick={() => run(() => resolveGrievance(id, note))}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mark Resolved
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {dialog === 'close' ? (
        <div className="rounded-md border border-border p-3">
          <label className="cg-label" htmlFor="grv-close">
            Closing note (optional)
          </label>
          <textarea
            id="grv-close"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-graphite-400"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => closeGrievance(id, note))}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Close Grievance
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-critical-600">{error}</p> : null}
    </div>
  );
}
