import type { Metadata } from 'next';
import { Settings } from 'lucide-react';
import { PlannedPage } from '@/components/command/planned-page';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <PlannedPage
      kicker="Account"
      title="Settings"
      description="Workspace and notification preferences."
      icon={Settings}
      note="Configurable settings are planned for a later milestone. Your role and organisational scope are shown on the Profile page."
    />
  );
}
