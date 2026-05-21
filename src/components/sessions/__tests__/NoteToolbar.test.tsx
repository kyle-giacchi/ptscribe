import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoteToolbar } from '../NoteToolbar';
import type { NoteTemplate, SessionModifiers } from '@/types';

const tpl: NoteTemplate = {
  id: 't1', name: 'SOAP', builtin: true, sections: [], createdAt: 0, updatedAt: 0,
  format: 'soap', systemPrompt: '',
} as NoteTemplate;

const emptyModifiers: SessionModifiers = { emphasis: [] };

const baseProps = {
  template: tpl, templates: [tpl],
  hasDraftContent: false, canGenerate: true, canRegenerate: true,
  noteExists: false, isGenerating: false,
  modifiers: emptyModifiers,
  onTemplateChange: () => {}, onManageTemplates: () => {},
  onGenerate: () => {}, onCopyNote: () => {}, onModifiersChange: () => {},
};

describe('NoteToolbar', () => {
  it('renders Modifier button as enabled', () => {
    render(<NoteToolbar {...baseProps} />);
    const modifier = screen.getByText('Modifier').closest('button')!;
    expect(modifier).not.toBeDisabled();
  });

  it('shows active count badge when modifiers are set', () => {
    render(<NoteToolbar
      {...baseProps}
      modifiers={{ tone: 'terse', emphasis: ['more_detail'] }}
    />);
    expect(screen.getByText(/Modifier · 2/)).toBeInTheDocument();
  });

  it('Generate fires onGenerate when no draft content', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar {...baseProps} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText(/Generate/).closest('button')!);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('Regenerate opens overwrite confirmation when hasDraftContent', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true}
      onGenerate={onGenerate}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    expect(screen.getByText('Replace existing note?')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('Overwrite modal confirm fires onGenerate', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true}
      onGenerate={onGenerate}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    const regenerateButtons = screen.getAllByText(/Regenerate/).map((el) => el.closest('button')!);
    fireEvent.click(regenerateButtons[regenerateButtons.length - 1]);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('Regenerate button is disabled when canRegenerate is false', () => {
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true} canRegenerate={false}
    />);
    const btn = screen.getByText(/Regenerate/).closest('button')!;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'No changes to transcript or modifiers since last generation');
  });

  it('Copy note calls onCopyNote when noteExists', () => {
    const onCopyNote = vi.fn();
    render(<NoteToolbar {...baseProps} noteExists onCopyNote={onCopyNote} />);
    fireEvent.click(screen.getByText(/Copy note/).closest('button')!);
    expect(onCopyNote).toHaveBeenCalledTimes(1);
  });
});
