import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoteToolbar } from '../NoteToolbar';
import type { NoteTemplate, SessionModifiers } from '@/types';

const tpl: NoteTemplate = {
  id: 't1', name: 'SOAP', builtin: true, sections: [], createdAt: 0, updatedAt: 0,
  format: 'soap', systemPrompt: '',
} as NoteTemplate;

const emptyModifiers: SessionModifiers = { clinicalDetail: [], codingBilling: [], beyondNote: [], customInstructions: [] };

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
      modifiers={{ voice: '1st_person', clinicalDetail: ['pertinent_negatives'], codingBilling: [], beyondNote: [], customInstructions: [] }}
    />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('Generate fires onGenerate when no draft content', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar {...baseProps} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText(/Generate/).closest('button')!);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith('replace');
  });

  it('Regenerate opens append/replace confirmation when hasDraftContent', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true}
      onGenerate={onGenerate}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    expect(screen.getByText('This note already has content')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('Replace button in modal fires onGenerate with replace mode', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true}
      onGenerate={onGenerate}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /Replace/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith('replace');
  });

  it('Append button in modal fires onGenerate with append mode', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      {...baseProps}
      hasDraftContent canGenerate noteExists={true}
      onGenerate={onGenerate}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith('append');
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
