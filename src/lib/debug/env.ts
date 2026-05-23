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

export function detectBrowser(): { name: string; version: string; engine: string } {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/'))
    return { name: 'Edge', version: ua.match(/Edg\/(\d+)/)?.[1] ?? '?', engine: 'Blink' };
  if (ua.includes('Chrome/'))
    return { name: 'Chrome', version: ua.match(/Chrome\/(\d+)/)?.[1] ?? '?', engine: 'Blink' };
  if (ua.includes('Firefox/'))
    return { name: 'Firefox', version: ua.match(/Firefox\/(\d+)/)?.[1] ?? '?', engine: 'Gecko' };
  if (ua.includes('Version/') && ua.includes('Safari/'))
    return { name: 'Safari', version: ua.match(/Version\/(\d+)/)?.[1] ?? '?', engine: 'WebKit' };
  return { name: 'Unknown', version: '?', engine: '?' };
}

export function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}

export function wordCount(text?: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}
