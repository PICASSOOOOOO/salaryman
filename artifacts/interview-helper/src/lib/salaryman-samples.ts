// ── SALARYMAN sample catalog ─────────────────────────────────────────────────
// "Every sound found in SALARYMAN, logged into a samples section in 1999."
// Two kinds of sample:
//   • "sfx"  — a procedural sound from soundEngine. It has no audio file; it's a
//              function. Dropped on a sampler pad, the pad fires the function.
//   • "url"  — an audio file (the uploaded office-radio soundtrack). Dropped on a
//              pad, the file is fetched + decoded into an AudioBuffer.
// Hummingbird library tracks are added dynamically by the Sampler from context,
// so they aren't listed here.
import {
  sfxSalarymanSting, sfxEnter, sfxTalk, sfxStep, sfxSave, sfxError, sfxCoin,
  sfxUIClick, sfxMilestone, sfxLevelUp, sfxBigPayout, sfxRealUsdDeposit,
  sfxLoreReveal, sfxSecretCode, sfxHologramBeamIn, sfxHologramSignalLost,
  sfxAttack, sfxHit, sfxKill, sfxHeal, sfxPoison, sfxDeath, sfxExplosion,
  sfxZoneCross, sfxWeaponDraw, sfxItemPickup,
} from "../soundEngine";

export type SampleKind = "sfx" | "url";

export interface Sample {
  id: string;        // stable id, used as the drag payload (application/x-sample-id)
  name: string;      // short pad label (<= ~10 chars rendered)
  group: string;     // catalog section header
  kind: SampleKind;
  play: () => void;  // preview (sfx fires immediately; url plays a transient <audio>)
  url?: string;      // present when kind === "url"
}

const BASE = import.meta.env.BASE_URL;

// Fire-and-forget preview of an audio file without disturbing any global player.
function previewUrl(url: string) {
  try {
    const a = new Audio(url);
    a.volume = 0.6;
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

function sfx(id: string, name: string, group: string, fn: () => void): Sample {
  return { id: `sfx:${id}`, name, group, kind: "sfx", play: fn };
}

// Interface + system sounds.
const UI_SAMPLES: Sample[] = [
  sfx("sting", "STING", "INTERFACE", sfxSalarymanSting),
  sfx("enter", "ENTER", "INTERFACE", sfxEnter),
  sfx("click", "CLICK", "INTERFACE", sfxUIClick),
  sfx("talk", "TALK", "INTERFACE", sfxTalk),
  sfx("save", "SAVE", "INTERFACE", sfxSave),
  sfx("error", "ERROR", "INTERFACE", sfxError),
  sfx("secret", "SECRET", "INTERFACE", sfxSecretCode),
  sfx("beamin", "BEAM IN", "INTERFACE", sfxHologramBeamIn),
  sfx("signlost", "SIGNLOST", "INTERFACE", sfxHologramSignalLost),
];

// Economy / progression.
const ECON_SAMPLES: Sample[] = [
  sfx("coin", "COIN", "ECONOMY", sfxCoin),
  sfx("payout", "PAYOUT", "ECONOMY", () => sfxBigPayout(1000)),
  sfx("usd", "USD DEP", "ECONOMY", sfxRealUsdDeposit),
  sfx("milestone", "MILESTON", "ECONOMY", sfxMilestone),
  sfx("levelup", "LEVEL UP", "ECONOMY", sfxLevelUp),
  sfx("lore", "LORE", "ECONOMY", sfxLoreReveal),
];

// Game / combat / world.
const GAME_SAMPLES: Sample[] = [
  sfx("step", "STEP", "WORLD", sfxStep),
  sfx("zone", "ZONE", "WORLD", sfxZoneCross),
  sfx("attack", "ATTACK", "WORLD", sfxAttack),
  sfx("hit", "HIT", "WORLD", sfxHit),
  sfx("kill", "KILL", "WORLD", sfxKill),
  sfx("heal", "HEAL", "WORLD", sfxHeal),
  sfx("poison", "POISON", "WORLD", sfxPoison),
  sfx("death", "DEATH", "WORLD", sfxDeath),
  sfx("explode", "EXPLODE", "WORLD", () => sfxExplosion(1)),
  sfx("weapon", "WEAPON", "WORLD", sfxWeaponDraw),
  sfx("pickup", "PICKUP", "WORLD", sfxItemPickup),
];

// The uploaded soundtrack — the 31 office-radio tracks.
const SOUNDTRACK_SAMPLES: Sample[] = Array.from({ length: 31 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  const url = `${BASE}callhome/track-${n}.mp3`;
  return {
    id: `track:${n}`,
    name: `TRK ${n}`,
    group: "OFFICE RADIO",
    kind: "url" as const,
    url,
    play: () => previewUrl(url),
  };
});

export const SAMPLE_CATALOG: Sample[] = [
  ...UI_SAMPLES,
  ...ECON_SAMPLES,
  ...GAME_SAMPLES,
  ...SOUNDTRACK_SAMPLES,
];

// Grouped for sectioned rendering, preserving catalog order.
export function groupedSamples(extra: Sample[] = []): { group: string; items: Sample[] }[] {
  const all = [...SAMPLE_CATALOG, ...extra];
  const order: string[] = [];
  const map = new Map<string, Sample[]>();
  for (const s of all) {
    if (!map.has(s.group)) { map.set(s.group, []); order.push(s.group); }
    map.get(s.group)!.push(s);
  }
  return order.map((g) => ({ group: g, items: map.get(g)! }));
}

export function findSample(id: string, extra: Sample[] = []): Sample | undefined {
  return SAMPLE_CATALOG.find((s) => s.id === id) ?? extra.find((s) => s.id === id);
}
