export const PLAYER_STAMINA_REGEN_MS = 60_000;

export function readPlayerStamina(data: Record<string, unknown>, now: Date): {
  stamina: number;
  nextData: Record<string, unknown>;
} {
  const rawEnergy = data.energy;
  const energy = typeof rawEnergy === "number" && Number.isFinite(rawEnergy)
    ? Math.max(0, Math.min(100, Math.floor(rawEnergy)))
    : 100;
  const rawUpdated = data.energyUpdatedAt;
  const previousMs = typeof rawUpdated === "string" ? Date.parse(rawUpdated) : Number.NaN;
  const lastMs = Number.isFinite(previousMs) && previousMs <= now.getTime()
    ? previousMs
    : now.getTime();
  const recovered = Math.floor((now.getTime() - lastMs) / PLAYER_STAMINA_REGEN_MS);
  const stamina = Math.min(100, energy + recovered);
  const nextUpdateMs = stamina >= 100 ? now.getTime() : lastMs + recovered * PLAYER_STAMINA_REGEN_MS;
  return {
    stamina,
    nextData: {
      ...data,
      energy: stamina,
      energyUpdatedAt: new Date(nextUpdateMs).toISOString(),
    },
  };
}

export function spendPlayerStamina(
  data: Record<string, unknown>,
  cost: number,
  now: Date,
): { stamina: number; data: Record<string, unknown> } | null {
  const current = readPlayerStamina(data, now);
  if (!Number.isInteger(cost) || cost < 0 || current.stamina < cost) return null;
  const stamina = current.stamina - cost;
  return {
    stamina,
    data: { ...current.nextData, energy: stamina, energyUpdatedAt: now.toISOString() },
  };
}
