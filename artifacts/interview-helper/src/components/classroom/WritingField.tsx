import { useState, useEffect, useRef, useCallback } from 'react';
import { SpellCheck, Loader2 } from 'lucide-react';
import { checkSpelling, type SpellMatch } from '@/lib/spellcheck';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

const baseInput: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(228,228,231,0.9)', fontFamily: FONT, fontSize: '0.8rem', lineHeight: 1.5,
  padding: '10px 12px', outline: 'none', borderRadius: 6, resize: 'vertical',
};

// A textarea that runs the shared LanguageTool spell-checker (debounced) and
// surfaces misspellings as click-to-apply autocorrect chips. Reused by both the
// free-form work box and assignment answers.
export default function WritingField({
  value, onChange, placeholder, rows = 6, style, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const [matches, setMatches] = useState<SpellMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim() || disabled) { setMatches([]); return; }
    timer.current = setTimeout(async () => {
      setChecking(true);
      try {
        setMatches(await checkSpelling(value));
      } finally {
        setChecking(false);
      }
    }, 900);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, disabled]);

  // Apply a suggestion at a known offset; recompute against current value to
  // avoid clobbering if the text shifted since the check ran.
  const applyFix = useCallback((m: SpellMatch, suggestion: string) => {
    if (value.slice(m.offset, m.offset + m.length) !== m.word) return;
    onChange(value.slice(0, m.offset) + suggestion + value.slice(m.offset + m.length));
    setMatches((prev) => prev.filter((x) => x !== m));
  }, [value, onChange]);

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        style={{ ...baseInput, ...style }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: 'rgba(228,228,231,0.5)', fontSize: '0.66rem' }}>
        <SpellCheck size={12} color={CRT} />
        {checking ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Loader2 size={11} className="animate-spin" /> checking spelling…</span>
        ) : matches.length === 0 ? (
          <span>{value.trim() ? 'No spelling issues found.' : 'Autocorrect on — start typing.'}</span>
        ) : (
          <span style={{ color: '#fbbf24' }}>{matches.length} possible {matches.length === 1 ? 'misspelling' : 'misspellings'} — click a fix:</span>
        )}
      </div>
      {matches.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {matches.slice(0, 12).map((m, i) => (
            <div key={`${m.offset}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 5, padding: '2px 6px' }}>
              <span style={{ color: '#fbbf24', fontFamily: FONT, fontSize: '0.66rem', textDecoration: 'line-through' }}>{m.word}</span>
              {m.suggestions.length === 0 ? (
                <span style={{ fontSize: '0.62rem', opacity: 0.5 }}>(no suggestion)</span>
              ) : (
                m.suggestions.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => applyFix(m, s)}
                    style={{ background: 'rgba(56,189,248,0.12)', border: 'none', color: CRT, borderRadius: 4, padding: '1px 6px', fontFamily: FONT, fontSize: '0.64rem', cursor: 'pointer' }}
                  >{s}</button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
