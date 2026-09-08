/**
 * Audio transcription contract. SERVER-SIDE ONLY (reads secret env).
 *
 * A concrete provider is chosen at runtime from `TRANSCRIBE_PROVIDER`. Phase 0
 * ships only `none` — it returns `{ available: false }` so the app can show
 * "Transcription unavailable" and NEVER fabricates a transcript.
 *
 * To add a real provider later:
 *   TRANSCRIBE_PROVIDER=whisper   TRANSCRIBE_API_KEY=...
 * and add a `case 'whisper':` below returning a class that POSTs the audio.
 * The rest of the codebase does not change.
 */

export interface TranscriptionInput {
  /** Signed URL or bytes of the recorded audio (m4a). */
  audioUrl?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  /** Optional language hint (e.g. 'hi', 'en'); providers may ignore it. */
  languageHint?: string | null;
}

export interface TranscriptionResult {
  available: boolean;
  /** Present only when `available` is true. Preserves the spoken language. */
  text?: string;
  /** Detected language when the provider reports it. Never translated. */
  language?: string | null;
  /** true => a mock/demo provider produced this (label it in the UI). */
  simulated: boolean;
  provider: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribeAudio(input: TranscriptionInput): Promise<TranscriptionResult>;
}

/** No provider configured. Honest "unavailable" — never a fake transcript. */
class NoTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'none';
  async transcribeAudio(): Promise<TranscriptionResult> {
    return { available: false, simulated: false, provider: 'none' };
  }
}

let singleton: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (singleton) return singleton;
  const provider = (process.env.TRANSCRIBE_PROVIDER ?? 'none').toLowerCase();
  switch (provider) {
    // case 'whisper': singleton = new WhisperProvider(); return singleton;
    case 'none':
    default:
      singleton = new NoTranscriptionProvider();
      return singleton;
  }
}

/** For tests. */
export function __resetTranscriptionProvider(): void {
  singleton = null;
}
