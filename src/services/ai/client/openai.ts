/**
 * Minimal browser-side OpenAI Whisper client.
 *
 * The user supplies their own API key in Settings; the call goes
 * directly from the browser to api.openai.com. We do NOT proxy through
 * any server we operate. This is intentional — see the Setup disclaimer.
 */

export interface WhisperArgs {
  apiKey: string;
  model: string; // e.g. 'whisper-1'
  audio: Blob;
  language?: string; // ISO-639-1 hint
  prompt?: string; // up to 224 tokens of biasing context
  signal?: AbortSignal;
}

export interface WhisperResult {
  text: string;
}

export async function transcribeWithOpenAI(args: WhisperArgs): Promise<WhisperResult> {
  if (!args.apiKey) {
    throw new Error('OpenAI API key is missing. Add one in Settings.');
  }
  const form = new FormData();
  // OpenAI requires a filename + extension that hints at the audio container.
  const filename = blobFilename(args.audio);
  form.append('file', args.audio, filename);
  form.append('model', args.model || 'whisper-1');
  if (args.language) form.append('language', args.language);
  if (args.prompt) form.append('prompt', args.prompt);
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await safeReadText(res);
    throw new Error(`Whisper request failed (${res.status}): ${errBody || res.statusText}`);
  }
  const data = (await res.json()) as { text?: string };
  if (typeof data.text !== 'string') {
    throw new Error('Whisper response missing `text` field');
  }
  return { text: data.text };
}

function blobFilename(blob: Blob): string {
  const type = blob.type || '';
  if (type.includes('webm')) return 'audio.webm';
  if (type.includes('ogg')) return 'audio.ogg';
  if (type.includes('mp4') || type.includes('m4a')) return 'audio.m4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
  if (type.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
