import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';
import { Link } from 'wouter';
import {
  GraduationCap, Plus, LogIn, Loader2, Copy, Check, BookOpen, Trash2,
  Users, ChevronRight, ArrowLeft, ShieldCheck, PenTool, Music2, Image as ImageIcon,
  FolderOpen, Palette, Send, FileText, UserCog, Languages, StickyNote,
} from 'lucide-react';
import LiveLesson from '@/components/classroom/LiveLesson';
import TutorPanel from '@/components/classroom/TutorPanel';
import PlagiarismChecker from '@/components/classroom/PlagiarismChecker';
import AssignmentsTab, { type AssignmentSummary } from '@/components/classroom/AssignmentsTab';
import SubmissionCard, { type ClassSubmission } from '@/components/classroom/SubmissionCard';
import SplitWorkspace, { type SplitModule } from '@/components/classroom/SplitWorkspace';
import Translatable from '@/components/classroom/Translatable';
import WritingField from '@/components/classroom/WritingField';
import { LanguageSelector } from '@/components/LanguageSelector';
import { CurrencySelector } from '@/components/CurrencySelector';
import { translateText } from '@/lib/translate';
import { getCurrentLanguage } from '@/i18n';
import { useFeatureLabel } from '@/hooks/use-feature-label';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

interface ClassroomSummary {
  id: number;
  name: string;
  description: string | null;
  joinCode: string;
  ownerUserId: string;
  liveActive: boolean;
  myRole: 'teacher' | 'student';
  isOwner: boolean;
}

interface Member { userId: string; role: 'teacher' | 'student'; displayName: string | null; joinedAt: string }
interface Lesson { id: number; title: string; body: string | null; resourceUrl: string | null; createdAt: string }
interface ClassroomDetail {
  classroom: ClassroomSummary & { liveStartedAt: string | null; liveRoom: string };
  myRole: 'teacher' | 'student';
  isOwner: boolean;
  members: Member[];
  lessons: Lesson[];
  assignments: AssignmentSummary[];
}

// Learning tools surfaced in the in-classroom launcher.
const LEARN_TOOLS = [
  { path: '/creative/writer', label: 'HEMINGWAY', icon: PenTool, teacherOnly: false },
  { path: '/creative/music', label: 'HUMMING BIRD', icon: Music2, teacherOnly: false },
  { path: '/creative/media', label: 'MEDIA VAULT', icon: FolderOpen, teacherOnly: false },
  { path: '/business/documents', label: 'DOCUMENTS', icon: FileText, teacherOnly: false },
  { path: '/creative/darkroom', label: 'DARK ROOM', icon: ImageIcon, teacherOnly: true },
  { path: '/creative/design', label: 'DESIGN STUDIO', icon: Palette, teacherOnly: true },
];

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(228,228,231,0.9)', fontFamily: FONT, fontSize: '0.85rem',
  padding: '10px 12px', outline: 'none', width: '100%', borderRadius: 6,
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
  background: CRT, color: '#04121c', border: 'none', borderRadius: 6,
  fontFamily: FONT, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
};

export default function Classroom() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const { label } = useFeatureLabel();
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiFetch('/api/education/classrooms');
      if (res.ok) {
        const data = await res.json();
        setClassrooms(data.classrooms ?? []);
      }
    } catch { /* */ } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadList();
    else if (!isLoading) setLoadingList(false);
  }, [isAuthenticated, isLoading, loadList]);

  if (isLoading) {
    return <div style={{ padding: 40, color: CRT, fontFamily: FONT }}><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: 'rgba(228,228,231,0.9)' }}>
        <div style={{ textAlign: 'center' }}>
          <GraduationCap size={40} color={CRT} style={{ marginBottom: 16 }} />
          <h1 style={{ color: CRT, fontSize: '1.2rem', marginBottom: 8 }}>{label.toUpperCase()}</h1>
          <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: 20 }}>Sign in to host or join a {label.toLowerCase()}.</p>
          <button onClick={() => login()} style={primaryBtn}><LogIn size={15} /> Sign In</button>
        </div>
      </div>
    );
  }

  if (selectedId != null) {
    return <ClassroomView classroomId={selectedId} onBack={() => { setSelectedId(null); loadList(); }} />;
  }

  return (
    <ClassroomList
      classrooms={classrooms}
      loading={loadingList}
      onOpen={(id) => setSelectedId(id)}
      onChanged={loadList}
    />
  );
}

// ── Hub: list + create + join ────────────────────────────────────────────────
function ClassroomList({
  classrooms, loading, onOpen, onChanged,
}: {
  classrooms: ClassroomSummary[];
  loading: boolean;
  onOpen: (id: number) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { label } = useFeatureLabel();
  const lower = label.toLowerCase();

  const create = useCallback(async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/education/classrooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Failed to create'); return; }
      setName(''); setDescription('');
      onChanged();
    } catch { setError('Failed to create'); } finally { setCreating(false); }
  }, [name, description, creating, onChanged]);

  const join = useCallback(async () => {
    if (!joinCode.trim() || joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await apiFetch('/api/education/classrooms/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Failed to join'); return; }
      setJoinCode('');
      onChanged();
    } catch { setError('Failed to join'); } finally { setJoining(false); }
  }, [joinCode, joining, onChanged]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px', fontFamily: FONT, color: 'rgba(228,228,231,0.9)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <GraduationCap size={26} color={CRT} />
        <h1 style={{ color: CRT, fontSize: '1.4rem', letterSpacing: '0.06em', margin: 0 }}>{label.toUpperCase()}</h1>
      </div>
      <p style={{ fontSize: '0.82rem', opacity: 0.6, marginBottom: 24 }}>Host live sessions, join with a code, collaborate with an embedded assistant.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={{ border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 18 }}>
          <div style={{ color: CRT, fontSize: '0.82rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> CREATE A {label.toUpperCase()}</div>
          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder={`${label} name`} value={name} onChange={(e) => setName(e.target.value)} />
          <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button onClick={() => void create()} disabled={creating || !name.trim()} style={{ ...primaryBtn, opacity: creating || !name.trim() ? 0.5 : 1 }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create (you'll be the host)
          </button>
        </div>

        <div style={{ border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 18 }}>
          <div style={{ color: CRT, fontSize: '0.82rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><LogIn size={15} /> JOIN WITH A CODE</div>
          <input
            style={{ ...inputStyle, marginBottom: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}
            placeholder="JOIN CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') void join(); }}
          />
          <button onClick={() => void join()} disabled={joining || !joinCode.trim()} style={{ ...primaryBtn, opacity: joining || !joinCode.trim() ? 0.5 : 1 }}>
            {joining ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} {label === 'Classroom' ? 'Join as student' : 'Join session'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: 16 }}>{error}</div>}

      <div style={{ color: CRT, fontSize: '0.78rem', letterSpacing: '0.08em', marginBottom: 12 }}>MY {label.toUpperCase()}S</div>
      {loading ? (
        <Loader2 className="animate-spin" color={CRT} />
      ) : classrooms.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: '0.82rem' }}>No {lower}s yet. Create one or join with a code.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {classrooms.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              style={{
                textAlign: 'left', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', padding: 16, cursor: 'pointer', color: 'inherit', fontFamily: FONT,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(228,228,231,0.95)', fontSize: '0.95rem', fontWeight: 600 }}>{c.name}</span>
                <ChevronRight size={16} color={CRT} />
              </div>
              {c.description && <p style={{ fontSize: '0.74rem', opacity: 0.6, margin: '6px 0 10px' }}>{c.description}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{
                  fontSize: '0.62rem', padding: '2px 8px', borderRadius: 99,
                  background: c.myRole === 'teacher' ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.06)',
                  color: c.myRole === 'teacher' ? CRT : 'rgba(228,228,231,0.6)',
                }}>{c.myRole.toUpperCase()}</span>
                {c.liveActive && <span style={{ fontSize: '0.62rem', color: '#f87171' }}>● LIVE</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── In-classroom view ────────────────────────────────────────────────────────
function ClassroomView({ classroomId, onBack }: { classroomId: number; onBack: () => void }) {
  const { user } = useAuth();
  const { label } = useFeatureLabel();
  const liveLabel = label === 'Classroom' ? 'LIVE LESSON' : 'LIVE SESSION';
  const [detail, setDetail] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'lessons' | 'assignments' | 'live' | 'tutor' | 'split' | 'tools' | 'work'>('lessons');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* */ } finally { setLoading(false); }
  }, [classroomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, color: CRT, fontFamily: FONT }}><Loader2 className="animate-spin" /></div>;
  if (!detail) return (
    <div style={{ padding: 40, fontFamily: FONT, color: 'rgba(228,228,231,0.8)' }}>
      <button onClick={onBack} style={{ ...primaryBtn, marginBottom: 16 }}><ArrowLeft size={14} /> Back</button>
      <div>Couldn't load this classroom (you may not be a member).</div>
    </div>
  );

  const isTeacher = detail.myRole === 'teacher';
  const c = detail.classroom;
  const displayName = (user?.firstName || user?.email?.split('@')[0] || 'MEMBER').toUpperCase();

  const startLive = async () => {
    const r = await apiFetch(`/api/education/classrooms/${classroomId}/live/start`, { method: 'POST' });
    if (!r.ok) throw new Error('Failed to start live lesson');
    load();
  };
  const stopLive = async () => {
    await apiFetch(`/api/education/classrooms/${classroomId}/live/stop`, { method: 'POST' });
    load();
  };

  const tabs: Array<{ id: typeof tab; label: string; show: boolean }> = [
    { id: 'lessons', label: 'LESSONS', show: true },
    { id: 'assignments', label: 'ASSIGNMENTS', show: true },
    { id: 'live', label: liveLabel, show: true },
    { id: 'tutor', label: 'TUTOR', show: true },
    { id: 'split', label: 'SPLIT VIEW', show: true },
    { id: 'tools', label: 'TOOLS', show: true },
    { id: 'work', label: isTeacher ? 'STUDENT WORK' : 'MY WORK', show: true },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: FONT, color: 'rgba(228,228,231,0.9)' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: CRT, fontFamily: FONT, fontSize: '0.78rem', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <ArrowLeft size={14} /> All classrooms
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ color: CRT, fontSize: '1.3rem', margin: 0 }}>{c.name}</h1>
            <span style={{
              fontSize: '0.62rem', padding: '2px 8px', borderRadius: 99,
              background: isTeacher ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.06)',
              color: isTeacher ? CRT : 'rgba(228,228,231,0.6)',
            }}>{detail.myRole.toUpperCase()}</span>
          </div>
          {c.description && <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: '6px 0 0' }}>{c.description}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageSelector />
          <CurrencySelector />
          <button
            onClick={() => { navigator.clipboard?.writeText(c.joinCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.06)', color: CRT, borderRadius: 6, padding: '8px 12px', fontFamily: FONT, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.15em' }}
            title="Copy join code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {c.joinCode}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(56,189,248,0.15)', marginBottom: 18, flexWrap: 'wrap' }}>
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', background: 'none', border: 'none', borderBottom: tab === t.id ? `2px solid ${CRT}` : '2px solid transparent',
              color: tab === t.id ? CRT : 'rgba(228,228,231,0.55)', fontFamily: FONT, fontSize: '0.76rem', cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'lessons' && <LessonsTab detail={detail} isTeacher={isTeacher} onChanged={load} />}
      {tab === 'assignments' && (
        <AssignmentsTab
          classroomId={classroomId}
          isTeacher={isTeacher}
          assignments={detail.assignments}
          lessons={detail.lessons.map((l) => ({ id: l.id, title: l.title }))}
          onChanged={load}
        />
      )}
      {tab === 'live' && (
        <LiveLesson
          room={c.liveRoom}
          displayName={displayName}
          isTeacher={isTeacher}
          active={c.liveActive}
          onStart={startLive}
          onStop={stopLive}
        />
      )}
      {tab === 'tutor' && <TutorPanel classroomName={c.name} />}
      {tab === 'split' && (
        <SplitWorkspace
          storageKey={`classroom-split-${classroomId}`}
          initialLeft="lessons"
          initialRight={isTeacher ? 'live' : 'tutor'}
          modules={[
            { id: 'lessons', label: 'Lessons', render: () => <LessonsReadonly lessons={detail.lessons} /> },
            { id: 'tutor', label: 'Tutor', render: () => <TutorPanel classroomName={c.name} /> },
            { id: 'translator', label: 'Translator', singleton: true, render: () => <TranslatorScratch /> },
            { id: 'notes', label: 'Notes', render: () => <NotesPad classroomId={classroomId} /> },
            {
              id: 'live',
              label: label === 'Classroom' ? 'Live lesson' : 'Live session',
              render: () => (
                <LiveLesson room={c.liveRoom} displayName={displayName} isTeacher={isTeacher} active={c.liveActive} onStart={startLive} onStop={stopLive} />
              ),
            },
          ]}
        />
      )}
      {tab === 'tools' && <ToolsTab isTeacher={isTeacher} members={detail.members} classroomId={classroomId} onChanged={load} />}
      {tab === 'work' && <WorkTab classroomId={classroomId} isTeacher={isTeacher} lessons={detail.lessons} />}
    </div>
  );
}

function LessonsTab({ detail, isTeacher, onChanged }: { detail: ClassroomDetail; isTeacher: boolean; onChanged: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const classroomId = detail.classroom.id;

  const add = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/lessons`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, resourceUrl }),
      });
      if (res.ok) { setTitle(''); setBody(''); setResourceUrl(''); onChanged(); }
    } catch { /* */ } finally { setSaving(false); }
  }, [title, body, resourceUrl, saving, classroomId, onChanged]);

  const remove = useCallback(async (id: number) => {
    await apiFetch(`/api/education/classrooms/${classroomId}/lessons/${id}`, { method: 'DELETE' });
    onChanged();
  }, [classroomId, onChanged]);

  return (
    <div>
      {isTeacher && (
        <div style={{ border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 16, marginBottom: 18 }}>
          <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 10 }}>NEW LESSON / MATERIAL</div>
          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }} rows={4} placeholder="Lesson content / notes…" value={body} onChange={(e) => setBody(e.target.value)} />
          <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="Resource link (optional)" value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} />
          <button onClick={() => void add()} disabled={saving || !title.trim()} style={{ ...primaryBtn, opacity: saving || !title.trim() ? 0.5 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add lesson
          </button>
        </div>
      )}

      {detail.lessons.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: '0.82rem' }}>No lessons yet.{isTeacher ? '' : ' Check back soon.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.lessons.map((l) => (
            <div key={l.id} style={{ border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8, padding: 14, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(228,228,231,0.95)', fontSize: '0.92rem' }}>
                  <BookOpen size={15} color={CRT} /> {l.title}
                </div>
                {isTeacher && (
                  <button onClick={() => void remove(l.id)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                )}
              </div>
              {l.body && <div style={{ marginTop: 8 }}><Translatable text={l.body} style={{ fontSize: '0.8rem', opacity: 0.75, lineHeight: 1.55, margin: 0 }} /></div>}
              {l.resourceUrl && <a href={l.resourceUrl} target="_blank" rel="noreferrer" style={{ color: CRT, fontSize: '0.74rem', marginTop: 8, display: 'inline-block' }}>↗ resource link</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only lessons list used inside the split workspace (with translation).
function LessonsReadonly({ lessons }: { lessons: Lesson[] }) {
  if (lessons.length === 0) return <div style={{ opacity: 0.5, fontSize: '0.8rem' }}>No lessons yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lessons.map((l) => (
        <div key={l.id} style={{ border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(228,228,231,0.95)', fontSize: '0.86rem' }}>
            <BookOpen size={14} color={CRT} /> {l.title}
          </div>
          {l.body && <div style={{ marginTop: 6 }}><Translatable text={l.body} style={{ fontSize: '0.76rem', opacity: 0.75, lineHeight: 1.5, margin: 0 }} /></div>}
          {l.resourceUrl && <a href={l.resourceUrl} target="_blank" rel="noreferrer" style={{ color: CRT, fontSize: '0.72rem', marginTop: 6, display: 'inline-block' }}>↗ resource link</a>}
        </div>
      ))}
    </div>
  );
}

// Free-form translation scratchpad. Singleton in the split (never two at once).
function TranslatorScratch() {
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const run = useCallback(async () => {
    if (!src.trim() || busy) return;
    setBusy(true); setErr(false);
    try { setOut(await translateText(src, getCurrentLanguage())); }
    catch { setErr(true); }
    finally { setBusy(false); }
  }, [src, busy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: CRT, fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Languages size={14} /> TRANSLATOR</span>
        <LanguageSelector compact />
      </div>
      <textarea
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        placeholder="Paste or type text to translate…"
        style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
      />
      <button onClick={() => void run()} disabled={busy || !src.trim()} style={{ ...primaryBtn, alignSelf: 'flex-start', opacity: busy || !src.trim() ? 0.5 : 1 }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />} Translate
      </button>
      {err && <div style={{ color: '#f87171', fontSize: '0.72rem' }}>Translation unavailable.</div>}
      {out && (
        <div style={{ border: '1px solid rgba(56,189,248,0.18)', borderRadius: 6, background: 'rgba(56,189,248,0.03)', padding: 12, fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'auto' }}>{out}</div>
      )}
    </div>
  );
}

// Personal scratch notes, persisted per-classroom in localStorage.
function NotesPad({ classroomId }: { classroomId: number }) {
  const key = `classroom-notes-${classroomId}`;
  const [notes, setNotes] = useState(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem(key, notes); } catch { /* */ } }, [key, notes]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <span style={{ color: CRT, fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}><StickyNote size={14} /> MY NOTES</span>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Jot notes while you watch / read… (saved on this device)"
        style={{ ...inputStyle, flex: 1, minHeight: 120, resize: 'none' }}
      />
    </div>
  );
}

function ToolsTab({
  isTeacher, members, classroomId, onChanged,
}: {
  isTeacher: boolean; members: Member[]; classroomId: number; onChanged: () => void;
}) {
  const tools = LEARN_TOOLS.filter((t) => isTeacher || !t.teacherOnly);

  const setRole = useCallback(async (userId: string, role: 'teacher' | 'student') => {
    await apiFetch(`/api/education/classrooms/${classroomId}/members/${userId}/role`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    });
    onChanged();
  }, [classroomId, onChanged]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isTeacher ? '1fr 1fr' : '1fr', gap: 18 }}>
      <div>
        <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 12 }}>LEARNING TOOLS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {tools.map((t) => (
            <Link key={t.path} href={t.path}>
              <a style={{
                display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', padding: 14,
                border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.02)',
                color: 'rgba(228,228,231,0.9)', textDecoration: 'none', fontFamily: FONT, fontSize: '0.78rem',
              }}>
                <t.icon size={18} color={CRT} /> {t.label}
              </a>
            </Link>
          ))}
        </div>
        {!isTeacher && <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: 12 }}>Students see a curated learn-only set of tools.</p>}
      </div>

      {isTeacher && (
        <div>
          <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> MEMBERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', border: '1px solid rgba(56,189,248,0.12)', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: '0.8rem' }}>
                  {m.displayName || m.userId.slice(0, 8)}
                  <span style={{ marginLeft: 8, fontSize: '0.62rem', color: m.role === 'teacher' ? CRT : 'rgba(228,228,231,0.5)' }}>{m.role.toUpperCase()}</span>
                </span>
                {isTeacher && m.role !== 'teacher' && (
                  <button onClick={() => void setRole(m.userId, 'teacher')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid rgba(56,189,248,0.3)', color: CRT, borderRadius: 5, padding: '4px 8px', fontFamily: FONT, fontSize: '0.66rem', cursor: 'pointer' }}>
                    <UserCog size={12} /> Make teacher
                  </button>
                )}
                {isTeacher && m.role === 'teacher' && m.displayName && (
                  <button onClick={() => void setRole(m.userId, 'student')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(228,228,231,0.55)', borderRadius: 5, padding: '4px 8px', fontFamily: FONT, fontSize: '0.66rem', cursor: 'pointer' }}>
                    Demote
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkTab({ classroomId, isTeacher, lessons }: { classroomId: number; isTeacher: boolean; lessons: Lesson[] }) {
  const [submissions, setSubmissions] = useState<ClassSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [lessonId, setLessonId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/submissions`);
      if (res.ok) { const d = await res.json(); setSubmissions(d.submissions ?? []); }
    } catch { /* */ } finally { setLoading(false); }
  }, [classroomId]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async () => {
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, status: 'submitted', lessonId: lessonId === '' ? undefined : lessonId }),
      });
      if (res.ok) { setTitle(''); setContent(''); setLessonId(''); load(); }
    } catch { /* */ } finally { setSaving(false); }
  }, [title, content, lessonId, saving, classroomId, load]);

  // Only loose (non-assignment) submissions show here; graded assignment work
  // lives in the Assignments tab.
  const freeSubmissions = submissions.filter((s) => s.assignmentId == null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
      {isTeacher && <PlagiarismChecker classroomId={classroomId} />}

      {!isTeacher && (
        <div style={{ border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 16 }}>
          <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 10 }}>SUBMIT WORK</div>
          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          {lessons.length > 0 && (
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="">— No specific lesson —</option>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          )}
          <div style={{ marginBottom: 12 }}>
            <WritingField value={content} onChange={setContent} placeholder="Your written work…" rows={6} />
          </div>
          <button onClick={() => void submit()} disabled={saving || !title.trim() || !content.trim()} style={{ ...primaryBtn, opacity: saving || !title.trim() || !content.trim() ? 0.5 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit
          </button>
        </div>
      )}

      <div>
        <div style={{ color: CRT, fontSize: '0.78rem', marginBottom: 12 }}>{isTeacher ? 'SUBMISSIONS' : 'MY SUBMISSIONS'}</div>
        {loading ? <Loader2 className="animate-spin" color={CRT} /> : freeSubmissions.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: '0.82rem' }}>No submissions yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {freeSubmissions.map((s) => (
              <SubmissionCard key={s.id} classroomId={classroomId} submission={s} isTeacher={isTeacher} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
