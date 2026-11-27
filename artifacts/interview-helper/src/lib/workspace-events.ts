export const WORKSPACE_FEATURE_ASSIGN_EVENT = "salaryman:workspace-feature-assign";
export const WORKSPACE_FEATURE_OPEN_EVENT = "salaryman:workspace-feature-open";

let pendingWorkspaceFeaturePath: string | null = null;

export function requestWorkspaceFeatureAssignment(path: string): void {
  if (typeof window === "undefined" || path === "/workspace") return;
  window.dispatchEvent(
    new CustomEvent<{ path: string }>(WORKSPACE_FEATURE_ASSIGN_EVENT, { detail: { path } }),
  );
}

export function requestWorkspaceFeatureOpen(path: string): void {
  if (typeof window === "undefined" || path === "/workspace") return;
  window.dispatchEvent(
    new CustomEvent<{ path: string }>(WORKSPACE_FEATURE_OPEN_EVENT, { detail: { path } }),
  );
}

export function queueWorkspaceFeatureOpen(path: string): void {
  if (path && path !== "/workspace") pendingWorkspaceFeaturePath = path;
}

export function consumeQueuedWorkspaceFeatureOpen(): string | null {
  const path = pendingWorkspaceFeaturePath;
  pendingWorkspaceFeaturePath = null;
  return path;
}
