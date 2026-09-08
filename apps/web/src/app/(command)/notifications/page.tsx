import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'info' | 'warning' | 'critical'> = {
  info: 'info',
  warning: 'warning',
  high: 'warning',
  critical: 'critical',
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, priority, status, category, action_url, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as {
    id: string;
    title: string;
    body: string | null;
    priority: string;
    status: string;
    category: string | null;
    action_url: string | null;
    created_at: string;
  }[];

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Account"
        title="Notifications"
        description="Alerts addressed to you (from the notifications table)."
      />
      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            message="You have no notifications right now."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className="flex items-start gap-3 p-4">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.status === 'unread' ? 'bg-accent-500' : 'bg-border'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary">{n.title}</p>
                    <Badge tone={TONE[n.priority] ?? 'neutral'}>{n.priority}</Badge>
                  </div>
                  {n.body ? <p className="mt-0.5 text-sm text-secondary">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-secondary">
                    {n.category ? `${n.category} · ` : ''}
                    {formatRelative(n.created_at)}
                  </p>
                </div>
                {n.action_url ? (
                  <Link
                    href={n.action_url}
                    className="shrink-0 text-xs font-medium text-accent-600 hover:underline"
                  >
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
