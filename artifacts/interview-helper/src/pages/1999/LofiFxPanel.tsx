import {
  LOFI_FX_PRESETS,
  matchingLofiPreset,
  type LofiFxPresetId,
  type LofiFxSettings,
} from "./lofi-fx";

type Props = {
  value: LofiFxSettings;
  disabled?: boolean;
  onChange: (next: LofiFxSettings) => void;
};

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="n-lofi-control">
      <span>{label}</span>
      <output>{display}</output>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function LofiFxPanel({ value, disabled, onChange }: Props) {
  const update = (patch: Partial<LofiFxSettings>) => onChange({ ...value, ...patch });
  const preset = matchingLofiPreset(value);
  const selectPreset = (id: string) => {
    if (id === "custom") return;
    const nextPreset = LOFI_FX_PRESETS[id as LofiFxPresetId];
    if (nextPreset) onChange({ ...nextPreset, enabled: true });
  };

  return (
    <section className="n-panel n-lofi-panel" aria-label="1999 master effects" data-testid="section-lofi-fx">
      <details>
        <summary className="n-panel-head" data-testid="summary-lofi-fx">
          <span className="n-eyebrow">MASTER FX</span>
          <span className={`n-lofi-state${value.enabled ? " is-on" : ""}`} data-testid="status-lofi-fx">
            {value.enabled ? "ACTIVE" : "BYPASS"}
          </span>
        </summary>
        <div className="n-machine-body n-lofi-body">
          <div className="n-lofi-topline">
            <label className="n-lofi-enable">
              <input
                aria-label="Enable master lo-fi effect"
                type="checkbox"
                checked={value.enabled}
                disabled={disabled}
                onChange={event => update({ enabled: event.target.checked })}
                data-testid="toggle-lofi-fx"
              />
              <span>LO-FI</span>
            </label>
            <label className="n-lofi-preset">
              PRESET
              <select
                aria-label="Lo-fi effect preset"
                value={preset}
                disabled={disabled}
                onChange={event => selectPreset(event.target.value)}
                data-testid="select-lofi-preset"
              >
                <option value="custom">CUSTOM</option>
                <option value="clean">CLEAN</option>
                <option value="dust">DUST</option>
                <option value="crush">CRUSH</option>
                <option value="wobble">WOBBLE</option>
              </select>
            </label>
          </div>

          <div className="n-lofi-grid" aria-label="Lo-fi effect controls">
            <RangeControl label="INPUT" value={value.input} min={0} max={150} display={`${value.input}%`} disabled={disabled} onChange={input => update({ input })} />
            <RangeControl label="OUTPUT" value={value.output} min={0} max={150} display={`${value.output}%`} disabled={disabled} onChange={output => update({ output })} />
            <RangeControl label="MIX" value={value.mix} min={0} max={100} display={`${value.mix}%`} disabled={disabled} onChange={mix => update({ mix })} />
            <RangeControl label="FILTER" value={value.filter} min={0} max={100} display={value.filter < 50 ? `DARK ${value.filter}` : value.filter > 50 ? `BRIGHT ${value.filter}` : "NEUTRAL"} disabled={disabled} onChange={filter => update({ filter })} />
            <label className="n-lofi-control">
              <span>BITS</span>
              <output>{value.bits}</output>
              <select aria-label="Bit depth" value={value.bits} disabled={disabled} onChange={event => update({ bits: Number(event.target.value) as LofiFxSettings["bits"] })} data-testid="select-lofi-bits">
                {[16, 12, 8, 4].map(bits => <option key={bits} value={bits}>{bits}</option>)}
              </select>
            </label>
            <RangeControl label="RATE" value={value.rate} min={4_000} max={48_000} step={1_000} display={`${Math.round(value.rate / 1_000)}K`} disabled={disabled} onChange={rate => update({ rate })} />
            <RangeControl label="DRIVE" value={value.drive} min={0} max={100} display={`${value.drive}`} disabled={disabled} onChange={drive => update({ drive })} />
            <RangeControl label="ALIAS" value={value.alias} min={0} max={100} display={`${value.alias}`} disabled={disabled} onChange={alias => update({ alias })} />
            <RangeControl label="NOISE" value={value.noise} min={0} max={100} display={`${value.noise}`} disabled={disabled} onChange={noise => update({ noise })} />
            <RangeControl label="DRUNK" value={value.drunk} min={0} max={100} display={`${value.drunk}`} disabled={disabled} onChange={drunk => update({ drunk })} />
            <RangeControl label="CHARACTER" value={value.character} min={0} max={100} display={`${value.character}`} disabled={disabled} onChange={character => update({ character })} />
          </div>

          <div className="n-lofi-bottom">
            <label className="n-lofi-enable">
              <input aria-label="Enable bass boost" type="checkbox" checked={value.bassBoost} disabled={disabled} onChange={event => update({ bassBoost: event.target.checked })} data-testid="toggle-lofi-bass" />
              <span>BASS BOOST</span>
            </label>
            <RangeControl label="BASS FREQ" value={value.bassFrequency} min={20} max={500} step={5} display={`${value.bassFrequency}HZ`} disabled={disabled || !value.bassBoost} onChange={bassFrequency => update({ bassFrequency })} />
            <label className="n-lofi-mode">
              MODE
              <select aria-label="Master effect channel mode" value={value.stereoMode} disabled={disabled} onChange={event => update({ stereoMode: event.target.value as LofiFxSettings["stereoMode"] })} data-testid="select-lofi-stereo-mode">
                <option value="stereo">STEREO</option>
                <option value="mono">MONO</option>
              </select>
            </label>
          </div>
        </div>
      </details>
    </section>
  );
}
