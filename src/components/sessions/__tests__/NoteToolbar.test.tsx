import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoteToolbar } from '../NoteToolbar';
import type { NoteTemplate } from '@/types';

const tpl: NoteTemplate = {
  id: 't1', name: 'SOAP', builtin: true, sections: [], createdAt: 0, updatedAt: 0,
  format: 'soap', systemPrompt: '',
} as NoteTemplate;

describe('NoteToolbar', () => {
  it('renders Modifier button as aria-disabled', () => {
    render(<NoteToolbar
      template={tpl} templates={[tpl]}
      hasDraftContent={false} canGenerate noteExists={false} isGenerating={false}
      onTemplateChange={() => {}} onManageTemplates={() => {}}
      onGenerate={() => {}} onCopyNote={() => {}}
    />);
    const modifier = screen.getByText('Modifier').closest('button')!;
    expect(modifier).toHaveAttribute('aria-disabled', 'true');
    expect(modifier).toBeDisabled();
  });

  it('Generate fires onGenerate when no draft content', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      template={tpl} templates={[tpl]}
      hasDraftContent={false} canGenerate noteExists isGenerating={false}
      onTemplateChange={() => {}} onManageTemplates={() => {}}
      onGenerate={onGenerate} onCopyNote={() => {}}
    />);
    fireEvent.click(screen.getByText(/Generate/).closest('button')!);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('Regenerate opens overwrite confirmation when hasDraftContent', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar
      template={tpl} templates={[tpl]}
      hasDraftContent canGenerate noteExists isGenerating={false}
      onTemplateChange={() => {}} onManageTemplates={() => {}}
      onGenerate={onGenerate} onCopyNote={() => {}}
    />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    expect(screen.getByText('Replace existing note?')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('Copy note calls onCopyNote when noteExists', () => {
    const onCopyNote = vi.fn();
    render(<NoteToolbar
      template={tpl} templates={[tpl]}
      hasDraftContent={false} canGenerate noteExists isGenerating={false}
      onTemplateChange={() => {}} onManageTemplates={() => {}}
      onGenerate={() => {}} onCopyNote={onCopyNote}
    />);
    fireEvent.click(screen.getByText(/Copy note/).closest('button')!);
    expect(onCopyNote).toHaveBeenCalledTimes(1);
  });
});
