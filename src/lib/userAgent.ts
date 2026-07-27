/**
 * The one user-agent parser. Two callers with different formatting needs — the
 * Debug Menu env panel (wants version + engine) and the passkey device label
 * (wants "Chrome on Windows") — share this ladder.
 *
 * `ua` is injectable so the parsing can be tested without stubbing `navigator`.
 */

/** Browser family, major version, and rendering engine. Order matters: Edge announces itself as Chrome too. */
export function detectBrowser(ua: string = navigator.userAgent): {
  name: string;
  version: string;
  engine: string;
} {
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

export function detectOS(ua: string = navigator.userAgent): string {
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}
