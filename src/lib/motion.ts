export const ease = {
  standard: [0.32, 0.08, 0.24, 1],
  enter: [0.16, 0.84, 0.44, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const duration = {
  instant: 0.12,
  quick: 0.2,
  base: 0.32,
  slow: 0.5,
  hero: 0.8,
} as const;

export const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: duration.base, ease: ease.enter },
} as const;

export const stagger = (children = 0.04) => ({
  animate: { transition: { staggerChildren: children } },
});
