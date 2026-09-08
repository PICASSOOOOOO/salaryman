import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Palette, Save, Loader2, Check, Upload, Globe, Target, Type, Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

interface BrandKitData {
  companyName: string;
  tagline: string;
  mission: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  website: string;
  industry: string;
  targetAudience: string;
  fontPrimary: string;
  fontSecondary: string;
  toneOfVoice: string;
}

const DEFAULT_KIT: BrandKitData = {
  companyName: '',
  tagline: '',
  mission: '',
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  logoUrl: '',
  website: '',
  industry: '',
  targetAudience: '',
  fontPrimary: '',
  fontSecondary: '',
  toneOfVoice: '',
};

function CrtInput({ label, value, onChange, type = 'text', placeholder = '', textarea = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; textarea?: boolean;
}) {
  const baseClass = "bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors w-full";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className={`${baseClass} resize-none`} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={baseClass} />
      )}
    </div>
  );
}

export default function BrandKit() {
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [kit, setKit] = useState<BrandKitData>({ ...DEFAULT_KIT });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadKit = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await apiFetch('/api/workspace/brand-kit');
      if (res.ok) {
        const data = await res.json();
        setKit({ ...DEFAULT_KIT, ...data });
      }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadKit(); }, [loadKit]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage your brand kit.' : 'Salaryman credentials required. BRAND VAULT access locked.'} />;
  }

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/workspace/brand-kit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {}
    setSaving(false);
  };

  const set = (k: keyof BrandKitData) => (v: string) => setKit(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                <Palette className="w-5 h-5 text-pink-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Brand Kit' : 'BRAND-CORE'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Store your brand colors, fonts, and tone of voice in one place.' : 'Brand identity matrix. Colors, fonts, tone-of-voice, and mission stored in one tactical reference card.'}
            </p>
          </div>
          {isAuthenticated && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                saved
                  ? 'bg-sky-500/20 border border-sky-500/30 text-sky-300'
                  : 'bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30'
              } disabled:opacity-60`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Kit'}
            </button>
          )}
        </div>

        {!isAuthenticated && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <Palette className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">Sign in to manage your brand kit</p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && isAuthenticated && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-5">
              {/* Identity */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">Identity</h3>
                </div>
                <div className="space-y-3">
                  <CrtInput label="Company Name" value={kit.companyName} onChange={set('companyName')} placeholder="Acme Corp" />
                  <CrtInput label="Tagline" value={kit.tagline} onChange={set('tagline')} placeholder="Move fast, build things" />
                  <CrtInput label="Industry" value={kit.industry} onChange={set('industry')} placeholder="SaaS / E-commerce / Consulting" />
                  <CrtInput label="Website" value={kit.website} onChange={set('website')} placeholder="https://yoursite.com" />
                  <CrtInput label="Mission" value={kit.mission} onChange={set('mission')} placeholder="What is your company's mission?" textarea />
                  <CrtInput label="Target Audience" value={kit.targetAudience} onChange={set('targetAudience')} placeholder="Who is your ideal customer?" textarea />
                </div>
              </div>

              {/* Tone of Voice */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">Tone of Voice</h3>
                </div>
                <CrtInput
                  label="Tone & Voice Notes"
                  value={kit.toneOfVoice}
                  onChange={set('toneOfVoice')}
                  placeholder="e.g. Professional but approachable. Direct and data-driven. Never uses jargon. Uses first-person plural (we/us)."
                  textarea
                />
              </div>

              {/* Colors */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="w-4 h-4 text-pink-400" />
                  <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">Colors</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={kit.primaryColor} onChange={e => set('primaryColor')(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent" />
                      <input type="text" value={kit.primaryColor} onChange={e => set('primaryColor')(e.target.value)}
                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Secondary Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={kit.secondaryColor} onChange={e => set('secondaryColor')(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent" />
                      <input type="text" value={kit.secondaryColor} onChange={e => set('secondaryColor')(e.target.value)}
                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Fonts */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Type className="w-4 h-4 text-blue-400" />
                  <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">Typography</h3>
                </div>
                <div className="space-y-3">
                  <CrtInput label="Primary Font" value={kit.fontPrimary} onChange={set('fontPrimary')} placeholder="e.g. Inter, Helvetica Neue" />
                  <CrtInput label="Secondary Font" value={kit.fontSecondary} onChange={set('fontSecondary')} placeholder="e.g. Georgia, Playfair Display" />
                </div>
              </div>

              {/* Logo URL */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="w-4 h-4 text-violet-400" />
                  <h3 className="font-semibold text-sm text-foreground uppercase tracking-wider">Logo</h3>
                </div>
                <CrtInput label="Logo URL" value={kit.logoUrl} onChange={set('logoUrl')} placeholder="https://... (paste a link to your logo)" />
                {kit.logoUrl && (
                  <div className="mt-3 p-3 bg-muted/20 rounded-lg border border-border flex items-center justify-center">
                    <img src={kit.logoUrl} alt="Logo preview" className="max-h-16 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Preview card */}
            <div className="sticky top-6">
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
                <div
                  className="h-24 flex items-center justify-center p-6"
                  style={{ background: `linear-gradient(135deg, ${kit.primaryColor}20, ${kit.secondaryColor}20)`, borderBottom: `2px solid ${kit.primaryColor}40` }}
                >
                  {kit.logoUrl ? (
                    <img src={kit.logoUrl} alt={kit.companyName} className="max-h-16 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: kit.primaryColor }}>
                        <span className="text-white font-bold text-lg">{kit.companyName?.[0]?.toUpperCase() ?? '?'}</span>
                      </div>
                      <span className="font-bold text-foreground text-lg">{kit.companyName || 'Your Brand'}</span>
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-4">
                  {kit.tagline && (
                    <p className="text-sm italic text-muted-foreground border-l-2 pl-3" style={{ borderColor: kit.primaryColor }}>
                      "{kit.tagline}"
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Industry', value: kit.industry },
                      { label: 'Website', value: kit.website },
                      { label: 'Primary Font', value: kit.fontPrimary },
                      { label: 'Secondary Font', value: kit.fontSecondary },
                    ].filter(i => i.value).map(item => (
                      <div key={item.label}>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                        <p className="text-xs text-foreground truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Color swatches */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Color Palette</p>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg border border-white/10" style={{ background: kit.primaryColor }} />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Primary</p>
                          <p className="text-xs font-mono text-foreground">{kit.primaryColor}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <div className="w-8 h-8 rounded-lg border border-white/10" style={{ background: kit.secondaryColor }} />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Secondary</p>
                          <p className="text-xs font-mono text-foreground">{kit.secondaryColor}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {kit.mission && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Mission</p>
                      <p className="text-xs text-foreground leading-relaxed">{kit.mission}</p>
                    </div>
                  )}

                  {kit.toneOfVoice && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Tone of Voice</p>
                      <p className="text-xs text-foreground leading-relaxed">{kit.toneOfVoice}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
