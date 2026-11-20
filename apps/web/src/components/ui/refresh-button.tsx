'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Re-runs the current server component tree (picks up data synced from the
 * mobile app). `router.refresh()` fetches a fresh copy of the current route.
 */
export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-primary transition-colors hover:bg-surface-muted',
        'disabled:opacity-60',
      )}
    >
      <RotateCw className={cn('h-4 w-4', pending && 'animate-spin')} strokeWidth={1.75} />
      <span>{pending ? 'Refreshing' : label}</span>
    </button>
  );
}
