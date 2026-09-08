import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, Image, FileText, Instagram, Settings, Download, Loader2,
  Wand2, Plus, X, ExternalLink, RefreshCw, Palette, Type,
  Square, Circle, Triangle, Move, ZoomIn, ZoomOut, Trash2,
  Copy, Save, Upload, Eye, Grid, ChevronDown, Check, AlertTriangle,
  Layout,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useBoomerMode } from '@/hooks/use-mobile';
import { apiFetch } from '@/lib/api-client';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';

const ACCENT_CYAN = '#22d3ee';
const MUTED_CYAN = 'rgba(34,211,238,0.6)';
const ACCENT = '#f59e0b';

type StudioTab = 'create' | 'designs' | 'nano' | 'settings';
type CanvaDesign = { id: string; title: string; urls?: { edit_url?: string; view_url?: string }; thumbnail?: { url: string }; created_at?: string };

const TEMPLATE_PRESETS = [
  { id: 'poster-18x24', label: 'POSTER 18×24', w: 1296, h: 1728, cat: 'poster' },
  { id: 'poster-24x36', label: 'POSTER 24×36', w: 1728, h: 2592, cat: 'poster' },
  { id: 'poster-11x17', label: 'POSTER 11×17', w: 792, h: 1224, cat: 'poster' },
  { id: 'flyer-letter', label: 'FLYER (LETTER)', w: 612, h: 792, cat: 'flyer' },
  { id: 'flyer-a4', label: 'FLYER (A4)', w: 595, h: 842, cat: 'flyer' },
  { id: 'flyer-half', label: 'HALF-PAGE FLYER', w: 612, h: 396, cat: 'flyer' },
  { id: 'ig-post', label: 'INSTAGRAM POST', w: 1080, h: 1080, cat: 'social' },
  { id: 'ig-story', label: 'INSTAGRAM STORY', w: 1080, h: 1920, cat: 'social' },
  { id: 'fb-post', label: 'FACEBOOK POST', w: 1200, h: 630, cat: 'social' },
  { id: 'fb-cover', label: 'FACEBOOK COVER', w: 820, h: 312, cat: 'social' },
  { id: 'twitter-post', label: 'X / TWITTER POST', w: 1200, h: 675, cat: 'social' },
  { id: 'linkedin-post', label: 'LINKEDIN POST', w: 1200, h: 627, cat: 'social' },
  { id: 'youtube-thumb', label: 'YOUTUBE THUMBNAIL', w: 1280, h: 720, cat: 'social' },
  { id: 'banner-web', label: 'WEB BANNER', w: 1200, h: 300, cat: 'banner' },
  { id: 'business-card', label: 'BUSINESS CARD', w: 252, h: 144, cat: 'print' },
  { id: 'a3', label: 'A3 PRINT', w: 842, h: 1191, cat: 'print' },
  { id: 'custom', label: 'CUSTOM SIZE', w: 1024, h: 1024, cat: 'custom' },
];

const CATEGORIES = [
  { id: 'all', label: 'ALL' },
  { id: 'poster', label: 'POSTERS' },
  { id: 'flyer', label: 'FLYERS' },
  { id: 'social', label: 'SOCIAL' },
  { id: 'banner', label: 'BANNERS' },
  { id: 'print', label: 'PRINT' },
  { id: 'custom', label: 'CUSTOM' },
];

function jsonOpts(method: string, data: any) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

function SettingsPanel({ canvaKey, setCanvaKey, nanoKey, setNanoKey, nanoUrl, setNanoUrl }: {
  canvaKey: string; setCanvaKey: (v: string) => void;
  nanoKey: string; setNanoKey: (v: string) => void;
  nanoUrl: string; setNanoUrl: (v: string) => void;
}) {
  const [showCanva, setShowCanva] = useState(false);
  const [showNano, setShowNano] = useState(false);
  const [saved, setSaved] = useState('');

  const save = () => {
    sessionStorage.setItem('ds_canva_key', canvaKey);
    sessionStorage.setItem('ds_nano_key', nanoKey);
    sessionStorage.setItem('ds_nano_url', nanoUrl);
    setSaved('SAVED');
    setTimeout(() => setSaved(''), 2000);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontFamily: "var(--font-sans)", fontSize: '1.1rem', color: ACCENT_CYAN, letterSpacing: '.12em', marginBottom: 24 }}>
        API CONFIGURATION
      </h2>

      <div style={{ marginBottom: 24, padding: 16, border: `1px solid rgba(56,189,248,0.15)`, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: ACCENT_CYAN, letterSpacing: '.1em' }}>
            CANVA CONNECT API
          </span>
          <span style={{
            fontSize: '0.65rem', fontFamily: "var(--font-sans)",
            padding: '2px 8px', border: `1px solid ${canvaKey ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
            color: canvaKey ? '#22c55e' : ACCENT,
          }}>
            {canvaKey ? 'CONNECTED' : 'NOT SET'}
          </span>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'rgba(228,228,231,0.5)', marginBottom: 10, fontFamily: "var(--font-sans)" }}>
          Get your API key from <a href="https://www.canva.com/developers/" target="_blank" rel="noopener" style={{ color: ACCENT_CYAN, textDecoration: 'underline' }}>canva.com/developers</a>
        </p>
        <div style={{ position: 'relative' }}>
          <input
            type={showCanva ? 'text' : 'password'}
            value={canvaKey}
            onChange={e => setCanvaKey(e.target.value)}
            placeholder="Enter Canva API key..."
            style={{
              width: '100%', padding: '8px 40px 8px 12px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
              fontFamily: "var(--font-sans)", fontSize: '0.8rem',
            }}
          />
          <button onClick={() => setShowCanva(!showCanva)} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: MUTED_CYAN,
          }}>
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 24, padding: 16, border: `1px solid rgba(56,189,248,0.15)`, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: ACCENT_CYAN, letterSpacing: '.1em' }}>
            NANO BANANA API
          </span>
          <span style={{
            fontSize: '0.65rem', fontFamily: "var(--font-sans)",
            padding: '2px 8px', border: `1px solid ${nanoKey ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
            color: nanoKey ? '#22c55e' : ACCENT,
          }}>
            {nanoKey ? 'CONNECTED' : 'NOT SET'}
          </span>
        </div>
        <input
          type={showNano ? 'text' : 'password'}
          value={nanoKey}
          onChange={e => setNanoKey(e.target.value)}
          placeholder="Nano Banana API key..."
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 8, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
            fontFamily: "var(--font-sans)", fontSize: '0.8rem',
          }}
        />
        <input
          value={nanoUrl}
          onChange={e => setNanoUrl(e.target.value)}
          placeholder="Nano Banana API endpoint URL..."
          style={{
            width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
            fontFamily: "var(--font-sans)", fontSize: '0.8rem',
          }}
        />
        <button onClick={() => setShowNano(!showNano)} style={{
          marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
          color: MUTED_CYAN, fontFamily: "var(--font-sans)", fontSize: '0.65rem',
        }}>
          {showNano ? 'HIDE KEYS' : 'SHOW KEYS'}
        </button>
      </div>

      <button onClick={save} style={{
        fontFamily: "var(--font-sans)", fontSize: '0.8rem', letterSpacing: '.1em',
        padding: '10px 24px', border: `1px solid ${ACCENT_CYAN}`, background: 'rgba(34,211,238,0.08)',
        color: ACCENT_CYAN, cursor: 'pointer',
      }}>
        {saved || 'SAVE CONFIGURATION'}
      </button>
    </div>
  );
}

function CreatePanel({ canvaKey, nanoKey, nanoUrl }: { canvaKey: string; nanoKey: string; nanoUrl: string }) {
  const [cat, setCat] = useState('all');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customW, setCustomW] = useState(1024);
  const [customH, setCustomH] = useState(1024);
  const [result, setResult] = useState<{ url?: string; id?: string; error?: string } | null>(null);
  const [nanoPrompt, setNanoPrompt] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const filtered = cat === 'all' ? TEMPLATE_PRESETS : TEMPLATE_PRESETS.filter(t => t.cat === cat);
  const chosen = TEMPLATE_PRESETS.find(t => t.id === selectedPreset);

  const createDesign = useCallback(async () => {
    if (!canvaKey) { setResult({ error: 'Set your Canva API key in Settings first' }); return; }
    if (!selectedPreset) { setResult({ error: 'Select a template size' }); return; }

    setCreating(true);
    setResult(null);
    try {
      const preset = TEMPLATE_PRESETS.find(t => t.id === selectedPreset)!;
      const w = selectedPreset === 'custom' ? customW : preset.w;
      const h = selectedPreset === 'custom' ? customH : preset.h;

      const res = await apiFetch('/api/design-studio/canva/designs', jsonOpts('POST', {
        canvaApiKey: canvaKey,
        title: title || `${preset.label} — ${new Date().toLocaleDateString()}`,
        width: w,
        height: h,
      }));
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || 'Failed to create design' });
      } else {
        const design = data.design || data;
        setResult({
          id: design.id,
          url: design.urls?.edit_url,
        });
      }
    } catch (err: any) {
      setResult({ error: err.message || 'Network error' });
    }
    setCreating(false);
  }, [canvaKey, selectedPreset, title, customW, customH]);

  const generateWithNano = useCallback(async () => {
    if (!nanoKey || !nanoUrl) { setAiResult({ error: 'Set your Nano Banana API key and URL in Settings first' }); return; }
    if (!nanoPrompt.trim()) { setAiResult({ error: 'Enter a prompt' }); return; }

    setGeneratingAi(true);
    setAiResult(null);
    try {
      const preset = chosen || { w: 1024, h: 1024 };
      const w = selectedPreset === 'custom' ? customW : preset.w;
      const h = selectedPreset === 'custom' ? customH : (chosen?.h || 1024);

      const res = await apiFetch('/api/design-studio/nano/generate', jsonOpts('POST', {
        nanoApiKey: nanoKey,
        nanoApiUrl: nanoUrl,
        prompt: nanoPrompt,
        width: Math.min(w, 2048),
        height: Math.min(h, 2048),
      }));
      const data = await res.json();
      if (!res.ok) {
        setAiResult({ error: data.error || 'Generation failed' });
      } else {
        setAiResult(data);
      }
    } catch (err: any) {
      setAiResult({ error: err.message || 'Network error' });
    }
    setGeneratingAi(false);
  }, [nanoKey, nanoUrl, nanoPrompt, chosen, selectedPreset, customW, customH]);

  const uploadToCanva = useCallback(async (imageUrl: string) => {
    if (!canvaKey) { setResult({ error: 'Set Canva API key first' }); return; }
    try {
      const res = await apiFetch('/api/design-studio/canva/assets/upload', jsonOpts('POST', {
        canvaApiKey: canvaKey,
        name: title || 'Nano Banana Generation',
        url: imageUrl,
      }));
      const data = await res.json();
      if (res.ok) {
        setResult({ id: 'asset-uploaded', url: undefined });
      } else {
        setResult({ error: data.error || 'Upload failed' });
      }
    } catch (err: any) {
      setResult({ error: err.message });
    }
  }, [canvaKey, title]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{
            fontFamily: "var(--font-sans)", fontSize: '0.65rem', letterSpacing: '.08em',
            padding: '4px 10px', border: `1px solid ${cat === c.id ? ACCENT_CYAN : 'rgba(34,211,238,0.15)'}`,
            background: cat === c.id ? 'rgba(56,189,248,0.12)' : 'transparent',
            color: cat === c.id ? ACCENT_CYAN : MUTED_CYAN, cursor: 'pointer',
          }}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
        {filtered.map(t => {
          const sel = selectedPreset === t.id;
          const aspect = t.w / t.h;
          const previewH = 80;
          const previewW = Math.min(previewH * aspect, 120);
          return (
            <button key={t.id} onClick={() => setSelectedPreset(t.id)} style={{
              padding: 10, border: `1px solid ${sel ? ACCENT_CYAN : 'rgba(34,211,238,0.12)'}`,
              background: sel ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{
                width: previewW, height: previewH, margin: '0 auto 8px',
                border: `1px solid ${sel ? ACCENT_CYAN : 'rgba(34,211,238,0.2)'}`,
                background: 'rgba(56,189,248,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Layout className="w-4 h-4" style={{ color: sel ? ACCENT_CYAN : MUTED_CYAN }} />
              </div>
              <div style={{
                fontFamily: "var(--font-sans)", fontSize: '0.6rem',
                color: sel ? ACCENT_CYAN : 'rgba(226,232,240,0.75)', letterSpacing: '.06em',
              }}>
                {t.label}
              </div>
              <div style={{
                fontFamily: "var(--font-sans)", fontSize: '0.5rem',
                color: 'rgba(228,228,231,0.35)', marginTop: 2,
              }}>
                {t.w}×{t.h}px
              </div>
            </button>
          );
        })}
      </div>

      {selectedPreset === 'custom' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <label style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: MUTED_CYAN }}>W:</label>
          <input type="number" value={customW} onChange={e => setCustomW(+e.target.value)} min={100} max={4096}
            style={{
              width: 80, padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
              fontFamily: "var(--font-sans)", fontSize: '0.75rem',
            }} />
          <label style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: MUTED_CYAN }}>H:</label>
          <input type="number" value={customH} onChange={e => setCustomH(+e.target.value)} min={100} max={4096}
            style={{
              width: 80, padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
              fontFamily: "var(--font-sans)", fontSize: '0.75rem',
            }} />
        </div>
      )}

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Design title (optional)..."
        style={{
          width: '100%', padding: '8px 12px', marginBottom: 12, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
          fontFamily: "var(--font-sans)", fontSize: '0.8rem',
        }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={createDesign} disabled={creating || !selectedPreset} style={{
          fontFamily: "var(--font-sans)", fontSize: '0.75rem', letterSpacing: '.08em',
          padding: '8px 16px', border: `1px solid ${ACCENT_CYAN}`, background: 'rgba(34,211,238,0.1)',
          color: ACCENT_CYAN, cursor: creating ? 'wait' : 'pointer', opacity: !selectedPreset ? 0.4 : 1,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          CREATE IN CANVA
        </button>
      </div>

      {result && (
        <div style={{
          padding: 12, marginBottom: 16,
          border: `1px solid ${result.error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          background: result.error ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
        }}>
          {result.error ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#ef4444' }}>
                {result.error}
              </span>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Check className="w-4 h-4" style={{ color: '#22c55e' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#22c55e' }}>
                  DESIGN CREATED
                </span>
              </div>
              {result.url && (
                <a href={result.url} target="_blank" rel="noopener" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: "var(--font-sans)", fontSize: '0.7rem',
                  color: ACCENT_CYAN, textDecoration: 'underline',
                }}>
                  OPEN IN CANVA <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid rgba(56,189,248,0.12)', paddingTop: 20, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Wand2 className="w-4 h-4" style={{ color: ACCENT }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: ACCENT, letterSpacing: '.1em' }}>
            NANO BANANA — AI GENERATION
          </span>
          {(!nanoKey || !nanoUrl) && (
            <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: 'rgba(245,158,11,0.6)' }}>
              (SET KEY IN SETTINGS)
            </span>
          )}
        </div>
        <textarea
          value={nanoPrompt}
          onChange={e => setNanoPrompt(e.target.value)}
          placeholder="Describe the design you want Nano Banana to generate..."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', marginBottom: 10, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(245,158,11,0.2)', color: '#e4e4e7', outline: 'none', resize: 'none',
            fontFamily: "var(--font-sans)", fontSize: '0.8rem',
          }}
        />
        {selectedPreset && (
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(228,228,231,0.4)', marginBottom: 8 }}>
            Output size: {selectedPreset === 'custom' ? `${customW}×${customH}` : `${chosen?.w}×${chosen?.h}`}px (capped at 2048)
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={generateWithNano} disabled={generatingAi} style={{
            fontFamily: "var(--font-sans)", fontSize: '0.75rem', letterSpacing: '.08em',
            padding: '8px 16px', border: `1px solid ${ACCENT}`, background: 'rgba(245,158,11,0.08)',
            color: ACCENT, cursor: generatingAi ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {generatingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            GENERATE
          </button>
        </div>

        {aiResult && (
          <div style={{
            marginTop: 12, padding: 12,
            border: `1px solid ${aiResult.error ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            background: aiResult.error ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
          }}>
            {aiResult.error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#ef4444' }}>
                  {aiResult.error}
                </span>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: '#22c55e', marginBottom: 8 }}>
                  GENERATION COMPLETE
                </div>
                {(aiResult.url || aiResult.image_url || aiResult.output?.image_url) && (
                  <div>
                    <img
                      src={aiResult.url || aiResult.image_url || aiResult.output?.image_url}
                      alt="Generated"
                      style={{ maxWidth: '100%', maxHeight: 400, border: `1px solid rgba(245,158,11,0.2)`, marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a
                        href={aiResult.url || aiResult.image_url || aiResult.output?.image_url}
                        download
                        style={{
                          fontFamily: "var(--font-sans)", fontSize: '0.65rem',
                          padding: '4px 10px', border: `1px solid ${ACCENT_CYAN}`, color: ACCENT_CYAN,
                          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Download className="w-3 h-3" /> DOWNLOAD
                      </a>
                      {canvaKey && (
                        <button
                          onClick={() => uploadToCanva(aiResult.url || aiResult.image_url || aiResult.output?.image_url)}
                          style={{
                            fontFamily: "var(--font-sans)", fontSize: '0.65rem',
                            padding: '4px 10px', border: `1px solid ${ACCENT}`, background: 'rgba(245,158,11,0.08)',
                            color: ACCENT, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <Upload className="w-3 h-3" /> SEND TO CANVA
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!aiResult.url && !aiResult.image_url && !aiResult.output?.image_url && (
                  <pre style={{
                    fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(228,228,231,0.6)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {JSON.stringify(aiResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DesignsPanel({ canvaKey }: { canvaKey: string }) {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{ id: string; url?: string; error?: string } | null>(null);

  const loadDesigns = useCallback(async () => {
    if (!canvaKey) { setError('Set your Canva API key in Settings first'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/design-studio/canva/designs', {
        headers: { 'x-canva-key': canvaKey },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load designs');
      } else {
        setDesigns(data.items || []);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, [canvaKey]);

  const pollExport = useCallback(async (exportId: string, designId: string, attempts = 0): Promise<void> => {
    if (attempts > 20) {
      setExportResult({ id: designId, error: 'Export timed out. Try again.' });
      setExporting(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/design-studio/canva/exports/${exportId}`, {
        headers: { 'x-canva-key': canvaKey },
      });
      const data = await res.json();
      const job = data.job || data;
      if (job.status === 'completed' || job.status === 'success') {
        const dlUrl = job.urls?.[0]?.url || job.download_url;
        setExportResult({ id: designId, url: dlUrl });
        setExporting(null);
      } else if (job.status === 'failed') {
        setExportResult({ id: designId, error: 'Export failed on Canva side' });
        setExporting(null);
      } else {
        await new Promise(r => setTimeout(r, 2000));
        await pollExport(exportId, designId, attempts + 1);
      }
    } catch (err: any) {
      setExportResult({ id: designId, error: err.message });
      setExporting(null);
    }
  }, [canvaKey]);

  const exportDesign = useCallback(async (designId: string, format: string) => {
    setExporting(designId);
    setExportResult(null);
    try {
      const res = await apiFetch(`/api/design-studio/canva/designs/${designId}/export`, jsonOpts('POST', {
        canvaApiKey: canvaKey,
        format,
      }));
      const data = await res.json();
      if (!res.ok) {
        setExportResult({ id: designId, error: data.error || 'Export failed' });
        setExporting(null);
      } else {
        const job = data.job || data;
        if (job.status === 'completed' && job.urls?.[0]?.url) {
          setExportResult({ id: designId, url: job.urls[0].url });
          setExporting(null);
        } else if (job.id) {
          await pollExport(job.id, designId);
        } else {
          setExportResult({ id: designId, error: 'No export job ID returned' });
          setExporting(null);
        }
      }
    } catch (err: any) {
      setExportResult({ id: designId, error: err.message });
      setExporting(null);
    }
  }, [canvaKey, pollExport]);

  useEffect(() => {
    if (canvaKey) loadDesigns();
  }, [canvaKey]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: '0.9rem', color: ACCENT_CYAN, letterSpacing: '.1em' }}>
          YOUR CANVA DESIGNS
        </h3>
        <button onClick={loadDesigns} disabled={loading} style={{
          fontFamily: "var(--font-sans)", fontSize: '0.65rem',
          padding: '4px 10px', border: `1px solid ${ACCENT_CYAN}`, background: 'rgba(34,211,238,0.08)',
          color: ACCENT_CYAN, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> REFRESH
        </button>
      </div>

      {!canvaKey && (
        <div style={{
          padding: 20, textAlign: 'center', border: '1px solid rgba(245,158,11,0.2)',
          background: 'rgba(245,158,11,0.04)',
        }}>
          <Settings className="w-8 h-8" style={{ color: ACCENT, margin: '0 auto 8px' }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: ACCENT }}>
            CONNECT YOUR CANVA ACCOUNT IN SETTINGS
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: 10, marginBottom: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT_CYAN, margin: '0 auto' }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: MUTED_CYAN, marginTop: 8 }}>
            LOADING DESIGNS...
          </p>
        </div>
      )}

      {!loading && designs.length === 0 && canvaKey && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Image className="w-8 h-8" style={{ color: MUTED_CYAN, margin: '0 auto 8px' }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: MUTED_CYAN }}>
            NO DESIGNS FOUND
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {designs.map(d => (
          <div key={d.id} style={{
            border: '1px solid rgba(56,189,248,0.12)', background: 'rgba(255,255,255,0.02)',
            overflow: 'hidden',
          }}>
            {d.thumbnail?.url ? (
              <img src={d.thumbnail.url} alt={d.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: 160, background: 'rgba(56,189,248,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Image className="w-8 h-8" style={{ color: MUTED_CYAN }} />
              </div>
            )}
            <div style={{ padding: 10 }}>
              <p style={{
                fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: '#e4e4e7',
                marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {d.title || 'Untitled'}
              </p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {d.urls?.edit_url && (
                  <a href={d.urls.edit_url} target="_blank" rel="noopener" style={{
                    fontFamily: "var(--font-sans)", fontSize: '0.55rem',
                    padding: '2px 6px', border: `1px solid ${ACCENT_CYAN}`, color: ACCENT_CYAN,
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    <ExternalLink className="w-2.5 h-2.5" /> EDIT
                  </a>
                )}
                <button onClick={() => exportDesign(d.id, 'png')} disabled={exporting === d.id} style={{
                  fontFamily: "var(--font-sans)", fontSize: '0.55rem',
                  padding: '2px 6px', border: '1px solid rgba(56,189,248,0.3)', background: 'none',
                  color: MUTED_CYAN, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  {exporting === d.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Download className="w-2.5 h-2.5" />}
                  PNG
                </button>
                <button onClick={() => exportDesign(d.id, 'pdf')} disabled={exporting === d.id} style={{
                  fontFamily: "var(--font-sans)", fontSize: '0.55rem',
                  padding: '2px 6px', border: '1px solid rgba(56,189,248,0.3)', background: 'none',
                  color: MUTED_CYAN, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <Download className="w-2.5 h-2.5" /> PDF
                </button>
              </div>
              {exportResult?.id === d.id && (
                <div style={{ marginTop: 6 }}>
                  {exportResult.error ? (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: '#ef4444' }}>
                      {exportResult.error}
                    </span>
                  ) : exportResult.url ? (
                    <a href={exportResult.url} download style={{
                      fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: '#22c55e',
                      textDecoration: 'underline',
                    }}>
                      DOWNLOAD READY
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DesignStudio() {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<StudioTab>('create');

  const [canvaKey, setCanvaKey] = useState(() => sessionStorage.getItem('ds_canva_key') || '');
  const [nanoKey, setNanoKey] = useState(() => sessionStorage.getItem('ds_nano_key') || '');
  const [nanoUrl, setNanoUrl] = useState(() => sessionStorage.getItem('ds_nano_url') || '');

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access the Design Studio.' : 'Salaryman credentials required. DESIGN STUDIO access locked.'} />;
  }

  const tabs: { id: StudioTab; label: string; icon: typeof Layers; desc: string }[] = [
    { id: 'create', label: 'CREATE', icon: Plus, desc: 'New poster, flyer, or social graphic' },
    { id: 'designs', label: 'MY DESIGNS', icon: Grid, desc: 'Browse & export your Canva designs' },
    { id: 'nano', label: 'NANO BANANA', icon: Wand2, desc: 'AI image generation' },
    { id: 'settings', label: 'SETTINGS', icon: Settings, desc: 'API keys & configuration' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: ACCENT_CYAN }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 24, borderBottom: '1px solid rgba(34,211,238,0.15)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ marginLeft: 'auto', order: 99 }}>
              <HummingBirdAttachStrip toolKey="design-studio" buttonStyle="ghost" pickerTitle="ATTACH AUDIO" />
            </div>
            <div style={{
              width: 36, height: 36, border: '1px solid rgba(34,211,238,0.4)',
              background: 'rgba(30,41,59,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Palette className="w-5 h-5" style={{ color: ACCENT_CYAN }} />
            </div>
            <div>
              <h1 style={{
                fontFamily: "var(--font-sans)", fontSize: '1.4rem',
                letterSpacing: '0.12em', color: ACCENT_CYAN, lineHeight: 1,
              }}>
                {boomerMode ? 'DESIGN STUDIO' : 'DESIGN FORGE'}
              </h1>
              <p style={{
                fontFamily: "var(--font-sans)", fontSize: '0.6rem',
                color: 'rgba(34,211,238,0.45)', letterSpacing: '0.1em', marginTop: 4,
              }}>
                {boomerMode
                  ? 'Create posters, flyers, and social graphics with Canva + Nano Banana AI'
                  : 'CANVA × NANO BANANA — POSTER / FLYER / SOCIAL FABRICATION UNIT'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            <span style={{
              fontFamily: "var(--font-sans)", fontSize: '0.55rem',
              padding: '2px 6px', border: `1px solid ${canvaKey ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
              color: canvaKey ? '#22c55e' : ACCENT,
            }}>
              CANVA: {canvaKey ? 'LINKED' : 'NOT SET'}
            </span>
            <span style={{
              fontFamily: "var(--font-sans)", fontSize: '0.55rem',
              padding: '2px 6px', border: `1px solid ${nanoKey ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
              color: nanoKey ? '#22c55e' : ACCENT,
            }}>
              NANO: {nanoKey ? 'LINKED' : 'NOT SET'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid rgba(34,211,238,0.15)', flexWrap: 'wrap' }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                fontFamily: "var(--font-sans)", fontSize: '0.7rem', letterSpacing: '.08em',
                color: active ? ACCENT_CYAN : MUTED_CYAN,
                background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
                borderBottom: active ? `2px solid ${ACCENT_CYAN}` : '2px solid transparent',
                border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer',
              }}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'create' && <CreatePanel canvaKey={canvaKey} nanoKey={nanoKey} nanoUrl={nanoUrl} />}
            {activeTab === 'designs' && <DesignsPanel canvaKey={canvaKey} />}
            {activeTab === 'nano' && (
              <NanoBananaPanel nanoKey={nanoKey} nanoUrl={nanoUrl} canvaKey={canvaKey} />
            )}
            {activeTab === 'settings' && (
              <SettingsPanel
                canvaKey={canvaKey} setCanvaKey={setCanvaKey}
                nanoKey={nanoKey} setNanoKey={setNanoKey}
                nanoUrl={nanoUrl} setNanoUrl={setNanoUrl}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function NanoBananaPanel({ nanoKey, nanoUrl, canvaKey }: { nanoKey: string; nanoUrl: string; canvaKey: string }) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('default');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<Array<{ prompt: string; result: any; ts: number }>>([]);
  const [error, setError] = useState('');

  const generate = useCallback(async () => {
    if (!nanoKey || !nanoUrl) { setError('Set your Nano Banana API key and URL in Settings'); return; }
    if (!prompt.trim()) { setError('Enter a prompt'); return; }

    setGenerating(true);
    setError('');
    try {
      const res = await apiFetch('/api/design-studio/nano/generate', jsonOpts('POST', {
        nanoApiKey: nanoKey,
        nanoApiUrl: nanoUrl,
        prompt: prompt.trim(),
        width: Math.min(width, 2048),
        height: Math.min(height, 2048),
        style,
      }));
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
      } else {
        setHistory(prev => [{ prompt: prompt.trim(), result: data, ts: Date.now() }, ...prev]);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setGenerating(false);
  }, [nanoKey, nanoUrl, prompt, width, height, style]);

  const sendToCanva = useCallback(async (imageUrl: string, name: string) => {
    if (!canvaKey) return;
    try {
      await apiFetch('/api/design-studio/canva/assets/upload', jsonOpts('POST', {
        canvaApiKey: canvaKey,
        name,
        url: imageUrl,
      }));
    } catch {}
  }, [canvaKey]);

  const STYLES = ['default', 'photorealistic', 'illustration', 'digital-art', 'oil-painting', 'watercolor', 'pixel-art', 'neon', 'minimal', 'cinematic'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Wand2 className="w-5 h-5" style={{ color: ACCENT }} />
        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: '1rem', color: ACCENT, letterSpacing: '.1em' }}>
          NANO BANANA AI GENERATOR
        </h3>
      </div>

      {(!nanoKey || !nanoUrl) && (
        <div style={{
          padding: 16, marginBottom: 16, border: '1px solid rgba(245,158,11,0.2)',
          background: 'rgba(245,158,11,0.04)', textAlign: 'center',
        }}>
          <AlertTriangle className="w-6 h-6" style={{ color: ACCENT, margin: '0 auto 8px' }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: ACCENT }}>
            SET YOUR NANO BANANA API KEY AND URL IN SETTINGS TO START GENERATING
          </p>
        </div>
      )}

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="A retro neon poster for a jazz concert in downtown Tokyo, featuring a saxophone silhouette against a midnight cityscape..."
        rows={4}
        style={{
          width: '100%', padding: '12px', marginBottom: 10, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(245,158,11,0.2)', color: '#e4e4e7', outline: 'none', resize: 'vertical',
          fontFamily: "var(--font-sans)", fontSize: '0.8rem',
        }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div>
          <label style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: MUTED_CYAN, display: 'block', marginBottom: 2 }}>STYLE</label>
          <select value={style} onChange={e => setStyle(e.target.value)} style={{
            padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
            fontFamily: "var(--font-sans)", fontSize: '0.7rem', cursor: 'pointer',
          }}>
            {STYLES.map(s => <option key={s} value={s} style={{ background: '#111' }}>{s.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: MUTED_CYAN, display: 'block', marginBottom: 2 }}>WIDTH</label>
          <input type="number" value={width} onChange={e => setWidth(+e.target.value)} min={256} max={2048} step={64}
            style={{
              width: 80, padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
              fontFamily: "var(--font-sans)", fontSize: '0.7rem',
            }} />
        </div>
        <div>
          <label style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: MUTED_CYAN, display: 'block', marginBottom: 2 }}>HEIGHT</label>
          <input type="number" value={height} onChange={e => setHeight(+e.target.value)} min={256} max={2048} step={64}
            style={{
              width: 80, padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7', outline: 'none',
              fontFamily: "var(--font-sans)", fontSize: '0.7rem',
            }} />
        </div>
      </div>

      <button onClick={generate} disabled={generating} style={{
        fontFamily: "var(--font-sans)", fontSize: '0.8rem', letterSpacing: '.1em',
        padding: '10px 24px', border: `1px solid ${ACCENT}`, background: 'rgba(245,158,11,0.1)',
        color: ACCENT, cursor: generating ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
      }}>
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {generating ? 'GENERATING...' : 'GENERATE IMAGE'}
      </button>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h4 style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: MUTED_CYAN, letterSpacing: '.08em', marginBottom: 12 }}>
            GENERATION HISTORY ({history.length})
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {history.map((h, i) => {
              const imgUrl = h.result?.url || h.result?.image_url || h.result?.output?.image_url;
              return (
                <div key={i} style={{
                  border: '1px solid rgba(245,158,11,0.15)', background: 'rgba(255,255,255,0.02)',
                  overflow: 'hidden',
                }}>
                  {imgUrl ? (
                    <img src={imgUrl} alt={h.prompt} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: 200, background: 'rgba(245,158,11,0.03)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <pre style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: 'rgba(228,228,231,0.4)', padding: 8, overflow: 'auto', maxHeight: 180 }}>
                        {JSON.stringify(h.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div style={{ padding: 10 }}>
                    <p style={{
                      fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(228,228,231,0.6)',
                      marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    }}>
                      {h.prompt}
                    </p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {imgUrl && (
                        <>
                          <a href={imgUrl} download style={{
                            fontFamily: "var(--font-sans)", fontSize: '0.55rem',
                            padding: '2px 6px', border: `1px solid ${ACCENT_CYAN}`, color: ACCENT_CYAN,
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            <Download className="w-2.5 h-2.5" /> DL
                          </a>
                          {canvaKey && (
                            <button onClick={() => sendToCanva(imgUrl, h.prompt.slice(0, 50))} style={{
                              fontFamily: "var(--font-sans)", fontSize: '0.55rem',
                              padding: '2px 6px', border: `1px solid ${ACCENT}`, background: 'none',
                              color: ACCENT, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                              <Upload className="w-2.5 h-2.5" /> CANVA
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
