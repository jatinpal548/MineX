/**
 * Mobile entry point for voice-note transcription.
 *
 * Calls the secure web route `POST /api/ai/transcribe` with the user's Supabase
 * token. No provider secret is ever in the mobile bundle. When no provider is
 * configured server-side the route returns `{ available: false }` and the UI
 * shows "Transcription unavailable" — a transcript is NEVER fabricated here.
 */
import { env, isWebApiConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface TranscribeResult {
  available: boolean;
  text?: string;
  language?: string | null;
  simulated: boolean;
  provider: string;
}

const TIMEOUT_MS = 20_000;

export async function transcribeVoiceNote(
  evidenceId: string,
  languageHint?: string | null,
): Promise<TranscribeResult> {
  if (!isWebApiConfigured) {
    return { available: false, simulated: false, provider: 'none' };
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { available: false, simulated: false, provider: 'none' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${env.webApiUrl}/api/ai/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ evidenceId, languageHint: languageHint ?? null }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return { available: false, simulated: false, provider: 'none' };
    return (await res.json()) as TranscribeResult;
  } catch {
    return { available: false, simulated: false, provider: 'none' };
  }
}
