import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Plus, Loader2, Trash2, Sparkles, ClipboardList, Send, ChevronDown, ChevronRight,
  CalendarClock, Award, Save,
} from 'lucide-react';
import Translatable from './Translatable';
import WritingField from './WritingField';
import SubmissionCard, { type ClassSubmission } from './SubmissionCard';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

export interface AssignmentSummary {
  id: number;
  lessonId: number | null;
  title: string;
  prompt: string | null;
  dueAt: string | null;
  points: number;
  published: boolean;
  hasCache: boolean;
  cacheGeneratedAt: string | null;
}

interface PracticeQuestion { kind: 'mcq' | 'short' | 'essay'; q: string; choices?: string[]; answer?: string }
interface AssignmentCache { summary?: string; questions: PracticeQuestion[] }
interface AssignmentDetail {
  assignment: AssignmentSummary & { cache: AssignmentCache | null };
  submissions: ClassSubmission[];
}
interface LessonLite { id: number; title: string }

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(228,228,231,0.9)', fontFamily: FONT, fontSize: '0.82rem',
  padding: '9px 12px', outline: 'none', width: '100%', borderRadius: 6,
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
  background: CRT, color: '#04121c', border: 'none', borderRadius: 6,
  fontFamily: FONT, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
};

function fmtDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AssignmentsTab({
  classroomId, isTeacher, assignments, lessons, onChanged,
}: {
  classroomId: number;
  isTeacher: boolean;
  assignments: AssignmentSummary[];
  lessons: LessonLite[];
  onChanged: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isTeacher && <CreateAssignment classroomId={classroomId} lessons={lessons} onChanged={onChanged} />}
      {assignments.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: '0.82rem' }}>
          No assignments yet.{isTeacher ? ' Create one above.' : ' Check back soon.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assignments.map((a) => (
            <AssignmentRow key={a.id} classroomId={classroomId} isTeacher={isTeacher} summary={a} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAssignment({ classroomId, lessons, onChanged }: { classroomId: number; lessons: LessonLite[]; onChanged: () => void }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [lessonId, setLessonId] = useState<number | ''>('');
  const [dueAt, setDueAt] = useState('');
  const [points, setPoints] = useState('100');
  const [saving, setSaving] = useState(false);

  const create = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, prompt,
          lessonId: lessonId === '' ? undefined : lessonId,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          points: points === '' ? 100 : Number(points),
        }),
      });
      if (res.ok) { setTitle(''); setPrompt(''); setLessonId(''); setDueAt(''); setPoints('100'); onChanged(); }
    } catch { /* */ } finally { setSaving(false); }
  }, [title, prompt, lessonId, dueAt, points, saving, classroomId, onChanged]);

  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 16 }}>
      <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={15} /> NEW ASSIGNMENT</div>
      <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Assignment title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }} rows={3} placeholder="Instructions / prompt…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        {lessons.length > 0 && (
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle}>
            <option value="">— Link a lesson (optional) —</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        )}
        <input type="datetime-local" style={inputStyle} value={dueAt} onChange={(e) => setDueAt(e.target.value)} title="Due date" />
        <input type="number" min={0} style={inputStyle} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Points" title="Points" />
      </div>
      <button onClick={() => void create()} disabled={saving || !title.trim()} style={{ ...primaryBtn, opacity: saving || !title.trim() ? 0.5 : 1 }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create assignment
      </button>
    </div>
  );
}

function AssignmentRow({ classroomId, isTeacher, summary, onChanged }: { classroomId: number; isTeacher: boolean; summary: AssignmentSummary; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/assignments/${summary.id}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* */ } finally { setLoading(false); }
  }, [classroomId, summary.id]);

  useEffect(() => { if (open && !detail) void load(); }, [open, detail, load]);

  const toggle = () => setOpen((o) => !o);

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/assignments/${summary.id}/generate`, { method: 'POST' });
      if (res.ok) { setDetail(null); await load(); onChanged(); }
    } catch { /* */ } finally { setGenerating(false); }
  }, [generating, classroomId, summary.id, load, onChanged]);

  const remove = useCallback(async () => {
    await apiFetch(`/api/education/classrooms/${classroomId}/assignments/${summary.id}`, { method: 'DELETE' });
    onChanged();
  }, [classroomId, summary.id, onChanged]);

  const due = fmtDue(summary.dueAt);

  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, cursor: 'pointer' }} onClick={toggle}>
        {open ? <ChevronDown size={16} color={CRT} /> : <ChevronRight size={16} color={CRT} />}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(228,228,231,0.95)', fontSize: '0.9rem' }}>
            <ClipboardList size={15} color={CRT} /> {summary.title}
            {isTeacher && !summary.published && <span style={{ fontSize: '0.6rem', color: 'rgba(228,228,231,0.5)' }}>(unpublished)</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.68rem', opacity: 0.6 }}>
            {due && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarClock size={11} /> due {due}</span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Award size={11} /> {summary.points} pts</span>
            {summary.hasCache && <span style={{ color: 'rgba(56,189,248,0.7)' }}>● homework ready</span>}
          </div>
        </div>
        {isTeacher && (
          <button onClick={(e) => { e.stopPropagation(); void remove(); }} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', cursor: 'pointer' }}><Trash2 size={15} /></button>
        )}
      </div>

      {open && (
        <div style={{ borderTop: '1px solid rgba(56,189,248,0.12)', padding: 14 }}>
          {summary.prompt && <Translatable text={summary.prompt} style={{ fontSize: '0.8rem', opacity: 0.85, lineHeight: 1.55, margin: 0 }} />}

          {isTeacher && (
            <button
              onClick={() => void generate()}
              disabled={generating}
              style={{ ...primaryBtn, marginTop: 12, background: 'transparent', color: CRT, border: '1px solid rgba(56,189,248,0.4)' }}
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {summary.hasCache ? 'Regenerate homework set' : 'Generate homework set'}
            </button>
          )}

          {loading ? (
            <div style={{ marginTop: 12 }}><Loader2 className="animate-spin" color={CRT} /></div>
          ) : detail ? (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {detail.assignment.cache && <HomeworkCache cache={detail.assignment.cache} isTeacher={isTeacher} />}
              {isTeacher ? (
                <div>
                  <div style={{ color: CRT, fontSize: '0.74rem', marginBottom: 8 }}>SUBMISSIONS ({detail.submissions.length})</div>
                  {detail.submissions.length === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: '0.78rem' }}>No submissions yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {detail.submissions.map((s) => (
                        <SubmissionCard key={s.id} classroomId={classroomId} submission={s} isTeacher maxPoints={summary.points} onChanged={() => { setDetail(null); void load(); }} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <StudentWork classroomId={classroomId} assignment={summary} mine={detail.submissions[0] ?? null} onSaved={() => { setDetail(null); void load(); onChanged(); }} />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function HomeworkCache({ cache, isTeacher }: { cache: AssignmentCache; isTeacher: boolean }) {
  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.18)', borderRadius: 8, background: 'rgba(56,189,248,0.03)', padding: 14 }}>
      <div style={{ color: CRT, fontSize: '0.74rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> PRACTICE SET</div>
      {cache.summary && <Translatable text={cache.summary} style={{ fontSize: '0.78rem', opacity: 0.85, lineHeight: 1.5, margin: '0 0 10px' }} />}
      <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cache.questions.map((q, i) => (
          <li key={i} style={{ fontSize: '0.78rem', color: 'rgba(228,228,231,0.88)', lineHeight: 1.5 }}>
            <span style={{ fontSize: '0.58rem', color: 'rgba(56,189,248,0.6)', marginRight: 6, letterSpacing: '0.06em' }}>{q.kind.toUpperCase()}</span>
            {q.q}
            {q.choices && q.choices.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, opacity: 0.8 }}>
                {q.choices.map((c, j) => (
                  <li key={j} style={{ fontSize: '0.74rem', color: isTeacher && q.answer === c ? '#4ade80' : 'rgba(228,228,231,0.75)' }}>
                    {c}{isTeacher && q.answer === c ? '  ✓' : ''}
                  </li>
                ))}
              </ul>
            )}
            {isTeacher && q.answer && (!q.choices || q.choices.length === 0) && (
              <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: 4 }}>Answer: {q.answer}</div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StudentWork({ classroomId, assignment, mine, onSaved }: { classroomId: number; assignment: AssignmentSummary; mine: ClassSubmission | null; onSaved: () => void }) {
  const [content, setContent] = useState(mine?.content ?? '');
  const [busy, setBusy] = useState(false);

  // If already graded, show the result read-only.
  if (mine && mine.status === 'graded') {
    return <SubmissionCard classroomId={classroomId} submission={mine} isTeacher={false} maxPoints={assignment.points} />;
  }

  const save = useCallback(async (status: 'draft' | 'submitted') => {
    if (busy) return;
    if (status === 'submitted' && !content.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: assignment.title, content, assignmentId: assignment.id, lessonId: assignment.lessonId ?? undefined, status }),
      });
      if (res.ok) onSaved();
    } catch { /* */ } finally { setBusy(false); }
  }, [busy, content, classroomId, assignment, onSaved]);

  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.18)', borderRadius: 8, background: 'rgba(56,189,248,0.03)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ color: CRT, fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 6 }}><Send size={13} /> YOUR WORK</div>
        {mine && <span style={{ fontSize: '0.62rem', color: mine.status === 'submitted' ? CRT : 'rgba(228,228,231,0.5)' }}>{mine.status.toUpperCase()}</span>}
      </div>
      <WritingField value={content} onChange={setContent} placeholder="Write your answer here…" rows={7} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => void save('draft')} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: CRT, border: '1px solid rgba(56,189,248,0.4)', borderRadius: 6, padding: '8px 14px', fontFamily: FONT, fontSize: '0.78rem', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft
        </button>
        <button onClick={() => void save('submitted')} disabled={busy || !content.trim()} style={{ ...primaryBtn, opacity: busy || !content.trim() ? 0.5 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {mine?.status === 'submitted' ? 'Update submission' : 'Turn in'}
        </button>
      </div>
    </div>
  );
}
