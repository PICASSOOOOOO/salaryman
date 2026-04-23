import { useAudioDevices } from '@/hooks/use-audio-devices';

interface Props {
  /** Pack mic + speaker selectors on one line. Default true. */
  inline?: boolean;
  /** Optional className applied to the outer container. */
  className?: string;
}

/**
 * Two dropdowns: one for mic input, one for speaker output.
 *
 * If the user hasn't granted mic permission yet, shows a single button that
 * triggers the permission prompt — required to populate device labels.
 *
 * Speaker selector is only rendered when the browser supports
 * HTMLMediaElement.setSinkId (Chrome/Edge desktop, recent Firefox). On
 * Safari and most mobile browsers we fall back to system default.
 */
export function AudioDeviceSelector({ inline = true, className = '' }: Props) {
  const {
    inputs, outputs, hasPermission, supportsSinkId,
    micId, speakerId, setMicId, setSpeakerId, requestPermission,
  } = useAudioDevices();

  if (!hasPermission) {
    return (
      <button
        type="button"
        onClick={() => { void requestPermission(); }}
        className={`text-[10px] tracking-[0.2em] font-mono px-3 py-1.5 border border-pink-400/40 text-pink-300 hover:bg-pink-500/10 active:bg-pink-500/20 rounded transition-colors ${className}`}
      >
        ENABLE MIC + SPEAKER PICKER
      </button>
    );
  }

  return (
    <div className={`${inline ? 'flex flex-wrap items-center' : 'flex flex-col'} gap-2 text-[10px] font-mono ${className}`}>
      <label className="flex items-center gap-1.5">
        <span className="text-pink-300/70 select-none" aria-label="Microphone">🎤</span>
        <select
          value={micId ?? ''}
          onChange={(e) => setMicId(e.target.value || null)}
          className="bg-black/70 border border-pink-400/30 text-pink-100 px-2 py-1 rounded outline-none focus:border-pink-300 max-w-[200px]"
          aria-label="Microphone input"
        >
          <option value="">SYSTEM DEFAULT</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      </label>

      {supportsSinkId && outputs.length > 0 && (
        <label className="flex items-center gap-1.5">
          <span className="text-cyan-300/70 select-none" aria-label="Speaker">🔊</span>
          <select
            value={speakerId ?? ''}
            onChange={(e) => setSpeakerId(e.target.value || null)}
            className="bg-black/70 border border-cyan-400/30 text-cyan-100 px-2 py-1 rounded outline-none focus:border-cyan-300 max-w-[200px]"
            aria-label="Speaker output"
          >
            <option value="">SYSTEM DEFAULT</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
