import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddClipButton } from '../AddClipButton';

describe('AddClipButton', () => {
  it('calls onRecord when main half is clicked', () => {
    const onRecord = vi.fn();
    render(<AddClipButton onRecord={onRecord} onUpload={() => {}} />);
    fireEvent.click(screen.getByText('New recording'));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it('opens menu when chevron is clicked', () => {
    render(<AddClipButton onRecord={() => {}} onUpload={() => {}} />);
    fireEvent.click(screen.getByLabelText('Add clip menu'));
    expect(screen.getByText('Record new clip')).toBeInTheDocument();
    expect(screen.getByText('Upload audio file')).toBeInTheDocument();
  });

  it('menu "Record new clip" item calls onRecord', () => {
    const onRecord = vi.fn();
    render(<AddClipButton onRecord={onRecord} onUpload={() => {}} />);
    fireEvent.click(screen.getByLabelText('Add clip menu'));
    fireEvent.click(screen.getByText('Record new clip'));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });
});
