import { apiFetch } from '@/lib/api-client';
const PENDING_HOUSING_KEY = "salaryman_pending_housing";
const SAVE_KEY = "sm_save";

export interface PendingHousingAssessment {
  startingBalance: number;
  officeTier: string;
}

interface HousingChargeResult {
  alreadyCharged: boolean;
  remainingBalance: number;
}

export function markPendingHousingAssessment(input: PendingHousingAssessment): void {
  try {
    localStorage.setItem(PENDING_HOUSING_KEY, JSON.stringify(input));
  } catch { /* storage may be unavailable */ }
}

export function readPendingHousingAssessment(): PendingHousingAssessment | null {
  try {
    const raw = localStorage.getItem(PENDING_HOUSING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingHousingAssessment>;
    if (typeof parsed.startingBalance !== "number" || typeof parsed.officeTier !== "string") return null;
    return {
      startingBalance: Math.max(0, Math.floor(parsed.startingBalance)),
      officeTier: parsed.officeTier,
    };
  } catch {
    return null;
  }
}

export async function settlePendingHousingAssessment(): Promise<boolean> {
  const pending = readPendingHousingAssessment();
  if (!pending) return true;
  try {
    const response = await apiFetch("/api/onboard-housing/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(pending),
    });
    if (!response.ok) return false;
    const out = await response.json() as HousingChargeResult;
    const raw = localStorage.getItem(SAVE_KEY);
    const prior = raw ? JSON.parse(raw) : {};
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...(prior && typeof prior === "object" ? prior : {}),
      savings: out.alreadyCharged ? prior?.savings ?? 0 : out.remainingBalance,
      housingChargedAt: Date.now(),
    }));
    localStorage.removeItem(PENDING_HOUSING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function startPendingHousingAssessmentRetry(intervalMs = 10_000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    if (stopped) return;
    const settled = await settlePendingHousingAssessment();
    if (!stopped && !settled) timer = setTimeout(run, intervalMs);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}