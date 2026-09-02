import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoteToolbar } from '../NoteToolbar';
import type { Note, NoteTemplate, Patient, SessionModifiers } from '@/types';

vi.mock('@/contexts/ClinicianProvider', () => ({
  useClinician: () => ({ clinician: { name: 'Dr. Test', credentials: 'DPT' } }),
}));

const tpl: NoteTemplate = {
  id: 't1',
  name: 'SOAP',
  builtin: true,
  sections: [],
  createdAt: 0,
  updatedAt: 0,
  format: 'soap',
  systemPrompt: '',
} as NoteTemplate;

const patient: Patient = { id: 'p1', firstName: 'Jane', lastName: 'Doe' } as Patient;

const note: Note = {
  id: 'n1',
  sessionId: 's1',
  patientId: 'p1',
  sections: [],
  createdAt: 0,
  updatedAt: 0,
  format: 'soap',
  finalized: false,
} as Note;

const emptyModifiers: SessionModifiers = {
  clinicalDetail: [],
  codingBilling: [],
  beyondNote: [],
  customInstructions: [],
};

const baseProps = {
  template: tpl,
  templates: [tpl],
  hasDraftContent: false,
  canGenerate: true,
  note: undefined as Note | undefined,
  patient,
  isGenerating: false,
  modifiers: emptyModifiers,
  onTemplateChange: () => {},
  onManageTemplates: () => {},
  onGenerate: () => {},
  onModifiersChange: () => {},
};

describe('NoteToolbar', () => {
  it('renders Modifier button as enabled', () => {
    render(<NoteToolbar {...baseProps} />);
    const modifier = screen.getByText('Modifier').closest('button')!;
    expect(modifier).not.toBeDisabled();
  });

  it('shows active count badge when modifiers are set', () => {
    render(
      <NoteToolbar
        {...baseProps}
        modifiers={{
          voice: '1st_person',
          clinicalDetail: ['pertinent_negatives'],
          codingBilling: [],
          beyondNote: [],
          customInstructions: [],
        }}
      />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('Generate fires onGenerate with no args (machine raises any needed gate)', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar {...baseProps} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText(/Generate/).closest('button')!);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith();
  });

  it('button label switches to Regenerate when hasDraftContent', () => {
    const onGenerate = vi.fn();
    render(<NoteToolbar {...baseProps} hasDraftContent onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText(/Regenerate/).closest('button')!);
    expect(onGenerate).toHaveBeenCalledWith();
  });

  it('Export menu is hidden when no note exists', () => {
    render(<NoteToolbar {...baseProps} note={undefined} />);
    expect(screen.queryByText('Export')).not.toBeInTheDocument();
  });

  it('Export menu opens with copy/print/download actions when a note exists', () => {
    render(<NoteToolbar {...baseProps} note={note} />);
    fireEvent.click(screen.getByText('Export').closest('button')!);
    expect(screen.getByText('Copy as text')).toBeInTheDocument();
    expect(screen.getByText('Copy as Markdown')).toBeInTheDocument();
    expect(screen.getByText('Print…')).toBeInTheDocument();
    expect(screen.getByText('Download PDF')).toBeInTheDocument();
  });
});
