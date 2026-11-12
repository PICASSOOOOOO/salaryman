export type LofiStereoMode = "stereo" | "mono";

export type LofiFxSettings = {
  enabled: boolean;
  input: number;
  output: number;
  mix: number;
  filter: number;
  bits: 4 | 8 | 12 | 16;
  rate: number;
  drive: number;
  alias: number;
  noise: number;
  drunk: number;
  character: number;
  bassBoost: boolean;
  bassFrequency: number;
  stereoMode: LofiStereoMode;
};

export const DEFAULT_LOFI_FX: LofiFxSettings = {
  enabled: false,
  input: 100,
  output: 100,
  mix: 100,
  filter: 50,
  bits: 16,
  rate: 48_000,
  drive: 0,
  alias: 50,
  noise: 0,
  drunk: 0,
  character: 0,
  bassBoost: false,
  bassFrequency: 120,
  stereoMode: "stereo",
};

export const LOFI_FX_PRESETS = {
  clean: { ...DEFAULT_LOFI_FX, enabled: true },
  dust: {
    ...DEFAULT_LOFI_FX,
    enabled: true,
    mix: 78,
    filter: 43,
    bits: 12,
    rate: 24_000,
    drive: 12,
    alias: 42,
    noise: 8,
    character: 18,
    bassBoost: true,
    bassFrequency: 90,
  },
  crush: {
    ...DEFAULT_LOFI_FX,
    enabled: true,
    mix: 90,
    filter: 48,
    bits: 8,
    rate: 12_000,
    drive: 38,
    alias: 82,
    character: 24,
  },
  wobble: {
    ...DEFAULT_LOFI_FX,
    enabled: true,
    mix: 72,
    filter: 50,
    bits: 12,
    rate: 22_000,
    alias: 58,
    noise: 5,
    drunk: 46,
    character: 10,
  },
} satisfies Record<string, LofiFxSettings>;

export type LofiFxPresetId = keyof typeof LOFI_FX_PRESETS;

export function isLofiFxSettings(value: unknown): value is LofiFxSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Partial<LofiFxSettings>;
  const percentValues = [
    settings.mix,
    settings.filter,
    settings.drive,
    settings.alias,
    settings.noise,
    settings.drunk,
    settings.character,
  ];
  return typeof settings.enabled === "boolean"
    && Number.isInteger(settings.input) && Number(settings.input) >= 0 && Number(settings.input) <= 150
    && Number.isInteger(settings.output) && Number(settings.output) >= 0 && Number(settings.output) <= 150
    && percentValues.every(item => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 100)
    && [4, 8, 12, 16].includes(Number(settings.bits))
    && Number.isInteger(settings.rate) && Number(settings.rate) >= 4_000 && Number(settings.rate) <= 48_000
    && typeof settings.bassBoost === "boolean"
    && Number.isInteger(settings.bassFrequency) && Number(settings.bassFrequency) >= 20 && Number(settings.bassFrequency) <= 500
    && (settings.stereoMode === "mono" || settings.stereoMode === "stereo");
}

export function matchingLofiPreset(settings: LofiFxSettings): LofiFxPresetId | "custom" {
  const keys = Object.keys(LOFI_FX_PRESETS) as LofiFxPresetId[];
  return keys.find((key) => {
    const preset = LOFI_FX_PRESETS[key];
    return (Object.keys(preset) as (keyof LofiFxSettings)[])
      .filter(field => field !== "enabled")
      .every(field => settings[field] === preset[field]);
  }) ?? "custom";
}
