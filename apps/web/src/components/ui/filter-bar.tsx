'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

export interface FilterSelect {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function FilterBar({
  searchKey = 'q',
  searchPlaceholder = 'Search…',
  selects = [],
  showSearch = true,
}: {
  searchKey?: string;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  showSearch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [term, setTerm] = useState(params.get(searchKey) ?? '');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep local input in sync if the URL changes elsewhere (e.g. Clear all)
  useEffect(() => {
    setTerm(params.get(searchKey) ?? '');
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [params, searchKey]);

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      next.delete('page'); // any filter change resets pagination
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const onSearchChange = (value: string) => {
    setTerm(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      push((next) => {
        if (value.trim()) next.set(searchKey, value.trim());
        else next.delete(searchKey);
      });
    }, 300);
  };

  const activeCount =
    (showSearch && params.get(searchKey) ? 1 : 0) +
    selects.filter((s) => params.get(s.key)).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSearch ? (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary"
            strokeWidth={1.75}
          />
          <input
            value={term}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-graphite-400"
          />
        </div>
      ) : null}

      {selects.map((s) => (
        <select
          key={s.key}
          value={params.get(s.key) ?? ''}
          onChange={(e) =>
            push((next) => {
              if (e.target.value) next.set(s.key, e.target.value);
              else next.delete(s.key);
            })
          }
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none transition-colors focus:border-graphite-400"
        >
          <option value="">{s.label}: all</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}

      {activeCount > 0 ? (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-secondary transition-colors hover:text-primary"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Clear
        </button>
      ) : null}
    </div>
  );
}
