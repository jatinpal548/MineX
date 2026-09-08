import { redirect } from 'next/navigation';
import { getCommandContext } from '@/lib/data/context';
import { CommandShell } from '@/components/command/command-shell';

// Auth-gated + cookie-dependent: never statically prerender.
export const dynamic = 'force-dynamic';

export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const context = await getCommandContext();
  if (!context) redirect('/login');

  return (
    <CommandShell
      context={{
        scopeLabel: context.scopeLabel,
        scopeKicker: context.scopeKicker,
        user: {
          name: context.user.profile?.full_name || context.user.email,
          email: context.user.email,
          roleLabel: context.primaryRoleLabel,
        },
        permissions: context.user.permissions,
      }}
    >
      {children}
    </CommandShell>
  );
}
