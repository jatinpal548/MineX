import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeObservation, classifyRisk, getLlmProvider } from '@coalguard/ai';
import { publicEnv } from '@/lib/env';

/**
 * POST /api/ai/classify-risk
 *
 * Secure server-side entry point for the mobile app's AI risk analysis.
 * - The mobile client sends its Supabase access token in `Authorization`.
 * - We verify it, then call the server-only `@coalguard/ai` abstraction.
 * - Any real AI provider key stays on the server; the mobile bundle never sees it.
 *
 * With `AI_PROVIDER=mock` this returns the deterministic heuristic, flagged
 * `simulated: true` so the app can label it clearly.
 */
export const dynamic = 'force-dynamic';

interface Body {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  mineType?: unknown;
  context?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(request: Request) {
  // 1. Authenticate the caller with their Supabase token.
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 });
  }
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  // 2. Validate the request body.
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const title = asString(body.title);
  if (!title) {
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  }

  // 3. Run the analysis through the shared abstraction.
  try {
    const provider = getLlmProvider();
    const input = {
      title,
      description: asString(body.description),
      category: asString(body.category),
      mineType: asString(body.mineType),
      context: asString(body.context),
    };
    const result = await classifyRisk(input);
    // Enrich with a plain-language consequence + single recommended action.
    // Deterministic and free; safe even when a real model produced `result`.
    const { consequence, recommendedAction } = analyzeObservation(input);

    return NextResponse.json({
      ...result,
      consequence,
      recommendedAction,
      provider: provider.name,
      model: provider.model,
    });
  } catch {
    return NextResponse.json(
      { error: 'Risk analysis is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
