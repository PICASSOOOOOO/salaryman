export interface RecordingExcerpt {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  transcriptText: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractHighlight {
  id: string;
  category: "agreement" | "payment" | "term" | "cancellation" | "liability" | "other";
  text: string;
}

export interface RecordingWorkflowState {
  excerpts: RecordingExcerpt[];
  contractHighlights: ContractHighlight[];
  emailSentAt?: string;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function readRecordingWorkflowState(raw: string | null | undefined): RecordingWorkflowState {
  try {
    const root = asObject(JSON.parse(raw || "{}"));
    const state = asObject(root.__recordingWorkflow);
    return {
      excerpts: Array.isArray(state.excerpts) ? state.excerpts as RecordingExcerpt[] : [],
      contractHighlights: Array.isArray(state.contractHighlights) ? state.contractHighlights as ContractHighlight[] : [],
      ...(typeof state.emailSentAt === "string" ? { emailSentAt: state.emailSentAt } : {}),
    };
  } catch {
    return { excerpts: [], contractHighlights: [] };
  }
}

export function updateRecordingWorkflowState(
  raw: string | null | undefined,
  patch: Partial<RecordingWorkflowState>,
): string {
  let root: JsonObject = {};
  try {
    root = asObject(JSON.parse(raw || "{}"));
  } catch {
    // Preserve the ability to add metadata to legacy or malformed event cursors.
  }
  const current = asObject(root.__recordingWorkflow);
  root.__recordingWorkflow = { ...current, ...patch, version: 1 };
  return JSON.stringify(root);
}

const CONTRACT_RULES: Array<{ category: ContractHighlight["category"]; pattern: RegExp }> = [
  { category: "agreement", pattern: /\b(?:agree(?:d|ment)?|accept(?:ed|ance)?|contract|terms and conditions|binding)\b/i },
  { category: "payment", pattern: /\b(?:price|payment|deposit|invoice|fee|refund|non.?refundable|charge|cost)\b/i },
  { category: "term", pattern: /\b(?:effective date|term|renew(?:al)?|expires?|duration|deliver(?:y|able)|deadline)\b/i },
  { category: "cancellation", pattern: /\b(?:cancel(?:lation)?|terminate|termination|withdraw|notice period)\b/i },
  { category: "liability", pattern: /\b(?:liability|warranty|guarantee|indemnif|damages|confidentiality)\b/i },
];

export function findContractualHighlights(transcript: string): ContractHighlight[] {
  const passages = transcript
    .split(/\n+|(?<=[.!?])\s+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 18 && text.length <= 700);
  const highlights: ContractHighlight[] = [];
  const seen = new Set<string>();
  for (const text of passages) {
    const normalized = text.toLocaleLowerCase();
    if (seen.has(normalized)) continue;
    const rule = CONTRACT_RULES.find((candidate) => candidate.pattern.test(text));
    if (!rule) continue;
    highlights.push({
      id: `hint-${highlights.length + 1}`,
      category: rule.category,
      text,
    });
    seen.add(normalized);
    if (highlights.length >= 20) break;
  }
  return highlights;
}

export function validateRecordingExcerpts(
  input: unknown,
  durationSeconds: number | null,
  now = new Date(),
): RecordingExcerpt[] | null {
  if (!Array.isArray(input) || input.length > 40) return null;
  const maxMs = Math.max(0, (durationSeconds ?? 0) * 1000);
  const ids = new Set<string>();
  const out: RecordingExcerpt[] = [];
  for (const raw of input) {
    const item = asObject(raw);
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 64) : "";
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 120) : "";
    const startMs = Number(item.startMs);
    const endMs = Number(item.endMs);
    if (
      !id || ids.has(id) || !label ||
      !Number.isInteger(startMs) || !Number.isInteger(endMs) ||
      startMs < 0 || endMs <= startMs || endMs > maxMs ||
      endMs - startMs > 10 * 60 * 1000
    ) return null;
    ids.add(id);
    const text = typeof item.transcriptText === "string" ? item.transcriptText.trim().slice(0, 2000) : "";
    const createdAt = typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
      ? item.createdAt
      : now.toISOString();
    out.push({
      id,
      label,
      startMs,
      endMs,
      transcriptText: text,
      createdAt,
      updatedAt: now.toISOString(),
    });
  }
  return out;
}
