export interface CreativeWorkPrefs {
  projectId: number | null;
  focus: string;
}

export function sanitizeCreativeWorkPrefs(raw: unknown): CreativeWorkPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { projectId: null, focus: "" };
  }

  const prefs = raw as Record<string, unknown>;
  const candidate = prefs.projectId;
  const projectId = typeof candidate === "number" || typeof candidate === "string"
    ? Number(candidate)
    : NaN;
  const focus = typeof prefs.focus === "string" ? prefs.focus.trim().slice(0, 1000) : "";

  return {
    projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null,
    focus,
  };
}

export const readCreativeWorkPrefs = sanitizeCreativeWorkPrefs;