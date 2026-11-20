'use client';

import { useRef, useState } from 'react';
import { GripVertical, UserRound } from 'lucide-react';
import { assignInspectionIssue } from '@/app/(command)/corrective-actions/[id]/actions';
import type { EligibleAssignee } from '@/lib/data/governance';
import { cn } from '@/lib/cn';

const ISSUE_TYPE = 'application/x-minex-inspection-issue';
const ERRORS: Record<string, string> = {
  forbidden: 'This issue can no longer be assigned.',
  due_date_invalid: 'Choose a valid due date.',
  assignee_ineligible: 'This person is no longer eligible for this mine.',
};

export function InspectionAssignment({
  inspectionId,
  issues,
  assignees,
  defaultDueDate,
}: {
  inspectionId: string;
  issues: { id: string; title: string; assigneeName: string | null }[];
  assignees: EligibleAssignee[];
  defaultDueDate: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);

  async function assign(issueId: string, person: EligibleAssignee) {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue || inFlight.current) return;
    if (!dueDate) {
      setFeedback({ error: true, text: 'Choose a due date before assigning.' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const result = await assignInspectionIssue({
        inspectionId,
        observationId: issueId,
        assigneeId: person.id,
        dueDate,
      });
      if (result.ok) {
        setSelected(null);
        setFeedback({ error: false, text: `${issue.title} assigned to ${person.fullName}.` });
      } else {
        setFeedback({
          error: true,
          text:
            ERRORS[result.error] ?? 'Assignment could not be saved. Check the issue and try again.',
        });
      }
    } catch {
      setFeedback({
        error: true,
        text: 'Could not confirm the assignment. Check the issue before trying again.',
      });
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          Drag an issue onto a person, or select the issue and then the person.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium text-primary">
          Due date
          <input
            type="date"
            value={dueDate}
            required
            disabled={pending}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="cg-label">Inspection issues</p>
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              draggable={!pending}
              disabled={pending}
              aria-pressed={selected === issue.id}
              onClick={() => setSelected(selected === issue.id ? null : issue.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(ISSUE_TYPE, issue.id);
                setSelected(issue.id);
              }}
              onDragEnd={() => setTarget(null)}
              className={cn(
                'flex w-full cursor-grab items-center gap-2 rounded-md border p-3 text-left text-sm active:cursor-grabbing disabled:cursor-wait',
                selected === issue.id
                  ? 'border-accent-600 bg-surface-muted'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span>
                {issue.title}
                <span className="mt-0.5 block text-xs text-secondary">
                  {issue.assigneeName ?? 'Unassigned'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="cg-label">Eligible assignees</p>
          {assignees.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={pending}
              aria-label={`Assign selected issue to ${person.fullName}`}
              onClick={() => {
                if (selected) void assign(selected, person);
              }}
              onDragOver={(event) => {
                if (pending || !event.dataTransfer.types.includes(ISSUE_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setTarget(person.id);
              }}
              onDragLeave={(event) => {
                if (
                  event.relatedTarget instanceof Node &&
                  event.currentTarget.contains(event.relatedTarget)
                )
                  return;
                setTarget(null);
              }}
              onDrop={(event) => {
                const issueId = event.dataTransfer.getData(ISSUE_TYPE);
                if (!issueId) return;
                event.preventDefault();
                setTarget(null);
                void assign(issueId, person);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-dashed p-3 text-left text-sm disabled:cursor-wait',
                target === person.id
                  ? 'border-accent-600 bg-surface-muted'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <UserRound className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {person.fullName}
                {person.email && person.email !== person.fullName ? (
                  <span className="block text-xs text-secondary">{person.email}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      {feedback ? (
        <p
          role={feedback.error ? 'alert' : 'status'}
          className={cn('text-sm', feedback.error ? 'text-critical-600' : 'text-safe-600')}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
