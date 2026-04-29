import { useState } from 'react';

export function useToggle(initial = false): readonly [boolean, () => void, () => void] {
  const [value, setValue] = useState(initial);
  return [value, () => setValue(true), () => setValue(false)] as const;
}
