export const NINETEEN_NINETY_NINE_MACHINE_IDS = [
  "op1",
  "sp404mkii",
  "mpc_sample",
  "korg_ms2000r",
  "korg_m1",
  "boss_ce2",
  "fm1",
  "smk37",
  "minimoog",
] as const;

export type NineteenNinetyNineProject = {
  schemaVersion: 1;
  name: string;
  bpm: number;
  emulatorState?: {
    firmwareIds: Partial<Record<"fm1" | "smk37", string>>;
    patchSaves?: Partial<Record<"fm1" | "smk37", {
      objectPath: string;
      filename: string;
      sizeBytes: number;
    }>>;
  };
  tracks: Array<{
    id: string;
    name: string;
    kind: "instrument" | "recording";
    machineId: (typeof NINETEEN_NINETY_NINE_MACHINE_IDS)[number];
    steps: number[];
    audioTrackId: number | null;
    overdubTrackIds?: number[];
    loopBars?: 1 | 2 | 4;
    loopBpm?: number;
    muted: boolean;
    volume: number;
    soundState?: {
      tone: number;
      decayMs: number;
    };
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjectTrack(value: unknown): value is NineteenNinetyNineProject["tracks"][number] {
  if (!isRecord(value)) return false;
  const validSoundState = value.soundState === undefined
    || (
      isRecord(value.soundState)
      && Number.isInteger(value.soundState.tone)
      && Number(value.soundState.tone) >= 0
      && Number(value.soundState.tone) <= 100
      && Number.isInteger(value.soundState.decayMs)
      && Number(value.soundState.decayMs) >= 80
      && Number(value.soundState.decayMs) <= 800
    );
  return validSoundState
    && typeof value.id === "string"
    && value.id.length > 0 && value.id.length <= 80
    && typeof value.name === "string"
    && value.name.trim().length > 0 && value.name.length <= 80
    && (value.kind === "instrument" || value.kind === "recording")
    && typeof value.machineId === "string"
    && (NINETEEN_NINETY_NINE_MACHINE_IDS as readonly string[]).includes(value.machineId)
    && Array.isArray(value.steps)
    && value.steps.length === 16
    && value.steps.every((step) => Number.isInteger(step) && Number(step) >= 0 && Number(step) <= 127)
    && (value.audioTrackId === null
      || (Number.isInteger(value.audioTrackId) && Number(value.audioTrackId) > 0))
    && (value.overdubTrackIds === undefined || (
      value.kind === "recording"
      && value.audioTrackId !== null
      && Array.isArray(value.overdubTrackIds)
      && value.overdubTrackIds.length <= 49
      && value.overdubTrackIds.every((id) => Number.isInteger(id) && Number(id) > 0 && id !== value.audioTrackId)
      && new Set(value.overdubTrackIds).size === value.overdubTrackIds.length
    ))
    && ((value.loopBars === undefined && value.loopBpm === undefined) || (
      value.kind === "recording"
      && value.audioTrackId !== null
      && (value.loopBars === 1 || value.loopBars === 2 || value.loopBars === 4)
      && Number.isInteger(value.loopBpm)
      && Number(value.loopBpm) >= 40
      && Number(value.loopBpm) <= 240
    ))
    && typeof value.muted === "boolean"
    && typeof value.volume === "number"
    && Number.isFinite(value.volume)
    && value.volume >= 0 && value.volume <= 100;
}

function isEmulatorState(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.firmwareIds)) return false;
  const firmwareIdsValid = Object.entries(value.firmwareIds).every(([machineId, firmwareId]) => (
    (machineId === "fm1" || machineId === "smk37")
    && typeof firmwareId === "string"
    && firmwareId.length <= 120
    && !/[\u0000-\u001f]/.test(firmwareId)
  ));
  if (!firmwareIdsValid) return false;
  if (value.patchSaves === undefined) return true;
  if (!isRecord(value.patchSaves)) return false;
  return Object.entries(value.patchSaves).every(([machineId, save]) => (
    (machineId === "fm1" || machineId === "smk37")
    && isRecord(save)
    && typeof save.objectPath === "string"
    && /^\/objects\/1999-emulator-saves\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(save.objectPath)
    && typeof save.filename === "string"
    && save.filename.length > 0
    && save.filename.length <= 120
    && !/[\u0000-\u001f]/.test(save.filename)
    && /\.fm1save$/i.test(save.filename)
    && Number.isInteger(save.sizeBytes)
    && Number(save.sizeBytes) >= 1
    && Number(save.sizeBytes) <= 16 * 1024 * 1024
  ));
}

export function parseNineteenNinetyNineProject(content: unknown) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 256 * 1024) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)
      || parsed.schemaVersion !== 1
      || typeof parsed.name !== "string"
      || parsed.name.trim().length === 0
      || parsed.name.length > 80
      || !Number.isInteger(parsed.bpm)
      || Number(parsed.bpm) < 40
      || Number(parsed.bpm) > 240
      || !Array.isArray(parsed.tracks)
      || parsed.tracks.length > 8
      || (parsed.emulatorState !== undefined && !isEmulatorState(parsed.emulatorState))
      || !parsed.tracks.every(isProjectTrack)) {
      return null;
    }
    return parsed as unknown as NineteenNinetyNineProject;
  } catch {
    return null;
  }
}
