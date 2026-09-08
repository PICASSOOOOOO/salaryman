/**
 * TerrenceAssistDrawer — floating, collapsible chat drawer that lets the
 * music-bot TERRENCE coach the player in any creative tab. Mounts in
 * WriterStudio (lyric mode), SoundLab, and TerrenceStudio.
 *
 * Ownership-gated: we only render the drawer if the player has an active
 * subscription to the TERRENCE marketplace bot. If they don't, we render
 * a minimal "HIRE TERRENCE" pill that links to VendKing.
 *
 * Streams from POST /api/studio/terrence-assist (SSE-style data: lines).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic2, X, Send, Loader2, Lock } from "lucide-react";
import { apiFetch, apiUrl } from "@/lib/api-client";

type Surface = 'writer' | 'soundlab' | 'studio';

interface SessionContext {
  genre?: string;
  bpm?: number;
  timeSignature?: string;
  /** Last ~2k chars of the user's working lyric, for paste-aware coaching. */
  lyricSnippet?: string;
  /** Free-text production notes (BPM, key, what's loaded). */
  beatNotes?: string;
}

interface Props {
  surface: Surface;
  /** Live session context — re-read every send. */
  getContext?: () => SessionContext;
  /** Optional: pin open by default (used in TerrenceStudio). */
  defaultOpen?: boolean;
  /** Hide the floating launcher entirely (consumer renders its own trigger). */
  externalTrigger?: { open: boolean; setOpen: (v: boolean) => void };
}

interface Msg { role: 'user' | 'assistant'; content: string; pending?: boolean }

const TERRENCE_SLUG = 'music-bot';

export default function TerrenceAssistDrawer({ surface, getContext, defaultOpen = false, externalTrigger }: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = externalTrigger ? externalTrigger.open : internalOpen;
  const setOpen = externalTrigger ? externalTrigger.setOpen : setInternalOpen;

  const [ownership, setOwnership] = useState<'unknown' | 'owned' | 'unowned'>('unknown');
  const [msgs, setMsgs]   = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Probe ownership once. We look up the marketplace item by slug, then
  // check the user's active subscriptions for that ID. Failing gracefully
  // (treat as unowned) keeps the drawer non-fatal in offline / dev modes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          apiFetch('/api/bots/marketplace/list'),
          apiFetch('/api/bots/marketplace/subscriptions'),
        ]);
        if (cancelled) return;
        const items = mRes.ok ? (await mRes.json())?.items ?? [] : [];
        const subs  = sRes.ok ? (await sRes.json())?.subscriptions ?? [] : [];
        const terrence = items.find((i: any) => i?.slug === TERRENCE_SLUG || i?.name === 'TERRENCE');
        const owned = !!terrence && subs.some((s: any) => s?.marketplaceItemId === terrence.id && s?.status === 'active');
        setOwnership(owned ? 'owned' : 'unowned');
      } catch {
        if (!cancelled) setOwnership('unowned');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll on new content.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open]);

  // Stop any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');

    const ctx = getContext?.() ?? {};
    const history = msgs.filter(m => !m.pending).slice(-6).map(m => ({ role: m.role, content: m.content }));

    setMsgs(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: '', pending: true }]);
    setSending(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch(apiUrl('studio/terrence-assist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          surface,
          history,
          ...ctx,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMsgs(m => replaceLast(m, `▾ TERRENCE: line dropped — ${err.error ?? res.status}`));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = ''; let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) { full += data.content; setMsgs(m => replaceLast(m, full)); }
            if (data.error)   { setMsgs(m => replaceLast(m, `▾ ${data.error}`)); }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setMsgs(m => replaceLast(m, `▾ Connection cut: ${e?.message ?? 'unknown'}`));
    } finally {
      setSending(false);
    }
  };

  const greeting = useMemo(() => terrenceGreetingFor(surface), [surface]);

  // Don't render anything until ownership is known to avoid flashing.
  if (ownership === 'unknown') return null;

  // Unowned → small dock pill that links to VendKing.
  if (ownership === 'unowned') {
    if (externalTrigger) return null;   // consumer is in charge of trigger
    return (
      <a
        href="/bots"
        className="fixed top-16 sm:top-24 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full font-mono text-[10px] tracking-[0.3em] text-pink-200 bg-black/80 border border-pink-500/40 hover:bg-pink-500/20 hover:text-white transition"
        title="Hire TERRENCE — live music coaching in every creative tab"
      >
        <Lock size={12} />
        HIRE TERRENCE
      </a>
    );
  }

  return (
    <>
      {/* Floating launcher (only when no external trigger and panel closed) */}
      {!externalTrigger && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed top-16 sm:top-24 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full font-mono text-[10px] tracking-[0.3em] text-pink-100 bg-black/85 border border-pink-500/60 hover:bg-pink-500/20 transition shadow-[0_0_30px_rgba(236,72,153,0.35)]"
          aria-label="Open Terrence assist"
        >
          <Mic2 size={14} className="text-pink-300" />
          ASK TERRENCE
        </button>
      )}

      {open && (
        <div
          className="fixed top-16 sm:top-24 right-4 z-50 w-[min(380px,94vw)] h-[min(540px,72vh)] flex flex-col rounded-md font-mono text-[12px] text-pink-100 shadow-[0_0_60px_rgba(236,72,153,0.35)]"
          style={{
            background: 'linear-gradient(180deg, #0a0a12 0%, #050507 100%)',
            border: '1px solid #ec489966',
          }}
          role="dialog"
          aria-label="Terrence music assist"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-3 py-2 border-b border-pink-500/30">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-400" style={{ boxShadow: '0 0 8px #ec4899', animation: 'bbs-pulse 1.4s ease-in-out infinite' }} />
              <span className="text-[10px] tracking-[0.4em] text-pink-200">TERRENCE // {surface.toUpperCase()}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-pink-300" aria-label="Close">
              <X size={14} />
            </button>
          </header>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="text-zinc-400 leading-relaxed">
                <div className="text-pink-300 mb-1">▾ TERRENCE</div>
                {greeting}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-cyan-200' : 'text-zinc-200'}>
                <div className={`text-[9px] tracking-[0.4em] mb-1 ${m.role === 'user' ? 'text-cyan-400' : 'text-pink-300'}`}>
                  {m.role === 'user' ? '▸ YOU' : '▾ TERRENCE'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {m.content || (m.pending ? <span className="text-zinc-500 inline-flex items-center gap-2"><Loader2 className="animate-spin" size={12}/> in the booth…</span> : '')}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-pink-500/30 p-2 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask for a hook, a chord move, a mix tweak…"
              rows={2}
              className="flex-1 bg-black/60 border border-pink-500/30 rounded px-2 py-1.5 text-[12px] resize-none focus:outline-none focus:border-pink-400 placeholder:text-zinc-600"
              aria-label="Message Terrence"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.trim()}
              className="h-9 w-9 flex items-center justify-center rounded bg-pink-500/30 border border-pink-500 hover:bg-pink-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              {sending ? <Loader2 className="animate-spin" size={14}/> : <Send size={14}/>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function replaceLast(arr: Msg[], content: string): Msg[] {
  if (arr.length === 0) return arr;
  const next = arr.slice();
  next[next.length - 1] = { role: 'assistant', content };
  return next;
}

function terrenceGreetingFor(surface: Surface): string {
  switch (surface) {
    case 'writer':
      return `I'm in the room. Drop a verse, a hook idea, or just say "what's the move on this bridge?" — I'll pull on the lyric you're working and respond in pocket. Try: "tighten this hook for radio" or "give me 4 bars of an 808 trap chorus".`;
    case 'soundlab':
      return `Sound design tab. Tell me what you're chasing — fat sub, glassy lead, gritty Memphis snare, side-chained pad — and I'll walk you through the patch knob by knob. I can also sketch a 16-step pattern you can paste in.`;
    default:
      return `Welcome to the studio. Faders are hot. Tell me what we're building today — genre, mood, BPM, target placement. I'll sketch the arrangement, the chord move, the lyric direction, and the mix moves to land it.`;
  }
}
