import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipsDrawer } from '../ClipsDrawer';
import type { SessionClip } from '@/types';

vi.mock('@/services/AudioRepository', () => ({
  audioRepository: { load: vi.fn(async () => new Blob([new Uint8Array(8)], { type: 'audio/webm' })) },
}));

function mkClip(id: string, createdAt: number, extra: Partial<SessionClip> = {}): SessionClip {
  return {
    id, createdAt, status: 'transcribed',
    durationSec: 30, startOffsetSec: 0, transcript: 'hi',
    updatedAt: createdAt,
    ...extra,
  } as SessionClip;
}

describe('ClipsDrawer', () => {
  it('renders one card per clip', () => {
    const clips = [mkClip('a', 100), mkClip('b', 200)];
    render(<ClipsDrawer open clips={clips} onClose={() => {}} onJump={() => {}} onDelete={() => {}} onRecord={() => {}} onUpload={() => {}} />);
    expect(screen.getByText('Clip 1')).toBeInTheDocument();
    expect(screen.getByText('Clip 2')).toBeInTheDocument();
  });

  it('Jump to transcript closes drawer + calls onJump with startOffsetSec', () => {
    const onClose = vi.fn();
    const onJump = vi.fn();
    const clips = [mkClip('a', 100, { startOffsetSec: 42 })];
    render(<ClipsDrawer open clips={clips} onClose={onClose} onJump={onJump} onDelete={() => {}} onRecord={() => {}} onUpload={() => {}} />);
    fireEvent.click(screen.getByText(/Jump to transcript/).closest('button')!);
    expect(onClose).toHaveBeenCalled();
    expect(onJump).toHaveBeenCalledWith(42);
  });

  it('Delete calls onDelete with clip id', () => {
    const onDelete = vi.fn();
    const clips = [mkClip('clipX', 100)];
    render(<ClipsDrawer open clips={clips} onClose={() => {}} onJump={() => {}} onDelete={onDelete} onRecord={() => {}} onUpload={() => {}} />);
    fireEvent.click(screen.getByLabelText('Delete clip 1'));
    expect(onDelete).toHaveBeenCalledWith('clipX');
  });

  it('renders empty state when no clips', () => {
    render(<ClipsDrawer open clips={[]} onClose={() => {}} onJump={() => {}} onDelete={() => {}} onRecord={() => {}} onUpload={() => {}} />);
    expect(screen.getByText('No clips yet')).toBeInTheDocument();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<ClipsDrawer open clips={[]} onClose={onClose} onJump={() => {}} onDelete={() => {}} onRecord={() => {}} onUpload={() => {}} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
