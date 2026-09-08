import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTranscriptionProvider } from '@coalguard/ai';
import { publicEnv } from '@/lib/env';

/**
 * POST /api/ai/transcribe   { evidenceId: string, languageHint?: string }
 *
 * Server-side transcription entry point for the mobile app.
 *  1. Verify the caller's Supabase token.
 *  2. Load the `evidence` row through THEIR token (RLS decides if they may see
 *     it) - so a user can only transcribe audio in their own mine scope.
 *  3. Sign a short-lived URL for the audio and hand it to the transcription
 *     provider. Provider secrets never leave the server.
 *
 * With no provider configured this returns `{ available: false }` and the app
 * shows "Transcription unavailable". It NEVER fabricates a transcript.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 });
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  // scoped client bound to the caller's JWT — RLS applies to every query below
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  let body: { evidenceId?: unknown; languageHint?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId : '';
  if (!evidenceId) {
    return NextResponse.json({ error: 'evidenceId is required.' }, { status: 400 });
  }
  const languageHint = typeof body.languageHint === 'string' ? body.languageHint : null;

  // 2. authorisation: can this user see this voice-note evidence row?
  const { data: ev, error: evErr } = await supabase
    .from('evidence')
    .select('id, storage_path, evidence_type')
    .eq('id', evidenceId)
    .eq('evidence_type', 'voice_note')
    .maybeSingle();
  if (evErr || !ev) {
    return NextResponse.json({ error: 'Voice note not found or not accessible.' }, { status: 403 });
  }

  // 3. sign + transcribe
  try {
    const { data: signed } = await supabase.storage
      .from('evidence')
      .createSignedUrl(ev.storage_path as string, 600);

    const provider = getTranscriptionProvider();
    const result = await provider.transcribeAudio({
      audioUrl: signed?.signedUrl,
      mimeType: 'audio/m4a',
      languageHint,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ available: false, simulated: false, provider: 'none' });
  }
}
