import { Skeleton, SkeletonTable } from './skeleton';

/**
 * Generic route-level loading placeholder. Rendered by each command route's
 * `loading.tsx` so a sidebar click paints an instant skeleton instead of
 * leaving the previous page frozen while the server component tree resolves.
 */
export function RouteSkeleton({ variant = 'table' }: { variant?: 'table' | 'map' | 'detail' }) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-64" />
        <Skeleton className="mt-2 h-3 w-80" />
      </div>

      {variant === 'map' ? (
        <div className="cg-card overflow-hidden p-0">
          <Skeleton className="h-[460px] w-full rounded-none" />
        </div>
      ) : variant === 'detail' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="cg-card space-y-3 p-5 lg:col-span-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="cg-card space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="cg-card p-5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-4 h-8 w-1/3" />
              </div>
            ))}
          </div>
          <SkeletonTable rows={8} />
        </>
      )}
    </div>
  );
}
