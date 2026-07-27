/**
 * Environment / storage diagnostic helpers shared by the Debug Menu panels.
 * Pure functions — no React, no side effects beyond reading `navigator`,
 * `localStorage`, and `screen`. Extracted from the former Admin page so the
 * panels can live inside the app-global DebugDrawer.
 */

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${units[i]}`;
}

export function lsBytes(key: string): number {
  const v = localStorage.getItem(key);
  return v ? (key.length + v.length) * 2 : 0;
}
