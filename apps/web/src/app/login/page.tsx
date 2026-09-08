import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Logo } from '@/components/brand/logo';
import { SignInForm } from '@/components/auth/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-graphite-900 p-10 text-paper-50 lg:flex">
        <Logo className="text-lg text-paper-50" />
        <div>
          <p className="text-2xl font-semibold leading-snug">
            Field-to-boardroom compliance intelligence for the coal mining ecosystem.
          </p>
          <p className="mt-4 max-w-md text-sm text-graphite-300">
            Inspections, evidence, AI risk analysis, corrective actions and audit trails — one
            governed system across every mine, region and subsidiary.
          </p>
        </div>
        <p className="text-xs text-graphite-400">Phase 0 · Foundation build</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="text-lg" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to MineX Command</h1>
          <p className="mt-1 text-sm text-secondary">
            Use the demo credentials created in your Supabase project.
          </p>
          <div className="mt-6">
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
