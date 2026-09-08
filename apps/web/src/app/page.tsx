import Link from 'next/link';
import { APP_TAGLINE } from '@coalguard/config';
import { Logo } from '@/components/brand/logo';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <Logo className="text-xl" />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">MineX Command</h1>
      <p className="mt-3 max-w-xl text-secondary">{APP_TAGLINE}</p>

      <p className="mt-6 max-w-xl text-sm text-secondary">
        The command center consumes live inspection, observation, evidence and corrective-action
        data synced from MineX Field, scoped to your role and mine.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md bg-graphite-800 px-4 text-sm font-medium text-white transition-colors hover:bg-graphite-700"
        >
          Open Command Center
        </Link>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-primary transition-colors hover:bg-surface-muted"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
