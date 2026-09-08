import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image, FileText, Share2, Download, Loader2, Wand2, RefreshCw, Copy, Check,
  ChevronDown, Zap, Type, AlignLeft, Mail, Megaphone, Tag, Target, Instagram,
  Twitter, Linkedin, Layers, Palette, SlidersHorizontal, Plus, X, Video, Globe
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

const ACCENT_CYAN = '#22d3ee';
const MUTED_CYAN = 'rgba(34,211,238,0.6)';
const SUBTLE_CYAN = 'rgba(34,211,238,0.08)';

const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(228,228,231,0.9)',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  padding: '8px 12px',
  outline: 'none',
  width: '100%',
  borderRadius: '6px',
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  resize: 'none',
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: 'pointer',
  appearance: 'none' as any,
  WebkitAppearance: 'none' as any,
};

function StudioButton({ onClick, children, disabled, style, small }: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'inherit',
        fontSize: small ? '0.75rem' : '0.85rem',
        letterSpacing: '0.05em',
        color: disabled ? 'rgba(148,163,184,0.45)' : ACCENT_CYAN,
        border: `1px solid ${disabled ? 'rgba(148,163,184,0.12)' : 'rgba(34,211,238,0.35)'}`,
        background: disabled ? 'rgba(15,23,42,0.5)' : 'rgba(34,211,238,0.1)',
        padding: small ? '4px 10px' : '7px 16px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'monospace',
      fontSize: '0.65rem',
      letterSpacing: '0.1em',
      color: 'rgba(161,161,170,0.6)',
      marginBottom: '6px',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      border: '1px solid rgba(34,211,238,0.2)',
      background: 'rgba(15,23,42,0.8)',
      padding: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── GRAPHICS STUDIO ──────────────────────────────────────────────────────────

type AspectRatio = '1024x1024' | '1024x1536' | '1536x1024';

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  bold: boolean;
}

function GraphicsStudio() {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AspectRatio>('1024x1024');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [newText, setNewText] = useState('');
  const [newColor, setNewColor] = useState('#38bdf8');
  const [newSize, setNewSize] = useState(32);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeRef = useRef<HTMLDivElement>(null);

  const aspectDims: Record<AspectRatio, [number, number]> = {
    '1024x1024': [1, 1],
    '1024x1536': [2, 3],
    '1536x1024': [3, 2],
  };

  const [aw, ah] = aspectDims[aspect];
  const previewW = 480;
  const previewH = Math.round(previewW * ah / aw);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await apiFetch('/api/studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size: aspect }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Generation failed');
      }
      const data = await res.json();
      setGeneratedImage(data.image);
      setLayers([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function addLayer() {
    if (!newText.trim()) return;
    setLayers(prev => [...prev, {
      id: crypto.randomUUID(),
      text: newText,
      x: 50, y: 50,
      fontSize: newSize,
      color: newColor,
      bold: false,
    }]);
    setNewText('');
  }

  function removeLayer(id: string) {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayer === id) setSelectedLayer(null);
  }

  function onMouseDown(e: React.MouseEvent, id: string) {
    const rect = compositeRef.current!.getBoundingClientRect();
    const layer = layers.find(l => l.id === id)!;
    setDragging({ id, offX: e.clientX - rect.left - (layer.x / 100) * previewW, offY: e.clientY - rect.top - (layer.y / 100) * previewH });
    setSelectedLayer(id);
    e.stopPropagation();
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const rect = compositeRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - dragging.offX) / previewW) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - dragging.offY) / previewH) * 100));
    setLayers(prev => prev.map(l => l.id === dragging.id ? { ...l, x, y } : l));
  }

  function onMouseUp() { setDragging(null); }

  function downloadImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = Math.round(1024 * ah / aw);
    const ctx = canvas.getContext('2d')!;

    const img = new window.Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      layers.forEach(layer => {
        ctx.save();
        ctx.fillStyle = layer.color;
        ctx.font = `${layer.bold ? 'bold' : 'normal'} ${Math.round(layer.fontSize * canvas.width / previewW)}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 8;
        ctx.fillText(layer.text, (layer.x / 100) * canvas.width, (layer.y / 100) * canvas.height);
        ctx.restore();
      });
      const a = document.createElement('a');
      a.download = 'pablo-studio-graphic.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = generatedImage!;
  }

  const ASPECT_LABELS: Record<AspectRatio, string> = {
    '1024x1024': 'SQUARE (1:1)',
    '1024x1536': 'PORTRAIT (2:3)',
    '1536x1024': 'LANDSCAPE (3:2)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

      {/* Left: Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Panel>
          <SectionLabel>IMAGE PROMPT</SectionLabel>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={4}
            style={TEXTAREA_STYLE}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) generate(); }}
          />
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(56,189,248,0.3)', fontFamily: "var(--font-sans)", alignSelf: 'center', letterSpacing: '0.1em' }}>
              ASPECT RATIO:
            </span>
            {(Object.keys(ASPECT_LABELS) as AspectRatio[]).map(a => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: '0.6rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: aspect === a ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
                  border: `1px solid ${aspect === a ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.15)'}`,
                  background: aspect === a ? 'rgba(56,189,248,0.1)' : 'transparent',
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                {ASPECT_LABELS[a]}
              </button>
            ))}
          </div>
        </Panel>

        {error && (
          <Panel style={{ borderColor: 'rgba(255,50,50,0.4)', background: 'rgba(255,0,0,0.05)' }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: 'rgba(255,80,80,0.9)' }}>
              ERROR: {error}
            </span>
          </Panel>
        )}

        <StudioButton onClick={generate} disabled={generating || !prompt.trim()}>
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generating ? 'GENERATING...' : 'GENERATE IMAGE'}
        </StudioButton>

        {generatedImage && (
          <Panel>
            <SectionLabel>ADD TEXT OVERLAY</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Text to overlay..."
                style={INPUT_STYLE}
                onKeyDown={e => { if (e.key === 'Enter') addLayer(); }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <SectionLabel>COLOR</SectionLabel>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                    style={{ width: '100%', height: '28px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(56,189,248,0.25)', padding: '2px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2 }}>
                  <SectionLabel>SIZE: {newSize}px</SectionLabel>
                  <input type="range" min={12} max={120} value={newSize} onChange={e => setNewSize(Number(e.target.value))}
                    style={{ width: '100%', accentColor: ACCENT_CYAN }} />
                </div>
              </div>
              <StudioButton onClick={addLayer} disabled={!newText.trim()} small>
                <Plus className="w-3 h-3" /> ADD LAYER
              </StudioButton>
            </div>

            {layers.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <SectionLabel>TEXT LAYERS</SectionLabel>
                {layers.map(l => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '4px 8px',
                    background: selectedLayer === l.id ? 'rgba(56,189,248,0.08)' : 'transparent',
                    border: `1px solid ${selectedLayer === l.id ? 'rgba(56,189,248,0.3)' : 'transparent'}`,
                    cursor: 'pointer',
                  }} onClick={() => setSelectedLayer(l.id)}>
                    <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: l.color, letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.text}
                    </span>
                    <button onClick={e => { e.stopPropagation(); removeLayer(l.id); }} style={{ color: 'rgba(255,80,80,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <StudioButton onClick={downloadImage} small>
                <Download className="w-3 h-3" /> EXPORT PNG
              </StudioButton>
            </div>
          </Panel>
        )}
      </div>

      {/* Right: Preview */}
      <div>
        <Panel>
          <SectionLabel>CANVAS PREVIEW</SectionLabel>
          <div
            ref={compositeRef}
            style={{
              width: '100%',
              aspectRatio: `${aw} / ${ah}`,
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(56,189,248,0.15)',
              position: 'relative',
              overflow: 'hidden',
              cursor: dragging ? 'grabbing' : 'default',
              userSelect: 'none',
            }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {generating && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED_CYAN }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: MUTED_CYAN, letterSpacing: '0.08em' }}>
                  GENERATING...
                </span>
              </div>
            )}

            {generatedImage && (
              <img
                src={generatedImage}
                alt="Generated"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                draggable={false}
              />
            )}

            {!generatedImage && !generating && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0.3 }}>
                <Image className="w-10 h-10" style={{ color: ACCENT_CYAN }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: ACCENT_CYAN, letterSpacing: '0.08em' }}>
                  READY FOR A PROMPT
                </span>
              </div>
            )}

            {layers.map(layer => (
              <div
                key={layer.id}
                onMouseDown={e => onMouseDown(e, layer.id)}
                style={{
                  position: 'absolute',
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  fontSize: `${layer.fontSize}px`,
                  color: layer.color,
                  fontWeight: layer.bold ? 'bold' : 'normal',
                  cursor: 'grab',
                  userSelect: 'none',
                  fontFamily: 'sans-serif',
                  outline: selectedLayer === layer.id ? `1px dashed ${MUTED_CYAN}` : 'none',
                  outlineOffset: '4px',
                  whiteSpace: 'nowrap',
                  transform: 'translate(-50%, -50%)',
                  padding: '2px 4px',
                }}
              >
                {layer.text}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '8px', fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.25)', letterSpacing: '0.1em' }}>
            {generatedImage ? 'DRAG TEXT TO REPOSITION · EXPORT TO SAVE' : 'ENTER PROMPT AND GENERATE'}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── COPYWRITING STUDIO ───────────────────────────────────────────────────────

const COPY_TYPES = [
  { value: 'tagline', label: 'Taglines', icon: Tag },
  { value: 'email', label: 'Email Campaign', icon: Mail },
  { value: 'blog', label: 'Blog Intro', icon: AlignLeft },
  { value: 'ad', label: 'Ad Copy', icon: Megaphone },
  { value: 'pitch', label: 'Elevator Pitch', icon: Target },
];

const TONES = ['professional', 'casual', 'bold', 'friendly', 'technical', 'luxury', 'playful', 'urgent'];

function CopyStudio() {
  const [type, setType] = useState('tagline');
  const [tone, setTone] = useState('professional');
  const [context, setContext] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setOutput('');
    try {
      const res = await apiFetch('/api/studio/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, tone, context }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Generation failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) throw new Error(d.error);
            if (d.content) setOutput(prev => prev + d.content);
          } catch (sseErr) {
            if (sseErr instanceof SyntaxError) continue;
            throw sseErr;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate content';
      setOutput(`ERROR: ${msg}. Please try again.`);
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadText() {
    const blob = new Blob([output], { type: 'text/plain' });
    const a = document.createElement('a');
    a.download = `pablo-copy-${type}.txt`;
    a.href = URL.createObjectURL(blob);
    a.click();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Panel>
          <SectionLabel>CONTENT TYPE</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
            {COPY_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontFamily: "var(--font-sans)",
                  fontSize: '0.65rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: type === t.value ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
                  border: `1px solid ${type === t.value ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.15)'}`,
                  background: type === t.value ? 'rgba(56,189,248,0.1)' : 'transparent',
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                <t.icon className="w-3 h-3" />
                {t.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionLabel>TONE</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
            {TONES.map(t => (
              <button
                key={t}
                onClick={() => setTone(t)}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: '0.6rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: tone === t ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
                  border: `1px solid ${tone === t ? 'rgba(56,189,248,0.45)' : 'rgba(56,189,248,0.1)'}`,
                  background: tone === t ? 'rgba(56,189,248,0.08)' : 'transparent',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionLabel>ADDITIONAL CONTEXT (OPTIONAL)</SectionLabel>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Add campaign goal, topic, target audience, or any extra context..."
            rows={3}
            style={TEXTAREA_STYLE}
          />
        </Panel>

        <StudioButton onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generating ? 'GENERATING...' : 'GENERATE COPY'}
        </StudioButton>
      </div>

      <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <SectionLabel>OUTPUT</SectionLabel>
          {output && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <StudioButton onClick={copyToClipboard} small>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'COPIED' : 'COPY'}
              </StudioButton>
              <StudioButton onClick={downloadText} small>
                <Download className="w-3 h-3" /> SAVE
              </StudioButton>
            </div>
          )}
        </div>
        <div style={{
          flex: 1,
          fontFamily: "var(--font-sans)",
          fontSize: '0.78rem',
          lineHeight: 1.65,
          color: output ? 'rgba(56,189,248,0.85)' : 'rgba(56,189,248,0.2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowY: 'auto' as const,
          letterSpacing: '0.02em',
          minHeight: '200px',
        }}>
          {output || (generating ? '' : 'PABLO AWAITING ORDERS...\n\nSelect a content type, set your tone,\nadd context, and hit GENERATE.')}
          {generating && !output && (
            <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: MUTED_CYAN }} />
              <span style={{ color: MUTED_CYAN }}>GENERATING COPY...</span>
            </span>
          )}
          {generating && output && <span style={{ color: MUTED_CYAN }}>…</span>}
        </div>
      </Panel>
    </div>
  );
}

// ── SOCIAL MEDIA STUDIO ───────────────────────────────────────────────────────

type SocialTemplate = 'instagram_square' | 'twitter_card' | 'linkedin_banner' | 'tiktok_vertical' | 'facebook_feed';

interface SocialResult {
  caption?: string;
  tweet?: string;
  post?: string;
  hook?: string;
  description?: string;
  hashtags?: string[];
  cta?: string;
  image_prompt?: string;
  alt_text?: string;
  raw?: string;
}

const SOCIAL_TEMPLATES = [
  { value: 'instagram_square' as SocialTemplate, label: 'Instagram Square', icon: Instagram, aspect: '1:1' },
  { value: 'twitter_card' as SocialTemplate, label: 'Twitter / X Card', icon: Twitter, aspect: '2:1' },
  { value: 'linkedin_banner' as SocialTemplate, label: 'LinkedIn Post', icon: Linkedin, aspect: '1.91:1' },
  { value: 'tiktok_vertical' as SocialTemplate, label: 'TikTok', icon: Video, aspect: '9:16' },
  { value: 'facebook_feed' as SocialTemplate, label: 'Facebook Post', icon: Globe, aspect: '1.91:1' },
];

function SocialStudio() {
  const [template, setTemplate] = useState<SocialTemplate>('instagram_square');
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<SocialResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setResult(null);
    setGeneratedImage(null);
    try {
      const res = await apiFetch('/api/studio/generate-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, topic }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Generation failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setResult({ raw: `ERROR: ${msg}. Please try again.` });
    } finally {
      setGenerating(false);
    }
  }

  async function generateImageFromPrompt() {
    if (!result?.image_prompt) return;
    setGeneratingImage(true);
    try {
      const sizeMap: Record<SocialTemplate, string> = {
        instagram_square: '1024x1024',
        twitter_card: '1536x1024',
        linkedin_banner: '1536x1024',
        tiktok_vertical: '1024x1536',
        facebook_feed: '1536x1024',
      };
      const res = await apiFetch('/api/studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: result.image_prompt, size: sizeMap[template] }),
      });
      if (!res.ok) throw new Error('Image generation failed');
      const data = await res.json();
      setGeneratedImage(data.image);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingImage(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function downloadImage() {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.download = `pablo-social-${template}.png`;
    a.href = generatedImage;
    a.click();
  }

  const mainText = result?.caption ?? result?.tweet ?? result?.post ?? result?.description ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Template selector */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
        {SOCIAL_TEMPLATES.map(t => (
          <button
            key={t.value}
            onClick={() => { setTemplate(t.value); setResult(null); setGeneratedImage(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              fontFamily: "var(--font-sans)",
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: template === t.value ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
              border: `1px solid ${template === t.value ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.15)'}`,
              background: template === t.value ? 'rgba(56,189,248,0.1)' : 'rgba(0,0,0,0.3)',
              padding: '8px 16px',
              cursor: 'pointer',
              flex: '1 1 auto',
              justifyContent: 'center',
            }}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            <span style={{ fontSize: '0.55rem', color: 'rgba(56,189,248,0.3)', letterSpacing: '0.1em' }}>[{t.aspect}]</span>
          </button>
        ))}
      </div>

      {/* Topic input + generate */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Post topic or campaign goal (optional)..."
          style={{ ...INPUT_STYLE, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') generate(); }}
        />
        <StudioButton onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generating ? 'BUILDING...' : 'BUILD POST'}
        </StudioButton>
      </div>

      {/* Results */}
      {result && !result.raw && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Left: Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {result.hook && (
              <Panel>
                <SectionLabel>HOOK</SectionLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.8rem', color: 'rgba(56,189,248,0.9)', lineHeight: 1.5, flex: 1, fontWeight: 'bold' }}>
                    {result.hook}
                  </p>
                  <StudioButton onClick={() => copyText(result.hook!, 'hook')} small>
                    {copied === 'hook' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </StudioButton>
                </div>
              </Panel>
            )}

            {mainText && (
              <Panel>
                <SectionLabel>{result.caption ? 'CAPTION' : result.tweet ? 'TWEET' : result.description ? 'DESCRIPTION' : 'POST'}</SectionLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: 'rgba(56,189,248,0.85)', lineHeight: 1.6, flex: 1, whiteSpace: 'pre-wrap' }}>
                    {mainText}
                  </p>
                  <StudioButton onClick={() => copyText(mainText, 'main')} small>
                    {copied === 'main' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </StudioButton>
                </div>
              </Panel>
            )}

            {result.cta && (
              <Panel>
                <SectionLabel>CALL TO ACTION</SectionLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.8rem', color: 'rgba(56,189,248,0.9)', fontWeight: 'bold' }}>
                    {result.cta}
                  </p>
                  <StudioButton onClick={() => copyText(result.cta!, 'cta')} small>
                    {copied === 'cta' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </StudioButton>
                </div>
              </Panel>
            )}

            {result.hashtags && result.hashtags.length > 0 && (
              <Panel>
                <SectionLabel>HASHTAGS</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', marginBottom: '8px' }}>
                  {result.hashtags.map((h, i) => (
                    <span key={i} style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: '0.65rem',
                      color: 'rgba(56,189,248,0.7)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(56,189,248,0.2)',
                      padding: '2px 8px',
                      letterSpacing: '0.05em',
                    }}>
                      #{h}
                    </span>
                  ))}
                </div>
                <StudioButton onClick={() => copyText(result.hashtags!.map(h => `#${h}`).join(' '), 'hashtags')} small>
                  {copied === 'hashtags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  COPY ALL HASHTAGS
                </StudioButton>
              </Panel>
            )}
          </div>

          {/* Right: Image */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {result.image_prompt && (
              <Panel>
                <SectionLabel>IMAGE PROMPT (AI SUGGESTED)</SectionLabel>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)', lineHeight: 1.5, marginBottom: '10px' }}>
                  {result.image_prompt}
                </p>
                <StudioButton onClick={generateImageFromPrompt} disabled={generatingImage}>
                  {generatingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />}
                  {generatingImage ? 'GENERATING...' : 'GENERATE IMAGE'}
                </StudioButton>
              </Panel>
            )}

            {generatedImage && (
              <Panel>
                <SectionLabel>GENERATED VISUAL</SectionLabel>
                <img src={generatedImage} alt="Social media visual" style={{ width: '100%', border: '1px solid rgba(56,189,248,0.15)' }} />
                <div style={{ marginTop: '10px' }}>
                  <StudioButton onClick={downloadImage} small>
                    <Download className="w-3 h-3" /> DOWNLOAD IMAGE
                  </StudioButton>
                </div>
              </Panel>
            )}

            {!result.image_prompt && !generatedImage && (
              <Panel>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px', opacity: 0.3 }}>
                  <Image className="w-8 h-8" style={{ color: ACCENT_CYAN }} />
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: ACCENT_CYAN, letterSpacing: '0.08em', textAlign: 'center' }}>
                    IMAGE PROMPT WILL APPEAR HERE
                  </span>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {result?.raw && (
        <Panel style={{ borderColor: 'rgba(255,50,50,0.3)', background: 'rgba(255,0,0,0.04)' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: 'rgba(255,80,80,0.8)' }}>
            {result.raw}
          </span>
        </Panel>
      )}

      {!result && !generating && (
        <Panel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px', opacity: 0.25 }}>
            <Share2 className="w-10 h-10" style={{ color: ACCENT_CYAN }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: ACCENT_CYAN, letterSpacing: '0.08em', textAlign: 'center', lineHeight: 2 }}>
              SELECT A TEMPLATE<br />ADD YOUR TOPIC<br />BUILD THE POST
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

type StudioTab = 'graphics' | 'copy' | 'social';

const TABS: { id: StudioTab; label: string; boomerLabel: string; icon: React.FC<any>; desc: string }[] = [
  { id: 'graphics', label: 'GRAPHICS', boomerLabel: 'IMAGES', icon: Image, desc: 'AI image generation + canvas editor' },
  { id: 'copy', label: 'COPY', boomerLabel: 'COPYWRITING', icon: FileText, desc: 'Marketing copy, emails, ads & pitches' },
  { id: 'social', label: 'SOCIAL', boomerLabel: 'SOCIAL MEDIA', icon: Share2, desc: 'Instagram, Twitter, LinkedIn, TikTok & Facebook templates' },
];

export default function ContentStudio({ embedded, initialTab }: { embedded?: boolean; initialTab?: StudioTab } = {}) {
  const { isAuthenticated } = useAuth();
  usePlan();
  const [tab, setTab] = useState<StudioTab>(initialTab ?? 'graphics');
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  if (!isAuthenticated && !embedded) {
    return <SignInPage context={boomerMode ? 'Sign in to access the content studio.' : 'Salaryman credentials required. CONTENT STUDIO access locked.'} />;
  }

  const innerContent = (
    <>
      {!embedded && (
        <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(56,189,248,0.15)', paddingBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{
              width: '36px', height: '36px',
              border: '1px solid rgba(56,189,248,0.5)',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Layers className="w-5 h-5" style={{ color: ACCENT_CYAN }} />
            </div>
            <div>
              <h1 style={{
                fontFamily: "var(--font-sans)",
                fontSize: '1.4rem',
                letterSpacing: '0.12em',
                color: ACCENT_CYAN,
                lineHeight: 1,
              }}>
                {boomerMode ? 'CONTENT STUDIO' : PABLO_PRODUCTS.STUDIO.name}
              </h1>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.35)', letterSpacing: '0.1em', marginTop: '4px' }}>
                {boomerMode ? 'AI-powered graphics, copy & social media' : PABLO_PRODUCTS.STUDIO.desc}
              </p>
            </div>
          </div>
          </div>
          <HummingBirdAttachStrip toolKey="content-studio" buttonStyle="ghost" pickerTitle="ATTACH AUDIO" />
        </div>
      )}

      {!initialTab && (
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid rgba(56,189,248,0.15)', paddingBottom: '0' }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: "var(--font-sans)",
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: active ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
                  background: active ? SUBTLE_CYAN : 'transparent',
                  border: `1px solid ${active ? 'rgba(34,211,238,0.4)' : 'transparent'}`,
                  borderBottom: active ? '1px solid #0f172a' : '1px solid transparent',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  marginBottom: active ? '-1px' : '0',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(56,189,248,0.7)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(56,189,248,0.35)'; }}
              >
                <t.icon className="w-3.5 h-3.5" />
                {boomerMode ? t.boomerLabel : t.label}
              </button>
            );
          })}
        </div>
      )}

      {!initialTab && (
        <div style={{ marginBottom: '16px', fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(56,189,248,0.3)', letterSpacing: '0.1em' }}>
          {TABS.find(t => t.id === tab)?.desc.toUpperCase()}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.12 }}
        >
          {tab === 'graphics' && <GraphicsStudio />}
          {tab === 'copy' && <CopyStudio />}
          {tab === 'social' && <SocialStudio />}
        </motion.div>
      </AnimatePresence>

      {!embedded && (
        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(56,189,248,0.08)', textAlign: 'center' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: 'rgba(56,189,248,0.2)', letterSpacing: '0.12em' }}>
            PABLO USES YOUR BRAND KIT FROM DASHBOARD · CONTENT IS AI-GENERATED · REVIEW BEFORE PUBLISHING
          </span>
        </div>
      )}
    </>
  );

  if (embedded) return innerContent;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: ACCENT_CYAN }}>
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {innerContent}
      </main>
    </div>
  );
}
