import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionTopBar } from '../SessionTopBar';
import type { Patient, Session, Note } from '@/types';

const patient: Patient = {
  id: 'p1', firstName: 'Jane', lastName: 'Doe', primaryDiagnosis: 'L knee OA',
  status: 'active', createdAt: 0, updatedAt: 0,
} as Patient;
const session: Session = {
  id: 's1', patientId: 'p1', type: 'follow_up', date: Date.now(),
  status: 'draft', clips: [], createdAt: 0, updatedAt: 0,
} as Session;

describe('SessionTopBar', () => {
  it('renders patient identity headline', () => {
    render(<MemoryRouter>
      <SessionTopBar
        patient={patient} session={session} note={undefined}
        totalDurationSec={0} clipsCount={0} clipsOpen={false}
        onToggleClips={() => {}} onRecord={() => {}} onUpload={() => {}}
        missingRequiredLabels={[]}
        onFinalize={() => {}} onUnfinalize={() => {}}
      />
    </MemoryRouter>);
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/L knee OA/)).toBeInTheDocument();
  });

  it('Audio clips toggle calls onToggleClips', () => {
    const onToggleClips = vi.fn();
    render(<MemoryRouter>
      <SessionTopBar
        patient={patient} session={session} note={undefined}
        totalDurationSec={0} clipsCount={3} clipsOpen={false}
        onToggleClips={onToggleClips} onRecord={() => {}} onUpload={() => {}}
        missingRequiredLabels={[]}
        onFinalize={() => {}} onUnfinalize={() => {}}
      />
    </MemoryRouter>);
    fireEvent.click(screen.getByText('Audio clips').closest('button')!);
    expect(onToggleClips).toHaveBeenCalledTimes(1);
  });

  it('Sign & export is disabled when missingRequiredLabels is non-empty', () => {
    const note: Note = { id: 'n1', sessionId: 's1', patientId: 'p1', format: 'soap', finalized: false, sections: [], createdAt: 0, updatedAt: 0 };
    render(<MemoryRouter>
      <SessionTopBar
        patient={patient} session={session} note={note}
        totalDurationSec={0} clipsCount={0} clipsOpen={false}
        onToggleClips={() => {}} onRecord={() => {}} onUpload={() => {}}
        missingRequiredLabels={['Assessment']}
        onFinalize={() => {}} onUnfinalize={() => {}}
      />
    </MemoryRouter>);
    const btn = screen.getByText(/Sign & export/).closest('button')!;
    expect(btn).toBeDisabled();
  });
});
