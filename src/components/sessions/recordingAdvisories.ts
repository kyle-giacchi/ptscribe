// Derived from useRecorder's event stream (see useRecorder.ts's RecorderEvent
// doc comment for why events are separate advisories rather than one snapshot
// field). A reducer keeps that derivation as one pure function instead of
// four hand-synced useState mirrors in RecordingPanel.
export interface RecordingAdvisories {
  silenceActive: boolean;
  silenceWarnDismissed: boolean;
  softWarnActive: boolean;
  wasAutoStopped: boolean;
}

export const initialAdvisories: RecordingAdvisories = {
  silenceActive: false,
  silenceWarnDismissed: false,
  softWarnActive: false,
  wasAutoStopped: false,
};

export type AdvisoryAction =
  | { type: 'silenceStart' }
  | { type: 'silenceEnd' }
  | { type: 'softWarn' }
  | { type: 'autoStopped' }
  | { type: 'clearAutoStopped' }
  | { type: 'dismissSilenceWarn' }
  | { type: 'reset' };

export function advisoriesReducer(
  state: RecordingAdvisories,
  action: AdvisoryAction,
): RecordingAdvisories {
  switch (action.type) {
    case 'silenceStart':
      return { ...state, silenceActive: true };
    case 'silenceEnd':
      return { ...state, silenceActive: false, silenceWarnDismissed: false };
    case 'softWarn':
      return { ...state, softWarnActive: true };
    case 'autoStopped':
      return { ...state, wasAutoStopped: true };
    case 'clearAutoStopped':
      return { ...state, wasAutoStopped: false };
    case 'dismissSilenceWarn':
      return { ...state, silenceWarnDismissed: true };
    case 'reset':
      return initialAdvisories;
  }
}
