const PENDING_DM_KEY = "salaryman:comms:pending-dm";

export function queuePendingCommsDmUserId(userId: string) {
  const id = userId.trim();
  if (!id) return;
  try {
    window.sessionStorage.setItem(PENDING_DM_KEY, id);
  } catch {
    // Navigation to COMMS still works when browser storage is unavailable.
  }
}

export function takePendingCommsDmUserId(): string | undefined {
  try {
    const id = window.sessionStorage.getItem(PENDING_DM_KEY)?.trim();
    window.sessionStorage.removeItem(PENDING_DM_KEY);
    return id || undefined;
  } catch {
    return undefined;
  }
}
