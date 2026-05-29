import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildKeyReport, extractJson, generateNote } from './generate';
import type { GenerateNoteArgs } from './generate';
import { callAnthropic } from './client/anthropic';
import type { NoteTemplate, Patient } from '@/types';

vi.mock('./client/anthropic');
vi.mock('@/lib/clinical/prompts', () => ({
  buildUserPrompt: vi.fn().mockReturnValue('mock user prompt'),
  buildModifierBlock: vi.fn().mockReturnValue('# Length\ntight clinical prose'),
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
  activeTranscriptTier: 't2',
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

describe('buildKeyReport', () => {
  it('reports a full match when returned keys equal template keys', () => {
    const report = buildKeyReport(mockTemplate, { subjective: 'a', plan: 'b' });
    expect(report.matched).toEqual(['subjective', 'plan']);
    expect(report.missing).toEqual([]);
    expect(report.unexpected).toEqual([]);
    expect(report.emptyMatched).toEqual([]);
  });

  it('flags a total key mismatch (returned keys, zero matched)', () => {
    const report = buildKeyReport(mockTemplate, { soap: 'x', notes: 'y' });
    expect(report.matched).toEqual([]);
    expect(report.returned).toEqual(['soap', 'notes']);
    expect(report.missing).toEqual(['subjective', 'plan']);
    expect(report.unexpected).toEqual(['soap', 'notes']);
  });

  it('reports missing and unexpected keys on a partial match', () => {
    const report = buildKeyReport(mockTemplate, { subjective: 'a', extra: 'z' });
    expect(report.matched).toEqual(['subjective']);
    expect(report.missing).toEqual(['plan']);
    expect(report.unexpected).toEqual(['extra']);
  });

  it('flags matched keys whose value is blank or not a string', () => {
    const report = buildKeyReport(mockTemplate, { subjective: '  ', plan: 42 });
    expect(report.emptyMatched).toEqual(['subjective', 'plan']);
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

  it('passes model and systemPrompt through to callAnthropic', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs });

    expect(mockCallAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: expect.stringContaining(mockTemplate.systemPrompt),
      }),
    );
  });

  it('passes modifier block to callAnthropic when modifiers are set', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({
      ...baseArgs,
      modifiers: {
        length: 'concise',
        clinicalDetail: [],
        codingBilling: [],
        beyondNote: [],
        customInstructions: [],
      },
    });

    expect(mockCallAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        modifierBlock: expect.stringContaining('tight clinical prose'),
      }),
    );
  });

  it('appends speaker-context section when activeTranscriptTier is t1', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, activeTranscriptTier: 't1' });

    const call = mockCallAnthropic.mock.calls[0][0];
    expect(call.system).toContain(mockTemplate.systemPrompt);
    expect(call.system).toContain('without speaker diarization');
  });

  it('appends the no-diarization note for t2 (local Whisper is not diarized)', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, activeTranscriptTier: 't2' });

    const call = mockCallAnthropic.mock.calls[0][0];
    expect(call.system).toContain(mockTemplate.systemPrompt);
    expect(call.system).toContain('does not split up the different speakers');
    expect(call.system).not.toContain('identify turns from a');
  });

  it('appends the diarization rule for t3 (Nova is diarized)', async () => {
    mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

    await generateNote({ ...baseArgs, activeTranscriptTier: 't3' });

    const call = mockCallAnthropic.mock.calls[0][0];
    expect(call.system).toContain(mockTemplate.systemPrompt);
    expect(call.system).toContain('Speaker labels');
    expect(call.system).toContain('identify turns from a');
    expect(call.system).not.toContain('does not split up the different speakers');
  });

  it.each(['t1', 't2', 't3'] as const)(
    'always appends the PII/PHI privacy rule (tier %s)',
    async (tier) => {
      mockCallAnthropic.mockResolvedValueOnce({ text: '{"subjective":"x","plan":"y"}' });

      await generateNote({ ...baseArgs, activeTranscriptTier: tier });

      const call = mockCallAnthropic.mock.calls[0][0];
      expect(call.system).toContain('never return personal identifiers (PII / PHI)');
      expect(call.system).toContain('The note must be de-identified.');
    },
  );

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
