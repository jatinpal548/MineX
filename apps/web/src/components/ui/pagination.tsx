'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: number) => {
    const p = new URLSearchParams(params.toString());
    if (next <= 1) p.delete('page');
    else p.set('page', String(next));
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-secondary">
      <p className="tabular-nums">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface transition-colors hover:bg-surface-muted',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= pageCount}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface transition-colors hover:bg-surface-muted',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
