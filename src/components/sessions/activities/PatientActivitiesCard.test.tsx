import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatientActivitiesCard } from './PatientActivitiesCard';
import type { Exercise, NoteActivities } from '@/types';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Pendulums',
    region: 'shoulder',
    category: 'mobility',
    instructions: '',
    defaultDosage: '2x10',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const EXERCISES = [ex(), ex({ id: 'e2', name: 'Sleeper Stretch', defaultDosage: '3x30s' })];
const EMPTY: NoteActivities = { performed: [], home: [] };

function setup(over: Partial<ComponentProps<typeof PatientActivitiesCard>> = {}) {
  const onChange = vi.fn();
  const onSyncPlan = vi.fn();
  render(
    <PatientActivitiesCard
      activities={EMPTY}
      exercises={EXERCISES}
      readOnly={false}
      seededFromPlan={false}
      canSyncPlan={false}
      onChange={onChange}
      onSyncPlan={onSyncPlan}
      {...over}
    />,
  );
  return { onChange, onSyncPlan };
}

describe('PatientActivitiesCard', () => {
  it('renders both list headings', () => {
    setup();
    expect(screen.getByText('Performed this visit')).toBeInTheDocument();
    expect(screen.getByText('Home program')).toBeInTheDocument();
  });

  it('adds a picked exercise to Performed with its default dosage and name snapshot', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise to performed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Pendulums' }));
    expect(onChange).toHaveBeenCalledWith({
      performed: [
        expect.objectContaining({ exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }),
      ],
      home: [],
    });
  });

  it('removes an entry', () => {
    const { onChange } = setup({
      activities: {
        performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }],
        home: [],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pendulums from performed' }));
    expect(onChange).toHaveBeenCalledWith({ performed: [], home: [] });
  });

  it('edits a note', () => {
    const { onChange } = setup({
      activities: {
        performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }],
        home: [],
      },
    });
    fireEvent.change(screen.getByLabelText('Note for Pendulums in performed'), {
      target: { value: 'stop if sharp pain' },
    });
    expect(onChange).toHaveBeenCalledWith({
      performed: [expect.objectContaining({ notes: 'stop if sharp pain' })],
      home: [],
    });
  });

  it('edits a dosage', () => {
    const { onChange } = setup({
      activities: {
        performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }],
        home: [],
      },
    });
    fireEvent.change(screen.getByLabelText('Dosage for Pendulums in performed'), {
      target: { value: '4x20' },
    });
    expect(onChange).toHaveBeenCalledWith({
      performed: [expect.objectContaining({ dosage: '4x20' })],
      home: [],
    });
  });

  it('copies performed entries into home with fresh ids, skipping duplicates', () => {
    const { onChange } = setup({
      activities: {
        performed: [
          { id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' },
          { id: 'a2', exerciseId: 'e2', dosage: '3x30s', exerciseName: 'Sleeper Stretch' },
        ],
        home: [{ id: 'h1', exerciseId: 'e1', dosage: 'EDITED', exerciseName: 'Pendulums' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy from performed' }));
    const next = onChange.mock.calls[0][0] as NoteActivities;
    expect(next.home).toHaveLength(2);
    // existing entry untouched — the copy must not overwrite an edited dosage
    expect(next.home[0]).toEqual({
      id: 'h1',
      exerciseId: 'e1',
      dosage: 'EDITED',
      exerciseName: 'Pendulums',
    });
    expect(next.home[1]).toEqual(expect.objectContaining({ exerciseId: 'e2', dosage: '3x30s' }));
    expect(next.home[1].id).not.toBe('a2');
  });

  it('hides all editing affordances when readOnly', () => {
    setup({
      readOnly: true,
      activities: {
        performed: [{ id: 'a1', exerciseId: 'e1', dosage: '2x10', exerciseName: 'Pendulums' }],
        home: [],
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Add exercise to performed' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove Pendulums from performed' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2x10')).toBeInTheDocument();
  });

  it('enables Update plan of care only when canSyncPlan', () => {
    setup({ canSyncPlan: true });
    const btn = screen.getByRole('button', { name: 'Update plan of care' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
  });

  it('disables Update plan of care when there is nothing to sync', () => {
    setup({ canSyncPlan: false });
    expect(screen.getByRole('button', { name: 'Update plan of care' })).toBeDisabled();
  });

  it('shows the plan-seed hint when seededFromPlan', () => {
    setup({ seededFromPlan: true });
    expect(screen.getByText('from plan of care')).toBeInTheDocument();
  });
});
