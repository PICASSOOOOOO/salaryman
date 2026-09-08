import { apiFetch, apiUrl } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Send, Clock, CheckCircle2, Loader2, X,
  Edit2, Eye, Zap, RefreshCw, Copy, Calendar, BarChart2,
  Twitter, Linkedin, Instagram, Facebook, Hash, Sparkles,
  FileText, Globe, MessageCircle, Film, Video, Download, Mail, UploadCloud,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '@/hooks/use-plan';
import { SignInPage } from '@/components/SignInPrompt';

interface SocialPost {
  id: number;
  platform: string;
  content: string;
  hashtags: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  impressions: number;
  engagements: number;
  clicks: number;
  shares: number;
  aiGenerated: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  published: number;
  scheduled: number;
  drafts: number;
  totalImpressions: number;
  totalEngagements: number;
  totalClicks: number;
  platformBreakdown: { platform: string; count: number }[];
}

interface ReelDelivery {
  method: 'tiktok' | 'email' | 'none';
  objectPath?: string;
  tiktokPublishId?: string;
  tiktokSkippedReason?: string;
  emailedTo?: number;
  note?: string;
}

interface ReelJob {
  id: string;
  status: 'queued' | 'capturing' | 'finishing' | 'delivering' | 'done' | 'error';
  stage: string;
  progress: number;
  ownerInitiated: boolean;
  ready: boolean;
  delivery: ReelDelivery | null;
  error: string | null;
  hasVideo: boolean;
}

const REEL_ACTIVE = new Set(['queued', 'capturing', 'finishing', 'delivering']);

const PLATFORMS = [
  { id: 'twitter', label: 'X / TWITTER', icon: Twitter, color: '#1DA1F2', charLimit: 280 },
  { id: 'linkedin', label: 'LINKEDIN', icon: Linkedin, color: '#0A66C2', charLimit: 3000 },
  { id: 'instagram', label: 'INSTAGRAM', icon: Instagram, color: '#E4405F', charLimit: 2200 },
  { id: 'facebook', label: 'FACEBOOK', icon: Facebook, color: '#1877F2', charLimit: 5000 },
  { id: 'threads', label: 'THREADS', icon: MessageCircle, color: '#000000', charLimit: 500 },
  { id: 'tiktok', label: 'TIKTOK', icon: Globe, color: '#ff0050', charLimit: 300 },
  { id: 'bluesky', label: 'BLUESKY', icon: Globe, color: '#0085ff', charLimit: 300 },
  { id: 'youtube', label: 'YOUTUBE', icon: Globe, color: '#FF0000', charLimit: 5000 },
];

const TONES = ['professional', 'casual', 'witty', 'bold', 'educational', 'inspirational', 'provocative'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'rgba(156,163,175,.6)',
  scheduled: 'rgba(251,191,36,.7)',
  published: 'rgba(34,197,94,.7)',
  failed: 'rgba(239,68,68,.7)',
};

function getPlatformInfo(id: string) {
  return PLATFORMS.find(p => p.id === id) || PLATFORMS[0];
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SocialMediaManager() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isOwner } = usePlan();
  const [tab, setTab] = useState<'posts' | 'compose' | 'calendar' | 'analytics' | 'reel'>('posts');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [composePlatform, setComposePlatform] = useState('twitter');
  const [composeContent, setComposeContent] = useState('');
  const [composeHashtags, setComposeHashtags] = useState('');
  const [composeSchedule, setComposeSchedule] = useState('');
  const [composeSaving, setComposeSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiPrimeNeeded, setAiPrimeNeeded] = useState(false);

  const [crossPostPlatforms, setCrossPostPlatforms] = useState<string[]>([]);
  const [crossPosting, setCrossPosting] = useState(false);
  const [showCrossPost, setShowCrossPost] = useState(false);

  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);
  const [calendarPosts, setCalendarPosts] = useState<SocialPost[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [reelJob, setReelJob] = useState<ReelJob | null>(null);
  const [reelStarting, setReelStarting] = useState(false);
  const [reelError, setReelError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterStatus) params.set('status', filterStatus);
      const r = await apiFetch(`/api/social/posts?${params}`);
      if (r.ok) setPosts(await r.json());
    } catch { }
    setLoading(false);
  }, [filterPlatform, filterStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await apiFetch('/api/social/stats');
      if (r.ok) setStats(await r.json());
    } catch { }
  }, []);

  useEffect(() => { if (isAuthenticated) { fetchPosts(); fetchStats(); } }, [isAuthenticated, fetchPosts, fetchStats]);

  const fetchReelStatus = useCallback(async () => {
    try {
      const r = await apiFetch('/api/gameplay-tiktok/status');
      if (r.ok) setReelJob(await r.json());
    } catch { }
  }, []);

  useEffect(() => {
    if (tab !== 'reel' || !isOwner) return;
    fetchReelStatus();
  }, [tab, isOwner, fetchReelStatus]);

  useEffect(() => {
    if (tab !== 'reel' || !isOwner) return;
    const active = reelJob ? REEL_ACTIVE.has(reelJob.status) : false;
    if (!active && !reelStarting) return;
    const id = setInterval(fetchReelStatus, 2500);
    return () => clearInterval(id);
  }, [tab, isOwner, reelJob, reelStarting, fetchReelStatus]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin w-6 h-6 text-cyan-500" /></div>;
  if (!isAuthenticated) return <SignInPage />;

  const platformInfo = getPlatformInfo(composePlatform);
  const charCount = composeContent.length;
  const charOver = charCount > platformInfo.charLimit;

  const jsonOpts = (method: string, data: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  async function handleSave(asDraft: boolean) {
    setComposeSaving(true);
    try {
      const hashtags = composeHashtags.split(/[,\s]+/).filter(h => h.startsWith('#') || h.length > 0).map(h => h.startsWith('#') ? h : `#${h}`).filter(Boolean);
      const payload = {
        platform: composePlatform,
        content: composeContent,
        hashtags,
        status: asDraft ? 'draft' : (composeSchedule ? 'scheduled' : 'published'),
        scheduledAt: composeSchedule || null,
      };
      if (editingId) {
        await apiFetch(`/api/social/posts/${editingId}`, jsonOpts('PATCH', payload));
      } else {
        await apiFetch('/api/social/posts', jsonOpts('POST', payload));
      }
      setComposeContent(''); setComposeHashtags(''); setComposeSchedule(''); setEditingId(null);
      setTab('posts');
      fetchPosts(); fetchStats();
    } catch { }
    setComposeSaving(false);
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/social/posts/${id}`, { method: 'DELETE' });
      fetchPosts(); fetchStats();
    } catch { }
  }

  async function handlePublish(id: number) {
    setPublishError(null);
    try {
      const r = await apiFetch(`/api/social/posts/${id}/publish`, { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setPublishError(data.error || `Could not publish post (${r.status}).`);
        return;
      }
      fetchPosts(); fetchStats();
    } catch {
      setPublishError('Network error — could not reach the social publishing service.');
    }
  }

  function startEdit(post: SocialPost) {
    setEditingId(post.id);
    setComposePlatform(post.platform);
    setComposeContent(post.content);
    setComposeHashtags((post.hashtags || []).join(' '));
    setComposeSchedule(post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '');
    setTab('compose');
  }

  async function handleAiGenerate() {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setAiPrimeNeeded(false);
    try {
      const r = await apiFetch('/api/social/generate', jsonOpts('POST', { platform: composePlatform, topic: aiTopic, tone: aiTone, includeHashtags: true }));
      if (r.ok) {
        const data = await r.json();
        setComposeContent(data.content);
        if (data.hashtags?.length) setComposeHashtags(data.hashtags.join(' '));
        setShowAi(false);
      } else if (r.status === 403) {
        setAiPrimeNeeded(true);
      }
    } catch { }
    setAiGenerating(false);
  }

  async function handleCrossPost() {
    if (!composeContent.trim() || crossPostPlatforms.length === 0) return;
    setCrossPosting(true);
    setAiPrimeNeeded(false);
    try {
      const r = await apiFetch('/api/social/generate-variants', jsonOpts('POST', { content: composeContent, platforms: crossPostPlatforms }));
      if (r.status === 403) {
        setAiPrimeNeeded(true);
      } else if (r.ok) {
        const data = await r.json();
        if (data.variants) {
          for (const [platform, text] of Object.entries(data.variants)) {
            await apiFetch('/api/social/posts', jsonOpts('POST', { platform, content: text as string, hashtags: [], status: 'draft' }));
          }
          setShowCrossPost(false);
          setCrossPostPlatforms([]);
          setTab('posts');
          fetchPosts();
        }
      }
    } catch { }
    setCrossPosting(false);
  }

  async function loadCalendar() {
    try {
      const r = await apiFetch('/api/social/calendar');
      if (r.ok) setCalendarPosts(await r.json());
    } catch { }
  }

  async function startReel() {
    setReelStarting(true);
    setReelError(null);
    try {
      const r = await apiFetch('/api/gameplay-tiktok/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        setReelJob(await r.json());
      } else if (r.status === 429) {
        await fetchReelStatus();
      } else {
        const d = await r.json().catch(() => ({}));
        setReelError(d.error || `Failed to start capture (${r.status})`);
      }
    } catch {
      setReelError('Network error — could not reach capture service.');
    }
    setReelStarting(false);
  }

  const tabs = [
    { id: 'posts' as const, label: 'ALL POSTS', icon: FileText },
    { id: 'compose' as const, label: editingId ? 'EDIT POST' : 'COMPOSE', icon: Plus },
    { id: 'calendar' as const, label: 'CALENDAR', icon: Calendar },
    { id: 'analytics' as const, label: 'ANALYTICS', icon: BarChart2 },
    ...(isOwner ? [{ id: 'reel' as const, label: 'GAMEPLAY REEL', icon: Film }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Hash className="w-5 h-5 text-cyan-400" />
        <h1 className="text-lg font-mono tracking-widest text-cyan-400">SOCIAL MEDIA COMMAND</h1>
        <span className="text-[10px] font-mono text-cyan-700 tracking-wider border border-cyan-900 px-2 py-0.5">SIGNAL-7</span>
      </div>

      <div className="flex gap-0 border border-cyan-900/30 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); if (t.id === 'calendar') loadCalendar(); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono tracking-wider transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-cyan-950/40 text-cyan-400 border-b-2 border-cyan-500' : 'text-cyan-700 hover:text-cyan-500 hover:bg-cyan-950/20'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {publishError && (
        <div className="flex items-center justify-between gap-3 border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[10px] font-mono text-amber-400">
          <span>{publishError}</span>
          <a href="/marketing/command" className="whitespace-nowrap text-cyan-400 hover:text-cyan-300 underline">
            OPEN MARKETING CONNECTIONS →
          </a>
        </div>
      )}

      {/* ── ALL POSTS ── */}
      {tab === 'posts' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              className="bg-black/50 border border-cyan-900/40 text-cyan-400 text-xs font-mono px-2 py-1.5 outline-none"
            >
              <option value="">ALL PLATFORMS</option>
              {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-black/50 border border-cyan-900/40 text-cyan-400 text-xs font-mono px-2 py-1.5 outline-none"
            >
              <option value="">ALL STATUS</option>
              <option value="draft">DRAFTS</option>
              <option value="scheduled">SCHEDULED</option>
              <option value="published">PUBLISHED</option>
            </select>
            <button onClick={fetchPosts} className="text-cyan-700 hover:text-cyan-400 transition-colors p-1">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setEditingId(null); setComposeContent(''); setComposeHashtags(''); setComposeSchedule(''); setTab('compose'); }}
              className="ml-auto flex items-center gap-1.5 bg-cyan-950/40 border border-cyan-800/50 text-cyan-400 text-xs font-mono px-3 py-1.5 hover:bg-cyan-900/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> NEW POST
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-cyan-600" /></div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-cyan-800 text-xs font-mono tracking-wider">
              NO POSTS YET — HIT COMPOSE TO CREATE YOUR FIRST POST
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map(post => {
                const pi = getPlatformInfo(post.platform);
                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-cyan-900/25 bg-black/30 p-3 hover:border-cyan-800/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <pi.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: pi.color }} />
                          <span className="text-[10px] font-mono tracking-wider" style={{ color: pi.color }}>{pi.label}</span>
                          <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.5 border" style={{ color: STATUS_COLORS[post.status], borderColor: STATUS_COLORS[post.status] + '44' }}>
                            {post.status.toUpperCase()}
                          </span>
                          {post.aiGenerated === 'yes' && <Sparkles className="w-3 h-3 text-yellow-500/60" />}
                          <span className="text-[9px] text-cyan-900 font-mono ml-auto">{fmtDate(post.createdAt)}</span>
                        </div>
                        <p className="text-xs text-cyan-300/70 font-mono leading-relaxed line-clamp-2">{post.content}</p>
                        {post.hashtags && (post.hashtags as string[]).length > 0 && (
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {(post.hashtags as string[]).slice(0, 5).map((h, i) => (
                              <span key={i} className="text-[9px] font-mono text-cyan-600 bg-cyan-950/40 px-1.5 py-0.5">{h}</span>
                            ))}
                          </div>
                        )}
                        {post.scheduledAt && post.status === 'scheduled' && (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-500/60 font-mono">
                            <Clock className="w-3 h-3" /> Scheduled: {fmtDate(post.scheduledAt)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setPreviewPost(post)} className="text-cyan-700 hover:text-cyan-400 p-1 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => startEdit(post)} className="text-cyan-700 hover:text-cyan-400 p-1 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        {post.status === 'draft' && (
                          <button onClick={() => handlePublish(post.id)} className="text-green-700 hover:text-green-400 p-1 transition-colors"><Send className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => handleDelete(post.id)} className="text-red-800 hover:text-red-400 p-1 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {post.status === 'published' && (post.impressions > 0 || post.engagements > 0) && (
                      <div className="flex gap-4 mt-2 pt-2 border-t border-cyan-900/15 text-[10px] font-mono text-cyan-700">
                        <span>{post.impressions.toLocaleString()} views</span>
                        <span>{post.engagements.toLocaleString()} engagements</span>
                        <span>{post.clicks.toLocaleString()} clicks</span>
                        <span>{post.shares.toLocaleString()} shares</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COMPOSE ── */}
      {tab === 'compose' && (
        <div className="space-y-4">
          <div className="border border-cyan-900/30 bg-black/20 p-4 space-y-4">
            <div>
              <label className="text-[10px] font-mono text-cyan-700 tracking-wider block mb-1.5">PLATFORM</label>
              <div className="flex gap-1.5 flex-wrap">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setComposePlatform(p.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono tracking-wider border transition-all ${
                      composePlatform === p.id
                        ? 'border-opacity-60 bg-opacity-10'
                        : 'border-cyan-900/20 text-cyan-800 hover:text-cyan-500'
                    }`}
                    style={composePlatform === p.id ? { borderColor: p.color + '99', color: p.color, backgroundColor: p.color + '15' } : {}}
                  >
                    <p.icon className="w-3 h-3" />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-mono text-cyan-700 tracking-wider">CONTENT</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAi(!showAi)}
                    className="flex items-center gap-1 text-[10px] font-mono text-yellow-600/60 hover:text-yellow-400 border border-yellow-900/30 px-2 py-0.5 transition-colors"
                  >
                    <Zap className="w-3 h-3" /> AI GENERATE
                  </button>
                  <button
                    onClick={() => setShowCrossPost(!showCrossPost)}
                    className="flex items-center gap-1 text-[10px] font-mono text-purple-600/60 hover:text-purple-400 border border-purple-900/30 px-2 py-0.5 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> CROSS-POST
                  </button>
                  <span className={`text-[10px] font-mono ${charOver ? 'text-red-400' : 'text-cyan-800'}`}>
                    {charCount}/{platformInfo.charLimit}
                  </span>
                </div>
              </div>

              <AnimatePresence>
                {showAi && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border border-yellow-900/30 bg-yellow-950/10 p-3 mb-3 space-y-2">
                      <div className="text-[10px] font-mono text-yellow-600/60 tracking-wider">AI CONTENT GENERATOR</div>
                      <input
                        type="text"
                        value={aiTopic}
                        onChange={e => setAiTopic(e.target.value)}
                        placeholder="What should this post be about?"
                        className="w-full bg-black/40 border border-yellow-900/30 text-cyan-300 text-xs font-mono px-3 py-2 outline-none placeholder:text-cyan-900"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={aiTone}
                          onChange={e => setAiTone(e.target.value)}
                          className="bg-black/40 border border-yellow-900/30 text-cyan-400 text-xs font-mono px-2 py-1 outline-none"
                        >
                          {TONES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                        </select>
                        <button
                          onClick={handleAiGenerate}
                          disabled={aiGenerating || !aiTopic.trim()}
                          className="flex items-center gap-1.5 bg-yellow-950/30 border border-yellow-700/40 text-yellow-500 text-xs font-mono px-3 py-1 hover:bg-yellow-900/30 disabled:opacity-30 transition-colors"
                        >
                          {aiGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          {aiGenerating ? 'GENERATING...' : 'GENERATE'}
                        </button>
                      </div>
                      {aiPrimeNeeded && (
                        <div className="text-[10px] font-mono text-yellow-400/80 border border-yellow-700/40 bg-yellow-950/20 px-2 py-1.5">
                          AI COPY GENERATION REQUIRES PABLO PRIME. <a href="/upgrade" className="underline text-yellow-300">UPGRADE →</a>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showCrossPost && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border border-purple-900/30 bg-purple-950/10 p-3 mb-3 space-y-2">
                      <div className="text-[10px] font-mono text-purple-600/60 tracking-wider">CROSS-POST — AI ADAPTS YOUR CONTENT FOR EACH PLATFORM</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {PLATFORMS.filter(p => p.id !== composePlatform).map(p => (
                          <button
                            key={p.id}
                            onClick={() => setCrossPostPlatforms(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono border transition-all ${
                              crossPostPlatforms.includes(p.id) ? 'border-purple-600/50 text-purple-400 bg-purple-950/30' : 'border-cyan-900/20 text-cyan-800'
                            }`}
                          >
                            <p.icon className="w-3 h-3" />
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleCrossPost}
                        disabled={crossPosting || crossPostPlatforms.length === 0 || !composeContent.trim()}
                        className="flex items-center gap-1.5 bg-purple-950/30 border border-purple-700/40 text-purple-400 text-xs font-mono px-3 py-1 hover:bg-purple-900/30 disabled:opacity-30 transition-colors"
                      >
                        {crossPosting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                        {crossPosting ? 'ADAPTING...' : `CREATE ${crossPostPlatforms.length} VARIANTS`}
                      </button>
                      {aiPrimeNeeded && (
                        <div className="text-[10px] font-mono text-purple-300/80 border border-purple-700/40 bg-purple-950/20 px-2 py-1.5">
                          AI CROSS-POST REQUIRES PABLO PRIME. <a href="/upgrade" className="underline text-purple-200">UPGRADE →</a>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                value={composeContent}
                onChange={e => setComposeContent(e.target.value)}
                rows={6}
                placeholder="Write your post content..."
                className={`w-full bg-black/40 border ${charOver ? 'border-red-600/50' : 'border-cyan-900/30'} text-cyan-300 text-xs font-mono px-3 py-2 outline-none resize-none placeholder:text-cyan-900 leading-relaxed`}
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-cyan-700 tracking-wider block mb-1.5">HASHTAGS</label>
              <input
                type="text"
                value={composeHashtags}
                onChange={e => setComposeHashtags(e.target.value)}
                placeholder="#marketing #socialmedia #growth"
                className="w-full bg-black/40 border border-cyan-900/30 text-cyan-300 text-xs font-mono px-3 py-2 outline-none placeholder:text-cyan-900"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-cyan-700 tracking-wider block mb-1.5">SCHEDULE (OPTIONAL)</label>
              <input
                type="datetime-local"
                value={composeSchedule}
                onChange={e => setComposeSchedule(e.target.value)}
                className="bg-black/40 border border-cyan-900/30 text-cyan-300 text-xs font-mono px-3 py-2 outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleSave(true)}
                disabled={composeSaving || !composeContent.trim()}
                className="flex items-center gap-1.5 bg-cyan-950/30 border border-cyan-800/40 text-cyan-500 text-xs font-mono px-4 py-2 hover:bg-cyan-900/30 disabled:opacity-30 transition-colors"
              >
                {composeSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                SAVE DRAFT
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={composeSaving || !composeContent.trim() || charOver}
                className="flex items-center gap-1.5 bg-green-950/30 border border-green-800/40 text-green-500 text-xs font-mono px-4 py-2 hover:bg-green-900/30 disabled:opacity-30 transition-colors"
              >
                {composeSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {composeSchedule ? 'SCHEDULE' : 'PUBLISH NOW'}
              </button>
              {editingId && (
                <button
                  onClick={() => { setEditingId(null); setComposeContent(''); setComposeHashtags(''); setComposeSchedule(''); }}
                  className="flex items-center gap-1.5 text-cyan-800 text-xs font-mono px-3 py-2 hover:text-cyan-500 transition-colors"
                >
                  <X className="w-3 h-3" /> CANCEL
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CALENDAR ── */}
      {tab === 'calendar' && (
        <div className="space-y-3">
          <div className="text-[10px] font-mono text-cyan-700 tracking-wider">SCHEDULED POSTS TIMELINE</div>
          {calendarPosts.length === 0 ? (
            <div className="text-center py-12 text-cyan-800 text-xs font-mono tracking-wider">
              NO SCHEDULED POSTS — COMPOSE A POST AND SET A SCHEDULE DATE
            </div>
          ) : (
            <div className="space-y-2">
              {calendarPosts.map(post => {
                const pi = getPlatformInfo(post.platform);
                return (
                  <div key={post.id} className="flex items-center gap-3 border border-cyan-900/20 bg-black/20 p-3">
                    <div className="flex flex-col items-center text-center min-w-[60px]">
                      <div className="text-[10px] font-mono text-amber-500/70">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                      <div className="text-[9px] font-mono text-cyan-800">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                    <div className="w-px h-8 bg-cyan-900/20" />
                    <pi.icon className="w-4 h-4 flex-shrink-0" style={{ color: pi.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-cyan-400/70 font-mono truncate">{post.content}</p>
                    </div>
                    <span className="text-[9px] font-mono tracking-wider px-1.5 py-0.5 border" style={{ color: STATUS_COLORS[post.status], borderColor: STATUS_COLORS[post.status] + '44' }}>
                      {post.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {stats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'TOTAL POSTS', value: stats.total, color: '#38bdf8' },
                  { label: 'PUBLISHED', value: stats.published, color: '#22c55e' },
                  { label: 'SCHEDULED', value: stats.scheduled, color: '#fbbf24' },
                  { label: 'DRAFTS', value: stats.drafts, color: '#9ca3af' },
                ].map(s => (
                  <div key={s.label} className="border border-cyan-900/20 bg-black/20 p-3 text-center">
                    <div className="text-lg font-mono" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] font-mono text-cyan-800 tracking-wider mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'IMPRESSIONS', value: stats.totalImpressions },
                  { label: 'ENGAGEMENTS', value: stats.totalEngagements },
                  { label: 'CLICKS', value: stats.totalClicks },
                ].map(s => (
                  <div key={s.label} className="border border-cyan-900/20 bg-black/20 p-3 text-center">
                    <div className="text-base font-mono text-cyan-400">{s.value.toLocaleString()}</div>
                    <div className="text-[9px] font-mono text-cyan-800 tracking-wider mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {stats.platformBreakdown.length > 0 && (
                <div className="border border-cyan-900/20 bg-black/20 p-4">
                  <div className="text-[10px] font-mono text-cyan-700 tracking-wider mb-3">POSTS BY PLATFORM</div>
                  <div className="space-y-2">
                    {stats.platformBreakdown.map(pb => {
                      const pi = getPlatformInfo(pb.platform);
                      const pct = stats.total > 0 ? (pb.count / stats.total * 100) : 0;
                      return (
                        <div key={pb.platform} className="flex items-center gap-3">
                          <pi.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: pi.color }} />
                          <span className="text-[10px] font-mono w-20" style={{ color: pi.color }}>{pi.label}</span>
                          <div className="flex-1 h-3 bg-cyan-950/30 relative">
                            <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: pi.color + '40' }} />
                          </div>
                          <span className="text-[10px] font-mono text-cyan-600 w-8 text-right">{pb.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-cyan-600" /></div>
          )}
        </div>
      )}

      {/* ── GAMEPLAY REEL (owner only) ── */}
      {tab === 'reel' && isOwner && (() => {
        const job = reelJob;
        const active = job ? REEL_ACTIVE.has(job.status) : false;
        const done = job?.status === 'done';
        const failed = job?.status === 'error';
        const statusColor = failed ? '#f87171' : done ? '#22c55e' : '#fbbf24';
        return (
          <div className="space-y-4">
            <div className="border border-cyan-900/30 bg-black/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-mono tracking-wider text-pink-400">GAMEPLAY REEL — AUTO-CAPTURED VERTICAL SHORT</span>
              </div>
              <p className="text-[11px] font-mono text-cyan-700 leading-relaxed">
                A headless bot plays SALARYMAN and screen-records ~40s of REAL gameplay,
                then renders a 1080×1920 short (caption + music, no AI narration). If a
                connected owner TikTok account exists it auto-posts; otherwise it's stored
                and emailed to you. Runs automatically every Monday at noon PT — use the
                button below to make one on demand.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={startReel}
                  disabled={reelStarting || active}
                  className="flex items-center gap-1.5 bg-pink-950/30 border border-pink-700/40 text-pink-400 text-xs font-mono px-4 py-2 hover:bg-pink-900/30 disabled:opacity-30 transition-colors"
                >
                  {reelStarting || active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                  {active ? 'CAPTURING…' : reelStarting ? 'STARTING…' : 'CREATE GAMEPLAY REEL'}
                </button>
                <button onClick={fetchReelStatus} className="text-cyan-700 hover:text-cyan-400 transition-colors p-1.5 border border-cyan-900/30">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {reelError && (
                <div className="text-[10px] font-mono text-red-400/80 border border-red-800/40 bg-red-950/20 px-2 py-1.5">{reelError}</div>
              )}
            </div>

            {job && (
              <div className="border border-cyan-900/30 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-cyan-700 tracking-wider">JOB {job.id}</span>
                  <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.5 border"
                    style={{ color: statusColor, borderColor: statusColor + '44' }}>
                    {job.status.toUpperCase()}
                  </span>
                </div>

                {(active || done) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-cyan-700">
                      <span>{job.stage}</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-2 bg-cyan-950/40 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-pink-500/50 transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                )}

                {failed && job.error && (
                  <div className="text-[10px] font-mono text-red-400/80 border border-red-800/40 bg-red-950/20 px-2 py-1.5">{job.error}</div>
                )}

                {done && job.hasVideo && (
                  <div className="space-y-2">
                    <video
                      src={apiUrl(`/api/gameplay-tiktok/${job.id}/file`)}
                      controls
                      playsInline
                      className="w-full max-w-[260px] mx-auto border border-cyan-900/40 bg-black"
                    />
                    <div className="flex items-center justify-center">
                      <a
                        href={apiUrl(`/api/gameplay-tiktok/${job.id}/file`)}
                        download={`salaryman-reel-${job.id}.mp4`}
                        className="flex items-center gap-1.5 text-cyan-500 hover:text-cyan-300 text-xs font-mono border border-cyan-800/40 px-3 py-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> DOWNLOAD MP4
                      </a>
                    </div>
                  </div>
                )}

                {done && job.delivery && (
                  <div className="text-[10px] font-mono text-cyan-600 border-t border-cyan-900/20 pt-2 space-y-1">
                    {job.delivery.method === 'tiktok' && (
                      <div className="flex items-center gap-1.5 text-green-500"><UploadCloud className="w-3 h-3" /> Posted to TikTok{job.delivery.tiktokPublishId ? ` · ${job.delivery.tiktokPublishId}` : ''}</div>
                    )}
                    {job.delivery.method === 'email' && (
                      <div className="flex items-center gap-1.5 text-cyan-400"><Mail className="w-3 h-3" /> Emailed to owner</div>
                    )}
                    {job.delivery.method === 'none' && (
                      <div className="text-cyan-700">{job.delivery.note || 'Produced — stored only.'}</div>
                    )}
                    {job.delivery.tiktokSkippedReason && (
                      <div className="text-cyan-800">TikTok auto-post skipped: {job.delivery.tiktokSkippedReason}</div>
                    )}
                    {job.delivery.objectPath && (
                      <div className="text-cyan-800 truncate">Backup: {job.delivery.objectPath}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── POST PREVIEW MODAL ── */}
      <AnimatePresence>
        {previewPost && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewPost(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#0a0f0a] border border-cyan-900/40 p-6 max-w-lg w-full max-h-[80vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {(() => { const pi = getPlatformInfo(previewPost.platform); return <><pi.icon className="w-4 h-4" style={{ color: pi.color }} /><span className="text-xs font-mono" style={{ color: pi.color }}>{pi.label}</span></>; })()}
                  <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.5 border" style={{ color: STATUS_COLORS[previewPost.status], borderColor: STATUS_COLORS[previewPost.status] + '44' }}>
                    {previewPost.status.toUpperCase()}
                  </span>
                </div>
                <button onClick={() => setPreviewPost(null)} className="text-cyan-800 hover:text-cyan-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="text-sm text-cyan-300/80 font-mono leading-relaxed whitespace-pre-wrap mb-4">{previewPost.content}</div>
              {previewPost.hashtags && (previewPost.hashtags as string[]).length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-4">
                  {(previewPost.hashtags as string[]).map((h, i) => (
                    <span key={i} className="text-[10px] font-mono text-cyan-600 bg-cyan-950/40 px-2 py-0.5">{h}</span>
                  ))}
                </div>
              )}
              <div className="text-[9px] font-mono text-cyan-900 border-t border-cyan-900/20 pt-2 space-y-0.5">
                <div>Created: {fmtDate(previewPost.createdAt)}</div>
                {previewPost.scheduledAt && <div>Scheduled: {fmtDate(previewPost.scheduledAt)}</div>}
                {previewPost.publishedAt && <div>Published: {fmtDate(previewPost.publishedAt)}</div>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
