// ─── Autopilot prefs helpers ─────────────────────────────────────────────────
// Shared coercion primitives used by the per-domain prefs sanitizers. Every
// owner-supplied prefs value passes through these so any garbage stored in
// autopilot_configs.prefs (or a malicious PUT body) degrades to a safe default.

/** Coerce arbitrary input to an integer clamped to [min, max], or `fallback`. */
export function clampIntPref(v: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** Coerce arbitrary input to a boolean, falling back when it isn't one. */
export function readBoolPref(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
