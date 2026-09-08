import { useState, useRef, useEffect } from 'react';
import { Globe, Plus, X, Loader2, ClipboardPaste, AlertCircle } from 'lucide-react';
import { useFeatureState } from '@/hooks/use-feature-state';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

function isClipboardReadLikelyBlocked(): boolean {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  const [showInput, setShowInput] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const handleClick = async () => {
    if (isClipboardReadLikelyBlocked()) {
      setTempValue('');
      setShowInput(true);
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          onPaste(text.trim());
          return;
        }
      }
    } catch {}
    setTempValue('');
    setShowInput(true);
  };

  const commit = (val: string) => {
    if (val.trim()) onPaste(val.trim());
    setShowInput(false);
    setTempValue('');
  };

  if (showInput) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={tempValue}
          onChange={e => setTempValue(e.target.value)}
          onPaste={e => {
            const text = e.clipboardData.getData('text');
            if (text) {
              e.preventDefault();
              commit(text.trim());
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(tempValue);
            if (e.key === 'Escape') { setShowInput(false); setTempValue(''); }
          }}
          onBlur={() => commit(tempValue)}
          placeholder="Paste URL here"
          className="w-48 bg-background border border-sky-400/60 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-sky-400/50 shadow-sm"
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setShowInput(false); setTempValue(''); }}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Paste URL"
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-sky-400/70 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/20 hover:border-sky-500/30 transition-colors"
    >
      <ClipboardPaste className="w-3.5 h-3.5" />
      <span className="hidden sm:inline text-[10px] font-medium">Paste</span>
    </button>
  );
}

export function WebsiteAnalyzer() {
  const { webAnalyzer: w } = useFeatureState();

  return (
    <div className="flex gap-6 flex-1">
      <div className="w-80 shrink-0 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-foreground">Analyze Websites</h3>
          <p className="text-xs text-muted-foreground">Enter up to 5 URLs. AI reads and summarizes each one with key takeaways you can talk through.</p>

          <div className="space-y-2">
            {w.urls.map((url, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={url}
                  onChange={e => {
                    const next = [...w.urls]; next[i] = e.target.value; w.setUrls(next);
                  }}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    if (!text) return;
                    e.preventDefault();
                    const next = [...w.urls];
                    next[i] = text.trim();
                    w.setUrls(next);
                  }}
                  placeholder="https://example.com"
                  className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
                />
                <PasteButton onPaste={(text) => {
                  const next = [...w.urls];
                  next[i] = text;
                  w.setUrls(next);
                }} />
                {w.urls.length > 1 && (
                  <button onClick={() => w.setUrls(w.urls.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {w.urls.length < 5 && (
              <button onClick={() => w.setUrls([...w.urls, ''])}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add URL
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Focus (optional)</label>
            <div className="flex items-center gap-1.5">
              <input value={w.analysisFocus} onChange={e => w.setAnalysisFocus(e.target.value)}
                onPaste={e => {
                  const text = e.clipboardData.getData('text');
                  if (!text) return;
                  e.preventDefault();
                  w.setAnalysisFocus(text.trim());
                }}
                placeholder="e.g. pricing, competitors, tech stack"
                className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
              <PasteButton onPaste={(text) => w.setAnalysisFocus(text)} />
            </div>
          </div>

          <button onClick={w.analyze} disabled={w.urls.every(u => !u.trim()) || w.analyzing}
            className="w-full py-2.5 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {w.analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : '✦ Analyze URLs'}
          </button>
          {(w.analysisResult || w.analysisError) && !w.analyzing && (
            <button onClick={w.clear} className="w-full py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors">
              Clear results
            </button>
          )}
        </div>

        <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-sky-300">Tip</p>
          <p>Works best with competitor sites, news articles, job listings, or any public web page. AI extracts key info and formats it for talking points.</p>
        </div>
      </div>

      <div className="flex-1">
        {!w.analysisResult && !w.analyzing && !w.analysisError && (
          <div className="bg-card border border-border rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center gap-3 text-center p-6">
            <Globe className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-muted-foreground text-sm">Enter URLs above and click Analyze</p>
          </div>
        )}
        {w.analyzing && (
          <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Reading and analyzing pages...
          </div>
        )}
        {w.analysisError && !w.analyzing && (
          <div className="bg-card border border-destructive/40 rounded-2xl p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">Analysis failed</p>
              <p className="text-sm text-muted-foreground">{w.analysisError}</p>
            </div>
          </div>
        )}
        {w.analysisResult && (
          <div className="bg-card border border-border rounded-2xl p-6 overflow-y-auto max-h-[70vh]">
            <MarkdownRenderer content={w.analysisResult} />
          </div>
        )}
      </div>
    </div>
  );
}
