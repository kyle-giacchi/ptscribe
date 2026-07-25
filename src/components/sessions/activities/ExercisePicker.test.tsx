import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExercisePicker } from './ExercisePicker';
import type { Exercise } from '@/types';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Pendulums',
    region: 'shoulder',
    category: 'mobility',
    instructions: '',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const LIST = [
  ex(),
  ex({ id: 'e2', name: 'Sleeper Stretch', region: 'shoulder' }),
  ex({ id: 'e3', name: 'Chin Tucks', region: 'cervical' }),
];

describe('ExercisePicker', () => {
  it('lists every exercise by default', () => {
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Pendulums')).toBeInTheDocument();
    expect(screen.getByText('Chin Tucks')).toBeInTheDocument();
  });

  it('filters by search text, case-insensitively', () => {
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search exercises…'), {
      target: { value: 'sleeper' },
    });
    expect(screen.getByText('Sleeper Stretch')).toBeInTheDocument();
    expect(screen.queryByText('Chin Tucks')).not.toBeInTheDocument();
  });

  it('filters by region chip', () => {
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cervical' }));
    expect(screen.getByText('Chin Tucks')).toBeInTheDocument();
    expect(screen.queryByText('Pendulums')).not.toBeInTheDocument();
  });

  it('renders a chip only for regions that have exercises', () => {
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Shoulder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Knee' })).not.toBeInTheDocument();
  });

  it('calls onPick with the chosen exercise', () => {
    const onPick = vi.fn();
    render(<ExercisePicker exercises={LIST} onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Sleeper Stretch' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Search exercises…'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state when nothing matches', () => {
    render(<ExercisePicker exercises={LIST} onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search exercises…'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('No exercises match.')).toBeInTheDocument();
  });
});
