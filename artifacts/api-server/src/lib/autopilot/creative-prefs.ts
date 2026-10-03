export interface CreativeWorkPrefs {
  projectId: number | null;
}

export function sanitizeCreativeWorkPrefs(raw: unknown): CreativeWorkPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { projectId: null };
  }

  const candidate = (raw as Record<string, unknown>).projectId;
  const projectId = typeof candidate === "number" || typeof candidate === "string"
    ? Number(candidate)
    : NaN;

  return {
    projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null,
  };
}

export const readCreativeWorkPrefs = sanitizeCreativeWorkPrefs;