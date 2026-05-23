/**
 * Build-time gate for the in-app debug tooling (Debug Menu drawer). Mirrors the
 * `VITE_DEMO_MODE` pattern: on by default, set `VITE_DEBUG_TOOLS=false` to hide
 * the Settings → Debug Menu entry point in a build.
 */
export const DEBUG_TOOLS_ENABLED = import.meta.env.VITE_DEBUG_TOOLS !== 'false';
