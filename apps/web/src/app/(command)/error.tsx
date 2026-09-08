'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CommandError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[command]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-critical-bg text-critical-600">
        <TriangleAlert className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-primary">Something went wrong</h1>
      <p className="mt-1 max-w-sm text-sm text-secondary">
        This view could not load its data. Your session is still active — try again.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
