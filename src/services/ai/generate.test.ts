import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractJson, generateNote } from './generate';
import type { GenerateNoteArgs } from './generate';
import { callAnthropic } from './client/anthropic';
import type { NoteTemplate, Patient } from '@/types';

vi.mock('./client/anthropic');
vi.mock('@/lib/clinical/prompts', () => ({
  buildUserPrompt: vi.fn().mockReturnValue('mock user prompt'),
}));

const mockCallAnthropic = vi.mocked(callAnthropic);

const mockTemplate = {
  systemPrompt: 'You are a PT assistant.',
  sections: [
    { key: 'subjective', label: 'Subjective', defaultContent: '' },
    { key: 'plan', label: 'Plan', defaultContent: '' },
  ],
} as unknown as NoteTemplate;

const mockPatient = { id: 'p-1', name: 'Jane Doe' } as unknown as Patient;

const baseArgs: GenerateNoteArgs = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  template: mockTemplate,
  transcript: 'Patient presents with knee pain.',
  patient: mockPatient,
  transcriptSource: 'whisper',
};

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    const result = extractJson('{"soap": "text here", "plan": "do x"}');
    expect(result).toEqual({ soap: 'text here', plan: 'do x' });
  });

  it('extracts JSON wrapped in a markdown code fence', () => {
    const result = extractJson('Here is the note:\n```json\n{"soap": "value"}\n```');
    expect(result).toEqual({ soap: 'value' });
  });

  it('extracts JSON wrapped in a plain code fence (no language tag)', () => {
    const result = extractJson('```\n{"key": "val"}\n```');
    expect(result).toEqual({ key: 'val' });
  });

  it('strips leading prose before the opening brace', () => {
    const result = extractJson('Sure, here is the output: {"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  it('strips trailing prose after the closing brace', () => {
    const result = extractJson('{"a": 1} Let me know if you need changes.');
    expect(result).toEqual({ a: 1 });
  });

  it('handles nested objects correctly', () => {
    const result = extractJson('{"outer": {"inner": "val"}}');
    expect(result).toEqual({ outer: { inner: 'val' } });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('No JSON here at all.')).toThrow(
      'AI response did not contain a JSON object',
    );
  });

  it('throws when the JSON is malformed', () => {
    expect(() => extractJson('{bad json}')).toThrow('Failed to parse AI JSON');
  });

  it('throws on an empty string', () => {
    expect(() => extractJson('')).toThrow('AI response did not contain a JSON object');
  });
});

describe('generateNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps sections from the template using the JSON keys in the model response', async () => {
    mockCallAnthropic.mockResolvedValueOnce({
      text: '{"subjective":"knee pain on flexion","plan":"strengthening exercises"}',
    });

    const result = await generateNote(baseArgs);

    expect(result.sections).toEqual([
      { key: 'subjective', label: 'Subjective', body: 'knee pain on flexion' },
      { key: 'plan', label: 'Plan', body: 'strengthening exercises' },
    ]);
  });

  it('sets body to empty string when the model omits a section key', async () => {
    mockCallAnthropic.mockResolvedValueOnce({
      text: '{"subjective":"knee pain"}',
    });

    const result = await generateNote(baseArgs);

    expect(result.sections[0].body).toBe('knee pain');
    expect(result.sections[1].body).toBe('');
  });

  it('passes model, systemPrompt, and toneStyle through to callAnthropic', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, toneStyle: 'terse' });

    expect(mockCallAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: mockTemplate.systemPrompt,
        toneStyle: 'terse',
      }),
    );
  });

  it('appends speaker-context section when transcriptSource is not whisper', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, transcriptSource: 'webspeech' });

    const call = mockCallAnthropic.mock.calls[0][0];
    expect(call.system).toContain(mockTemplate.systemPrompt);
    expect(call.system).toContain('without speaker diarization');
  });

  it('does not append speaker-context section when transcriptSource is whisper', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, transcriptSource: 'whisper' });

    expect(mockCallAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ system: mockTemplate.systemPrompt }),
    );
  });

  it('throws for the "none" provider', async () => {
    await expect(generateNote({ ...baseArgs, provider: 'none' })).rejects.toThrow(
      'AI generation is disabled',
    );
  });

  it('throws for an unknown provider', async () => {
    await expect(
      generateNote({ ...baseArgs, provider: 'bogus' as GenerateNoteArgs['provider'] }),
    ).rejects.toThrow('Unknown generation provider: bogus');
  });
});
