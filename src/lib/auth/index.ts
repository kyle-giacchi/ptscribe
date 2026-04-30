export type { AppUser } from './types';
export { DEMO_USER } from './demo';

import { DEMO_USER } from './demo';
import type { AppUser } from './types';

export function getCurrentUser(): AppUser {
  return DEMO_USER;
}
