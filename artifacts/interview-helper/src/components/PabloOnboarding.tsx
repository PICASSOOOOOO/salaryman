import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useBoomerMode, useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { useAudioSettings } from '@/hooks/use-audio-settings';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { playStep, playError, playMilestone } from '@/lib/ui-sound';
import { PixelOffice } from './PixelOffice';
import { useArtAsset } from '@/lib/art';
import propCapsuleImg from '@/assets/pledge/prop_warehouse.png';
import propStudioImg from '@/assets/pledge/prop_studio_loft.png';
import propCoworkingImg from '@/assets/pledge/prop_corner_office.png';
import propSuiteImg from '@/assets/pledge/prop_penthouse.png';
import { PropertyCard } from './PropertyCard';
import { EconomyKey } from './EconomyKey';
import {
  ONBOARDING_STARTING_FIAT, computeOnboardingDebt,
  getFactionOnboardingTiers, FACTION_DISTRICTS,
} from '@/lib/property-catalog';
import { getSalarymanBizPath, getSalarymanName, getSalarymanEmail, isLikelyEmail, getSalarymanGender, setSalarymanGender, salarymanTerm, type SalarymanGender } from '../lib/tutorial-progress';
import {
  type Appearance,
  type Gender,
  type CharacterTemplate,
  defaultAppearance,
  drawPlayerSprite,
  CHARACTER_TEMPLATES,
  templateGender,
  templateFromAppearance,
  applyTemplateGarb,
  applyCharacterTemplate,
} from '@/lib/character-identity';
import {
  getOperationalCities,
  getCityById,
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

export function normalizeOnboardingCompanyName(value: string): string {
  return value.trim().toUpperCase().slice(0, 80);
}

export function hasOnboardingCompanyName(
  bizPath: OnboardingAnswers["bizPath"] | "",
  companyName: string,
): boolean {
  return bizPath === "unemployed"
    || (bizPath === "business" && companyName.trim().length >= 2);
}

export function shouldFileOnboardingRegistry(
  bizPath: OnboardingAnswers["bizPath"] | "",
): boolean {
  return bizPath === "business";
}

const FACTIONS: { id: OnboardingAnswers['faction']; label: string; desc: string }[] = [
  { id: 'suit',      label: 'SUITS',      desc: 'Company jobs and city benefits.' },
  { id: 'nomad',     label: 'NOMADS',     desc: 'Independent work and flexible routes.' },
  { id: 'replicant', label: 'REPLICANTS', desc: 'Specialized work with higher risk.' },
];

const JOB_CLASSES = [
  'TRADER', 'ENFORCER', 'COURIER', 'FIXER', 'NETRUNNER', 'MEDIC', 'BARKEEP', 'INVESTIGATOR', 'ARTIST', 'BUREAUCRAT',
];

type JobClassMeta = { label: string; faction: 'suit' | 'nomad' | 'replicant'; skillBonus: string };

const REAL_WORLD_INDUSTRIES: Record<string, JobClassMeta> = {
  'CONSTRUCTION & TRADES':    { label: 'CONSTRUCTION & TRADES',    faction: 'nomad',     skillBonus: 'stamina_boost' },
  'FINANCE & ACCOUNTING':     { label: 'FINANCE & ACCOUNTING',     faction: 'suit',      skillBonus: 'credit_edge' },
  'HEALTHCARE & MEDICINE':    { label: 'HEALTHCARE & MEDICINE',    faction: 'nomad',     skillBonus: 'recovery_boost' },
  'LAW & LEGAL SERVICES':     { label: 'LAW & LEGAL SERVICES',     faction: 'suit',      skillBonus: 'negotiation_edge' },
  'MILITARY & DEFENSE':       { label: 'MILITARY & DEFENSE',       faction: 'nomad',     skillBonus: 'combat_training' },
  'IT & TECHNOLOGY':          { label: 'IT & TECHNOLOGY',          faction: 'replicant', skillBonus: 'hack_affinity' },
  'CREATIVE & DESIGN':        { label: 'CREATIVE & DESIGN',        faction: 'replicant', skillBonus: 'persuasion_edge' },
  'LOGISTICS & SUPPLY CHAIN': { label: 'LOGISTICS & SUPPLY CHAIN', faction: 'nomad',     skillBonus: 'route_memory' },
  'EDUCATION & TRAINING':     { label: 'EDUCATION & TRAINING',     faction: 'suit',      skillBonus: 'rep_boost' },
  'SALES & MARKETING':        { label: 'SALES & MARKETING',        faction: 'suit',      skillBonus: 'deal_sense' },
  'REAL ESTATE':              { label: 'REAL ESTATE',              faction: 'suit',      skillBonus: 'property_eye' },
  'FOOD & HOSPITALITY':       { label: 'FOOD & HOSPITALITY',       faction: 'nomad',     skillBonus: 'social_warmth' },
  'MANUFACTURING':            { label: 'MANUFACTURING',            faction: 'nomad',     skillBonus: 'craft_precision' },
  'ENERGY & UTILITIES':       { label: 'ENERGY & UTILITIES',       faction: 'nomad',     skillBonus: 'grid_sense' },
  'MEDIA & ENTERTAINMENT':    { label: 'MEDIA & ENTERTAINMENT',    faction: 'replicant', skillBonus: 'signal_boost' },
  'BIOTECH & PHARMA':         { label: 'BIOTECH & PHARMA',         faction: 'replicant', skillBonus: 'augment_affinity' },
  'TRANSPORTATION & AUTO':    { label: 'TRANSPORTATION & AUTO',    faction: 'nomad',     skillBonus: 'mobility_bonus' },
  'GOVERNMENT & CIVIL':       { label: 'GOVERNMENT & CIVIL',       faction: 'suit',      skillBonus: 'clearance_edge' },
  'AGRICULTURE & FOOD SCI':   { label: 'AGRICULTURE & FOOD SCI',   faction: 'nomad',     skillBonus: 'survival_boost' },
  'INSURANCE & RISK':         { label: 'INSURANCE & RISK',         faction: 'suit',      skillBonus: 'risk_sense' },
};

// Fallback used only before the server quote resolves. The real value comes
// from /api/onboard-housing/quote (startingBalance), which sources it from
// STARTER_CHECKING_BALANCE in bank.ts — the single place to change when the
// economy tunes down the opening balance. Do NOT edit this number directly.
// Also exported as ONBOARDING_STARTING_FIAT from property-catalog so the
// post-onboarding housing panel can reference the same number.
const ONBOARDING_STARTING_FIAT_FALLBACK = 200_000;

// The onboarding housing tiers (labels/taglines/descs) are themed per faction
// in property-catalog (getFactionOnboardingTiers). Cover art is keyed by tier id
// here — the art is shared across factions (same artKeys), only the copy changes.
const TIER_IMG: Record<OnboardingAnswers['officeTier'], string> = {
  capsule: propCapsuleImg,
  studio: propStudioImg,
  coworking: propCoworkingImg,
  suite: propSuiteImg,
};

interface PabloOnboardingProps {
  charName: string;
  charClass: string;
  venue?: 'registry' | 'lobby';
  onComplete: (answers: OnboardingAnswers) => void;
}

export function getInitialOnboardingBizPath(
  venue: PabloOnboardingProps['venue'],
  savedPath: 'business' | 'unemployed' | null | undefined,
): 'business' | 'unemployed' | '' {
  return venue === 'lobby' ? 'business' : (savedPath ?? '');
}

export const LOBBY_ONBOARDING_COPY = {
  heading: 'Choose a start.',
  helper: 'One choice. Change it later.',
  business: 'BUILD A BUSINESS',
  unemployed: 'FIND WORK',
  companyLabel: 'COMPANY NAME',
} as const;

const INDUSTRIES = [
  'SOFTWARE / SAAS',
  'AGENCY / CONSULTING',
  'E-COMMERCE / RETAIL',
  'FINTECH',
  'MEDIA / CONTENT',
  'LOGISTICS / DELIVERY',
  'BAR / RESTAURANT',
  'SECURITY / ENFORCEMENT',
  'EDUCATION / SCHOOL',
  'CUSTOM / OTHER',
];

// Consolidated intake, server-browser first: DESTINATION is a game-style city
// picker (each city is a live regional server), GREET sets the stage, IDENTITY
// rolls name/contact in with the character builder, BUSINESS holds the whole
// business-onboarding block, and REAL ESTATE sets the office/housing tier in
// the chosen city. Then we file and confirm.
type Step = 'destination' | 'greet' | 'identity' | 'business' | 'estate' | 'submitting' | 'done';

// Pages that count toward the progress bar (everything the user actively
// fills in). submitting/done are terminal and excluded.
export const REQUIRED_ONBOARDING_STEPS = ['destination', 'identity', 'business'] as const;
const DATA_STEPS: Step[] = [...REQUIRED_ONBOARDING_STEPS];

function vtFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "var(--font-sans)" };
}
function stFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "var(--font-sans)" };
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
  const url = useArtAsset('scene_office', 4000, { retryOnFail: true });
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
        alt="Tower office"
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

/**
 * Painted establishing shot for a destination city in the server browser.
 * Renders the city's cinematic Nano Banana `city_<id>` asset for live cities;
 * stays null while the asset bakes (or for coming-soon cities) so the gradient
 * + emoji fallback in CityHero shows through. Graceful, credit-gated.
 */
function CityHeroArt({ artKey }: { artKey: string }) {
  const url = useArtAsset(artKey, 4000, { retryOnFail: true });
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/**
 * Server-browser hero banner for a destination city: a color-graded gradient +
 * big city glyph (the always-present fallback), with the painted city art laid
 * over it for live cities, finished with a bottom vignette so overlaid name and
 * badges read cleanly.
 */
function CityHero({ city, selected, isMobile }: { city: CityEntry; selected: boolean; isMobile?: boolean }) {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: isMobile ? '3 / 1' : '21 / 9', overflow: 'hidden',
      background: city.bgGradient,
      borderBottom: `1px solid ${selected ? city.accentColor : 'rgba(56,189,248,.2)'}`,
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '3.2rem', opacity: city.isLive ? 0.5 : 0.3, filter: city.isLive ? 'none' : 'grayscale(.55)',
      }}>{city.icon}</div>
      {city.isLive && <CityHeroArt artKey={`city_${city.cityId}`} />}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(3,6,12,.05) 30%, rgba(3,6,12,.74) 100%)',
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

// A ready-made REALISTIC character option served by GET
// /salaryman/character/templates.
interface CharacterTemplateOption {
  id: string;
  artKey: string;
  label: string;
  archetype: CharacterTemplate;
  faction: OnboardingAnswers['faction'];
  imageUrl: string | null;
  status: string;
  appearance: { skinTone?: string; hairColor?: string; hairStyle?: string; faceStyle?: string; outfitStyle?: string; outfitColor?: string };
}

// One card in the intake LOOK gallery. Pulls its realistic portrait via the
// shared art pipeline (useArtAsset → lazy bake + live poll) and, until that's
// ready (or when the render backend is unconfigured), falls back to the pixel
// paper-doll built from the template's look hints — so the gallery always shows
// something and onboarding is never blocked.
function TemplateCard({
  opt, pCls, selected, onPick, onUrlReady,
}: {
  opt: CharacterTemplateOption;
  pCls?: string;
  selected: boolean;
  onPick: (opt: CharacterTemplateOption, url: string | null) => void;
  onUrlReady: (id: string, url: string) => void;
}) {
  // Fallback (non-art) options carry a sentinel "__" key — skip the fetch for
  // those so we don't spray 404s at the art route.
  const fetchKey = opt.artKey && !opt.artKey.startsWith('__') ? opt.artKey : '';
  const live = useArtAsset(fetchKey, 4000, { retryOnFail: true });
  const url = live ?? opt.imageUrl ?? null;

  const fallbackAppr = useMemo(
    () => applyCharacterTemplate(
      { ...defaultAppearance(), gender: templateGender(opt.archetype) },
      opt.archetype, opt.faction, opt.appearance,
    ),
    [opt],
  );

  // When a SELECTED card's realistic art finishes baking, let the parent fill
  // in the portrait it couldn't set at pick-time (graceful upgrade).
  useEffect(() => {
    if (selected && url) onUrlReady(opt.id, url);
  }, [selected, url, opt.id, onUrlReady]);

  return (
    <button
      type="button"
      onClick={() => onPick(opt, url)}
      data-testid={`onboarding-template-${opt.id}`}
      aria-pressed={selected}
      title={opt.label}
      style={{
        display: 'flex', flexDirection: 'column', padding: 0, cursor: 'pointer', overflow: 'hidden',
        background: selected ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
        border: selected ? '1px solid rgba(56,189,248,.7)' : '1px solid rgba(56,189,248,.15)',
        boxShadow: selected ? '0 0 16px rgba(56,189,248,.3)' : 'none',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', background: 'radial-gradient(ellipse at 50% 35%, rgba(56,189,248,.1), rgba(0,8,12,.92))', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {url ? (
          <img
            src={resolveAvatarUrl(url)}
            alt={opt.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            data-testid={`onboarding-template-img-${opt.id}`}
          />
        ) : (
          <CharacterPreview appearance={fallbackAppr} pCls={pCls} size={96} />
        )}
        {selected && (
          <span style={{ position: 'absolute', top: '.25rem', right: '.3rem', ...stFont(false), fontSize: '.4rem', letterSpacing: '.12em', color: '#04060a', background: '#38bdf8', padding: '.08rem .3rem', borderRadius: 2 }}>✓</span>
        )}
      </div>
      <div style={{ ...vtFont(false), fontSize: '.62rem', letterSpacing: '.04em', padding: '.3rem .25rem', textAlign: 'center', color: selected ? '#38bdf8' : 'rgba(56,189,248,.6)', lineHeight: 1.2 }}>
        {opt.label}
      </div>
    </button>
  );
}

export function PabloOnboarding({ charName, charClass, venue = 'registry', onComplete }: PabloOnboardingProps) {
  const [boomerMode] = useBoomerMode();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { settings, toggleMuted } = useAudioSettings();
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
  const activeSteps = useMemo<Step[]>(
    () => venue === 'lobby' ? ['business'] : [...DATA_STEPS],
    [venue],
  );
  const [step, setStep] = useState<Step>(() => venue === 'lobby' ? 'business' : 'destination');
  const [faction, setFaction] = useState<OnboardingAnswers['faction']>('suit');
  // Expandable "what is this?" explainer above the ALLEGIANCE choice.
  const [showFactionInfo, setShowFactionInfo] = useState(false);
  const [jobClass, setJobClass] = useState<string>('TRADER');
  const [playerName, setPlayerName] = useState(defaultName);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  // Pre-seed bizPath from the answer Pablo collected during the intro.
  const [bizPath, setBizPath] = useState<'business' | 'unemployed' | ''>(
    () => getInitialOnboardingBizPath(
      venue,
      typeof window !== 'undefined' ? getSalarymanBizPath() : null,
    )
  );
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
  // Housing tiers themed to the chosen faction/district (copy only — ids +
  // prices are stable; the server prices these faction-blind).
  const factionOfficeTiers = useMemo(() => getFactionOnboardingTiers(faction), [faction]);
  // Server-authoritative starting balance for the debt callout. Fetched from
  // /api/onboard-housing/quote on mount; falls back to the module constant
  // until the response arrives so the UI is never blank.
  const [startingFiat, setStartingFiat] = useState(ONBOARDING_STARTING_FIAT_FALLBACK);
  useEffect(() => {
    apiFetch('/api/onboard-housing/quote')
      .then((r: Response) => r.json())
      .then((data: { startingBalance?: number }) => {
        if (typeof data?.startingBalance === 'number') {
          setStartingFiat(data.startingBalance);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);
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

  // ── Ready-made REALISTIC character gallery ─────────────────────────────────
  // The primary look-picker: a grid of pre-built archetype × faction templates,
  // each rendered via the Unreal backend (lazily, through useArtAsset). Picking
  // one sets the portrait AND the matching pixel appearance so the in-world
  // sprite stays consistent. Degrades to the pixel paper-doll fallback (per
  // card) when the render backend is unconfigured — onboarding is never blocked.
  const [templates, setTemplates] = useState<CharacterTemplateOption[] | null>(null);
  const [templatesErr, setTemplatesErr] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/salaryman/character/templates');
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && Array.isArray(body?.templates) && body.templates.length) {
          setTemplates(body.templates as CharacterTemplateOption[]);
        } else {
          setTemplatesErr(true);
        }
      } catch {
        if (!cancelled) setTemplatesErr(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the realistic art is unavailable (endpoint failed / nothing baked),
  // fall back to the three pixel archetypes so the gallery still works.
  const galleryOptions: CharacterTemplateOption[] = useMemo(() => {
    if (templates && templates.length) return templates;
    if (!templatesErr) return [];
    return CHARACTER_TEMPLATES.map(t => ({
      id: `fallback_${t.id}`,
      artKey: `__none_${t.id}`,
      label: t.label,
      archetype: t.id,
      faction: 'suit' as OnboardingAnswers['faction'],
      imageUrl: null,
      status: 'none',
      appearance: {},
    }));
  }, [templates, templatesErr]);

  const pickTemplate = useCallback((opt: CharacterTemplateOption, url: string | null) => {
    const g: SalarymanGender = opt.archetype === 'woman' ? 'woman' : opt.archetype === 'man' ? 'man' : 'neither';
    setSelectedTemplateId(opt.id);
    setTemplate(opt.archetype);
    setGender(g);
    setSalarymanGender(g);
    setFaction(opt.faction);
    // A template is a deliberate complete look — stop auto-applying faction garb.
    garbTouchedRef.current = true;
    setPortraitErr('');
    setPortraitOutage('');
    setAppearance(a => {
      const base = applyCharacterTemplate(a, opt.archetype, opt.faction, opt.appearance);
      if (url) return { ...base, portraitUrl: url };
      // No realistic art yet → clear any stale portrait so the pixel sprite
      // (which now matches the template) is what the player carries.
      const { portraitUrl: _drop, ...rest } = base;
      return rest;
    });
    playStep();
  }, []);

  // A selected template's art may finish baking AFTER the pick — upgrade the
  // portrait in place (only if the player hasn't replaced it via photo).
  const onTemplateUrlReady = useCallback((id: string, url: string) => {
    setSelectedTemplateId(curSel => {
      if (curSel === id) setAppearance(a => (a.portraitUrl ? a : { ...a, portraitUrl: url }));
      return curSel;
    });
  }, []);

  // DESTINATION — game-style city/server browser (was folded into REAL ESTATE).
  // Show only live cities; coming-soon placeholders are filtered out.
  const cities = getOperationalCities();
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
        const r = await apiFetch('/api/world/locate', { credentials: 'include' });
        if (r.ok && alive) {
          const loc = await r.json() as { country: string | null; region: string | null };
          setCoarseLocation(loc.country ?? null);
          setOriginLine(loc.country ? `DETECTED ORIGIN · ${loc.country}${loc.region ? ` / ${loc.region}` : ''}` : 'ORIGIN UNKNOWN · USING DEVICE TIMEZONE');
        }
      } catch { /* dev/local IP won't resolve — fall back to timezone */ }
      try {
        const r = await apiFetch('/api/world/population', { credentials: 'include' });
        if (r.ok && alive) setPopulation(await r.json() as { cityId: string; online: number; max: number });
      } catch { /* non-fatal — caps still render */ }
    })();
    return () => { alive = false; };
  }, []);

  const capacityLabel = (c: CityEntry): string =>
    population && population.cityId === c.cityId ? `${population.online} / ${population.max} ONLINE` : `CAP ${c.maxPlayers}`;

  // The destination the player has chosen — used to greet them by city and to
  // show the address step's "you're settling in <city>" context.
  const chosenCity = getCityById(homeCityId);

  const stepIdx = Math.max(0, activeSteps.indexOf(step));
  const totalSteps = activeSteps.length;

  const advance = useCallback(() => {
    const idx = activeSteps.indexOf(step);
    if (idx >= 0 && idx < activeSteps.length - 1) { playStep(); setStep(activeSteps[idx + 1]); }
  }, [activeSteps, step]);

  const goBack = useCallback(() => {
    if (step === 'submitting' || step === 'done') return;
    const idx = activeSteps.indexOf(step);
    if (idx > 0) { playStep(); setStep(activeSteps[idx - 1]); }
  }, [activeSteps, step]);

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
       businessType: isBusiness ? 'minx' : 'unemployed',
      companyName: isBusiness
        ? normalizeOnboardingCompanyName(companyName)
        : '',
      industry: isBusiness ? (finalIndustry || 'GENERAL SERVICES') : '',
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
      pendingOwnerVerification: false,
      appearance: { ...appearance, gender: genderToAppearance(gender) },
      homeCityId,
      locationConsent,
      coarseLocation: locationConsent ? coarseLocation : null,
    };
  }, [bizPath, playerName, defaultName, contactEmail, defaultEmail, industry, customIndustry, companyName, officeTier, declaredSalary, employeeCount, employeeSalary, faction, gender, jobClass, appearance, homeCityId, locationConsent, coarseLocation]);

  const submit = useCallback(async () => {
    setSubmitErr('');
    const a = buildAnswers();
    if (isLoading || !isAuthenticated) {
      setSubmitErr('Sign in before saving your answers.');
      setStep('business');
      return;
    }
    if (!hasOnboardingCompanyName(a.bizPath, a.companyName)) {
      setSubmitErr('Enter a company name to continue.');
      setStep('business');
      return;
    }
    if (!a.homeCityId || !getCityById(a.homeCityId)?.isLive) {
      setSubmitErr('Choose an operational city before completing registration.');
      setStep('destination');
      return;
    }
    setStep('submitting');
    const isBusiness = shouldFileOnboardingRegistry(a.bizPath);
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
      isEducation: isBusiness && a.industry === 'EDUCATION / SCHOOL',
      companySize: sizeLabel,
      contactEmail: a.contactEmail || null,
      isPaid: false,
      payrollProvider: 'NONE',
      declaredMonthlyIncome: a.declaredMonthlyIncome,
      incomeVerified: false,
      pace: 'full',
      faction: a.faction,
      jobClass: a.jobClass,
      homeCityId: a.homeCityId,
      locationConsent: a.locationConsent,
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
        setSubmitErr('That company name is taken. Pick another.');
        setStep('business');
        return;
      }
    } catch (e: any) {
      playError();
      setSubmitErr(e?.message || 'Could not save your answers. Try again.');
      setStep('business');
      return;
    }
    playMilestone();
    onComplete(a);
  }, [buildAnswers, isAuthenticated, isLoading, onComplete]);

  const canAdvance = (): boolean => {
    if (step === 'destination') return !!homeCityId && !!getCityById(homeCityId)?.isLive;
    if (step === 'identity') {
      return playerName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
    }
    if (step === 'business') return hasOnboardingCompanyName(bizPath, companyName);
    if (step === 'estate') return !!officeTier && !!homeCityId;
    return true;
  };

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

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: venue === 'lobby' ? 'rgba(0,0,0,.58)' : 'rgba(0,0,0,.92)',
      backdropFilter: venue === 'lobby' ? 'blur(2px)' : undefined,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440,
      boxSizing: 'border-box',
      padding: isMobile
        ? 'max(.65rem, env(safe-area-inset-top)) .5rem max(.65rem, env(safe-area-inset-bottom))'
        : '2.8rem 1rem 2.2rem',
    }}>
      <style>{`@keyframes pulse-save { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,.2); } 50% { box-shadow: 0 0 20px rgba(56,189,248,.5); } }`}</style>
      <div style={{
        width: isMobile ? '100%' : 480,
        maxWidth: isMobile ? '100%' : 'min(94vw, 480px)',
        height: isMobile ? '100%' : undefined,
        minHeight: 0,
        maxHeight: isMobile ? '100%' : 'calc(100vh - 5rem)',
        display: 'flex', flexDirection: 'column',
        background: venue === 'lobby' ? 'rgba(7,17,27,.98)' : 'rgba(0,5,0,.99)',
        border: isMobile ? 'none' : '1px solid rgba(56,189,248,.5)',
        boxShadow: isMobile ? 'none' : '0 0 60px rgba(56,189,248,.06)',
      }}>
        <div style={{ padding: '.55rem .85rem', borderBottom: '1px solid rgba(56,189,248,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...VT, fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em' }}>
              {venue === 'lobby' ? 'TOWER CHECK-IN' : 'SHADOW TOWER'}
            </div>
            <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
              {venue === 'lobby' ? 'RECEPTION · 1 STEP' : `ONBOARDING · STEP ${stepIdx + 1}/${totalSteps}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <button
              onClick={toggleMuted}
              aria-label={settings.muted ? 'Unmute audio' : 'Mute audio'}
              title={settings.muted ? 'Unmute audio' : 'Mute audio'}
              style={{
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: settings.muted ? 'rgba(244,63,94,.15)' : 'transparent',
                border: `1px solid ${settings.muted ? 'rgba(244,63,94,.5)' : 'rgba(56,189,248,.3)'}`,
                borderRadius: 4,
                color: settings.muted ? '#fca5a5' : 'rgba(56,189,248,.7)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {settings.muted
                ? <VolumeX style={{ width: 13, height: 13 }} />
                : <Volume2 style={{ width: 13, height: 13 }} />}
            </button>
          </div>
        </div>

        <div style={{ height: 3, background: 'rgba(56,189,248,.06)', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${((stepIdx + 1) / totalSteps) * 100}%`, background: 'rgba(56,189,248,.5)', transition: 'width .35s ease' }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', padding: '.85rem .95rem 1.15rem' }}>
          {step === 'destination' && (
            <div>
              <div style={{ ...VT, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '.05em' }}>Choose your city.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Every city is its own live server with its own economy and population. Pick where you'll live and work — you can travel between live cities later.
              </div>
              <div style={{ ...ST, fontSize: '.5rem', letterSpacing: '.1em', color: 'rgba(125,211,252,.55)', marginTop: '.55rem' }}>
                &gt; {originLine}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.6rem', marginTop: '.6rem' }}>
                {cities.map((c) => {
                  const isSel = c.cityId === homeCityId;
                  const isSuggested = c.cityId === suggestedId;
                  const live = c.isLive;
                  return (
                    <button
                      key={c.cityId}
                      type="button"
                      disabled={!live}
                      onClick={() => { if (live) { setHomeCityId(c.cityId); playStep(); } }}
                      data-testid={`city-option-${c.cityId}`}
                      aria-pressed={isSel}
                      style={{
                        textAlign: 'left', padding: 0, overflow: 'hidden',
                        border: `1px solid ${isSel ? c.accentColor : 'rgba(56,189,248,.22)'}`,
                        background: isSel ? `${c.accentColor}14` : 'rgba(56,189,248,.03)',
                        cursor: live ? 'pointer' : 'not-allowed',
                        opacity: live ? 1 : 0.6,
                        boxShadow: isSel ? `0 0 22px ${c.accentColor}33` : 'none',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <CityHero city={c} selected={isSel} isMobile={isMobile} />
                        <span style={{
                          position: 'absolute', top: '.4rem', left: '.45rem',
                          ...ST, fontSize: '.42rem', letterSpacing: '.14em',
                          color: '#04060a', background: live ? c.accentColor : 'rgba(125,211,252,.55)',
                          padding: '.12rem .4rem', borderRadius: 2,
                        }}>
                          {live ? (isSel ? '✓ SELECTED' : 'ONLINE') : 'COMING SOON'}
                        </span>
                        {isSuggested && live && (
                          <span style={{
                            position: 'absolute', top: '.4rem', right: '.45rem',
                            ...ST, fontSize: '.42rem', letterSpacing: '.14em',
                            color: '#04060a', background: c.accentColor, padding: '.12rem .4rem', borderRadius: 2,
                          }}>SUGGESTED</span>
                        )}
                        <div style={{ position: 'absolute', left: '.55rem', right: '.55rem', bottom: '.4rem' }}>
                          <div style={{ ...VT, fontSize: '1.15rem', color: '#fff', letterSpacing: '.1em', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>{c.cityName}</div>
                          <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(255,255,255,.72)', letterSpacing: '.1em', textShadow: '0 1px 4px rgba(0,0,0,.85)' }}>{c.region} · {c.tagline}</div>
                        </div>
                      </div>
                      <div style={{ padding: isMobile ? '.35rem .55rem' : '.5rem .65rem' }}>
                        <div style={{
                          ...ST, fontSize: '.46rem', color: 'rgba(125,211,252,.6)', letterSpacing: '.02em', lineHeight: 1.65,
                          ...(isMobile ? {
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          } : {}),
                        }}>
                          {c.description}
                        </div>
                        <div style={{ ...ST, fontSize: '.46rem', letterSpacing: '.1em', marginTop: isMobile ? '.25rem' : '.4rem', color: live ? (isSel ? c.accentColor : 'rgba(56,189,248,.55)') : 'rgba(125,211,252,.35)' }}>
                          {live ? capacityLabel(c) : `OPENS SOON · ${c.region}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                &gt; ONBOARDING READY.<br/>
                &gt; SUBJECT CLASS: <span style={{ color: '#38bdf8' }}>{charClass.toUpperCase()}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  Welcome to {chosenCity?.cityName ?? 'the city'}. Let’s get started.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', marginTop: '.55rem', lineHeight: 1.85 }}>
                  Answer a few questions, then continue.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.7rem' }}>
                  {['① IDENTITY + LOOK', '② BUSINESS', '③ ADDRESS', '④ STEP OUTSIDE'].map(t => (
                    <span key={t} style={{ ...ST, fontSize: '.46rem', letterSpacing: '.1em', color: 'rgba(125,211,252,.6)', border: '1px solid rgba(56,189,248,.2)', padding: '.2rem .4rem' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'identity' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Your details.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Add the details needed to continue.
              </div>
              {Field({ label: 'NAME', value: playerName, onChange: setPlayerName, placeholder: 'e.g. JOHN MINX' })}
              {Field({ label: 'CONTACT EMAIL', value: contactEmail, onChange: setContactEmail, placeholder: 'you@domain.com', type: 'email' })}
            </div>
          )}

          {false && step === 'identity' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Who are you, on paper and on the street?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Name + contact go on every contract. The look is how the city sees you.
              </div>

              {Field({ label: 'SALARYMAN NAME', value: playerName, onChange: setPlayerName, placeholder: 'e.g. JOHN MINX' })}
              {Field({ label: 'CONTACT EMAIL', value: contactEmail, onChange: setContactEmail, placeholder: 'you@domain.com', type: 'email' })}

              <SectionLabel>PICK YOUR LOOK</SectionLabel>
              <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6, marginTop: '.25rem' }}>
                Choose a ready-made citizen. It sets your portrait and your faction kit — and on office floors you’ll automatically suit up. Repaint anything later from your profile.
              </div>

              {galleryOptions.length === 0 ? (
                <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.08em', padding: '1.2rem .4rem', textAlign: 'center' }} data-testid="onboarding-template-loading">
                  LOADING CHARACTER TEMPLATES…
                </div>
              ) : (
                <div
                  style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '.4rem', marginTop: '.4rem' }}
                  data-testid="onboarding-template-gallery"
                >
                  {galleryOptions.map(opt => (
                    <TemplateCard
                      key={opt.id}
                      opt={opt}
                      pCls={charClass}
                      selected={selectedTemplateId === opt.id}
                      onPick={pickTemplate}
                      onUrlReady={onTemplateUrlReady}
                    />
                  ))}
                </div>
              )}

              <SectionLabel>OR MAKE IT YOURS</SectionLabel>

              {/* Photo → character: the SECONDARY path. Upload a selfie and let
                  Pablo paint a real, on-brand portrait that overrides the picked
                  template. The pixel appearance is still derived so the in-world
                  sprite resembles the player. */}
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
                {/* Live preview — painted portrait when generated, else the pixel
                    doll that reflects the currently picked template. */}
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
                      border: '1px solid rgba(56,189,248,.35)', background: 'rgba(56,189,248,.06)',
                      ...VT, fontSize: '.72rem', color: 'rgba(56,189,248,.85)', letterSpacing: '.06em', opacity: portraitBusy ? 0.5 : 1,
                    }}
                  >
                    {portraitBusy ? 'GENERATING…' : appearance.portraitUrl ? '↻ REGENERATE FROM PHOTO' : '✦ GENERATE FROM PHOTO'}
                  </button>
                  <div style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.06em', lineHeight: 1.5, marginTop: '.3rem' }}>
                    Optional — upload a selfie and Pablo paints your character. Takes ~30s.
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
                </div>
              </div>
            </div>
          )}

          {step === 'business' && venue === 'lobby' && (
            <div>
              <div style={{ ...VT, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '.05em' }}>{LOBBY_ONBOARDING_COPY.heading}</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.7, marginTop: '.25rem' }}>
                {LOBBY_ONBOARDING_COPY.helper}
              </div>
              <div style={{ display: 'grid', gap: '.45rem', marginTop: '.75rem' }}>
                <button
                  type="button"
                  onClick={() => { setBizPath('business'); playStep(); }}
                  data-testid="onboarding-choice-business"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: bizPath === 'business' ? 'rgba(251,191,36,.15)' : 'rgba(56,189,248,.03)',
                    border: bizPath === 'business' ? '1.5px solid #fbbf24' : '1px solid rgba(56,189,248,.25)',
                    padding: '.7rem', cursor: 'pointer', color: '#fbbf24',
                  }}
                >
                  <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em' }}>{bizPath === 'business' ? '▸ ' : ''}{LOBBY_ONBOARDING_COPY.business}</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setBizPath('unemployed'); playStep(); }}
                  data-testid="onboarding-choice-unemployed"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: bizPath === 'unemployed' ? 'rgba(56,189,248,.12)' : 'transparent',
                    border: bizPath === 'unemployed' ? '1.5px solid #38bdf8' : '1px solid rgba(56,189,248,.2)',
                    padding: '.7rem', cursor: 'pointer', color: '#38bdf8',
                  }}
                >
                  <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em' }}>{bizPath === 'unemployed' ? '▸ ' : ''}{LOBBY_ONBOARDING_COPY.unemployed}</div>
                </button>
              </div>
              {bizPath === 'business' && (
                <div style={{ marginTop: '.8rem' }}>
                  {Field({ label: LOBBY_ONBOARDING_COPY.companyLabel, value: companyName, onChange: setCompanyName, placeholder: 'Your company' })}
                </div>
              )}
              {submitErr && (
                <div style={{ marginTop: '.65rem', padding: '.5rem', border: '1px solid rgba(255,80,80,.4)', color: '#ff8a8a', ...ST, fontSize: '.5rem' }}>
                  {submitErr}
                </div>
              )}
            </div>
          )}

          {step === 'business' && venue !== 'lobby' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>How will you start?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Pick a work path now. Company details, staffing, payroll, appearance, and upgrades stay editable after arrival.
              </div>
              <button
                onClick={() => { setBizPath('business'); playStep(); }}
                data-testid="onboarding-choice-business"
                style={{
                  display: 'block', width: '100%', textAlign: 'left', marginTop: '.8rem',
                  background: bizPath === 'business' ? 'rgba(251,191,36,.15)' : 'rgba(56,189,248,.03)',
                  border: bizPath === 'business' ? '1.5px solid #fbbf24' : '1px solid rgba(56,189,248,.25)',
                  padding: '.8rem', cursor: 'pointer', color: '#fbbf24',
                }}
              >
                <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.08em' }}>{bizPath === 'business' ? '▸ ' : ''}BUILD A BUSINESS</div>
                <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(251,191,36,.65)', marginTop: '.25rem' }}>START WITH A SIMPLE COMPANY · COMPLETE DETAILS LATER</div>
              </button>
              <button
                onClick={() => { setBizPath('unemployed'); playStep(); }}
                data-testid="onboarding-choice-unemployed"
                style={{
                  display: 'block', width: '100%', textAlign: 'left', marginTop: '.55rem',
                  background: bizPath === 'unemployed' ? 'rgba(56,189,248,.12)' : 'transparent',
                  border: bizPath === 'unemployed' ? '1.5px solid #38bdf8' : '1px solid rgba(56,189,248,.2)',
                  padding: '.8rem', cursor: 'pointer', color: '#38bdf8',
                }}
              >
                <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.08em' }}>{bizPath === 'unemployed' ? '▸ ' : ''}FIND WORK IN THE CITY</div>
                <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.55)', marginTop: '.25rem' }}>START SOLO · REGISTER A BUSINESS LATER</div>
              </button>
              {submitErr && (
                <div style={{ marginTop: '.65rem', padding: '.5rem', border: '1px solid rgba(255,80,80,.4)', color: '#ff8a8a', ...ST, fontSize: '.5rem' }}>
                  {submitErr}
                </div>
              )}
            </div>
          )}

          {false && step === 'business' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Choose how to begin.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Choose a work path for now.
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
                  ▸ START HERE
                </div>
                <div style={{ ...VT, fontSize: '1.25rem', color: '#fbbf24', letterSpacing: '.08em', lineHeight: 1.1 }}>
                  {bizPath === 'business' ? '▸ ' : ''}OPEN A BUSINESS
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(251,191,36,.85)', marginTop: '.35rem', letterSpacing: '.08em' }}>
                  COMPANY · WORK · OFFICE
                </div>
              </button>

              <div style={{ marginTop: '.65rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(56,189,248,.12)' }} />
                <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.18em' }}>OR CHOOSE WORK</div>
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
                  {bizPath === 'unemployed' ? '▸ ' : ''}FIND WORK
                </div>
                <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', marginTop: '.2rem', lineHeight: 1.55 }}>
                  Start without a company.
                </div>
              </button>

              {/* Business detail block — only when the business lane is picked. */}
              {bizPath === 'business' && (
                <div>
                  <SectionLabel>BUSINESS DETAILS</SectionLabel>
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
                    <SectionLabel>CHOOSE A GROUP</SectionLabel>
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
                        {showFactionInfo ? '× CLOSE' : '? DETAILS'}
                    </button>
                  </div>
                  <div style={{ ...ST, fontSize: '.46rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.03em', lineHeight: 1.55, marginTop: '.2rem' }}>
                    This choice shapes your work and access.
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
                      <div><span style={{ color: '#38bdf8' }}>SUITS</span> — company work and city benefits.</div>
                      <div style={{ marginTop: '.3rem' }}><span style={{ color: '#38bdf8' }}>NOMADS</span> — independent work and flexible routes.</div>
                      <div style={{ marginTop: '.3rem' }}><span style={{ color: '#38bdf8' }}>REPLICANTS</span> — specialized work with higher risk.</div>
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

                  <SectionLabel>YOUR WORK</SectionLabel>
                  <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', marginTop: '.15rem', marginBottom: '.35rem' }}>
                    WORK STYLE
                  </div>
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
                  <div style={{ ...ST, fontSize: '.44rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', marginTop: '.7rem', marginBottom: '.35rem' }}>
                    INDUSTRY
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.3rem' }}>
                    {Object.entries(REAL_WORLD_INDUSTRIES).map(([key, meta]) => (
                      <button key={key} onClick={() => { setJobClass(key); if (!garbTouchedRef.current && faction !== meta.faction) setFaction(meta.faction); }} data-testid={`onboarding-job-${key.toLowerCase().replace(/\W+/g, '-')}`} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: jobClass === key ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                        border: jobClass === key ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.12)',
                        padding: '.38rem .6rem', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <span style={{ ...VT, fontSize: '.78rem', color: jobClass === key ? '#38bdf8' : 'rgba(56,189,248,.50)', letterSpacing: '.06em' }}>
                          {meta.label}
                        </span>
                        <span style={{ ...ST, fontSize: '.38rem', color: jobClass === key ? 'rgba(56,189,248,.7)' : 'rgba(56,189,248,.28)', letterSpacing: '.1em', marginLeft: '.5rem', whiteSpace: 'nowrap' }}>
                          {meta.faction.toUpperCase()} · +{meta.skillBonus.replace(/_/g, ' ')}
                        </span>
                      </button>
                    ))}
                  </div>

                  <SectionLabel>HEADCOUNT &amp; PAYROLL</SectionLabel>
                  <EconomyKey style={{ marginTop: '.3rem' }} />
                  <div style={{ marginTop: '.45rem' }}>
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
              {bizPath === 'unemployed' && <EconomyKey style={{ marginTop: '.3rem' }} />}
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
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Set up your address.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Your office and home in {chosenCity?.cityName ?? 'the city'}. Rent is monthly, due on day one.
              </div>

              {chosenCity && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem',
                  marginTop: '.6rem', padding: '.5rem .65rem',
                  border: `1px solid ${chosenCity.accentColor}55`, background: `${chosenCity.accentColor}12`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{chosenCity.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...VT, fontSize: '.92rem', color: '#fff', letterSpacing: '.08em' }}>{chosenCity.cityName}</div>
                      <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(125,211,252,.6)', letterSpacing: '.08em' }}>{chosenCity.region}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playStep(); setStep('destination'); }}
                    data-testid="estate-change-city"
                    style={{
                      ...ST, fontSize: '.46rem', letterSpacing: '.1em', color: 'rgba(56,189,248,.7)',
                      background: 'transparent', border: '1px solid rgba(56,189,248,.3)',
                      padding: '.2rem .5rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >CHANGE</button>
                </div>
              )}

              <SectionLabel>YOUR ADDRESS</SectionLabel>
              {/* District header — housing is themed to the player's faction/location */}
              {(() => {
                const d = FACTION_DISTRICTS[faction];
                return (
                  <div style={{
                    marginTop: '.4rem', padding: '.45rem .6rem',
                    border: `1px solid ${d.accent}55`, background: `${d.accent}12`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                      <span style={{ ...ST, fontSize: '.4rem', letterSpacing: '.14em', color: d.accent, border: `1px solid ${d.accent}66`, padding: '.1rem .35rem' }}>{d.factionLabel}</span>
                      <span style={{ ...VT, fontSize: '.85rem', letterSpacing: '.08em', color: d.accent }}>{d.district}</span>
                      <span style={{ ...ST, fontSize: '.4rem', letterSpacing: '.1em', color: d.accent, opacity: .6 }}>{d.districtKana}</span>
                    </div>
                    <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(125,211,252,.55)', lineHeight: 1.5, marginTop: '.22rem' }}>{d.locationBlurb}</div>
                  </div>
                );
              })()}
              <EconomyKey style={{ marginTop: '.3rem' }} />
              {/* Marketplace card grid — 1-col on mobile, 2×2 on desktop */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '.5rem',
                marginTop: '.35rem',
              }}>
                {factionOfficeTiers.map(opt => {
                  const sel = officeTier === opt.id;
                  const priceLabel = `ƒ${opt.price.toLocaleString()}/MO`;
                  return (
                    <div key={opt.id} data-testid={`onboarding-office-${opt.id}`}>
                      <PropertyCard
                        img={TIER_IMG[opt.id]}
                        label={opt.label}
                        tagline={opt.tagline}
                        desc={opt.desc}
                        priceLabel={priceLabel}
                        selected={sel}
                        boomer={boomerMode}
                        onSelect={() => { playStep(); setOfficeTier(opt.id); }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Debt-to-Pablo callout — always shows DUE ON ARRIVAL, conditionally shows DEBT ALERT */}
              {(() => {
                const tier = factionOfficeTiers.find(t => t.id === officeTier) ?? factionOfficeTiers[0];
                const inDebt = startingFiat < tier.price;
                const shortfall = Math.max(0, tier.price - startingFiat);
                return (
                  <div style={{
                    marginTop: '.55rem',
                    padding: '.45rem .6rem',
                    border: inDebt ? '1px solid rgba(239,68,68,.38)' : '1px solid rgba(56,189,248,.18)',
                    background: inDebt ? 'rgba(239,68,68,.05)' : 'rgba(56,189,248,.03)',
                  }}>
                    <div style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.38)', letterSpacing: '.12em', marginBottom: '.22rem' }}>
                      WHAT YOU OWE ON DAY ONE
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ ...VT, fontSize: '.95rem', color: inDebt ? '#f87171' : '#38bdf8', letterSpacing: '.06em' }}>
                          DUE ON ARRIVAL: ƒ{tier.price.toLocaleString()}
                        </div>
                        <div style={{ ...ST, fontSize: '.41rem', color: 'rgba(125,211,252,.45)', marginTop: '.08rem', lineHeight: 1.5 }}>
                          Charged to your account on arrival
                        </div>
                      </div>
                      {inDebt && (
                        <div style={{
                          ...ST, fontSize: '.42rem', color: '#fca5a5', letterSpacing: '.07em',
                          background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.32)',
                          padding: '.22rem .48rem', whiteSpace: 'nowrap', alignSelf: 'center',
                        }}>
                          ⚠ DEBT ALERT — ƒ{shortfall.toLocaleString()} SHORT
                        </div>
                      )}
                    </div>
                    {inDebt && (
                      <div style={{ ...ST, fontSize: '.41rem', color: 'rgba(239,68,68,.6)', marginTop: '.28rem', lineHeight: 1.5 }}>
                        You'll arrive in the negative. The balance carries a fee.
                      </div>
                    )}
                  </div>
                );
              })()}

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
                  Let us remember my <b style={{ color: '#7dd3fc' }}>approximate (country-level)</b> location to improve
                  error reports &amp; research. Optional. Nothing finer than country is ever stored.
                </span>
              </label>
            </div>
          )}

          {step === 'submitting' && (
            <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2 }}>
              &gt; SAVING YOUR ANSWERS...<br/>
              &gt; CHECKING YOUR ACCOUNT...<br/>
              &gt; PREPARING YOUR START...
            </div>
          )}

          {step === 'done' && (
            <div>
              <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2 }}>
                &gt; ANSWERS SAVED.<br/>
                &gt; {salarymanTerm(gender, 'upper')}: <span style={{ color: '#38bdf8' }}>{playerName}</span><br/>
                &gt; STATUS: <span style={{ color: '#38bdf8' }}>{bizPath === 'business' ? `BUSINESS — ${companyName.toUpperCase()}` : 'WORK'}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  You're ready. Continue outside.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', marginTop: '.5rem', lineHeight: 1.85 }}>
                  Your profile can be updated later.
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '.5rem .85rem', paddingBottom: 'calc(.5rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(56,189,248,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
              ONBOARDING
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
              CONTINUE TO THE TOWER
            </button>
          ) : step === 'business' || step === 'estate' ? (
            <button onClick={submit} disabled={!canAdvance()} data-testid="onboarding-submit" style={{
              ...VT, fontSize: '1.05rem', letterSpacing: '.12em',
              padding: '.4rem 1.1rem',
              background: canAdvance() ? 'rgba(56,189,248,.15)' : 'rgba(56,189,248,.02)',
              border: canAdvance() ? '1px solid rgba(56,189,248,.7)' : '1px solid rgba(56,189,248,.1)',
              color: canAdvance() ? '#38bdf8' : 'rgba(56,189,248,.2)',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
            }}>
              {venue === 'lobby' ? 'SAVE & CONTINUE' : 'SAVE YOUR ANSWERS AND FINISH'}
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
