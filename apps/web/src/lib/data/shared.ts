/** Shared helpers for the list/detail data-access modules. */

export const PAGE_SIZE = 20;

/** First element of a PostgREST embed (to-one comes back as object, to-many as array). */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function embedCount(v: unknown): number {
  const first = one(v as unknown as { count?: number } | { count?: number }[]);
  return first?.count ?? 0;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paged<T>(rows: T[], total: number, page: number, pageSize: number): Paged<T> {
  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = (Math.max(1, page) - 1) * pageSize;
  return [from, from + pageSize - 1];
}
