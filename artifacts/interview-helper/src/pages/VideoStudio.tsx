import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Film, Sparkles, Loader2, Download, AlertTriangle, Smartphone, Monitor } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '').replace(/^\//, '');
function apiUrl(path: string) {
  return `/${BASE ? BASE + '/' : ''}api/${path}`.replace(/\/+/g, '/');
}

type Orientation = 'portrait' | 'landscape';

interface JobStatus {
  id: string;
  status: 'queued' | 'scripting' | 'rendering' | 'assembling' | 'done' | 'error';
  stage: string;
  progress: number;
  title: string | null;
  sceneCount: number;
  scenesDone: number;
  durationSec: number | null;
  error: string | null;
  ready: boolean;
}

export default function VideoStudio() {
  const { isAuthenticated, login } = useAuth();
  const [topic, setTopic] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [sceneCount, setSceneCount] = useState(5);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const poll = useCallback((id: string) => {
    const tick = async () => {
      try {
        const res = await apiFetch(apiUrl(`studio/video/${id}`), { credentials: 'include' });
        if (!res.ok) {
          setError(`Status check failed (${res.status})`);
          setBusy(false);
          return;
        }
        const data = await res.json() as JobStatus;
        setJob(data);
        if (data.status === 'done') {
          setVideoUrl(apiUrl(`studio/video/${id}/file`));
          setBusy(false);
          return;
        }
        if (data.status === 'error') {
          setError(data.error || 'Video generation failed');
          setBusy(false);
          return;
        }
        pollRef.current = setTimeout(tick, 2500);
      } catch {
        setError('Lost connection while generating.');
        setBusy(false);
      }
    };
    pollRef.current = setTimeout(tick, 2000);
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim() || busy) return;
    clearPoll();
    setError(null);
    setVideoUrl(null);
    setJob(null);
    setBusy(true);
    try {
      const res = await apiFetch(apiUrl('studio/video'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), orientation, sceneCount }),
      });
      if (!res.ok) {
        let msg = `Failed to start (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
        setError(msg);
        setBusy(false);
        return;
      }
      const { id } = await res.json() as { id: string };
      poll(id);
    } catch {
      setError('Could not reach the video engine.');
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-4">
          <Film className="w-12 h-12 text-amber-400/40 mx-auto" />
          <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">ACCESS RESTRICTED</p>
          <button onClick={() => login()} className="px-6 py-2 border border-amber-500/30 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500/10 transition-colors">SIGN IN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Film className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-mono uppercase tracking-widest text-amber-400">Video Studio</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-8">
          Type a topic. The engine writes a script, voices it, generates cinematic
          visuals, and stitches a captioned short — automatically.
        </p>

        <div className="space-y-5 border border-white/[0.06] rounded-lg p-5 bg-white/[0.01]">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Topic</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="e.g. Three productivity habits of effective salarymen"
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/40 resize-none placeholder:text-zinc-700 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Format</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setOrientation('portrait')}
                  disabled={busy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border transition-colors ${orientation === 'portrait' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-white/10 text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Smartphone className="w-3 h-3" /> Vertical
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  disabled={busy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border transition-colors ${orientation === 'landscape' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-white/10 text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Monitor className="w-3 h-3" /> Wide
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Scenes: {sceneCount}</label>
              <input
                type="range"
                min={3}
                max={8}
                value={sceneCount}
                disabled={busy}
                onChange={e => setSceneCount(Number(e.target.value))}
                className="w-40 accent-amber-500"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={busy || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs uppercase tracking-widest rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? 'Generating…' : 'Generate Video'}
          </button>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2 text-red-400/90 text-sm border border-red-500/20 rounded p-3 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {busy && job && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-zinc-400 mb-2">
              <span>{job.stage}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded overflow-hidden">
              <div className="h-full bg-amber-500/70 transition-all duration-500" style={{ width: `${job.progress}%` }} />
            </div>
            {job.sceneCount > 0 && job.status === 'rendering' && (
              <p className="text-[10px] text-zinc-600 mt-2">Rendered {job.scenesDone}/{job.sceneCount} scenes</p>
            )}
          </div>
        )}

        {videoUrl && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono uppercase tracking-widest text-amber-400">
                {job?.title || 'Your Video'}
              </h2>
              <a
                href={videoUrl}
                download={`salaryman-video.mp4`}
                className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400 hover:text-amber-400 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
            <video
              src={videoUrl}
              controls
              autoPlay
              playsInline
              className={`rounded-lg border border-white/10 bg-black mx-auto ${orientation === 'portrait' ? 'max-h-[70vh]' : 'w-full'}`}
            />
            {job?.durationSec ? (
              <p className="text-[10px] text-zinc-600 mt-2 text-center">{job.durationSec}s · {job.sceneCount} scenes</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
