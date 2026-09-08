import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Search, Download, Brain, ExternalLink, Copy, Check,
  Loader2, AlertCircle, Image, User, Calendar, Link2, FileText,
  ChevronDown, ChevronUp, X, Plus,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useBoomerMode } from '@/hooks/use-mobile';

interface ScrapeResult {
  source: 'scrape' | 'oembed' | 'error';
  url: string;
  title?: string;
  description?: string;
  content?: string;
  author?: string;
  authorUrl?: string;
  image?: string;
  thumbnail?: string;
  siteName?: string;
  provider?: string;
  publishedDate?: string;
  html?: string;
  headings?: string[];
  links?: { text: string; href: string }[];
  error?: string;
  type?: string;
}

export default function WebScraper() {
  const [boomerMode] = useBoomerMode();
  const [url, setUrl] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [batchResults, setBatchResults] = useState<ScrapeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHeadings, setShowHeadings] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [history, setHistory] = useState<ScrapeResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedToVault(false);

    try {
      const resp = await apiFetch('/api/scraper/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'Failed to extract content');
      } else {
        setResult(data);
        setHistory(prev => [data, ...prev.slice(0, 19)]);
      }
    } catch {
      setError('Network error — could not reach the server');
    }
    setLoading(false);
  };

  const handleBatchScrape = async () => {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setLoading(true);
    setError(null);
    setBatchResults([]);

    try {
      const resp = await apiFetch('/api/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'Batch scrape failed');
      } else {
        setBatchResults(data.results || []);
        setHistory(prev => [...(data.results || []).filter((r: ScrapeResult) => r.source !== 'error'), ...prev].slice(0, 20));
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveToVault = async (item: ScrapeResult) => {
    setSavingToVault(true);
    try {
      const content = buildVaultContent(item);
      const resp = await apiFetch('/api/vault/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title || new URL(item.url).hostname,
          content,
          entryType: 'reference',
          tags: ['scraped', item.provider || item.siteName || new URL(item.url).hostname].filter(Boolean),
          folder: '/scraped',
          frontmatter: {
            source_url: item.url,
            scraped_at: new Date().toISOString(),
            author: item.author || '',
          },
        }),
      });
      if (resp.ok) {
        setSavedToVault(true);
        setTimeout(() => setSavedToVault(false), 3000);
      }
    } catch {}
    setSavingToVault(false);
  };

  const buildVaultContent = (item: ScrapeResult): string => {
    const parts: string[] = [];
    parts.push(`# ${item.title || 'Untitled'}\n`);
    parts.push(`**Source:** [${item.url}](${item.url})`);
    if (item.author) parts.push(`**Author:** ${item.author}`);
    if (item.publishedDate) parts.push(`**Published:** ${item.publishedDate}`);
    if (item.description) parts.push(`\n> ${item.description}`);
    if (item.content) parts.push(`\n---\n\n${item.content}`);
    return parts.join('\n');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleScrape();
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h1 className="text-xs font-mono tracking-widest uppercase text-zinc-400">
              {boomerMode ? 'WEB SCRAPER' : 'SIGNAL INTERCEPT'}
            </h1>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                ref={inputRef}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste any URL — websites, TikTok, YouTube, Twitter, Instagram..."
                className="w-full bg-muted/30 border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none"
                autoFocus
              />
            </div>
            <button
              onClick={handleScrape}
              disabled={!url.trim() || loading}
              className="px-5 py-2.5 bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 rounded-lg text-xs font-mono tracking-widest hover:bg-cyan-500/25 disabled:opacity-40 shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'EXTRACT'}
            </button>
            <button
              onClick={() => setShowBatch(!showBatch)}
              className={`px-3 py-2.5 rounded-lg text-xs font-mono border shrink-0 ${showBatch ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' : 'text-zinc-500 border-border hover:text-zinc-300'}`}
              title="Batch mode"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {showBatch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden">
                <div className="mt-3 space-y-2">
                  <textarea
                    value={batchUrls}
                    onChange={e => setBatchUrls(e.target.value)}
                    rows={4}
                    placeholder="Paste up to 10 URLs, one per line..."
                    className="w-full bg-muted/20 border border-border rounded-lg p-3 text-sm text-foreground font-mono resize-y placeholder:text-zinc-600"
                  />
                  <button
                    onClick={handleBatchScrape}
                    disabled={!batchUrls.trim() || loading}
                    className="px-4 py-1.5 bg-violet-500/15 text-violet-400 border border-violet-500/25 rounded-lg text-xs font-mono hover:bg-violet-500/25 disabled:opacity-40"
                  >
                    {loading ? 'EXTRACTING...' : 'BATCH EXTRACT'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 mt-2 text-[9px] font-mono text-zinc-600 tracking-widest">
            <span>SUPPORTS: WEBSITES · TIKTOK · YOUTUBE · TWITTER/X · INSTAGRAM · REDDIT · SPOTIFY</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4">
              <div className="bg-card/60 border border-border rounded-xl overflow-hidden">
                {(result.image || result.thumbnail) && (
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={result.image || result.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-medium text-foreground">{result.title || 'Untitled'}</h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[9px] font-mono tracking-widest px-2 py-0.5 rounded border ${
                          result.source === 'oembed'
                            ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                            : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                        }`}>
                          {result.source === 'oembed' ? 'SOCIAL MEDIA' : 'WEB SCRAPE'}
                        </span>
                        {(result.provider || result.siteName) && (
                          <span className="text-[9px] font-mono text-zinc-500">{result.provider || result.siteName}</span>
                        )}
                        {result.author && (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
                            <User className="w-3 h-3" /> {result.author}
                          </span>
                        )}
                        {result.publishedDate && (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
                            <Calendar className="w-3 h-3" /> {new Date(result.publishedDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => saveToVault(result)}
                        disabled={savingToVault || savedToVault}
                        className="px-2 py-1.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-1"
                      >
                        <Brain className="w-3 h-3" />
                        {savedToVault ? 'SAVED' : savingToVault ? 'SAVING...' : 'SAVE TO VAULT'}
                      </button>
                      <a href={result.url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {result.description && (
                    <p className="text-sm text-zinc-400 leading-relaxed">{result.description}</p>
                  )}

                  {result.html && result.source === 'oembed' && (
                    <div
                      className="bg-black/30 rounded-lg p-3 overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: result.html }}
                    />
                  )}

                  {result.headings && result.headings.length > 0 && (
                    <div>
                      <button onClick={() => setShowHeadings(!showHeadings)}
                        className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-zinc-500 hover:text-zinc-300">
                        {showHeadings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        HEADINGS ({result.headings.length})
                      </button>
                      {showHeadings && (
                        <div className="mt-1 pl-3 border-l border-border space-y-0.5">
                          {result.headings.map((h, i) => (
                            <p key={i} className="text-xs text-zinc-400">{h}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {result.content && (
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-mono tracking-widest text-zinc-600">EXTRACTED CONTENT</span>
                        <button onClick={() => copyContent(result.content!)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'COPIED' : 'COPY'}
                        </button>
                      </div>
                      <div className="bg-muted/10 border border-border/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                        <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">{result.content}</pre>
                      </div>
                    </div>
                  )}

                  {result.links && result.links.length > 0 && (
                    <div>
                      <button onClick={() => setShowLinks(!showLinks)}
                        className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-zinc-500 hover:text-zinc-300">
                        {showLinks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        LINKS ({result.links.length})
                      </button>
                      {showLinks && (
                        <div className="mt-1 space-y-1">
                          {result.links.map((l, i) => (
                            <a key={i} href={l.href} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-sky-400/70 hover:text-sky-400 truncate">
                              <Link2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">{l.text}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {batchResults.length > 0 && (
            <div className="space-y-3 mt-4">
              <h3 className="text-[9px] font-mono tracking-widest text-zinc-500">BATCH RESULTS ({batchResults.length})</h3>
              {batchResults.map((item, i) => (
                <div key={i} className="bg-card/40 border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{item.title || item.url}</p>
                      {item.error ? (
                        <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                      ) : (
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{item.description || item.content?.slice(0, 200)}</p>
                      )}
                    </div>
                    {!item.error && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => saveToVault(item)}
                          className="p-1.5 rounded text-emerald-400/50 hover:text-emerald-400 hover:bg-emerald-500/10">
                          <Brain className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setResult(item); setUrl(item.url); }}
                          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!result && !error && batchResults.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <Globe className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-xs font-mono tracking-widest mb-2">
                {boomerMode ? 'EXTRACT CONTENT FROM ANY URL' : 'INTERCEPT ANY SIGNAL'}
              </p>
              <p className="text-[10px] text-zinc-700 max-w-sm text-center leading-relaxed">
                Paste a URL above to extract content. Works with websites, articles, TikTok, YouTube, Twitter/X, Instagram, Reddit, and more. Save extracted content directly to your Second Brain.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mb-2" />
              <p className="text-[9px] font-mono tracking-widest text-zinc-500">EXTRACTING CONTENT...</p>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="w-64 border-l border-border bg-card/30 flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <h3 className="text-[9px] font-mono tracking-widest text-zinc-500">HISTORY ({history.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {history.map((item, i) => (
              <button key={i} onClick={() => { setResult(item); setUrl(item.url); }}
                className="w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                <p className="text-xs text-foreground truncate">{item.title || 'Untitled'}</p>
                <p className="text-[9px] text-zinc-600 truncate mt-0.5">{item.url}</p>
                <span className={`text-[8px] font-mono tracking-widest ${
                  item.source === 'oembed' ? 'text-violet-500' : 'text-cyan-500'
                }`}>
                  {item.source === 'oembed' ? 'SOCIAL' : 'WEB'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
