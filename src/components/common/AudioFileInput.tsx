import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface AudioFileInputHandle {
  open(): void;
}

interface AudioFileInputProps {
  onPick: (file: File) => void;
}

export const AudioFileInput = forwardRef<AudioFileInputHandle, AudioFileInputProps>(
  function AudioFileInput({ onPick }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({
      open() {
        inputRef.current?.click();
      },
    }));
    return (
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    );
  },
);
