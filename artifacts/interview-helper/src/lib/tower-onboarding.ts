import { apiFetch } from "@/lib/api-client";

export type TowerOnboardingState = {
  status: "housing" | "briefing" | "complete";
  hostelBed?: { floor: number; room: string; free: true };
  publicTerminalAccess?: true;
  lockdownActive?: true;
  completedAt?: string;
};

type CloudSave = {
  slotIndex: number;
  charName: string;
  charClass: string;
  level?: number | null;
  lastZone?: string | null;
  playtime?: number | null;
  lastSavedAt?: string | null;
  data?: Record<string, unknown> | null;
};

const LOCKDOWN_KEY = "salaryman_tower_lockdown_v1";

export function isTowerLockdownActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(LOCKDOWN_KEY) === "1") return true;
    const raw = window.localStorage.getItem("sm_save");
    const save = raw ? JSON.parse(raw) : {};
    return save?.towerOnboarding?.lockdownActive === true;
  } catch {
    return false;
  }
}

export function applyTowerOnboardingState(state: TowerOnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("sm_save");
    const prior = raw ? JSON.parse(raw) : {};
    const nextSave = {
      ...(prior && typeof prior === "object" ? prior : {}),
      towerOnboarding: state,
    } as Record<string, unknown>;
    delete nextSave.hostelBed;
    delete nextSave.publicTerminalAccess;
    window.localStorage.setItem("sm_save", JSON.stringify(nextSave));
    if (state.lockdownActive) window.localStorage.setItem(LOCKDOWN_KEY, "1");
  } catch {}
}

export async function persistTowerOnboardingState(state: TowerOnboardingState): Promise<void> {
  const listed = await apiFetch("/api/salaryman/saves", { credentials: "include" });
  if (!listed.ok) throw new Error("Unable to load your Tower record");
  let saves = ((await listed.json()) as { saves?: CloudSave[] }).saves ?? [];
  if (!saves.length) {
    const ensured = await apiFetch("/api/salaryman/saves/ensure", {
      method: "POST",
      credentials: "include",
    });
    if (!ensured.ok) throw new Error("Unable to create your Tower record");
    const payload = await ensured.json() as { save?: CloudSave };
    if (payload.save) saves = [payload.save];
  }
  const preferredSlot = Number.parseInt(window.localStorage.getItem("sm_slot") ?? "0", 10);
  const save = saves.find((candidate) => candidate.slotIndex === preferredSlot)
    ?? [...saves].sort((a, b) =>
      new Date(b.lastSavedAt ?? 0).getTime() - new Date(a.lastSavedAt ?? 0).getTime())[0];
  if (!save) throw new Error("Tower record unavailable");
  const data = { ...(save.data ?? {}), towerOnboarding: state };
  const updated = await apiFetch(`/api/salaryman/saves/${save.slotIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      charName: save.charName,
      charClass: save.charClass,
      level: save.level ?? 1,
      lastZone: save.lastZone ?? "SHADOW TOWER",
      playtime: save.playtime ?? 0,
      data,
    }),
  });
  if (!updated.ok) throw new Error("Unable to save your Tower assignment");
  applyTowerOnboardingState(state);
}