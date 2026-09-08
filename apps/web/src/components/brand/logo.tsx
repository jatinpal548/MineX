import { cn } from '@/lib/cn';

/**
 * MineX wordmark — a single horizontal lockup: dark "Mine" + blue "X".
 * `whitespace-nowrap` guarantees the "X" never wraps under "Mine".
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block whitespace-nowrap font-semibold tracking-tight', className)}>
      Mine<span className="text-[#2563eb]">X</span>
    </span>
  );
}
