'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="cg-label">Work email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-graphite-400"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="cg-label">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-graphite-400"
        />
      </label>

      {error ? (
        <p className="rounded-md bg-critical-bg px-3 py-2 text-sm text-critical-600">{error}</p>
      ) : null}

      <Button type="submit" disabled={loading} className="mt-2">
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
