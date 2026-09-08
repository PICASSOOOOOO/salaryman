import { useState, useCallback } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { getCurrentLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { translateText } from '@/lib/translate';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

// Renders a passage of content with an inline "Translate" toggle. Reused for
// lessons and assignment prompts so translation lives with the content, not as a
// separate duplicated tool. Targets whatever language the UI is currently set to.
export default function Translatable({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const lang = getCurrentLanguage();
  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === lang);

  const toggle = useCallback(async () => {
    if (translated != null) { setTranslated(null); return; }
    setLoading(true);
    setError(false);
    try {
      setTranslated(await translateText(text, lang));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [translated, text, lang]);

  if (!text.trim()) return null;

  return (
    <div>
      <p style={{ whiteSpace: 'pre-wrap', ...style }}>{translated ?? text}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button
          onClick={() => void toggle()}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none',
            border: '1px solid rgba(56,189,248,0.3)', color: CRT, borderRadius: 5,
            padding: '3px 8px', fontFamily: FONT, fontSize: '0.66rem', cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
          {translated != null ? 'Show original' : `Translate${langInfo ? ` → ${langInfo.nativeName}` : ''}`}
        </button>
        {error && <span style={{ fontSize: '0.64rem', color: '#f87171' }}>translation unavailable</span>}
      </div>
    </div>
  );
}
