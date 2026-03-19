import { Globe, Plus, X, Loader2 } from 'lucide-react';
import { useFeatureState } from '@/hooks/use-feature-state';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

export function WebsiteAnalyzer() {
  const { webAnalyzer: w } = useFeatureState();

  return (
    <div className="flex gap-6 flex-1">
      <div className="w-80 shrink-0 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-foreground">Analyze Websites</h3>
          <p className="text-xs text-muted-foreground">Paste up to 5 URLs. AI reads and summarizes each one with key takeaways you can talk through.</p>

          <div className="space-y-2">
            {w.urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={url} onChange={e => {
                  const next = [...w.urls]; next[i] = e.target.value; w.setUrls(next);
                }}
                  placeholder="https://example.com"
                  className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
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
            <input value={w.analysisFocus} onChange={e => w.setAnalysisFocus(e.target.value)}
              placeholder="e.g. pricing, competitors, tech stack"
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
          </div>

          <button onClick={w.analyze} disabled={w.urls.every(u => !u.trim()) || w.analyzing}
            className="w-full py-2.5 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {w.analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : '✦ Analyze URLs'}
          </button>
          {w.analysisResult && !w.analyzing && (
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
        {!w.analysisResult && !w.analyzing && (
          <div className="bg-card border border-border rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center gap-3 text-center p-6">
            <Globe className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-muted-foreground text-sm">Paste some URLs and click Analyze</p>
          </div>
        )}
        {w.analyzing && (
          <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Reading and analyzing pages...
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
