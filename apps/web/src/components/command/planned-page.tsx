import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export function PlannedPage({
  kicker,
  title,
  description,
  icon,
  note,
}: {
  kicker: string;
  title: string;
  description: string;
  icon: LucideIcon;
  note: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} description={description} />
      <EmptyState icon={icon} title="Planned for a later milestone" message={note} />
    </div>
  );
}
