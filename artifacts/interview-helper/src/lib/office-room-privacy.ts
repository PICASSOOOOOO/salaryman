import type { OfficeRoom } from "@/components/office/office-types";

export type OfficeRoomSnapshot = Pick<
  OfficeRoom,
  "id" | "x" | "y" | "w" | "h" | "doorSide" | "doorAt" | "doorSpan" | "label" | "sub" | "accent" | "privacy"
>;

export type OfficeRoomVisibility =
  | { mode: "live"; room: OfficeRoom }
  | { mode: "snapshot"; room: OfficeRoomSnapshot }
  | { mode: "undiscovered" };

const STORAGE_PREFIX = "salaryman.office.room-discovery.v1.";

export function isPlayerInsideOfficeRoom(room: OfficeRoom, col: number, row: number): boolean {
  return col >= room.x && col < room.x + room.w && row >= room.y && row < room.y + room.h;
}

export function snapshotOfficeRoom(room: OfficeRoom): OfficeRoomSnapshot {
  return {
    id: room.id, x: room.x, y: room.y, w: room.w, h: room.h,
    doorSide: room.doorSide, doorAt: room.doorAt, doorSpan: room.doorSpan,
    label: room.label, sub: room.sub, accent: room.accent, privacy: room.privacy,
  };
}

export function resolveOfficeRoomVisibility(
  room: OfficeRoom,
  player: { col: number; row: number } | null,
  snapshots: Readonly<Record<string, OfficeRoomSnapshot>>,
): OfficeRoomVisibility {
  if (room.privacy !== "private") return { mode: "live", room };
  if (player && isPlayerInsideOfficeRoom(room, player.col, player.row)) return { mode: "live", room };
  const snapshot = snapshots[room.id];
  return snapshot ? { mode: "snapshot", room: snapshot } : { mode: "undiscovered" };
}

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

export function loadOfficeRoomSnapshots(scope: string): Record<string, OfficeRoomSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const snapshots: Record<string, OfficeRoomSnapshot> = {};
    for (const [id, candidate] of Object.entries(value)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const room = candidate as Partial<OfficeRoomSnapshot>;
      if (room.id !== id || ![room.x, room.y, room.w, room.h].every(Number.isFinite)
        || !room.w || !room.h || room.privacy !== "private") continue;
      snapshots[id] = snapshotOfficeRoom(room as OfficeRoom);
    }
    return snapshots;
  } catch {
    return {};
  }
}

export function saveOfficeRoomSnapshots(scope: string, snapshots: Readonly<Record<string, OfficeRoomSnapshot>>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(snapshots));
  } catch {
    // Discovery still works for the current session if browser storage is unavailable.
  }
}
