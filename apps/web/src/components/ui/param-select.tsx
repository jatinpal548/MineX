'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** A single URL-param-bound <select>. Used for the dashboard mine switcher. */
export function ParamSelect({
  paramKey,
  allLabel,
  options,
}: {
  paramKey: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      value={params.get(paramKey) ?? ''}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(paramKey, e.target.value);
        else next.delete(paramKey);
        next.delete('page');
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
      className="h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none transition-colors focus:border-graphite-400"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
