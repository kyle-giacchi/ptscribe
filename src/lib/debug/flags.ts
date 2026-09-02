/**
 * Build-time gate for the in-app debug tooling (Debug Menu drawer). Dev-only —
 * Vite statically replaces `import.meta.env.DEV` with `false` in production, so
 * the drawer and its panels tree-shake out of the bundle entirely.
 */
export const DEBUG_TOOLS_ENABLED = import.meta.env.DEV;
