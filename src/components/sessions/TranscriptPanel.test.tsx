import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TranscriptPanel } from './TranscriptPanel';

const base = {
  transcript: 'hello world',
  clips: [],
  transcribing: false,
  hasUserEdits: false,
  hasT2Transcript: true,
  hasT3Transcript: false,
  totalDurationSec: 60,
  collapsed: false,
  onCollapse: () => {},
  onChange: () => {},
  onCommit: () => {},
  onCreateTranscript: () => {},
  onRevertToLocal: () => {},
};

describe('TranscriptPanel Improve-with-AI in demo mode', () => {
  it('shows a disabled Improve button with a demo tooltip when cloudDisabledReason is set', () => {
    render(
      <TranscriptPanel
        {...base}
        canImproveWithAI
        cloudDisabledReason="Cloud transcription is disabled in demo mode."
      />,
    );
    const btn = screen.getByRole('button', { name: /improve with ai/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Cloud transcription is disabled in demo mode.');
  });
});
