import { useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
import { toast } from 'sonner';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { clearWhisperModelCache } from '@/services/ai/client/localWhisper';

export function OnDeviceModelCard() {
  const { sessions } = useSessions();
  const [modelBusy, setModelBusy] = useState(false);

  async function handleClearModel() {
    // Guard: never pull the model out from under an in-flight session. The
    // model cache is app-global (see ADR-0002), so re-downloading mid-transcribe
    // would break the active worker.
    const inFlight = sessions.some((s) => s.status === 'recording' || s.status === 'transcribing');
    if (inFlight) {
      toast.error(
        'Finish or stop the active recording/transcription before re-downloading the model.',
      );
      return;
    }
    if (
      !confirm(
        'Clear the on-device transcription model and download it again (~150 MB)? Your patients, sessions, and notes are not affected.',
      )
    ) {
      return;
    }
    setModelBusy(true);
    const t = toast.loading('Re-downloading on-device model…');
    try {
      await clearWhisperModelCache();
      toast.success('On-device model re-downloaded', { id: t });
    } catch (e) {
      toast.error(`Could not re-download the model: ${(e as Error).message}`, { id: t });
    } finally {
      setModelBusy(false);
    }
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Eyebrow>On-device model</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0, lineHeight: 1.5 }}>
          The local Whisper transcription model (~150 MB) is downloaded once and cached on this
          device — it persists across sessions, reloads, and resets, so you only download it again
          if you choose to. Clear and re-download it if transcription stops working or you suspect
          the cached files are corrupt.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PtButton
            variant="ghost"
            iconLeft={<HardDriveDownload size={14} strokeWidth={2} />}
            disabled={modelBusy}
            onClick={handleClearModel}
          >
            {modelBusy ? 'Re-downloading…' : 'Clear & re-download model'}
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
