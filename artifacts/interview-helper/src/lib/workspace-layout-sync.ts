import { apiFetch } from "./api-client";
import type { WorkspaceLayout } from "@workspace/api-zod";

export type { WorkspaceLayout };

function isWorkspaceLayout(value: unknown): value is WorkspaceLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as { version?: unknown; slots?: unknown };
  return (
    layout.version === 2 &&
    Array.isArray(layout.slots) &&
    layout.slots.length >= 1 &&
    layout.slots.length <= 9 &&
    layout.slots.every(
      (slot) => slot === null || (typeof slot === "string" && slot.length > 0 && slot.length <= 300),
    )
  );
}

async function readLayoutResponse(response: Response): Promise<WorkspaceLayout | null> {
  if (!response.ok) throw new Error(`Workspace sync failed (${response.status})`);
  const payload = (await response.json()) as { layout?: unknown };
  if (payload.layout === null) return null;
  if (!isWorkspaceLayout(payload.layout)) {
    throw new Error("Workspace sync returned an invalid layout");
  }
  return payload.layout;
}

export async function readAccountWorkspaceLayout(
  signal?: AbortSignal,
): Promise<WorkspaceLayout | null> {
  const response = await apiFetch("/api/account/workspace", {
    skipSessionExpiryRedirect: true,
    signal,
  });
  return readLayoutResponse(response);
}

export async function writeAccountWorkspaceLayout(
  layout: WorkspaceLayout,
  signal?: AbortSignal,
): Promise<WorkspaceLayout> {
  const response = await apiFetch("/api/account/workspace", {
    method: "PUT",
    body: JSON.stringify(layout),
    headers: { "Content-Type": "application/json" },
    redirectOnUnauthorized: false,
    skipSessionExpiryRedirect: true,
    signal,
  });
  const saved = await readLayoutResponse(response);
  if (!saved) throw new Error("Workspace sync did not confirm the saved layout");
  return saved;
}
