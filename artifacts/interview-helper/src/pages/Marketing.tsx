import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { PabloAutomationNav } from '@/components/PabloAutomationNav';
import {
  Linkedin, Instagram, Facebook, Music2, Megaphone, Loader2, Wand2, Twitter, Cloud, AtSign, Youtube,
  Trash2, Copy, Check, Image as ImageIcon, Bot, Hash, Download,
} from 'lucide-react';

const CRT = '#111111';
const CRT_DIM = 'rgba(0,0,0,0.58)';
const CRT_FAINT = 'rgba(0,0,0,0.14)';
const FONT = "var(--font-sans)";

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'bluesky' | 'threads' | 'youtube';

const PLATFORMS: Array<{
  id: Platform;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  dims: string;
}> = [
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, dims: '1200x627' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, dims: '1080x1080' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, dims: '1200x628' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, dims: '1080x1920' },
  { id: 'twitter', label: 'X / Twitter', icon: Twitter, dims: '1600x900' },
  { id: 'bluesky', label: 'Bluesky', icon: Cloud, dims: '1200x675' },
  { id: 'threads', label: 'Threads', icon: AtSign, dims: '1080x1080' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, dims: '1280x720' },
];

interface AdBot {
  id: number;
  name: string;
  role: string | null;
  status: string | null;
  personality: string | null;
}

interface AdCreative {
  id: number;
  platform: Platform;
  brief: string;
  headline: string | null;
  primaryText: string | null;
  cta: string | null;
  hashtags: string[] | null;
  imageUrl: string | null;
  dimensions: string | null;
  botName: string | null;
  status: string | null;
  createdAt: string | null;
}

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(0,0,0,0.2)',
  color: '#111111',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  padding: '10px 12px',
  outline: 'none',
  width: '100%',
  borderRadius: '6px',
  resize: 'none',
};

function platformIcon(p: Platform): React.ComponentType<{ className?: string }> {
  return PLATFORMS.find((x) => x.id === p)?.icon ?? Megaphone;
}

function platformLabel(p: Platform): string {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

export default function Marketing() {
  const [location] = useLocation();
  const showAutomationNav = location.split(/[?#]/, 1)[0] === '/bots/ad-studio';
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [brief, setBrief] = useState('');
  const [bots, setBots] = useState<AdBot[]>([]);
  const [botId, setBotId] = useState<number | null>(null);
  const [loadingBots, setLoadingBots] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<AdCreative[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [latest, setLatest] = useState<AdCreative | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const loadBots = useCallback(async () => {
    setLoadingBots(true);
    setTeamError(null);
    try {
      const res = await apiFetch('/api/marketing/ad-bots');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not load the ad capability (${res.status}).`);
      const list: AdBot[] = Array.isArray(data.bots) ? data.bots : [];
      setBots(list);
      setBotId((prev) => list.some((bot) => bot.id === prev)
        ? prev
        : list.find((bot) => (bot.role ?? '').toLowerCase() === 'lead')?.id ?? list[0]?.id ?? null);
      if (!list.length) setTeamError('PABLO PRIME ad capability is unavailable.');
    } catch (loadError) {
      setTeamError(loadError instanceof Error ? loadError.message : 'Could not load the ad capability.');
    } finally {
      setLoadingBots(false);
    }
  }, []);

  const loadAds = useCallback(async () => {
    setLoadingAds(true);
    setAdsError(null);
    try {
      const res = await apiFetch('/api/marketing/ads');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not load the ad library (${res.status}).`);
      setAds(Array.isArray(data.ads) ? data.ads : []);
    } catch (loadError) {
      setAdsError(loadError instanceof Error ? loadError.message : 'Could not load the ad library.');
    } finally {
      setLoadingAds(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
    loadAds();
  }, [loadBots, loadAds]);

  const generate = useCallback(async () => {
    if (!brief.trim() || generating) return;
    if (!botId || loadingBots || teamError) {
      setError(teamError ?? 'PABLO PRIME is not ready to create ads.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/marketing/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, brief: brief.trim(), botId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate ad');
        return;
      }
      if (!data.ad) throw new Error('The ad service returned no creative.');
      setLatest(data.ad);
      setAds((prev) => [data.ad, ...prev]);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }, [brief, platform, botId, generating, loadingBots, teamError]);

  const remove = useCallback(async (id: number) => {
    try {
      const res = await apiFetch(`/api/marketing/ads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAds((prev) => prev.filter((a) => a.id !== id));
        setLatest((prev) => (prev?.id === id ? null : prev));
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const copyAd = useCallback((ad: AdCreative) => {
    const tags = (ad.hashtags ?? []).map((h) => `#${h}`).join(' ');
    const text = [ad.headline, '', ad.primaryText, '', ad.cta, '', tags]
      .filter((s) => s !== null && s !== undefined)
      .join('\n')
      .trim();
    navigator.clipboard?.writeText(text);
    setCopied(ad.id);
    setTimeout(() => setCopied((c) => (c === ad.id ? null : c)), 1500);
  }, []);

  return (
    <div style={{ minHeight: '100%', background: '#fafaf7', color: '#111111', fontFamily: FONT, padding: '24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {showAutomationNav && <PabloAutomationNav />}
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Megaphone className="w-5 h-5" style={{ color: CRT }} />
          <h1 style={{ fontSize: '1.1rem', letterSpacing: '0.14em', color: CRT, margin: 0 }}>AD BOTS</h1>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.62)', letterSpacing: '0.02em', margin: '0 0 20px' }}>
          PABLO PRIME creates platform-specific ad copy and visuals. Choose a channel, review the result, and post from your account.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20, alignItems: 'start' }}>
          {/* LEFT — generator + result + gallery */}
          <div>
            {/* Generator */}
            <div style={{ border: `1px solid ${CRT_FAINT}`, borderRadius: 8, padding: 18, background: '#ffffff' }}>
              {/* Platform tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {PLATFORMS.map((p) => {
                  const Icon = p.icon;
                  const active = platform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`button-ad-platform-${p.id}`}
                      onClick={() => setPlatform(p.id)}
                      aria-pressed={active}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        flexShrink: 0, whiteSpace: 'nowrap',
                        fontFamily: 'inherit', fontSize: '0.72rem', letterSpacing: '0.06em',
                        padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                        color: active ? '#ffffff' : CRT_DIM,
                        background: active ? CRT : '#ffffff',
                        border: `1px solid ${active ? CRT : 'rgba(0,0,0,0.2)'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <label style={{ fontSize: '0.66rem', letterSpacing: '0.1em', color: CRT_DIM, display: 'block', marginBottom: 6 }}>
                CAMPAIGN BRIEF
              </label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What are we advertising? Product, offer, audience, key benefit, vibe…"
                rows={4}
                maxLength={1000}
                style={inputStyle}
              />

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  onClick={generate}
                  data-testid="button-generate-ad"
                  disabled={generating || !brief.trim() || !botId || loadingBots || Boolean(teamError)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: 'inherit', fontSize: '0.8rem', letterSpacing: '0.06em',
                    padding: '11px 20px', borderRadius: 6,
                    cursor: generating || !brief.trim() ? 'not-allowed' : 'pointer',
                    color: generating || !brief.trim() ? 'rgba(161,161,170,0.4)' : '#06080d',
                    background: generating || !brief.trim() ? 'rgba(255,255,255,0.04)' : CRT,
                    border: `1px solid ${generating || !brief.trim() ? 'rgba(255,255,255,0.08)' : CRT}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {generating ? 'GENERATING…' : 'GENERATE AD'}
                </button>
              </div>

              {error && (
                <div style={{ marginTop: 12, fontSize: '0.72rem', color: '#f87171', letterSpacing: '0.04em' }}>{error}</div>
              )}
              {generating && (
                <div style={{ marginTop: 12, fontSize: '0.68rem', color: CRT_DIM, letterSpacing: '0.04em' }}>
                  Writing copy and rendering the visual — this can take ~30s.
                </div>
              )}
            </div>

            {/* Latest result */}
            <AnimatePresence>
              {latest && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ marginTop: 18 }}
                >
                  <div style={{ fontSize: '0.66rem', letterSpacing: '0.12em', color: CRT, marginBottom: 8 }}>LATEST CREATIVE</div>
                  <AdCard ad={latest} onDelete={remove} onCopy={copyAd} copied={copied === latest.id} large />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gallery */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ImageIcon className="w-4 h-4" style={{ color: CRT_DIM }} />
                <span style={{ fontSize: '0.7rem', letterSpacing: '0.12em', color: CRT_DIM }}>
                  AD LIBRARY {ads.length > 0 ? `· ${ads.length}` : ''}
                </span>
              </div>
              {adsError ? (
                <div role="alert" style={{ border: `1px solid ${CRT_FAINT}`, borderRadius: 8, padding: 16, color: '#8b1b1b', fontSize: '0.72rem' }}>
                  {adsError}{' '}
                  <button type="button" onClick={() => void loadAds()} style={{ textDecoration: 'underline' }}>Retry</button>
                </div>
              ) : loadingAds ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: CRT_DIM }} />
                </div>
              ) : ads.length === 0 ? (
                <div style={{ border: `1px dashed ${CRT_FAINT}`, borderRadius: 10, padding: 40, textAlign: 'center', color: 'rgba(161,161,170,0.5)', fontSize: '0.75rem' }}>
                  No ads yet. Write a brief and generate your first creative.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                  {ads.map((ad) => (
                    <AdCard key={ad.id} ad={ad} onDelete={remove} onCopy={copyAd} copied={copied === ad.id} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PABLO PRIME uses one assistant for the ad capability. */}
          <div style={{ border: `1px solid ${CRT_FAINT}`, borderRadius: 8, padding: 16, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Bot className="w-4 h-4" style={{ color: CRT }} />
              <span style={{ fontSize: '0.7rem', letterSpacing: '0.12em', color: CRT }}>PABLO PRIME</span>
            </div>
            <p style={{ fontSize: '0.64rem', color: 'rgba(0,0,0,0.58)', margin: '0 0 14px', lineHeight: 1.5 }}>
              One assistant handles ad creation. Existing provider configuration stays behind the scenes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingBots ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', color: 'rgba(0,0,0,0.5)' }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing ad creation…
                </div>
              ) : teamError ? (
                <div role="alert" style={{ fontSize: '0.7rem', color: '#8b1b1b' }}>
                  {teamError}{' '}
                  <button type="button" onClick={() => void loadBots()} style={{ textDecoration: 'underline' }}>Retry</button>
                </div>
              ) : (
                <div
                  data-testid="pablo-automation-ad-ready"
                  style={{ border: `1px solid ${CRT_FAINT}`, borderRadius: 8, padding: '10px 12px', fontSize: '0.72rem', color: CRT_DIM }}
                >
                  {generating ? 'PABLO PRIME IS CREATING YOUR AD.' : 'READY TO CREATE ADS.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdCard({
  ad, onDelete, onCopy, copied, large,
}: {
  ad: AdCreative;
  onDelete: (id: number) => void;
  onCopy: (ad: AdCreative) => void;
  copied: boolean;
  large?: boolean;
}) {
  const Icon = platformIcon(ad.platform);
  const imgSrc = resolveAvatarUrl(ad.imageUrl);
  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8, overflow: 'hidden', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', background: '#f3f1eb', aspectRatio: large ? '1.91 / 1' : '16 / 10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {imgSrc ? (
          <img src={imgSrc} alt={ad.headline ?? 'Ad creative'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <ImageIcon className="w-8 h-8" style={{ color: 'rgba(0,0,0,0.3)' }} />
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ffffff', border: `1px solid ${CRT_FAINT}`, borderRadius: 4, padding: '3px 8px', fontSize: '0.62rem', letterSpacing: '0.04em', color: CRT }}>
          <Icon className="w-3 h-3" />
          {platformLabel(ad.platform)}{ad.dimensions ? ` · ${ad.dimensions}` : ''}
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {ad.headline && (
          <div style={{ fontSize: large ? '0.95rem' : '0.82rem', color: '#111111', lineHeight: 1.35 }}>{ad.headline}</div>
        )}
        {ad.primaryText && (
          <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.7)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ad.primaryText}</div>
        )}
        {ad.cta && (
          <div style={{ alignSelf: 'flex-start', fontSize: '0.66rem', letterSpacing: '0.04em', color: '#ffffff', background: CRT, borderRadius: 4, padding: '4px 12px' }}>{ad.cta}</div>
        )}
        {ad.hashtags && ad.hashtags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {ad.hashtags.map((h) => (
              <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.62rem', color: CRT_DIM }}>
                <Hash className="w-2.5 h-2.5" />{h}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
          <button
            onClick={() => onCopy(ad)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', fontSize: '0.66rem', letterSpacing: '0.05em', color: CRT_DIM, background: 'transparent', border: `1px solid rgba(56,189,248,0.2)`, borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'COPIED' : 'COPY TEXT'}
          </button>
          {imgSrc && (
            <a
              href={imgSrc}
              download={`ad-${ad.platform}-${ad.id}.png`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', fontSize: '0.66rem', letterSpacing: '0.05em', color: CRT_DIM, background: 'transparent', border: `1px solid rgba(56,189,248,0.2)`, borderRadius: 5, padding: '5px 10px', textDecoration: 'none' }}
            >
              <Download className="w-3 h-3" /> IMAGE
            </a>
          )}
          {ad.botName && (
            <span style={{ fontSize: '0.6rem', color: 'rgba(161,161,170,0.5)', marginLeft: 4 }}>by {ad.botName}</span>
          )}
          <button
            onClick={() => onDelete(ad.id)}
            title="Delete"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', color: 'rgba(248,113,113,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
