const KEY = 'ptnotes.sameDayWarning.suppressedDate';

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function suppressSameDayWarningForToday(): void {
  try {
    sessionStorage.setItem(KEY, todayStamp());
  } catch {
    /* sessionStorage unavailable — best-effort suppression only */
  }
}

export function isSameDayWarningSuppressed(): boolean {
  try {
    return sessionStorage.getItem(KEY) === todayStamp();
  } catch {
    return false;
  }
}
