import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ScanText, Loader2, Save, Check, Award } from 'lucide-react';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

export interface ClassSubmission {
  id: number;
  title: string;
  content: string;
  studentName: string | null;
  studentUserId: string;
  assignmentId: number | null;
  status: string;
  grade: number | null;
  feedback: string | null;
  aiScore: number | null;
  aiReasoning: string | null;
  createdAt: string;
}

function aiColor(s: number): string {
  if (s >= 70) return '#f87171';
  if (s >= 40) return '#fbbf24';
  return '#4ade80';
}

const statusColor: Record<string, string> = {
  draft: 'rgba(228,228,231,0.5)',
  submitted: CRT,
  graded: '#4ade80',
};

// One submission row. Students see status + grade/feedback once graded. Teachers
// get a one-click authenticity check (reusing the /check endpoint) and inline
// grading. Reused by the free-form work tab and the assignments tab.
export default function SubmissionCard({
  classroomId, submission, isTeacher, maxPoints, onChanged,
}: {
  classroomId: number;
  submission: ClassSubmission;
  isTeacher: boolean;
  maxPoints?: number;
  onChanged?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(submission.aiScore);
  const [aiReasoning, setAiReasoning] = useState<string | null>(submission.aiReasoning);
  const [grade, setGrade] = useState<string>(submission.grade != null ? String(submission.grade) : '');
  const [feedback, setFeedback] = useState<string>(submission.feedback ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const runCheck = useCallback(async () => {
    if (checking || submission.content.trim().length < 20) return;
    setChecking(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: submission.content, submissionId: submission.id }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setAiScore(data.result.aiLikelihood);
        setAiReasoning(data.result.reasoning);
      }
    } catch { /* */ } finally { setChecking(false); }
  }, [checking, submission, classroomId]);

  const saveGrade = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/submissions/${submission.id}/grade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: grade === '' ? null : Number(grade), feedback }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); onChanged?.(); }
    } catch { /* */ } finally { setSaving(false); }
  }, [saving, grade, feedback, classroomId, submission.id, onChanged]);

  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8, padding: 14, background: 'rgba(255,255,255,0.02)', fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: '0.88rem', color: 'rgba(228,228,231,0.95)' }}>{submission.title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.62rem', color: statusColor[submission.status] ?? CRT, letterSpacing: '0.06em' }}>{submission.status.toUpperCase()}</span>
          {aiScore != null && <span style={{ fontSize: '0.66rem', color: aiColor(aiScore) }}>AI {aiScore}%</span>}
        </div>
      </div>
      {isTeacher && submission.studentName && <div style={{ fontSize: '0.66rem', opacity: 0.5, marginTop: 2 }}>by {submission.studentName}</div>}

      <p style={{ fontSize: '0.76rem', opacity: 0.72, lineHeight: 1.5, margin: '8px 0 0', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{submission.content || <em style={{ opacity: 0.5 }}>(empty draft)</em>}</p>

      {aiReasoning && (
        <p style={{ fontSize: '0.7rem', color: 'rgba(228,228,231,0.55)', lineHeight: 1.45, marginTop: 8, borderLeft: `2px solid ${aiScore != null ? aiColor(aiScore) : CRT}`, paddingLeft: 8 }}>{aiReasoning}</p>
      )}

      {/* Student-facing grade + feedback once graded */}
      {!isTeacher && submission.status === 'graded' && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(74,222,128,0.2)', paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: '0.78rem' }}>
            <Award size={14} /> Grade: {submission.grade ?? '—'}{maxPoints != null ? ` / ${maxPoints}` : ''}
          </div>
          {submission.feedback && <p style={{ fontSize: '0.74rem', opacity: 0.8, lineHeight: 1.5, marginTop: 6 }}>{submission.feedback}</p>}
        </div>
      )}

      {/* Teacher tools: authenticity check + inline grading */}
      {isTeacher && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(56,189,248,0.12)', paddingTop: 12 }}>
          <button
            onClick={() => void runCheck()}
            disabled={checking || submission.content.trim().length < 20}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
              color: CRT, border: '1px solid rgba(56,189,248,0.4)', borderRadius: 6, padding: '6px 10px',
              fontFamily: FONT, fontSize: '0.72rem', cursor: checking || submission.content.trim().length < 20 ? 'not-allowed' : 'pointer',
              opacity: submission.content.trim().length < 20 ? 0.5 : 1, marginBottom: 10,
            }}
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />} {aiScore != null ? 'Re-check authenticity' : 'Check authenticity'}
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number" min={0} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade"
              style={{ width: 90, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(228,228,231,0.9)', fontFamily: FONT, fontSize: '0.76rem', padding: '6px 8px', borderRadius: 6, outline: 'none' }}
            />
            {maxPoints != null && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>/ {maxPoints}</span>}
            <input
              value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback (optional)"
              style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(228,228,231,0.9)', fontFamily: FONT, fontSize: '0.76rem', padding: '6px 8px', borderRadius: 6, outline: 'none' }}
            />
            <button
              onClick={() => void saveGrade()}
              disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: CRT, color: '#04121c', border: 'none', borderRadius: 6, padding: '6px 12px', fontFamily: FONT, fontSize: '0.74rem', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />} {saved ? 'Saved' : 'Save grade'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
