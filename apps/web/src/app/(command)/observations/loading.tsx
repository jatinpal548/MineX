import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-56" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <SkeletonTable rows={8} />
    </div>
  );
}
