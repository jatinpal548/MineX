import Link from 'next/link';
import { cn } from '@/lib/cn';

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cg-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-border bg-surface-muted/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-secondary',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b border-border px-4 py-3 align-middle text-primary',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="transition-colors hover:bg-surface-muted/70">{children}</tr>;
}

/** Primary cell content that navigates to the row's detail page. */
export function CellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
    >
      {children}
    </Link>
  );
}
