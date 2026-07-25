// Derived from useRecorder's event stream (see useRecorder.ts's RecorderEvent
// doc comment for why events are separate advisories rather than one snapshot
// field). A sub-reducer of the session machine's capture slice: the machine
// owns the state (so `wasAutoStopped` is visible to it), and
// `sessionMachineReducer` delegates `capture/advisory` here.
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
