import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Film, Shirt, Tv, Image as ImageIcon,
  Loader2, Copy, Check, Download, Sparkles,
  Tag, Package, Clapperboard, Music, Palette,
  Video, Eye, RefreshCw, ChevronRight, X,
  Lock, Unlock, Trash2, Cloud, CloudOff,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { apiFetch } from '@/lib/api-client';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';

type ImageMode = 'clothing_brand' | 'lookbook' | 'billboard' | 'film_35mm' | 'film_hidef' | 'packaging' | 'label' | 'poster';
type VideoMode = 'video_commercial' | 'music_video' | 'brand_film' | 'social_video' | 'lookbook_video';
type Tab = 'image' | 'video';

interface SavedProduction {
  id: number;
  name: string;
  objectPath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  isLocked: boolean;
  expiresAt: string | null;
  source: string | null;
  createdAt: string;
}

interface GeneratedImage {
  id: string;
  mode: ImageMode;
  prompt: string;
  style: string;
  dataUrl: string;
  createdAt: string;
  fileId?: number | null;
}

const IMAGE_MODES: { key: ImageMode; label: string; codename: string; icon: typeof Camera; desc: string }[] = [
  { key: 'clothing_brand', label: 'CLOTHING BRAND', codename: 'APPAREL', icon: Shirt, desc: 'Product shots, fashion editorial' },
  { key: 'lookbook', label: 'LOOKBOOK', codename: 'LOOKBOOK', icon: Eye, desc: 'Model lifestyle editorial shots' },
  { key: 'billboard', label: 'BILLBOARD', codename: 'OOH', icon: Tv, desc: 'Large-format outdoor advertising' },
  { key: 'film_35mm', label: '35MM FILM', codename: '35MM', icon: Film, desc: 'Analog film grain, Portra colors' },
  { key: 'film_hidef', label: 'HI-DEF CINEMA', codename: 'IMAX', icon: Camera, desc: '8K cinematic, ARRI quality' },
  { key: 'packaging', label: 'PACKAGING', codename: 'PACK', icon: Package, desc: 'Product packaging mockups' },
  { key: 'label', label: 'LABELS & TAGS', codename: 'TAGS', icon: Tag, desc: 'Woven labels, hang tags' },
  { key: 'poster', label: 'POSTER', codename: 'PRINT', icon: ImageIcon, desc: 'Promotional posters & prints' },
];

const VIDEO_MODES: { key: VideoMode; label: string; codename: string; icon: typeof Video; desc: string }[] = [
  { key: 'video_commercial', label: 'TV COMMERCIAL', codename: 'SPOT', icon: Clapperboard, desc: 'Broadcast-quality ad scripts' },
  { key: 'music_video', label: 'MUSIC VIDEO', codename: 'MV', icon: Music, desc: 'Visual storytelling treatments' },
  { key: 'brand_film', label: 'BRAND FILM', codename: 'BRAND', icon: Film, desc: 'Emotional brand narratives' },
  { key: 'social_video', label: 'SOCIAL VIDEO', codename: 'VIRAL', icon: Video, desc: 'Algorithm-optimized content' },
  { key: 'lookbook_video', label: 'LOOKBOOK VIDEO', codename: 'RUNWAY', icon: Eye, desc: 'Fashion campaign films' },
];

const ASPECT_OPTIONS = [
  { value: '1024x1024', label: '1:1', desc: 'Square' },
  { value: '1024x1536', label: '2:3', desc: 'Portrait' },
  { value: '1536x1024', label: '3:2', desc: 'Landscape' },
];

const STYLE_PRESETS = [
  'Minimal & Clean', 'Luxury Editorial', 'Streetwear Grit', 'Vintage Retro',
  'Neon Cyberpunk', 'Natural Organic', 'Bold & Graphic', 'Film Noir',
  'Pastel Dream', 'Raw Industrial',
];

function renderMd(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-emerald-400 font-bold mt-4 mb-1 text-xs uppercase tracking-widest">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-foreground font-bold mt-5 mb-2 text-sm">$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      return `<div class="grid grid-cols-${Math.min(cells.length, 6)} gap-1 text-[10px] border-b border-border/20 py-1">${cells.map(c => `<span class="truncate">${c.trim()}</span>`).join('')}</div>`;
    })
    .replace(/^[•\-] (.+)$/gm, '<li class="ml-3">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-3">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="space-y-0.5 my-1">$1</ul>')
    .replace(/\n{2,}/g, '</p><p class="my-1">')
    .replace(/\n/g, '<br />');
}

function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ProductionStudio({ embedded, initialTab }: { embedded?: boolean; initialTab?: Tab } = {}) {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab ?? 'image');
  const [imageMode, setImageMode] = useState<ImageMode>('clothing_brand');
  const [videoMode, setVideoMode] = useState<VideoMode>('video_commercial');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [aspect, setAspect] = useState('1024x1024');
  const [concept, setConcept] = useState('');
  const [duration, setDuration] = useState('30');
  const [audience, setAudience] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedImage[]>(() => {
    try { return JSON.parse(localStorage.getItem('prod-gallery') ?? '[]'); } catch { return []; }
  });

  const [savedProductions, setSavedProductions] = useState<SavedProduction[]>([]);
  const [loadingProductions, setLoadingProductions] = useState(false);

  const [videoScript, setVideoScript] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);

  const [copied, setCopied] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const loadSavedProductions = useCallback(async () => {
    try {
      setLoadingProductions(true);
      const res = await apiFetch('/api/studio/productions');
      if (res.ok) {
        const data = await res.json();
        setSavedProductions(data.items ?? []);
      }
    } catch {
    } finally {
      setLoadingProductions(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadSavedProductions();
  }, [isAuthenticated, loadSavedProductions]);

  if (!isAuthenticated && !embedded) return <SignInPage />;

  const generateImage = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setGeneratedImage(null);
    try {
      const res = await apiFetch('/api/studio/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: imageMode, prompt: prompt.trim(), style: style || undefined, aspect }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedImage(data.image);
      const entry: GeneratedImage = {
        id: Date.now().toString(36),
        mode: imageMode,
        prompt: prompt.trim(),
        style: style,
        dataUrl: data.image,
        createdAt: new Date().toISOString(),
        fileId: data.fileId ?? null,
      };
      const updated = [entry, ...gallery].slice(0, 20);
      setGallery(updated);
      localStorage.setItem('prod-gallery', JSON.stringify(updated));
      loadSavedProductions();
    } catch (e: unknown) {
      setGeneratedImage(null);
      alert((e as Error).message || 'Generation failed');
    }
    setGenerating(false);
  };

  const generateScript = async () => {
    if (!concept.trim() || scriptLoading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScriptLoading(true);
    setVideoScript('');
    try {
      const res = await apiFetch('/api/studio/production-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: videoMode, concept: concept.trim(), duration, style: style || undefined, audience: audience || undefined }),
        signal: controller.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buf = '';
      let raw = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.content) { raw += d.content; setVideoScript(raw); }
            else if (d.done) setScriptLoading(false);
            else if (d.error) { setScriptLoading(false); setVideoScript(`Error: ${d.error}`); }
          } catch {}
        }
      }
      setScriptLoading(false);
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setScriptLoading(false);
        setVideoScript(`Error: ${(e as Error).message}`);
      }
    }
  };

  const toggleLock = async (id: number, currentlyLocked: boolean) => {
    try {
      const res = await apiFetch(`/api/studio/productions/${id}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !currentlyLocked }),
      });
      if (res.ok) loadSavedProductions();
    } catch {}
  };

  const deleteProduction = async (id: number) => {
    try {
      const res = await apiFetch(`/api/studio/productions/${id}`, { method: 'DELETE' });
      if (res.ok) loadSavedProductions();
    } catch {}
  };

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name}.png`;
    a.click();
  };

  const downloadFromServer = async (id: number, name: string) => {
    try {
      const res = await apiFetch(`/api/tools/documents/files/${id}/download`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const currentImageMode = IMAGE_MODES.find(m => m.key === imageMode)!;
  const currentVideoMode = VIDEO_MODES.find(m => m.key === videoMode)!;

  const innerContent = (
    <>
      {!embedded && (
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="ml-auto order-last">
              <HummingBirdAttachStrip toolKey="production-studio" buttonStyle="ghost" pickerTitle="SCORE THIS PRODUCTION" />
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Clapperboard className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                PRODUCTION STUDIO
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered creative production for brands, film, and video
              </p>
            </div>
          </div>
        </div>
      )}

      {!initialTab && (
        <div className="flex items-center gap-2 mb-5">
            {([
              { key: 'image' as Tab, label: 'IMAGE STUDIO', codename: 'STILLS', icon: Camera },
              { key: 'video' as Tab, label: 'VIDEO PRODUCTION', codename: 'MOTION', icon: Video },
            ]).map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tab === t.key ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'bg-card text-muted-foreground border-border hover:border-violet-500/20'}`}>
                  <Icon className="w-4 h-4" />
                  {boomerMode ? t.label : t.codename}
                </button>
              );
            })}
          </div>
      )}

          {tab === 'image' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {IMAGE_MODES.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.key} onClick={() => setImageMode(m.key)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${imageMode === m.key ? 'bg-violet-500/10 border-violet-500/25 text-violet-400' : 'bg-card/50 border-border text-muted-foreground hover:border-violet-500/15'}`}>
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-bold leading-tight">{boomerMode ? m.label : m.codename}</span>
                      <span className="text-[8px] opacity-50 leading-tight">{m.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <currentImageMode.icon className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                    {boomerMode ? currentImageMode.label : currentImageMode.codename}
                  </span>
                </div>

                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={imageMode === 'clothing_brand'
                    ? 'Describe your clothing item: "Black oversized hoodie with embroidered gold dragon on back, premium cotton fleece, displayed on mannequin..."'
                    : imageMode === 'billboard'
                    ? 'Describe your billboard: "Luxury perfume ad with crystal bottle, dark moody background, gold typography reading NOIR..."'
                    : imageMode === 'film_35mm'
                    ? 'Describe your 35mm shot: "Woman in vintage red dress walking through Tokyo neon streets at dusk, rain-slicked pavement..."'
                    : 'Describe what you want to create...'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-violet-500/40 transition-colors resize-none"
                  style={{ fontFamily: "'Fira Code', monospace" }}
                  rows={4}
                  disabled={generating}
                />

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <select value={style} onChange={e => setStyle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-foreground focus:outline-none cursor-pointer">
                      <option value="">Style: Auto</option>
                      {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ASPECT_OPTIONS.map(a => (
                      <button key={a.value} onClick={() => setAspect(a.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${aspect === a.value ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' : 'text-muted-foreground border-border hover:border-violet-500/15'}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={generateImage} disabled={!prompt.trim() || generating}
                  className="mt-4 flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-40 shadow-lg shadow-violet-500/20">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {boomerMode ? 'GENERATE' : 'PRODUCE'}
                </button>
              </div>

              <AnimatePresence>
                {generating && !generatedImage && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin text-violet-400 mb-4" />
                    <span className="text-sm font-bold">
                       Generating image…
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 mt-1">This may take 15-30 seconds</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {generatedImage && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-violet-500/15 bg-card/50 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-violet-500/10 bg-violet-500/[0.03]">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">{boomerMode ? currentImageMode.label : currentImageMode.codename}</span>
                      <span className="flex items-center gap-1 text-[9px] text-emerald-400/60">
                        <Cloud className="w-3 h-3" /> SAVED
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => downloadImage(generatedImage, `${imageMode}-${Date.now()}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                        <Download className="w-3 h-3" /> EXPORT
                      </button>
                      <button onClick={() => { setGeneratedImage(null); generateImage(); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                        <RefreshCw className="w-3 h-3" /> REGENERATE
                      </button>
                    </div>
                  </div>
                  <div className="p-4 flex justify-center bg-zinc-950/50">
                    <img src={generatedImage} alt={prompt} className="max-w-full max-h-[600px] rounded-lg shadow-2xl" />
                  </div>
                </motion.div>
              )}

              {gallery.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-2">
                    {boomerMode ? 'RECENT PRODUCTIONS' : 'PRODUCTION LOG'}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {gallery.slice(0, 10).map(g => (
                      <button key={g.id} onClick={() => setGeneratedImage(g.dataUrl)}
                        className="rounded-lg border border-border overflow-hidden hover:border-violet-500/25 transition-colors group relative">
                        <img src={g.dataUrl} alt={g.prompt} className="w-full aspect-square object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                          <span className="text-[8px] text-white/80 leading-tight truncate">{g.prompt.slice(0, 40)}...</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {savedProductions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Cloud className="w-3.5 h-3.5 text-violet-400/50" />
                    <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                      {boomerMode ? 'SAVED FILES' : 'FILE SYSTEM'}
                    </span>
                    <span className="text-[9px] text-muted-foreground/30">
                      {savedProductions.length} {savedProductions.length === 1 ? 'FILE' : 'FILES'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 border-b border-border/50 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                      <span>FILE</span>
                      <span>STATUS</span>
                      <span>EXPIRES</span>
                      <span>LOCK</span>
                      <span></span>
                    </div>
                    {savedProductions.map(p => {
                      const days = daysUntilExpiry(p.expiresAt);
                      return (
                        <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-border/20 items-center hover:bg-violet-500/[0.02] transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <ImageIcon className="w-3.5 h-3.5 text-violet-400/50 shrink-0" />
                            <span className="text-[10px] text-foreground truncate" style={{ fontFamily: "'Fira Code', monospace" }}>
                              {p.name}
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${p.isLocked ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                            {p.isLocked ? 'LOCKED' : 'ACTIVE'}
                          </span>
                          <span className={`text-[9px] font-mono ${p.isLocked ? 'text-muted-foreground/30' : days !== null && days <= 7 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                            {p.isLocked ? 'NEVER' : days !== null ? `${days}D` : '--'}
                          </span>
                          <button
                            onClick={() => toggleLock(p.id, p.isLocked)}
                            className={`p-1.5 rounded-lg border transition-colors ${p.isLocked ? 'text-amber-400 border-amber-500/20 hover:bg-amber-500/10' : 'text-muted-foreground border-border hover:border-violet-500/20 hover:text-violet-400'}`}
                            title={p.isLocked ? 'Unlock file (will expire in 30 days)' : 'Lock file (prevents auto-deletion)'}
                          >
                            {p.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => downloadFromServer(p.id, p.name)}
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-violet-400 hover:border-violet-500/20 transition-colors"
                              title="Export file">
                              <Download className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteProduction(p.id)}
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/20 transition-colors"
                              title="Delete file">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <CloudOff className="w-3 h-3 text-muted-foreground/20" />
                    <span className="text-[9px] text-muted-foreground/30">
                       Unlocked files are deleted after 30 days. Lock files to keep them permanently.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'video' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {VIDEO_MODES.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.key} onClick={() => setVideoMode(m.key)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${videoMode === m.key ? 'bg-violet-500/10 border-violet-500/25 text-violet-400' : 'bg-card/50 border-border text-muted-foreground hover:border-violet-500/15'}`}>
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-bold leading-tight">{boomerMode ? m.label : m.codename}</span>
                      <span className="text-[8px] opacity-50 leading-tight">{m.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <currentVideoMode.icon className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                    {boomerMode ? currentVideoMode.label : currentVideoMode.codename}
                  </span>
                </div>

                <textarea
                  value={concept}
                  onChange={e => setConcept(e.target.value)}
                  placeholder={videoMode === 'video_commercial'
                    ? 'Describe your commercial concept: "30-second luxury watch ad, a man diving off a yacht in slow motion, watch glinting underwater..."'
                    : videoMode === 'lookbook_video'
                    ? 'Describe your fashion film: "SS25 collection reveal, models walking through abandoned warehouse, industrial meets haute couture..."'
                    : 'Describe your video concept...'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-violet-500/40 transition-colors resize-none"
                  style={{ fontFamily: "'Fira Code', monospace" }}
                  rows={4}
                  disabled={scriptLoading}
                />

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1 block">DURATION</label>
                    <select value={duration} onChange={e => setDuration(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-foreground focus:outline-none cursor-pointer">
                      <option value="15">15 seconds</option>
                      <option value="30">30 seconds</option>
                      <option value="60">60 seconds</option>
                      <option value="90">90 seconds</option>
                      <option value="120">2 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1 block">VISUAL STYLE</label>
                    <select value={style} onChange={e => setStyle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-foreground focus:outline-none cursor-pointer">
                      <option value="">Auto</option>
                      {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1 block">AUDIENCE</label>
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                      placeholder="e.g., Gen Z, Luxury buyers"
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none"
                    />
                  </div>
                </div>

                <button onClick={generateScript} disabled={!concept.trim() || scriptLoading}
                  className="mt-4 flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-40 shadow-lg shadow-violet-500/20">
                  {scriptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                  {boomerMode ? 'GENERATE PRODUCTION PLAN' : 'PRODUCE SCRIPT'}
                </button>
              </div>

              {(scriptLoading || videoScript) && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-violet-500/15 bg-card/50 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-violet-500/10 bg-violet-500/[0.03]">
                    <div className="flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                        {boomerMode ? 'PRODUCTION PLAN' : 'SCRIPT OUTPUT'}
                      </span>
                      {scriptLoading && <Loader2 className="w-3 h-3 animate-spin text-violet-400/50" />}
                    </div>
                    <button onClick={() => copyText(videoScript, 'script')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                      {copied === 'script' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied === 'script' ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <div className="p-5 prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-h2:text-sm prose-h3:text-xs prose-p:text-xs prose-li:text-xs prose-strong:text-foreground overflow-y-auto max-h-[600px]"
                    style={{ fontFamily: "'Fira Code', monospace" }}
                    dangerouslySetInnerHTML={{ __html: renderMd(videoScript) }}
                  />
                </motion.div>
              )}
            </div>
          )}

    </> 
  );

  if (embedded) return innerContent;

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 md:p-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          {innerContent}
        </div>
      </main>
    </div>
  );
}
