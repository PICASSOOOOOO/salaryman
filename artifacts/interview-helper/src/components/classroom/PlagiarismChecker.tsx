import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ScanText, Loader2, AlertTriangle, Upload } from 'lucide-react';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

interface CheckResult {
  aiLikelihood: number;
  reasoning: string;
  flaggedPassages: string[];
}

function scoreColor(score: number): string {
  if (score >= 70) return '#f87171';
  if (score >= 40) return '#fbbf24';
  return '#4ade80';
}

// Teacher-only AI written-word / plagiarism checker. Posts pasted or uploaded
// text to the classroom-scoped checker endpoint and renders the assistive score.
export default function PlagiarismChecker({ classroomId }: { classroomId: number }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setText(content.slice(0, 50000));
    } catch {
      setError('Could not read that file.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const run = useCallback(async () => {
    if (text.trim().length < 20 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch(`/api/education/classrooms/${classroomId}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Check failed.'); return; }
      setResult(data.result);
      setNote(data.note ?? '');
    } catch {
      setError('Checker temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [text, loading, classroomId]);

  return (
    <div style={{ border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8, background: 'rgba(56,189,248,0.04)', padding: 16, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: CRT, fontSize: '0.85rem', letterSpacing: '0.08em', marginBottom: 12 }}>
        <ScanText size={16} /> WRITTEN-WORD CHECKER
        <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'rgba(56,189,248,0.55)' }}>TEACHER TOOL</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a student's written work here, or upload a .txt file…"
        rows={6}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(228,228,231,0.9)', fontFamily: 'inherit', fontSize: '0.78rem', lineHeight: 1.5,
          padding: '10px 12px', outline: 'none', borderRadius: 6, resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button
          onClick={() => void run()}
          disabled={loading || text.trim().length < 20}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: CRT, color: '#04121c', border: 'none', borderRadius: 6, fontFamily: FONT,
            fontSize: '0.8rem', fontWeight: 600,
            cursor: loading || text.trim().length < 20 ? 'not-allowed' : 'pointer',
            opacity: loading || text.trim().length < 20 ? 0.5 : 1,
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ScanText size={14} />} Analyze
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: 'transparent', color: CRT, border: '1px solid rgba(56,189,248,0.4)',
            borderRadius: 6, fontFamily: FONT, fontSize: '0.78rem', cursor: 'pointer',
          }}
        >
          <Upload size={13} /> Upload .txt
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,text/plain" onChange={onFile} style={{ display: 'none' }} />
        <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: 'rgba(228,228,231,0.4)' }}>{text.length.toLocaleString()} chars</span>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 10 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 14, borderTop: '1px solid rgba(56,189,248,0.15)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: scoreColor(result.aiLikelihood), lineHeight: 1 }}>
              {result.aiLikelihood}%
            </span>
            <span style={{ fontSize: '0.74rem', color: 'rgba(228,228,231,0.65)' }}>AI-written likelihood</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'hidden',
          }}>
            <div style={{ height: '100%', width: `${result.aiLikelihood}%`, background: scoreColor(result.aiLikelihood) }} />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(228,228,231,0.85)', lineHeight: 1.5, marginTop: 12 }}>{result.reasoning}</p>

          {result.flaggedPassages.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.7)', marginBottom: 6, letterSpacing: '0.06em' }}>FLAGGED PASSAGES</div>
              {result.flaggedPassages.map((p, i) => (
                <div key={i} style={{
                  fontSize: '0.74rem', color: 'rgba(251,191,36,0.95)', background: 'rgba(251,191,36,0.08)',
                  borderLeft: '2px solid rgba(251,191,36,0.6)', padding: '6px 10px', marginBottom: 6, borderRadius: 4,
                }}>“{p}”</div>
              ))}
            </div>
          )}

          {note && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, fontSize: '0.68rem', color: 'rgba(228,228,231,0.5)' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
