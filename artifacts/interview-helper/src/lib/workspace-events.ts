export const WORKSPACE_FEATURE_ASSIGN_EVENT = "salaryman:workspace-feature-assign";

export function requestWorkspaceFeatureAssignment(path: string): void {
  if (typeof window === "undefined" || path === "/workspace") return;
  window.dispatchEvent(
    new CustomEvent<{ path: string }>(WORKSPACE_FEATURE_ASSIGN_EVENT, { detail: { path } }),
  );
}
