'use client';

import { useState, useTransition, type ReactNode } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Paperclip,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type { CorrectiveActionStatus } from '@coalguard/types';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type { CaCapabilities } from '@/lib/data/ca-permissions';
import { allowedStatusTargets } from '@/lib/data/ca-permissions';
import { CA_STATUS_META } from '@/lib/status';
import {
  addProgressNote,
  assignCorrectiveAction,
  attachClosureEvidence,
  rejectCorrectiveAction,
  submitCorrectiveAction,
  updateCorrectiveActionStatus,
  verifyCorrectiveAction,
  type ActionResult,
} from '@/app/(command)/corrective-actions/[id]/actions';

interface Assignee {
  id: string;
  fullName: string;
  email: string | null;
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: 'Your session has expired. Sign in again.',
  forbidden: 'You do not have permission to perform this action.',
  forbidden_or_wrong_state: 'You cannot verify this action, or it is no longer awaiting verification.',
  not_found: 'This corrective action is no longer available to you.',
  not_assignee_or_wrong_state: 'Only the assigned owner can submit this action, and only while it is open.',
  assignee_required: 'Select an owner.',
  assignee_ineligible: 'That user is not eligible for this mine.',
  due_date_invalid: 'Choose a valid due date.',
  closure_notes_required: 'Closure notes are required before submitting.',
  reason_required: 'A rejection reason is required.',
  note_required: 'Enter a note.',
  invalid_transition: 'That status change is not allowed from the current state.',
  already_closed: 'This corrective action is already verified and closed.',
  invalid_path: 'The uploaded file path was rejected.',
  evidence_insert_failed: 'The evidence could not be recorded. Try again.',
  update_failed: 'The change could not be saved. It may have been updated elsewhere — refresh and retry.',
  server_error: 'Something went wrong on the server. Try again.',
  invalid_request: 'Invalid request.',
  upload_failed: 'The file upload failed. Check your connection and try again.',
};

type DialogKind = 'assign' | 'status' | 'submit' | 'verify' | 'reject' | 'evidence' | 'progress';

export function GovernancePanel({
  caId,
  status,
  mineId,
  assignedToName,
  capabilities,
  assignees,
}: {
  caId: string;
  status: CorrectiveActionStatus;
  mineId: string;
  assignedToName: string | null;
  capabilities: CaCapabilities;
  assignees: Assignee[];
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setDialog(null);
      } else {
        setError(ERROR_TEXT[res.error] ?? res.error);
      }
    });
  };

  const c = capabilities;
  const nothing =
    !c.canAssign && !c.canManageStatus && !c.canSubmit && !c.canVerify && !c.canAddEvidence;

  return (
    <section className="cg-card p-0">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight text-primary">
          {c.canVerify || c.canAssign ? 'Manager actions' : 'Actions'}
        </h2>
        <p className="mt-0.5 text-xs text-secondary">
          Every action is recorded in the governance timeline.
        </p>
      </div>

      <div className="space-y-2 p-5">
        {c.isTerminal ? (
          <p className="flex items-center gap-2 text-sm text-safe-600">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            This corrective action is verified and closed.
          </p>
        ) : null}

        {!c.isTerminal && status === 'submitted' && !c.canVerify && !c.canSubmit ? (
          <p className="text-sm text-secondary">This action is awaiting manager verification.</p>
        ) : null}

        {nothing && !c.isTerminal ? (
          <p className="text-sm text-secondary">
            You have view access only. You cannot change this corrective action.
          </p>
        ) : null}

        {c.canVerify ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialog('verify')}>
              <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
              Verify &amp; close
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDialog('reject')}>
              <XCircle className="h-4 w-4" strokeWidth={2} />
              Reject
            </Button>
          </div>
        ) : null}

        {c.canAssign ? (
          <Button size="sm" variant="secondary" onClick={() => setDialog('assign')}>
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            {assignedToName ? 'Reassign owner' : 'Assign owner'}
          </Button>
        ) : null}

        {c.canManageStatus && allowedStatusTargets(status).length > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => setDialog('status')}>
            Update status
          </Button>
        ) : null}

        {c.canSubmit ? (
          <Button size="sm" variant="secondary" onClick={() => setDialog('submit')}>
            Submit for verification
          </Button>
        ) : null}

        {c.canAddEvidence ? (
          <Button size="sm" variant="ghost" onClick={() => setDialog('evidence')}>
            <Paperclip className="h-4 w-4" strokeWidth={2} />
            Add closure evidence
          </Button>
        ) : null}

        {(c.isAssignee || c.canAssign || c.canVerify) && !c.isTerminal ? (
          <Button size="sm" variant="ghost" onClick={() => setDialog('progress')}>
            Add progress note
          </Button>
        ) : null}
      </div>

      {dialog === 'assign' ? (
        <AssignDialog
          assignees={assignees}
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(assigneeId, dueDate, note) =>
            run(() => assignCorrectiveAction({ caId, assigneeId, dueDate, note }))
          }
        />
      ) : null}

      {dialog === 'status' ? (
        <StatusDialog
          current={status}
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(toStatus, note) =>
            run(() => updateCorrectiveActionStatus({ caId, toStatus, note }))
          }
        />
      ) : null}

      {dialog === 'progress' ? (
        <NoteDialog
          title="Add progress note"
          description="Record what has changed. Visible in the governance timeline."
          label="Progress note"
          confirmLabel="Add note"
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(note) => run(() => addProgressNote({ caId, note }))}
        />
      ) : null}

      {dialog === 'submit' ? (
        <NoteDialog
          title="Submit for verification"
          description="Summarise the work done. The manager will review this before verifying."
          label="Closure notes"
          confirmLabel="Submit"
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(note) => run(() => submitCorrectiveAction({ caId, closureNotes: note }))}
        />
      ) : null}

      {dialog === 'verify' ? (
        <ConfirmDialog
          title="Verify and close this corrective action?"
          description="Confirm the closure evidence and notes are acceptable. This marks the action verified and closed."
          confirmLabel="Verify & close"
          optionalNoteLabel="Verification note (optional)"
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(note) => run(() => verifyCorrectiveAction({ caId, note }))}
        />
      ) : null}

      {dialog === 'reject' ? (
        <NoteDialog
          title="Reject this corrective action"
          description="The owner will be asked to rework it. A reason is required."
          label="Rejection reason"
          confirmLabel="Reject"
          danger
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(() => rejectCorrectiveAction({ caId, reason }))}
        />
      ) : null}

      {dialog === 'evidence' ? (
        <EvidenceDialog
          caId={caId}
          mineId={mineId}
          pending={pending}
          error={error}
          setError={setError}
          onClose={() => setDialog(null)}
          onAttach={(payload) => run(() => attachClosureEvidence(payload))}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------- dialogs --------------------------- */

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-graphite-950/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface shadow-overlay">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-secondary">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-sm text-critical-600">{error}</p>
  );
}

function DialogActions({
  pending,
  confirmLabel,
  danger,
  disabled,
  onClose,
}: {
  pending: boolean;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" size="sm" variant={danger ? 'danger' : 'primary'} disabled={pending || disabled}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : null}
        {confirmLabel}
      </Button>
    </div>
  );
}

const fieldCls =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-graphite-400';

function AssignDialog({
  assignees,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  assignees: Assignee[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (assigneeId: string, dueDate: string, note: string) => void;
}) {
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      title="Assign corrective action"
      description="Set the responsible owner and a due date."
      onClose={onClose}
    >
      {assignees.length === 0 ? (
        <p className="text-sm text-secondary">
          No eligible assignees. A user must hold a role at this mine before they can be assigned.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(assigneeId, dueDate, note);
          }}
        >
          <label className="block text-sm">
            <span className="cg-label">Owner</span>
            <select
              required
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={fieldCls}
            >
              <option value="">Select a user…</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                  {a.email ? ` — ${a.email}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <span className="cg-label">Due date</span>
            <input
              type="date"
              required
              min={today}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldCls}
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="cg-label">Assignment note (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={fieldCls}
              placeholder="Context for the owner…"
            />
          </label>

          <ErrorLine error={error} />
          <DialogActions
            pending={pending}
            confirmLabel="Assign"
            disabled={!assigneeId || !dueDate}
            onClose={onClose}
          />
        </form>
      )}
    </Modal>
  );
}

function StatusDialog({
  current,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  current: CorrectiveActionStatus;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (to: CorrectiveActionStatus, note: string) => void;
}) {
  const targets = allowedStatusTargets(current);
  const [to, setTo] = useState<CorrectiveActionStatus | ''>(targets[0] ?? '');
  const [note, setNote] = useState('');

  return (
    <Modal title="Update status" description={`Current status: ${CA_STATUS_META[current].label}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (to) onSubmit(to, note);
        }}
      >
        <label className="block text-sm">
          <span className="cg-label">New status</span>
          <select
            required
            value={to}
            onChange={(e) => setTo(e.target.value as CorrectiveActionStatus)}
            className={fieldCls}
          >
            {targets.map((t) => (
              <option key={t} value={t}>
                {CA_STATUS_META[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="cg-label">Note (optional)</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldCls}
          />
        </label>
        <ErrorLine error={error} />
        <DialogActions pending={pending} confirmLabel="Update" disabled={!to} onClose={onClose} />
      </form>
    </Modal>
  );
}

function NoteDialog({
  title,
  description,
  label,
  confirmLabel,
  danger,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(note);
        }}
      >
        <label className="block text-sm">
          <span className="cg-label">{label}</span>
          <textarea
            rows={4}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldCls}
            autoFocus
          />
        </label>
        <ErrorLine error={error} />
        <DialogActions
          pending={pending}
          confirmLabel={confirmLabel}
          danger={danger}
          disabled={note.trim().length === 0}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  optionalNoteLabel,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  optionalNoteLabel: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(note);
        }}
      >
        <label className="block text-sm">
          <span className="cg-label">{optionalNoteLabel}</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldCls}
          />
        </label>
        <ErrorLine error={error} />
        <DialogActions pending={pending} confirmLabel={confirmLabel} onClose={onClose} />
      </form>
    </Modal>
  );
}

function EvidenceDialog({
  caId,
  mineId,
  pending,
  error,
  setError,
  onClose,
  onAttach,
}: {
  caId: string;
  mineId: string;
  pending: boolean;
  error: string | null;
  setError: (s: string | null) => void;
  onClose: () => void;
  onAttach: (payload: {
    caId: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
  }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${mineId}/corrective-actions/${caId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('evidence')
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setError('The file upload failed. Check your connection and try again.');
        return;
      }
      onAttach({
        caId,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size ?? null,
      });
    } finally {
      setUploading(false);
    }
  };

  const busy = pending || uploading;

  return (
    <Modal
      title="Add closure evidence"
      description="Attach a photo or document as evidence for this corrective action."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:text-primary"
        />
        <p className="mt-2 text-xs text-secondary">
          Uploaded from the Command Center — not marked as field-captured, no GPS.
        </p>
        <ErrorLine error={error} />
        <DialogActions
          pending={busy}
          confirmLabel={uploading ? 'Uploading…' : 'Attach'}
          disabled={!file}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}
