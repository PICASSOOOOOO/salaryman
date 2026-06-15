import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useBoomerMode, useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@workspace/replit-auth-web';
import { CITY_NAME } from '../gameSystems';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { playStep, playError, playMilestone } from '@/lib/ui-sound';
import { PixelOffice } from './PixelOffice';
import { useArtAsset } from '@/lib/art';
import { getSalarymanBizPath, getSalarymanName, getSalarymanEmail, isLikelyEmail, getSalarymanGender, setSalarymanGender, salarymanTerm, type SalarymanGender } from '../lib/tutorial-progress';
import {
  type Appearance,
  type Gender,
  type HairStyle,
  type FaceStyle,
  type OutfitStyle,
  type CharacterTemplate,
  defaultAppearance,
  drawPlayerSprite,
  CHARACTER_TEMPLATES,
  templateGender,
  templateFromAppearance,
  applyTemplateGarb,
  APPEARANCE_SKIN_TONES,
  APPEARANCE_HAIR_COLORS,
  APPEARANCE_OUTFIT_COLORS,
  APPEARANCE_HAIR_STYLES,
  APPEARANCE_FACE_STYLES,
  APPEARANCE_OUTFIT_STYLES,
} from '@/lib/character-identity';
import {
  getOperationalCities,
  resolveHomeCity,
  getLocalTimezone,
  type CityEntry,
} from '@/lib/world-servers';

export interface OnboardingAnswers {
  bizPath: 'business' | 'unemployed';
  businessType: 'minx' | 'real' | 'unemployed';
  companyName: string;
  industry: string;
  contactEmail: string;
  playerName: string;
  perception: number;
  combatStyle: string;
  playstyle: string;
  goal: string;
  officeTier: 'capsule' | 'studio' | 'coworking' | 'suite';
  declaredMonthlyIncome: number;
  employeeCount: number;
  employeeMonthlySalary: number;
  // FULL-path-only character details (faction allegiance + job class). The
  // QUICK path leaves these as defaults so the user lands in the city with
  // a neutral identity they can flesh out later.
  pace: 'full' | 'quick';
  faction: 'suit' | 'nomad' | 'replicant';
  gender: SalarymanGender;
  jobClass: string;
  // True iff the salary figure is awaiting org-owner attestation. Set by
  // the server when a real-business owner declares income without a
  // payroll provider; the client surfaces this as a warning badge.
  pendingOwnerVerification: boolean;
  // Character-builder paper-doll appearance, chosen on the IDENTITY page and
  // ridden into the save blob (data.appearance) by Immigration so WorldPlay,
  // the office, and the customizer all render the same avatar.
  appearance: Appearance;
  // REAL ESTATE page — chosen home city (regional/timezone server) and the
  // optional coarse-location consent. Immigration persists these and POSTs
  // the home-city to the registry (replacing the old relocation phase).
  homeCityId: string;
  locationConsent: boolean;
  coarseLocation: string | null;
}

const FACTIONS: { id: OnboardingAnswers['faction']; label: string; desc: string }[] = [
  { id: 'suit',      label: 'SUITS',      desc: 'PABLO CORP card-carriers. Discounts at Corp shops, first dibs on contracts, and a personal handheld from day one. The city runs on you.' },
  { id: 'nomad',     label: 'NOMADS',     desc: 'Wastelanders beyond the wall. Off the books, higher payouts on grey-market gigs — but Corp doesn\'t catch you when you fall, and you start with no handheld.' },
  { id: 'replicant', label: 'REPLICANTS', desc: 'Synthetic. Optimized, deniable, always one bad scan from retirement. You don\'t eat — you charge. Pass as human, or don\'t.' },
];

const JOB_CLASSES = [
  'TRADER', 'ENFORCER', 'COURIER', 'FIXER', 'NETRUNNER', 'MEDIC', 'BARKEEP', 'INVESTIGATOR', 'ARTIST', 'BUREAUCRAT',
];

const OFFICE_TIERS: { id: OnboardingAnswers['officeTier']; label: string; desc: string; price: number }[] = [
  { id: 'capsule',   label: 'DESK + CAPSULE',          desc: 'Floor-39 desk + capsule hotel pod. Cheapest legal address.', price: 5_500 },
  { id: 'studio',    label: 'STUDIO LOFT',             desc: 'Live-work studio. One room, one bed. Rent eats.',          price: 12_000 },
  { id: 'coworking', label: 'COWORKING + APARTMENT',   desc: 'Hot desk + a real 1-BR across town.',                       price: 18_000 },
  { id: 'suite',     label: 'EXEC SUITE + PENTHOUSE',  desc: 'Glass-wall office, secretary, view of the wastes.',         price: 35_000 },
];

interface PabloOnboardingProps {
  charName: string;
  charClass: string;
  onComplete: (answers: OnboardingAnswers) => void;
}

const INDUSTRIES = [
  'SOFTWARE / SAAS',
  'AGENCY / CONSULTING',
  'E-COMMERCE / RETAIL',
  'FINTECH',
  'MEDIA / CONTENT',
  'LOGISTICS / DELIVERY',
  'BAR / RESTAURANT',
  'SECURITY / ENFORCEMENT',
  'CUSTOM / OTHER',
];

// Consolidated intake: four grouped PAGES instead of a dozen single-field
// micro-steps. GREET sets the stage, IDENTITY rolls name/contact in with the
// character builder, BUSINESS holds the whole business-onboarding block, and
// REAL ESTATE folds the home-city picker (was its own Immigration phase) in
// with the office/housing tier. Then we file and confirm.
type Step = 'greet' | 'identity' | 'business' | 'estate' | 'submitting' | 'done';

// Pages that count toward the progress bar (everything the user actively
// fills in). submitting/done are terminal and excluded.
const DATA_STEPS: Step[] = ['greet', 'identity', 'business', 'estate'];

function vtFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'VT323',monospace" };
}
function stFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'Share Tech Mono',monospace" };
}

// Salaryman address term ('man'|'woman'|'neither') → paper-doll body gender
// ('m'|'f'|'nb'). drawPlayerSprite doesn't change body shape by gender, but we
// store it so downstream consumers (Mila/companion logic, future variants) read
// a coherent value.
function genderToAppearance(g: SalarymanGender): Gender {
  return g === 'woman' ? 'f' : g === 'neither' ? 'nb' : 'm';
}

/**
 * Painted establishing shot for the intake greet step. Uses the cinematic
 * Nano Banana `scene_office` asset so the onboarding matches the game's
 * painted art everywhere. While the asset is still baking (or unavailable),
 * it falls back to the pixel diorama so the step never renders empty.
 */
function PaintedIntakeOffice() {
  const url = useArtAsset('scene_office');
  if (!url) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PixelOffice scale={2} />
      </div>
    );
  }
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '16 / 9',
      border: '1px solid rgba(56,189,248,.4)',
      boxShadow: '0 0 30px rgba(56,189,248,.12)',
      overflow: 'hidden',
    }}>
      <img
        src={url}
        alt="Pablo Corp office"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* Bottom-up vignette so the cyan terminal text below reads cleanly. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(3,6,12,.12) 0%, rgba(3,6,12,.6) 100%)',
      }} />
    </div>
  );
}

// Live paper-doll preview for the character builder. Renders the SAME
// drawPlayerSprite the city/office use, scaled up and crisp (pixelated).
function CharacterPreview({ appearance, pCls, size = 116 }: { appearance: Appearance; pCls?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = Math.round(size * 1.3);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    c.width = size * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, h);
    ctx.imageSmoothingEnabled = false;
    const scale = size / 30;
    ctx.save();
    ctx.scale(scale, scale);
    drawPlayerSprite(ctx, appearance, { pCls, px: 15, py: 28 });
    ctx.restore();
  }, [appearance, pCls, size, h]);
  return (
    <canvas
      ref={ref}
      data-testid="onboarding-character-preview"
      style={{ width: size, height: h, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}

export function PabloOnboarding({ charName, charClass, onComplete }: PabloOnboardingProps) {
  const [boomerMode] = useBoomerMode();
  const { user } = useAuth();
  const VT = vtFont(boomerMode);
  const ST = stFont(boomerMode);

  // Pablo collects name + email up front in the terminal (PabloTerminal),
  // BEFORE OAuth. Those values land in localStorage via setSalarymanName /
  // setSalarymanEmail. To make the post-auth registry feel like one
  // continuous conversation (and to honor "all details should match"),
  // we prefer the terminal-collected values over what the OAuth provider
  // returned, then fall back to the OAuth profile, then to charName.
  const terminalName = useMemo(
    () => (typeof window !== 'undefined' ? (getSalarymanName() ?? '').trim() : ''),
    [],
  );
  const terminalEmail = useMemo(
    () => (typeof window !== 'undefined' ? (getSalarymanEmail() ?? '').trim().toLowerCase() : ''),
    [],
  );
  const defaultName = useMemo(() => {
    if (terminalName) return terminalName.toUpperCase();
    const first = (user?.firstName ?? '').trim();
    const last = (user?.lastName ?? '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    return (full || charName || 'SALARYMAN').toUpperCase();
  }, [terminalName, user, charName]);
  const defaultEmail = useMemo(() => {
    if (terminalEmail && isLikelyEmail(terminalEmail)) return terminalEmail;
    return (user?.email ?? '').trim().toLowerCase();
  }, [terminalEmail, user]);

  const isMobile = useIsMobile();
  const [step, setStep] = useState<Step>('greet');
  const [faction, setFaction] = useState<OnboardingAnswers['faction']>('suit');
  // Expandable "what is this?" explainer above the ALLEGIANCE choice.
  const [showFactionInfo, setShowFactionInfo] = useState(false);
  const [jobClass, setJobClass] = useState<string>('TRADER');
  const [playerName, setPlayerName] = useState(defaultName);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  // Pre-seed bizPath from the answer Pablo collected during the intro.
  const [bizPath, setBizPath] = useState<'business' | 'unemployed' | ''>(
    () => (typeof window !== 'undefined' ? getSalarymanBizPath() ?? '' : '')
  );
  const [businessType, setBusinessType] = useState<'minx' | 'real'>('minx');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('SOFTWARE / SAAS');
  const [customIndustry, setCustomIndustry] = useState('');
  // Number inputs are stored as raw strings so the field can be empty
  // (no leading "0" greeting the user) and accept any digit count without
  // a UI-level cap. Parsing/clamping happens at submit time.
  const [employeeCount, setEmployeeCount] = useState<string>('');
  const [employeeSalary, setEmployeeSalary] = useState<string>('');
  const [declaredSalary, setDeclaredSalary] = useState<string>('');
  const [gender, setGender] = useState<SalarymanGender>(
    () => (typeof window !== 'undefined' ? getSalarymanGender() ?? 'man' : 'man')
  );
  // Character creation is framed around three TEMPLATES (Replicant / Woman /
  // Man). The template drives the body gender + the faction-default garb; it is
  // NOT persisted (templateFromAppearance re-derives it on load).
  const [template, setTemplate] = useState<CharacterTemplate>(
    () => templateFromAppearance(undefined, charClass, faction),
  );
  // Once the player hand-picks an outfit style/color we stop auto-applying the
  // faction-default garb, so their choice isn't clobbered when faction changes.
  const garbTouchedRef = useRef(false);
  const [officeTier, setOfficeTier] = useState<OnboardingAnswers['officeTier']>('capsule');
  const [submitErr, setSubmitErr] = useState('');

  // Character-builder appearance. Seeded from the class default; gender mirrors
  // the salaryman address term so the two never drift apart.
  const [appearance, setAppearance] = useState<Appearance>(
    () => ({ ...defaultAppearance(charClass), gender: genderToAppearance(gender) }),
  );
  const setAppr = useCallback(
    (patch: Partial<Appearance>) => setAppearance(a => ({ ...a, ...patch })),
    [],
  );
  // Keep appearance.gender locked to the chosen salaryman term.
  useEffect(() => {
    setAppearance(a => (a.gender === genderToAppearance(gender) ? a : { ...a, gender: genderToAppearance(gender) }));
  }, [gender]);
  // Spawn each template in its faction-default garb. Re-applies whenever the
  // template or faction changes, but backs off the moment the player hand-picks
  // their own outfit so their choice is never clobbered.
  useEffect(() => {
    if (garbTouchedRef.current) return;
    setAppearance(a => applyTemplateGarb(a, template, faction));
  }, [template, faction]);

  // ── Photo → character ──────────────────────────────────────────────────────
  // Upload a selfie and let Pablo paint a real, on-brand character portrait from
  // it (image-to-image). The painted portrait becomes the headline avatar; the
  // pixel swatches are still derived so the in-world sprite resembles the player.
  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitErr, setPortraitErr] = useState('');
  // Studio-OUTAGE notice is shown CALMLY (not as a red error) because it's not
  // the user's photo — the external paint service is just out of credit/down.
  const [portraitOutage, setPortraitOutage] = useState('');

  // Downscale to a <=1024px JPEG data URL so we don't ship a 12MP frame.
  const fileToScaledDataUrl = useCallback(async (file: File): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result ?? ''));
      fr.onerror = () => reject(new Error('Could not read that file.'));
      fr.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That image looks corrupted.'));
      i.src = dataUrl;
    });
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const onGenerateFromPhoto = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setPortraitErr('Pick an image file (JPEG or PNG).'); playError(); return; }
    setPortraitErr('');
    setPortraitOutage('');
    setPortraitBusy(true);
    try {
      const photo = await fileToScaledDataUrl(file);
      const res = await apiFetch('/salaryman/character/portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, gender: genderToAppearance(gender), charClass }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The studio (external paint service) is out of credit / unavailable —
        // this isn't the user's fault. Show a calm notice nudging the manual
        // builder rather than a red "bad photo" error.
        if (res.status === 503 || body?.studioOutage) {
          setPortraitOutage(body?.error || "Pablo's portrait studio is closed for the moment. Build your look with the options below — you can repaint it later.");
          return;
        }
        throw new Error(body?.error || `Generation failed (${res.status})`);
      }
      const next: Partial<Appearance> = {};
      const a = body?.appearance as Partial<Appearance> | undefined;
      if (a && typeof a === 'object') {
        if (a.skinTone) next.skinTone = a.skinTone;
        if (a.hairColor) next.hairColor = a.hairColor;
        if (a.hairStyle) next.hairStyle = a.hairStyle;
        if (a.faceStyle) next.faceStyle = a.faceStyle;
        if (a.outfitStyle) next.outfitStyle = a.outfitStyle;
        if (a.outfitColor) next.outfitColor = a.outfitColor;
      }
      const portraitUrl = (body?.portraitUrl as string) || (a?.portraitUrl as string) || '';
      if (portraitUrl) next.portraitUrl = portraitUrl;
      // A painted portrait is a deliberate look — stop auto-applying faction garb
      // over it if the player later changes faction.
      if (next.outfitStyle || next.outfitColor) garbTouchedRef.current = true;
      setAppr(next);
      playMilestone();
    } catch (e) {
      setPortraitErr(e instanceof Error ? e.message : 'Generation failed. Try again.');
      playError();
    } finally {
      setPortraitBusy(false);
    }
  }, [fileToScaledDataUrl, gender, charClass, setAppr]);

  // REAL ESTATE — home-city picker (folded in from the old relocation phase).
  const cities = useMemo<CityEntry[]>(() => getOperationalCities(), []);
  const suggestion = useMemo(() => resolveHomeCity(getLocalTimezone()), []);
  const suggestedId = suggestion?.city.cityId ?? null;
  const [homeCityId, setHomeCityId] = useState<string>(() => suggestedId ?? cities[0]?.cityId ?? '');
  const [locationConsent, setLocationConsent] = useState(false);
  const [coarseLocation, setCoarseLocation] = useState<string | null>(null);
  const [population, setPopulation] = useState<{ cityId: string; online: number; max: number } | null>(null);
  const [originLine, setOriginLine] = useState<string>('USING DEVICE TIMEZONE');

  // Best-effort enrichment for the city picker: detect coarse origin (for the
  // optional consent) and this realm's live load. Both are non-fatal — caps
  // render from the static catalog and the timezone suggestion stands alone.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/world/locate', { credentials: 'include' });
        if (r.ok && alive) {
          const loc = await r.json() as { country: string | null; region: string | null };
          setCoarseLocation(loc.country ?? null);
          setOriginLine(loc.country ? `DETECTED ORIGIN · ${loc.country}${loc.region ? ` / ${loc.region}` : ''}` : 'ORIGIN UNKNOWN · USING DEVICE TIMEZONE');
        }
      } catch { /* dev/local IP won't resolve — fall back to timezone */ }
      try {
        const r = await fetch('/api/world/population', { credentials: 'include' });
        if (r.ok && alive) setPopulation(await r.json() as { cityId: string; online: number; max: number });
      } catch { /* non-fatal — caps still render */ }
    })();
    return () => { alive = false; };
  }, []);

  const capacityLabel = (c: CityEntry): string =>
    population && population.cityId === c.cityId ? `${population.online} / ${population.max} ONLINE` : `CAP ${c.maxPlayers}`;

  const stepIdx = Math.max(0, DATA_STEPS.indexOf(step));
  const totalSteps = DATA_STEPS.length;

  const advance = useCallback(() => {
    const idx = DATA_STEPS.indexOf(step);
    if (idx >= 0 && idx < DATA_STEPS.length - 1) { playStep(); setStep(DATA_STEPS[idx + 1]); }
  }, [step]);

  const goBack = useCallback(() => {
    if (step === 'submitting' || step === 'done') return;
    const idx = DATA_STEPS.indexOf(step);
    if (idx > 0) { playStep(); setStep(DATA_STEPS[idx - 1]); }
  }, [step]);

  // Single source of truth for the answer object so submit() and the final
  // STEP OUTSIDE button can never drift apart.
  const buildAnswers = useCallback((): OnboardingAnswers => {
    const isBusiness = bizPath === 'business';
    const finalName = (playerName || defaultName).trim().slice(0, 32).toUpperCase() || 'SALARYMAN';
    const finalEmail = (contactEmail || defaultEmail).trim().toLowerCase().slice(0, 120);
    const finalIndustry = industry === 'CUSTOM / OTHER' && customIndustry.trim()
      ? customIndustry.trim().toUpperCase().slice(0, 60)
      : industry;
    const parseNonNeg = (s: string): number => {
      const n = Math.floor(Number(s));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const safeEmployeeCount = isBusiness ? parseNonNeg(employeeCount) : 0;
    const safeEmployeeSalary = isBusiness ? parseNonNeg(employeeSalary) : 0;
    const safeDeclaredSalary = parseNonNeg(declaredSalary);
    return {
      bizPath: isBusiness ? 'business' : 'unemployed',
      businessType: isBusiness ? businessType : 'unemployed',
      companyName: isBusiness ? companyName.trim().toUpperCase().slice(0, 80) : '',
      industry: isBusiness ? finalIndustry : '',
      contactEmail: finalEmail,
      playerName: finalName,
      perception: 5,
      combatStyle: 'balanced',
      playstyle: isBusiness ? 'trader' : 'explorer',
      goal: isBusiness ? 'wealth' : 'survive',
      officeTier,
      declaredMonthlyIncome: safeDeclaredSalary,
      employeeCount: safeEmployeeCount,
      employeeMonthlySalary: safeEmployeeSalary,
      pace: 'full',
      faction,
      gender,
      jobClass,
      pendingOwnerVerification: isBusiness && businessType === 'real' && safeDeclaredSalary > 0,
      appearance: { ...appearance, gender: genderToAppearance(gender) },
      homeCityId,
      locationConsent,
      coarseLocation: locationConsent ? coarseLocation : null,
    };
  }, [bizPath, playerName, defaultName, contactEmail, defaultEmail, industry, customIndustry, businessType, companyName, officeTier, declaredSalary, employeeCount, employeeSalary, faction, gender, jobClass, appearance, homeCityId, locationConsent, coarseLocation]);

  const submit = useCallback(async () => {
    setSubmitErr('');
    setStep('submitting');
    const a = buildAnswers();
    const isBusiness = a.bizPath === 'business';
    const sizeLabel = !isBusiness
      ? null
      : a.employeeCount === 0 ? 'SOLO OPERATOR'
      : a.employeeCount <= 5 ? `SMALL TEAM (${a.employeeCount})`
      : a.employeeCount <= 25 ? `CREW (${a.employeeCount})`
      : `OPERATION (${a.employeeCount})`;
    const payload = {
      playerName: a.playerName,
      businessType: isBusiness ? a.businessType : 'unemployed',
      companyName: isBusiness ? a.companyName : null,
      industry: isBusiness ? a.industry : null,
      companySize: sizeLabel,
      contactEmail: a.contactEmail || null,
      isPaid: false,
      payrollProvider: 'NONE',
      declaredMonthlyIncome: a.declaredMonthlyIncome,
      incomeVerified: false,
      pace: 'full',
      faction: a.faction,
      jobClass: a.jobClass,
    };
    try {
      const res = await apiFetch('/api/world/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.status !== 409) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Registration failed (${res.status}).`);
      }
      // 409 = company name taken; surface it but stay on the business page.
      if (res.status === 409) {
        playError();
        setSubmitErr('That company name is already on the registry. Pick another.');
        setStep('business');
        return;
      }
    } catch (e: any) {
      playError();
      setSubmitErr(e?.message || 'Pablo Corp registry is unreachable. Try again.');
      setStep(isBusiness ? 'business' : 'estate');
      return;
    }
    playMilestone();
    setStep('done');
  }, [buildAnswers]);

  const canAdvance = (): boolean => {
    if (step === 'identity') {
      return playerName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
    }
    if (step === 'business') {
      if (bizPath === '') return false;
      if (bizPath === 'unemployed') return true;
      const companyOk = companyName.trim().length >= 2 && (industry !== 'CUSTOM / OTHER' || customIndustry.trim().length >= 2);
      if (!companyOk) return false;
      const ec = Number(employeeCount);
      const es = Number(employeeSalary);
      const ecValid = employeeCount === '' || (Number.isFinite(ec) && ec >= 0);
      if (!ecValid) return false;
      if (ec > 0 && !(Number.isFinite(es) && es > 0)) return false;
      if (declaredSalary !== '') {
        const ds = Number(declaredSalary);
        if (!(Number.isFinite(ds) && ds >= 0)) return false;
      }
      return true;
    }
    if (step === 'estate') return !!officeTier && !!homeCityId;
    return true;
  };

  // Pablo Q&A panel: lets the user ask Pablo a general question without
  // breaking out of the modal.
  const [pabloAsk, setPabloAsk] = useState('');
  const [pabloReply, setPabloReply] = useState('');
  const [pabloBusy, setPabloBusy] = useState(false);
  const askPablo = useCallback(async () => {
    const q = pabloAsk.trim();
    if (!q || pabloBusy) return;
    setPabloBusy(true);
    setPabloReply('');
    try {
      const res = await apiFetch('/api/chat/pablo/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transcript: q, history: [] }),
      });
      if (!res.ok) throw new Error(`Pablo ${res.status}`);
      const data = (await res.json()) as { say?: string };
      setPabloReply(data?.say || 'Pablo is busy. Try later.');
      setPabloAsk('');
    } catch (e: any) {
      setPabloReply(`Pablo couldn't answer: ${e?.message || 'unknown error'}`);
    } finally {
      setPabloBusy(false);
    }
  }, [pabloAsk, pabloBusy]);

  const Field = ({ label, value, onChange, placeholder, type = 'text', readOnly = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean }) => (
    <div style={{ marginTop: '.55rem' }}>
      <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>{label}</div>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '.5rem .7rem',
          background: 'rgba(0,8,8,.95)',
          border: '1px solid rgba(56,189,248,.3)',
          color: '#38bdf8',
          ...ST, fontSize: '.85rem', letterSpacing: '.06em',
          outline: 'none',
          caretColor: '#38bdf8',
        }}
      />
    </div>
  );

  // Section heading used to break the grouped pages into labelled blocks.
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.2em', marginTop: '1rem', marginBottom: '.2rem', borderTop: '1px solid rgba(56,189,248,.1)', paddingTop: '.6rem' }}>
      {children}
    </div>
  );

  // A row of selectable swatch chips for the appearance colors.
  const SwatchRow = ({ options, value, onPick, testid }: { options: { id: string; label: string; hex: string }[]; value: string; onPick: (hex: string) => void; testid: string }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.3rem' }} data-testid={testid}>
      {options.map(o => {
        const sel = value.toLowerCase() === o.hex.toLowerCase();
        return (
          <button
            key={o.id}
            type="button"
            title={o.label}
            onClick={() => { onPick(o.hex); playStep(); }}
            style={{
              width: 22, height: 22, padding: 0, cursor: 'pointer',
              background: o.hex,
              border: sel ? '2px solid #38bdf8' : '1px solid rgba(56,189,248,.25)',
              boxShadow: sel ? '0 0 8px rgba(56,189,248,.55)' : 'none',
              outline: 'none',
            }}
          />
        );
      })}
    </div>
  );

  // A row of selectable text chips for the appearance styles.
  function ChipRow<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.3rem' }}>
        {options.map(o => {
          const sel = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => { onPick(o.id); playStep(); }}
              style={{
                ...VT, fontSize: '.78rem', letterSpacing: '.06em',
                padding: '.2rem .5rem', cursor: 'pointer',
                background: sel ? 'rgba(56,189,248,.14)' : 'rgba(56,189,248,.02)',
                border: sel ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.18)',
                color: sel ? '#38bdf8' : 'rgba(56,189,248,.5)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440, padding: isMobile ? 0 : '2.8rem 1rem 2.2rem',
    }}>
      <style>{`@keyframes pulse-save { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,.2); } 50% { box-shadow: 0 0 20px rgba(56,189,248,.5); } }`}</style>
      <div style={{
        width: isMobile ? '100vw' : 480,
        maxWidth: isMobile ? '100vw' : 'min(94vw, 480px)',
        height: isMobile ? '100dvh' : undefined,
        maxHeight: isMobile ? '100dvh' : 'calc(100vh - 5rem)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,5,0,.99)',
        border: isMobile ? 'none' : '1px solid rgba(56,189,248,.5)',
        boxShadow: isMobile ? 'none' : '0 0 60px rgba(56,189,248,.06)',
      }}>
        <div style={{ padding: '.55rem .85rem', borderBottom: '1px solid rgba(56,189,248,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...VT, fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em' }}>PABLO CORP — INTAKE</div>
            <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
              {CITY_NAME} REGISTRY · STEP {stepIdx + 1}/{totalSteps}
            </div>
          </div>
          <div style={{ width: 32, height: 32, border: '1px solid rgba(56,189,248,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...VT, fontSize: '1.2rem', color: '#38bdf8' }}>P</div>
        </div>

        <div style={{ height: 3, background: 'rgba(56,189,248,.06)', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${((stepIdx + 1) / totalSteps) * 100}%`, background: 'rgba(56,189,248,.5)', transition: 'width .35s ease' }} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '.85rem .95rem' }}>
          {step === 'greet' && (
            <div>
              {/* Painted "Pablo's office" establishing shot. Sets the visual
                  stage for the intake — the salaryman is walking into Pablo's
                  office to register — in the game's cinematic painted style
                  (Nano Banana scene_office), matching the rest of SALARYMAN.
                  Falls back to the pixel diorama until the painted asset is
                  ready so the greet step never renders empty. */}
              <div style={{ marginBottom: '.7rem' }}>
                <PaintedIntakeOffice />
              </div>
              <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2, marginBottom: '.4rem' }}>
                &gt; SIGNAL ACQUIRED.<br/>
                &gt; PABLO CORP REGISTRY ONLINE.<br/>
                &gt; SUBJECT CLASS: <span style={{ color: '#38bdf8' }}>{charClass.toUpperCase()}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  Sit down. Let's make it official — fast.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', marginTop: '.55rem', lineHeight: 1.85 }}>
                  Four screens: who you are, your hustle, where you live. Then you walk
                  the city. Change anything later from your profile.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.7rem' }}>
                  {['① IDENTITY + LOOK', '② BUSINESS', '③ REAL ESTATE', '④ STEP OUTSIDE'].map(t => (
                    <span key={t} style={{ ...ST, fontSize: '.46rem', letterSpacing: '.1em', color: 'rgba(125,211,252,.6)', border: '1px solid rgba(56,189,248,.2)', padding: '.2rem .4rem' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'identity' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Who are you, on paper and on the street?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Name + contact go on every contract. The look is how the city sees you.
              </div>

              {Field({ label: 'SALARYMAN NAME', value: playerName, onChange: setPlayerName, placeholder: 'e.g. JOHN MINX' })}
              {Field({ label: 'CONTACT EMAIL', value: contactEmail, onChange: setContactEmail, placeholder: 'you@domain.com', type: 'email' })}

              <SectionLabel>PICK YOUR TEMPLATE</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem', marginTop: '.3rem' }}>
                {CHARACTER_TEMPLATES.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      // Picking a template sets the body gender (replicant reads
                      // as androgynous → 'neither') and re-applies faction garb
                      // unless the player has already hand-picked an outfit.
                      const g: SalarymanGender = opt.id === 'woman' ? 'woman' : opt.id === 'man' ? 'man' : 'neither';
                      setTemplate(opt.id);
                      setGender(g);
                      setSalarymanGender(g);
                      if (!garbTouchedRef.current) setAppearance(a => applyTemplateGarb(a, opt.id, faction));
                    }}
                    data-testid={`onboarding-template-${opt.id}`}
                    title={opt.desc}
                    style={{
                      background: template === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                      border: template === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                      padding: '.45rem .35rem', cursor: 'pointer', textAlign: 'center',
                      ...VT, fontSize: '.74rem', color: template === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.04em',
                    }}
                  >
                    {template === opt.id ? '▸ ' : ''}{opt.label}
                  </button>
                ))}
              </div>
              <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6, marginTop: '.35rem' }}>
                {CHARACTER_TEMPLATES.find(t => t.id === template)?.desc}
                {' Your faction sets the default look — and on office floors you’ll automatically suit up.'}
              </div>

              <SectionLabel>CHARACTER BUILDER</SectionLabel>

              {/* Photo → character: the headline path. Upload a selfie and let
                  Pablo paint a real, on-brand portrait. Swatches below stay as
                  optional fine-tuning + drive the in-world pixel sprite. */}
              <input
                ref={portraitInputRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onGenerateFromPhoto(f); e.currentTarget.value = ''; }}
                data-testid="onboarding-portrait-input"
              />
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '.8rem', marginTop: '.4rem', alignItems: isMobile ? 'stretch' : 'flex-start' }}>
                {/* Live preview — painted portrait when generated, else pixel doll */}
                <div style={{ flexShrink: 0, alignSelf: isMobile ? 'center' : undefined, position: 'relative', width: 132, height: 152, border: '1px solid rgba(56,189,248,.2)', background: 'radial-gradient(ellipse at 50% 40%, rgba(56,189,248,.08), rgba(0,8,12,.9))', padding: '.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {appearance.portraitUrl ? (
                    <img
                      src={resolveAvatarUrl(appearance.portraitUrl)}
                      alt="Your character"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      data-testid="onboarding-portrait-img"
                    />
                  ) : (
                    <CharacterPreview appearance={{ ...appearance, gender: genderToAppearance(gender) }} pCls={charClass} />
                  )}
                  {portraitBusy && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,8,12,.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.4rem', textAlign: 'center', padding: '.4rem' }}>
                      <div style={{ width: 22, height: 22, border: '2px solid rgba(56,189,248,.3)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(56,189,248,.7)', letterSpacing: '.1em', lineHeight: 1.5 }}>PABLO IS<br/>PAINTING YOU…</div>
                    </div>
                  )}
                </div>
                {/* Controls */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => { if (!portraitBusy) portraitInputRef.current?.click(); }}
                    disabled={portraitBusy}
                    data-testid="onboarding-generate-portrait"
                    style={{
                      width: '100%', padding: '.5rem .4rem', cursor: portraitBusy ? 'default' : 'pointer',
                      border: '1px solid rgba(56,189,248,.5)', background: 'rgba(56,189,248,.12)',
                      ...VT, fontSize: '.72rem', color: '#38bdf8', letterSpacing: '.06em', opacity: portraitBusy ? 0.5 : 1,
                    }}
                  >
                    {portraitBusy ? 'GENERATING…' : appearance.portraitUrl ? '↻ REGENERATE FROM PHOTO' : '✦ GENERATE FROM PHOTO'}
                  </button>
                  <div style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.06em', lineHeight: 1.5, marginTop: '.3rem' }}>
                    Upload a selfie — Pablo paints your character. Takes ~30s.
                  </div>
                  {portraitErr && (
                    <div style={{ ...ST, fontSize: '.44rem', color: '#f87171', letterSpacing: '.04em', lineHeight: 1.5, marginTop: '.3rem' }} data-testid="onboarding-portrait-err">{portraitErr}</div>
                  )}
                  {portraitOutage && (
                    <div
                      style={{
                        ...ST, fontSize: '.46rem', color: '#fbbf24', letterSpacing: '.04em', lineHeight: 1.55,
                        marginTop: '.4rem', padding: '.4rem .45rem', border: '1px solid rgba(251,191,36,.35)',
                        background: 'rgba(251,191,36,.07)', borderRadius: 2,
                      }}
                      data-testid="onboarding-portrait-outage"
                    >
                      {portraitOutage}
                    </div>
                  )}
                  <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.6rem' }}>SKIN</div>
                  <SwatchRow options={APPEARANCE_SKIN_TONES} value={appearance.skinTone} onPick={(hex) => setAppr({ skinTone: hex })} testid="onboarding-skin-swatches" />
                  <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.5rem' }}>HAIR COLOR</div>
                  <SwatchRow options={APPEARANCE_HAIR_COLORS} value={appearance.hairColor} onPick={(hex) => setAppr({ hairColor: hex })} testid="onboarding-hair-swatches" />
                </div>
              </div>

              <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.6rem' }}>HAIR STYLE</div>
              <ChipRow options={APPEARANCE_HAIR_STYLES} value={appearance.hairStyle} onPick={(id: HairStyle) => setAppr({ hairStyle: id })} />

              <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.6rem' }}>FACE</div>
              <ChipRow options={APPEARANCE_FACE_STYLES} value={appearance.faceStyle} onPick={(id: FaceStyle) => setAppr({ faceStyle: id })} />

              <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.6rem' }}>OUTFIT</div>
              <ChipRow options={APPEARANCE_OUTFIT_STYLES} value={appearance.outfitStyle} onPick={(id: OutfitStyle) => { garbTouchedRef.current = true; setAppr({ outfitStyle: id }); }} />

              <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginTop: '.6rem' }}>OUTFIT COLOR</div>
              <SwatchRow options={APPEARANCE_OUTFIT_COLORS} value={appearance.outfitColor} onPick={(hex) => { garbTouchedRef.current = true; setAppr({ outfitColor: hex }); }} testid="onboarding-outfit-swatches" />
            </div>
          )}

          {step === 'business' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Pick your lane, {playerName.split(' ')[0]}.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Business gets you an office, payroll, a team.
              </div>

              <button
                onClick={() => setBizPath('business')}
                data-testid="onboarding-choice-business"
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  marginTop: '.85rem',
                  background: bizPath === 'business' ? 'linear-gradient(180deg, rgba(251,191,36,.18), rgba(251,191,36,.06))' : 'linear-gradient(180deg, rgba(251,191,36,.10), rgba(56,189,248,.04))',
                  border: bizPath === 'business' ? '1.5px solid rgba(251,191,36,.85)' : '1.5px solid rgba(251,191,36,.45)',
                  padding: '.85rem 1.05rem', cursor: 'pointer',
                  boxShadow: bizPath === 'business' ? '0 0 0 3px rgba(251,191,36,.12), 0 0 24px rgba(251,191,36,.18)' : '0 0 16px rgba(251,191,36,.08)',
                  position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute', top: '-.45rem', right: '.7rem',
                  background: '#fbbf24', color: '#0a0a0a',
                  ...VT, fontSize: '.5rem', letterSpacing: '.18em',
                  padding: '.18rem .55rem',
                }}>
                  ▸ RECOMMENDED
                </div>
                <div style={{ ...VT, fontSize: '1.25rem', color: '#fbbf24', letterSpacing: '.08em', lineHeight: 1.1 }}>
                  {bizPath === 'business' ? '▸ ' : ''}OPEN A BUSINESS
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(251,191,36,.85)', marginTop: '.35rem', letterSpacing: '.08em' }}>
                  OFFICE · PAYROLL · TEAM · PHONE LINES
                </div>
              </button>

              <div style={{ marginTop: '.65rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(56,189,248,.12)' }} />
                <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.18em' }}>OR — THE HARD WAY</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(56,189,248,.12)' }} />
              </div>
              <button
                onClick={() => setBizPath('unemployed')}
                data-testid="onboarding-choice-unemployed"
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  marginTop: '.4rem',
                  background: bizPath === 'unemployed' ? 'rgba(56,189,248,.10)' : 'transparent',
                  border: bizPath === 'unemployed' ? '1px solid rgba(56,189,248,.5)' : '1px solid rgba(56,189,248,.12)',
                  padding: '.45rem .65rem', cursor: 'pointer',
                }}
              >
                <div style={{ ...VT, fontSize: '.72rem', color: bizPath === 'unemployed' ? '#38bdf8' : 'rgba(56,189,248,.42)', letterSpacing: '.08em' }}>
                  {bizPath === 'unemployed' ? '▸ ' : ''}STAY UNEMPLOYED
                </div>
                <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', marginTop: '.2rem', lineHeight: 1.55 }}>
                  No office, no payroll, no team. Register later — but lose the sign-up bonuses.
                </div>
              </button>

              {/* Business detail block — only when the business lane is picked. */}
              {bizPath === 'business' && (
                <div>
                  <SectionLabel>THE BUSINESS</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.3rem' }}>
                    {[
                      { id: 'minx' as const, label: 'FICTITIOUS', desc: 'In-game cover. Free.' },
                      { id: 'real' as const, label: 'REAL ENTERPRISE', desc: 'Tied to your IRL company. Org created.' },
                    ].map(opt => (
                      <button key={opt.id} onClick={() => setBusinessType(opt.id)} style={{
                        background: businessType === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                        border: businessType === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                        padding: '.5rem .6rem', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <div style={{ ...VT, fontSize: '.92rem', color: businessType === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>{opt.label}</div>
                        <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', marginTop: '.15rem', lineHeight: 1.5 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>

                  {Field({ label: 'COMPANY NAME', value: companyName, onChange: setCompanyName, placeholder: 'e.g. MINX HOLDINGS LLC' })}

                  <div style={{ marginTop: '.55rem' }}>
                    <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>INDUSTRY</div>
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '.5rem .7rem',
                      background: 'rgba(0,8,8,.95)',
                      border: '1px solid rgba(56,189,248,.3)',
                      color: '#38bdf8',
                      ...ST, fontSize: '.82rem', outline: 'none', cursor: 'pointer',
                    }}>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>

                  {industry === 'CUSTOM / OTHER' && Field({ label: 'DESCRIBE YOUR BUSINESS', value: customIndustry, onChange: setCustomIndustry, placeholder: 'DRONE DELIVERY, AI CONSULTING, FINTECH…' })}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                    <SectionLabel>ALLEGIANCE</SectionLabel>
                    <button
                      type="button"
                      onClick={() => setShowFactionInfo(v => !v)}
                      data-testid="onboarding-faction-info-toggle"
                      style={{
                        ...ST, fontSize: '.46rem', letterSpacing: '.08em', cursor: 'pointer',
                        background: 'transparent', border: '1px solid rgba(56,189,248,.3)',
                        color: 'rgba(56,189,248,.7)', padding: '.15rem .4rem', borderRadius: 2, whiteSpace: 'nowrap',
                      }}
                    >
                      {showFactionInfo ? '× CLOSE' : '? WHAT IS THIS'}
                    </button>
                  </div>
                  <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.03em', lineHeight: 1.55, marginTop: '.2rem' }}>
                    Your allegiance is the side of the city you answer to. It shapes how Pablo Corp treats you, where you're welcome, and how you earn — you can't switch it casually later, so pick the life you want.
                  </div>
                  {showFactionInfo && (
                    <div
                      data-testid="onboarding-faction-info"
                      style={{
                        ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.6)', letterSpacing: '.03em', lineHeight: 1.6,
                        marginTop: '.4rem', padding: '.5rem .55rem', border: '1px solid rgba(56,189,248,.2)',
                        background: 'rgba(56,189,248,.04)', borderRadius: 2,
                      }}
                    >
                      <div><span style={{ color: '#38bdf8' }}>SUITS</span> — inside the system. Corp perks, contracts, and a handheld, in exchange for playing by Pablo Corp's rules.</div>
                      <div style={{ marginTop: '.3rem' }}><span style={{ color: '#38bdf8' }}>NOMADS</span> — outside the wall. Bigger grey-market payouts and total freedom, but no Corp safety net and no handheld to start.</div>
                      <div style={{ marginTop: '.3rem' }}><span style={{ color: '#38bdf8' }}>REPLICANTS</span> — synthetic. You pass as human and run lean, but a bad scan can mean retirement. High risk, high deniability.</div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.4rem', marginTop: '.3rem' }}>
                    {FACTIONS.map(opt => (
                      <button key={opt.id} onClick={() => setFaction(opt.id)} data-testid={`onboarding-faction-${opt.id}`} style={{
                        background: faction === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                        border: faction === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                        padding: '.5rem .7rem', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <div style={{ ...VT, fontSize: '.9rem', color: faction === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
                          {faction === opt.id ? '▸ ' : ''}{opt.label}
                        </div>
                        <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.35)', marginTop: '.2rem', lineHeight: 1.5 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>

                  <SectionLabel>WHAT YOU DO FOR MONEY</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.3rem' }}>
                    {JOB_CLASSES.map(jc => (
                      <button key={jc} onClick={() => setJobClass(jc)} data-testid={`onboarding-job-${jc.toLowerCase()}`} style={{
                        background: jobClass === jc ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                        border: jobClass === jc ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                        padding: '.45rem .6rem', cursor: 'pointer', textAlign: 'center',
                        ...VT, fontSize: '.9rem', color: jobClass === jc ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em',
                      }}>
                        {jc}
                      </button>
                    ))}
                  </div>

                  <SectionLabel>HEADCOUNT &amp; PAYROLL</SectionLabel>
                  <div style={{ marginTop: '.3rem' }}>
                    <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>EMPLOYEES (besides yourself)</div>
                    <input
                      type="number" inputMode="numeric" min={0}
                      placeholder="0"
                      value={employeeCount}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        setEmployeeCount(digits === '' ? '' : String(Number(digits)));
                      }}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                        background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                        color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                        outline: 'none', caretColor: '#38bdf8',
                      }}
                    />
                  </div>
                  {Number(employeeCount) > 0 && (
                    <div style={{ marginTop: '.55rem' }}>
                      <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>AVG MONTHLY PAY PER EMPLOYEE (ƒ)</div>
                      <input
                        type="number" inputMode="numeric" min={0}
                        placeholder="0"
                        value={employeeSalary}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, '');
                          setEmployeeSalary(digits === '' ? '' : String(Number(digits)));
                        }}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                          background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                          color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                          outline: 'none', caretColor: '#38bdf8',
                        }}
                      />
                      <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(248,113,113,.55)', marginTop: '.35rem', letterSpacing: '.06em' }}>
                        PROJECTED PAYROLL: ƒ{(Number(employeeCount) * Number(employeeSalary) || 0).toLocaleString()} / MO
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Declared income — asked on BOTH paths (gig income for the
                  unemployed; take-home for owners). */}
              <SectionLabel>{bizPath === 'unemployed' ? 'GIG INCOME' : 'YOUR TAKE-HOME'}</SectionLabel>
              {bizPath === 'business' && businessType === 'real' && (
                <div data-testid="onboarding-salary-pending-notice" style={{ marginTop: '.3rem', padding: '.45rem .6rem', border: '1px solid rgba(251,191,36,.45)', background: 'rgba(251,191,36,.06)', ...ST, fontSize: '.5rem', color: '#fbbf24', letterSpacing: '.06em', lineHeight: 1.6 }}>
                  PENDING ATTESTATION — A real-business salary doesn't count toward payouts until an org owner verifies it on the registry. Connect a payroll provider (Gusto/ADP) to skip this step entirely.
                </div>
              )}
              <div style={{ marginTop: '.3rem' }}>
                <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>DECLARED MONTHLY INCOME (ƒ)</div>
                <input
                  type="number" inputMode="numeric" min={0}
                  placeholder="0"
                  value={declaredSalary}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    setDeclaredSalary(digits === '' ? '' : String(Number(digits)));
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                    background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                    color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                    outline: 'none', caretColor: '#38bdf8',
                  }}
                />
              </div>

              {submitErr && (
                <div style={{ marginTop: '.6rem', padding: '.4rem .55rem', border: '1px solid rgba(255,80,80,.4)', background: 'rgba(255,80,80,.05)', ...ST, fontSize: '.5rem', color: '#ff8a8a', letterSpacing: '.05em' }}>
                  {submitErr}
                </div>
              )}
            </div>
          )}

          {step === 'estate' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Where do you live and work?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Pick a city, then your address. Rent is monthly, due on day one.
              </div>

              <SectionLabel>HOME CITY</SectionLabel>
              <div style={{ ...ST, fontSize: '.5rem', letterSpacing: '.1em', color: 'rgba(125,211,252,.55)', marginBottom: '.35rem' }}>
                &gt; {originLine}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.45rem' }}>
                {cities.map((c) => {
                  const isSel = c.cityId === homeCityId;
                  const isSuggested = c.cityId === suggestedId;
                  return (
                    <button
                      key={c.cityId}
                      type="button"
                      onClick={() => { setHomeCityId(c.cityId); playStep(); }}
                      data-testid={`city-option-${c.cityId}`}
                      style={{
                        textAlign: 'left', padding: '.6rem .75rem',
                        border: `1px solid ${isSel ? c.accentColor : 'rgba(56,189,248,.22)'}`,
                        background: isSel ? `${c.accentColor}1a` : 'rgba(56,189,248,.03)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.6rem',
                      }}
                    >
                      <div style={{ fontSize: '1.3rem', lineHeight: 1 }}>{c.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                          <span style={{ ...VT, fontSize: '1rem', color: isSel ? '#fff' : '#7dd3fc', letterSpacing: '.1em' }}>{c.cityName}</span>
                          {isSuggested && (
                            <span style={{ ...ST, fontSize: '.4rem', letterSpacing: '.14em', color: '#04060a', background: c.accentColor, padding: '.08rem .35rem', borderRadius: 2 }}>SUGGESTED</span>
                          )}
                        </div>
                        <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(125,211,252,.45)', letterSpacing: '.08em', marginTop: '.18rem' }}>{c.region} · {c.tagline}</div>
                      </div>
                      <div style={{ ...ST, fontSize: '.48rem', letterSpacing: '.08em', whiteSpace: 'nowrap', color: isSel ? c.accentColor : 'rgba(56,189,248,.5)' }}>
                        {capacityLabel(c)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <SectionLabel>YOUR ADDRESS</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.4rem', marginTop: '.3rem' }}>
                {OFFICE_TIERS.map(opt => (
                  <button key={opt.id} onClick={() => setOfficeTier(opt.id)} data-testid={`onboarding-office-${opt.id}`} style={{
                    background: officeTier === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                    border: officeTier === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                    padding: '.55rem .7rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem' }}>
                      <div style={{ ...VT, fontSize: '.95rem', color: officeTier === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
                        {officeTier === opt.id ? '▸ ' : ''}{opt.label}
                      </div>
                      <div style={{ ...VT, fontSize: '.85rem', color: officeTier === opt.id ? '#7dd3fc' : 'rgba(56,189,248,.45)', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                        ƒ{opt.price.toLocaleString()}/MO
                      </div>
                    </div>
                    <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.35)', marginTop: '.2rem', lineHeight: 1.55 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '.55rem',
                marginTop: '.8rem', padding: '.55rem .7rem',
                border: '1px solid rgba(56,189,248,.18)', background: 'rgba(56,189,248,.02)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={locationConsent}
                  onChange={(e) => setLocationConsent(e.target.checked)}
                  data-testid="location-consent"
                  style={{ marginTop: '.15rem', accentColor: '#38bdf8' }}
                />
                <span style={{ ...ST, fontSize: '.48rem', lineHeight: 1.7, color: 'rgba(125,211,252,.6)', letterSpacing: '.06em' }}>
                  Let PABLO CORP remember my <b style={{ color: '#7dd3fc' }}>approximate (country-level)</b> location to improve
                  error reports &amp; research. Optional. Nothing finer than country is ever stored.
                </span>
              </label>
            </div>
          )}

          {step === 'submitting' && (
            <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2 }}>
              &gt; FILING WITH PABLO CORP REGISTRY...<br/>
              &gt; CROSS-CHECKING ACCOUNT PROFILE...<br/>
              &gt; ALLOCATING WORKSTATION...
            </div>
          )}

          {step === 'done' && (
            <div>
              <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2 }}>
                &gt; REGISTRY UPDATED.<br/>
                &gt; {salarymanTerm(gender, 'upper')}: <span style={{ color: '#38bdf8' }}>{playerName}</span><br/>
                &gt; STATUS: <span style={{ color: '#38bdf8' }}>{bizPath === 'business' ? `${businessType.toUpperCase()} — ${companyName.toUpperCase()}` : 'UNEMPLOYED'}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  You're on the books. Step outside.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', marginTop: '.5rem', lineHeight: 1.85 }}>
                  Hit [P] anytime to call me back. Don't go above Floor 39 unless you want to learn what I am when I'm not being polite.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inline Pablo Q&A — lets the user ask a general question without
            ditching the modal. Hidden on the submitting/done steps. */}
        {step !== 'submitting' && step !== 'done' && (
          <div style={{ padding: '.45rem .85rem', borderTop: '1px solid rgba(56,189,248,.15)', flexShrink: 0, background: 'rgba(56,189,248,.025)' }}>
            <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.14em', marginBottom: '.3rem' }}>ASK PABLO ANYTHING</div>
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <input
                type="text"
                value={pabloAsk}
                onChange={(e) => setPabloAsk(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); askPablo(); } }}
                placeholder={pabloBusy ? 'Pablo is thinking…' : 'e.g. what\'s a faction? do I need a real company?'}
                data-testid="onboarding-pablo-ask-input"
                disabled={pabloBusy}
                style={{
                  flex: 1, boxSizing: 'border-box', padding: '.35rem .55rem',
                  background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.25)',
                  color: '#38bdf8', ...ST, fontSize: '.6rem', letterSpacing: '.04em',
                  outline: 'none', caretColor: '#38bdf8',
                }}
              />
              <button
                type="button"
                onClick={askPablo}
                disabled={pabloBusy || !pabloAsk.trim()}
                data-testid="onboarding-pablo-ask-submit"
                style={{
                  ...VT, fontSize: '.85rem', letterSpacing: '.08em',
                  padding: '.25rem .65rem',
                  background: pabloBusy || !pabloAsk.trim() ? 'rgba(56,189,248,.04)' : 'rgba(56,189,248,.12)',
                  border: '1px solid rgba(56,189,248,.4)',
                  color: pabloBusy || !pabloAsk.trim() ? 'rgba(56,189,248,.3)' : '#38bdf8',
                  cursor: pabloBusy || !pabloAsk.trim() ? 'not-allowed' : 'pointer',
                }}
              >ASK ▸</button>
            </div>
            {pabloReply && (
              <div data-testid="onboarding-pablo-reply" style={{ marginTop: '.4rem', padding: '.4rem .55rem', border: '1px solid rgba(56,189,248,.2)', background: 'rgba(0,5,8,.6)', ...ST, fontSize: '.55rem', color: 'rgba(125,211,252,.85)', letterSpacing: '.04em', lineHeight: 1.6, maxHeight: 120, overflow: 'auto' }}>
                {pabloReply}
              </div>
            )}
          </div>
        )}

        <div style={{ padding: '.5rem .85rem', borderTop: '1px solid rgba(56,189,248,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          {stepIdx > 0 && step !== 'submitting' && step !== 'done' ? (
            <button onClick={goBack} data-testid="onboarding-back" style={{
              ...VT, fontSize: '.95rem', letterSpacing: '.1em',
              padding: '.35rem .85rem',
              background: 'transparent',
              border: '1px solid rgba(56,189,248,.3)',
              color: 'rgba(56,189,248,.6)', cursor: 'pointer',
            }}>
              ◂ BACK
            </button>
          ) : (
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.06em' }}>
              PABLO CORP REGISTRY · {CITY_NAME}
            </div>
          )}
          {step === 'submitting' ? (
            <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.1em' }}>FILING...</div>
          ) : step === 'done' ? (
            <button onClick={() => onComplete(buildAnswers())} data-testid="onboarding-step-outside" style={{
              ...VT, fontSize: '1.1rem', letterSpacing: '.12em',
              padding: '.4rem 1.2rem',
              background: 'rgba(56,189,248,.15)',
              border: '1px solid rgba(56,189,248,.7)',
              color: '#38bdf8', cursor: 'pointer',
              animation: 'pulse-save 1.5s ease-in-out infinite',
            }}>
              ▸ STEP OUTSIDE ◂
            </button>
          ) : step === 'estate' ? (
            <button onClick={submit} disabled={!canAdvance()} data-testid="onboarding-submit" style={{
              ...VT, fontSize: '1.05rem', letterSpacing: '.12em',
              padding: '.4rem 1.1rem',
              background: canAdvance() ? 'rgba(56,189,248,.15)' : 'rgba(56,189,248,.02)',
              border: canAdvance() ? '1px solid rgba(56,189,248,.7)' : '1px solid rgba(56,189,248,.1)',
              color: canAdvance() ? '#38bdf8' : 'rgba(56,189,248,.2)',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
            }}>
              ▸ FILE WITH PABLO ◂
            </button>
          ) : (
            <button onClick={advance} disabled={!canAdvance()} data-testid="onboarding-next" style={{
              ...VT, fontSize: '1rem', letterSpacing: '.1em',
              padding: '.35rem 1rem',
              background: canAdvance() ? 'rgba(56,189,248,.08)' : 'rgba(56,189,248,.02)',
              border: canAdvance() ? '1px solid rgba(56,189,248,.5)' : '1px solid rgba(56,189,248,.1)',
              color: canAdvance() ? '#38bdf8' : 'rgba(56,189,248,.2)',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
            }}>
              {step === 'greet' ? 'BEGIN ▸' : 'NEXT ▸'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
