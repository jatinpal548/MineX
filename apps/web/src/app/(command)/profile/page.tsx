import type { Metadata } from 'next';
import { getRoleDefinition } from '@coalguard/config';
import { getCommandContext } from '@/lib/data/context';
import { PageHeader } from '@/components/ui/page-header';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { initialsOf } from '@/lib/format';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const context = await getCommandContext();
  if (!context) return null;

  const { user } = context;
  const name = user.profile?.full_name || user.email;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Account" title="Profile" description="Your identity, roles and access scope." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Identity" className="lg:col-span-1">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-graphite-800 text-sm font-bold text-white">
              {initialsOf(name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-primary">{name}</p>
              <p className="truncate text-xs text-secondary">{user.email}</p>
            </div>
          </div>
          <dl className="mt-4">
            <DefinitionRow label="Primary role">{context.primaryRoleLabel}</DefinitionRow>
            <DefinitionRow label="Scope">{context.scopeLabel}</DefinitionRow>
            <DefinitionRow label="Context">{context.scopeKicker}</DefinitionRow>
            <DefinitionRow label="Employee code">
              {user.profile?.employee_code ?? '--'}
            </DefinitionRow>
            <DefinitionRow label="Account">
              {user.profile?.is_active === false ? (
                <Badge tone="critical">Inactive</Badge>
              ) : (
                <Badge tone="safe">Active</Badge>
              )}
            </DefinitionRow>
          </dl>
        </Panel>

        <Panel
          title="Roles & scope"
          description="From role_assignments — enforced by database RLS."
          className="lg:col-span-2"
        >
          {user.roles.length === 0 ? (
            <p className="text-sm text-secondary">No roles assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {user.roles.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-primary">
                      {getRoleDefinition(r.role).label}
                    </p>
                    <p className="text-xs text-secondary">
                      {getRoleDefinition(r.role).description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.is_primary ? <Badge tone="neutral">Primary</Badge> : null}
                    <Badge tone="info">{r.scope_level}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5">
            <p className="cg-label mb-2">Effective permissions</p>
            {user.permissions.length === 0 ? (
              <p className="text-sm text-secondary">None.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.map((p) => (
                  <Badge key={p} tone="neutral" className="font-mono text-[11px]">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
