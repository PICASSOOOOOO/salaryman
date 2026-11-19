import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, ScanText, X } from "lucide-react";
import {
  ReviewClassroomSubmissionWritingResponse,
  type ClassroomSubmissionWritingReviewResponse,
} from "@workspace/api-zod";
import { apiFetch } from "@/lib/api-client";

const CRT = "#38bdf8";
const FONT = "var(--font-sans)";

function FindingsList({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, color: CRT, fontSize: "0.72rem", letterSpacing: "0.08em" }}>{title}</h3>
      {items.length ? (
        <ul style={{ margin: "7px 0 0", paddingLeft: 20, color: "rgba(228,228,231,0.82)", fontSize: "0.78rem", lineHeight: 1.55 }}>
          {items.map((item, index) => <li key={`${index}-${item.slice(0, 24)}`} style={{ marginTop: 4 }}>{item}</li>)}
        </ul>
      ) : (
        <p style={{ margin: "7px 0 0", color: "rgba(228,228,231,0.58)", fontSize: "0.76rem" }}>No specific items to discuss.</p>
      )}
    </section>
  );
}

export default function ClassroomWritingReview({
  classroomId,
  submissionId,
  canReview,
}: {
  classroomId: number;
  submissionId: number;
  canReview: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassroomSubmissionWritingReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    setLoading(false);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  const runReview = useCallback(async () => {
    if (!canReview || loading) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiFetch(
        `/api/education/classrooms/${classroomId}/submissions/${submissionId}/writing-review`,
        { method: "POST", signal: controller.signal },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Writing review is unavailable.");
        return;
      }
      const parsed = ReviewClassroomSubmissionWritingResponse.safeParse(payload);
      if (!parsed.success) {
        setError("The review returned an unexpected response. No review was saved.");
        return;
      }
      setResult(parsed.data);
    } catch {
      if (!controller.signal.aborted) setError("Could not complete the writing review. Please retry.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setLoading(false);
    }
  }, [canReview, loading, classroomId, submissionId]);

  return (
    <>
      <button
        type="button"
        onClick={() => void runReview()}
        disabled={!canReview || loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
          color: CRT, border: "1px solid rgba(56,189,248,0.4)", borderRadius: 6, padding: "7px 10px",
          fontFamily: FONT, fontSize: "0.72rem", cursor: !canReview || loading ? "not-allowed" : "pointer",
          opacity: canReview ? 1 : 0.5,
        }}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />}
        Review writing
      </button>

      {open && (
        <div
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 12, background: "rgba(0,0,0,0.72)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="classroom-writing-review-title"
            onKeyDown={(event) => { if (event.key === "Escape") close(); }}
            style={{
              width: "min(620px, 100%)", maxHeight: "min(82vh, 760px)", overflow: "auto",
              background: "#0b1220", color: "rgba(228,228,231,0.92)", border: "1px solid rgba(56,189,248,0.32)",
              borderRadius: 10, padding: 18, fontFamily: FONT, boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <h2 id="classroom-writing-review-title" style={{ margin: 0, color: CRT, fontSize: "0.92rem" }}>Teacher writing review</h2>
                <p style={{ margin: "4px 0 0", color: "rgba(228,228,231,0.5)", fontSize: "0.68rem" }}>A discussion aid, not an authorship test.</p>
              </div>
              <button type="button" aria-label="Close writing review" onClick={close} autoFocus
                style={{ display: "inline-flex", border: "1px solid rgba(228,228,231,0.2)", borderRadius: 5, padding: 6, background: "transparent", color: "inherit", cursor: "pointer" }}>
                <X size={15} />
              </button>
            </header>

            <div style={{ display: "flex", gap: 8, marginTop: 14, padding: 10, borderRadius: 6, background: "rgba(251,191,36,0.08)", color: "rgba(253,230,138,0.92)", fontSize: "0.7rem", lineHeight: 1.45 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Temporary review only. The submission and these findings are not saved by this review. Do not use the output to grade, accuse, report, or discipline a student.</span>
            </div>

            {loading && (
              <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, color: "rgba(228,228,231,0.7)", fontSize: "0.78rem" }}>
                <Loader2 size={15} className="animate-spin" /> Reviewing submitted writing…
              </div>
            )}
            {error && <p role="alert" style={{ marginTop: 16, color: "#fca5a5", fontSize: "0.78rem" }}>{error}</p>}

            {result && (
              <div aria-live="polite" style={{ marginTop: 6 }}>
                {result.truncated && (
                  <p style={{ margin: "14px 0 0", color: "rgba(228,228,231,0.62)", fontSize: "0.7rem" }}>
                    Review covered the first {result.reviewedCharacters.toLocaleString()} characters.
                  </p>
                )}
                <FindingsList title="POTENTIAL WRITING PATTERNS" items={result.findings.potentialPatterns} />
                <FindingsList title="OTHER POSSIBLE EXPLANATIONS" items={result.findings.alternativeExplanations} />
                <FindingsList title="NEUTRAL CONVERSATION QUESTIONS" items={result.findings.conversationQuestions} />
                <div style={{ marginTop: 18, borderTop: "1px solid rgba(228,228,231,0.12)", paddingTop: 12 }}>
                  <h3 style={{ margin: 0, color: "rgba(228,228,231,0.65)", fontSize: "0.68rem", letterSpacing: "0.06em" }}>LIMITATIONS</h3>
                  {result.limitations.map((item, index) => (
                    <p key={`${index}-${item.slice(0, 24)}`} style={{ margin: "7px 0 0", color: "rgba(228,228,231,0.58)", fontSize: "0.68rem", lineHeight: 1.45 }}>{item}</p>
                  ))}
                </div>
              </div>
            )}

            <footer style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, borderTop: "1px solid rgba(228,228,231,0.1)", paddingTop: 12 }}>
              <button type="button" onClick={close}
                style={{ border: "1px solid rgba(228,228,231,0.25)", borderRadius: 5, padding: "7px 12px", background: "transparent", color: "inherit", fontFamily: FONT, fontSize: "0.72rem", cursor: "pointer" }}>
                Close review
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
