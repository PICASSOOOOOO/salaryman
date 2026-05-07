import { useState, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@workspace/replit-auth-web';
import { CITY_NAME } from '../gameSystems';
import { apiFetch } from '@/lib/api-client';
import { PixelOffice } from './PixelOffice';
import { getSalarymanBizPath, getSalarymanName, getSalarymanEmail, isLikelyEmail } from '../lib/tutorial-progress';

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
  faction: 'pablo_loyalist' | 'shadow_rebel' | 'neutral_operator';
  jobClass: string;
  // True iff the salary figure is awaiting org-owner attestation. Set by
  // the server when a real-business owner declares income without a
  // payroll provider; the client surfaces this as a warning badge.
  pendingOwnerVerification: boolean;
}

const FACTIONS: { id: OnboardingAnswers['faction']; label: string; desc: string }[] = [
  { id: 'pablo_loyalist',   label: 'PABLO LOYALIST',   desc: 'Card-carrying. Discounts at Corp shops, first dibs on contracts, and Pablo answers your calls.' },
  { id: 'shadow_rebel',     label: 'SHADOW REBEL',     desc: 'Off the books. Higher payouts on grey-market gigs, but Corp doesn\'t catch you when you fall.' },
  { id: 'neutral_operator', label: 'NEUTRAL OPERATOR', desc: 'No allegiance. Slower start, but every door stays open. Most operatives pick this one.' },
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

type Step = 'greet' | 'pace' | 'name' | 'email' | 'choice' | 'business' | 'faction' | 'job' | 'team' | 'salary' | 'office' | 'submitting' | 'done';

// 'pace' sits right after 'greet' so the user picks FULL DOSSIER vs QUICK
// START before we start asking detail questions. QUICK skips faction, job,
// team, salary and office (defaults are filed instead) so a busy user can
// land in the city in three taps. FULL keeps the elaborate intake.
const STEP_ORDER: Step[] = ['greet', 'pace', 'name', 'email', 'choice', 'business', 'faction', 'job', 'team', 'salary', 'office', 'submitting', 'done'];

function vtFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'VT323',monospace" };
}
function stFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'Share Tech Mono',monospace" };
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
    return (full || charName || 'OPERATIVE').toUpperCase();
  }, [terminalName, user, charName]);
  const defaultEmail = useMemo(() => {
    if (terminalEmail && isLikelyEmail(terminalEmail)) return terminalEmail;
    return (user?.email ?? '').trim().toLowerCase();
  }, [terminalEmail, user]);

  // If Pablo already has a usable name/email from the terminal intake,
  // skip those steps entirely on the modal — re-asking would feel like
  // he forgot. We FREEZE these flags at mount via useState initializer
  // so a late OAuth profile refresh can't suddenly drop the user's
  // current step out of visibleSteps mid-flow (architect-flagged race).
  // The user can still flip them back on with the EDIT toggles below
  // if they need to fix a typo.
  const [haveName, setHaveName] = useState<boolean>(
    () => defaultName.trim().length >= 2 && defaultName !== 'OPERATIVE',
  );
  const [haveEmail, setHaveEmail] = useState<boolean>(
    () => isLikelyEmail(defaultEmail),
  );

  const [step, setStep] = useState<Step>('greet');
  const [pace, setPace] = useState<'full' | 'quick' | ''>('');
  const [faction, setFaction] = useState<OnboardingAnswers['faction']>('neutral_operator');
  const [jobClass, setJobClass] = useState<string>('TRADER');
  const [playerName, setPlayerName] = useState(defaultName);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  // Pre-seed bizPath from the answer Pablo collected during the intro.
  // (Currently the terminal no longer collects this — it's asked here
  // on the 'choice' step — but if a legacy session left a value in
  // storage we honor it so the choice carries through.)
  const [bizPath, setBizPath] = useState<'business' | 'unemployed' | ''>(
    () => (typeof window !== 'undefined' ? getSalarymanBizPath() ?? '' : '')
  );
  const [businessType, setBusinessType] = useState<'minx' | 'real'>('minx');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('SOFTWARE / SAAS');
  const [customIndustry, setCustomIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [employeeSalary, setEmployeeSalary] = useState<number>(3000);
  const [declaredSalary, setDeclaredSalary] = useState<number>(5000);
  const [officeTier, setOfficeTier] = useState<OnboardingAnswers['officeTier']>('capsule');
  const [submitErr, setSubmitErr] = useState('');

  // Skip steps the terminal already covered:
  //   - 'name'  if Pablo already collected a name in the terminal
  //   - 'email' if Pablo already collected an email in the terminal
  //   - 'business' / 'team' when the user picks unemployed (no company to file)
  const visibleSteps = useMemo<Step[]>(() => {
    return STEP_ORDER.filter(s => {
      if (s === 'name'  && haveName)  return false;
      if (s === 'email' && haveEmail) return false;
      if (s === 'business' && bizPath === 'unemployed') return false;
      if (s === 'team' && bizPath === 'unemployed') return false;
      // QUICK path: collapse to the bare-minimum identity questions.
      // Faction, job class, team headcount, salary, and office choice are
      // all skipped — sensible defaults file with the registry. The user
      // can flesh these out later from the Profile screen.
      if (pace === 'quick' && (s === 'faction' || s === 'job' || s === 'team' || s === 'salary' || s === 'office')) return false;
      return true;
    });
  }, [bizPath, haveName, haveEmail, pace]);
  const stepIdx = Math.max(0, visibleSteps.indexOf(step));
  const totalSteps = visibleSteps.length;

  const advance = useCallback(() => {
    const idx = visibleSteps.indexOf(step);
    if (idx < visibleSteps.length - 1) setStep(visibleSteps[idx + 1]);
  }, [step, visibleSteps]);

  const submit = useCallback(async () => {
    setSubmitErr('');
    setStep('submitting');
    const finalName = (playerName || defaultName).trim().slice(0, 32).toUpperCase() || 'OPERATIVE';
    const finalEmail = (contactEmail || defaultEmail).trim().toLowerCase().slice(0, 120);
    const finalIndustry = industry === 'CUSTOM / OTHER' && customIndustry.trim()
      ? customIndustry.trim().toUpperCase().slice(0, 60)
      : industry;
    const isBusiness = bizPath === 'business';
    const safeEmployeeCount = isBusiness ? Math.max(0, Math.min(Math.floor(employeeCount), 1_000)) : 0;
    const safeEmployeeSalary = isBusiness ? Math.max(0, Math.min(Math.floor(employeeSalary), 1_000_000)) : 0;
    const safeDeclaredSalary = Math.max(0, Math.min(Math.floor(declaredSalary), 1_000_000));
    const sizeLabel = !isBusiness
      ? null
      : safeEmployeeCount === 0 ? 'SOLO OPERATOR'
      : safeEmployeeCount <= 5 ? `SMALL TEAM (${safeEmployeeCount})`
      : safeEmployeeCount <= 25 ? `CREW (${safeEmployeeCount})`
      : `OPERATION (${safeEmployeeCount})`;
    const payload = {
      playerName: finalName,
      businessType: isBusiness ? businessType : 'unemployed',
      companyName: isBusiness ? companyName.trim().toUpperCase().slice(0, 80) : null,
      industry: isBusiness ? finalIndustry : null,
      companySize: sizeLabel,
      contactEmail: finalEmail || null,
      isPaid: false,
      payrollProvider: 'NONE',
      declaredMonthlyIncome: safeDeclaredSalary,
      incomeVerified: false,
      // Onboarding extras — server stashes these in worldBusinessesTable.meta.
      pace: pace || 'full',
      faction,
      jobClass,
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
      // 409 = company name taken; surface it but stay on business step.
      if (res.status === 409) {
        setSubmitErr('That company name is already on the registry. Pick another.');
        setStep('business');
        return;
      }
    } catch (e: any) {
      setSubmitErr(e?.message || 'Pablo Corp registry is unreachable. Try again.');
      setStep(isBusiness ? 'business' : 'choice');
      return;
    }
    onComplete({
      bizPath: isBusiness ? 'business' : 'unemployed',
      businessType: isBusiness ? businessType : 'unemployed',
      companyName: isBusiness ? payload.companyName ?? '' : '',
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
      pace: pace || 'full',
      faction,
      jobClass,
      // Real biz + non-zero declared salary without a payroll provider always
      // lands as PENDING owner attestation; the server will reject
      // /world/declare-salary until an org owner verifies.
      pendingOwnerVerification: isBusiness && businessType === 'real' && safeDeclaredSalary > 0,
    });
    setStep('done');
  }, [playerName, defaultName, contactEmail, defaultEmail, industry, customIndustry, bizPath, businessType, companyName, onComplete, officeTier, declaredSalary, employeeCount, employeeSalary, pace, faction, jobClass]);

  const canAdvance = (): boolean => {
    if (step === 'pace') return pace !== '';
    if (step === 'name') return playerName.trim().length >= 2;
    if (step === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
    if (step === 'choice') return bizPath !== '';
    if (step === 'business') return companyName.trim().length >= 2 && (industry !== 'CUSTOM / OTHER' || customIndustry.trim().length >= 2);
    if (step === 'faction') return !!faction;
    if (step === 'job') return jobClass.trim().length >= 2;
    if (step === 'team') return employeeCount >= 0 && employeeCount <= 1000 && (employeeCount === 0 || employeeSalary > 0);
    if (step === 'salary') return declaredSalary >= 0 && declaredSalary <= 1_000_000;
    if (step === 'office') return officeTier !== undefined;
    return true;
  };

  // Pablo Q&A panel: lets the user ask Pablo a general question without
  // breaking out of the modal. The answer is rendered inline below the
  // input. (Architect-flagged: the rigid step modal previously trapped
  // the user — Pablo couldn't answer "what's a faction?" mid-intake.)
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

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440, padding: '2.8rem 1rem 2.2rem',
    }}>
      <style>{`@keyframes pulse-save { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,.2); } 50% { box-shadow: 0 0 20px rgba(56,189,248,.5); } }`}</style>
      <div style={{
        width: 460, maxWidth: 'min(92vw, 460px)', maxHeight: 'calc(100vh - 5rem)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,5,0,.99)',
        border: '1px solid rgba(56,189,248,.5)',
        boxShadow: '0 0 60px rgba(56,189,248,.06)',
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
              {/* Pixel-art "Pablo's office" diorama. Sets the visual stage
                  for the intake — the operative is literally walking into
                  Pablo's office to register. Sprites are MIT-licensed from
                  https://github.com/pablodelucca/pixel-agents. */}
              <div style={{ marginBottom: '.7rem', display: 'flex', justifyContent: 'center' }}>
                <PixelOffice scale={2} />
              </div>
              <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 2, marginBottom: '.4rem' }}>
                &gt; SIGNAL ACQUIRED.<br/>
                &gt; PABLO CORP REGISTRY ONLINE.<br/>
                &gt; SUBJECT CLASS: <span style={{ color: '#38bdf8' }}>{charClass.toUpperCase()}</span>
                {haveName  && (
                  <><br/>&gt; NAME ON FILE: <span style={{ color: '#38bdf8' }}>{defaultName}</span>{' '}
                    <button
                      type="button"
                      onClick={() => setHaveName(false)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(56,189,248,.5)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                      data-testid="onboarding-edit-name"
                    >[edit]</button>
                  </>
                )}
                {haveEmail && (
                  <><br/>&gt; EMAIL ON FILE: <span style={{ color: '#38bdf8' }}>{defaultEmail}</span>{' '}
                    <button
                      type="button"
                      onClick={() => setHaveEmail(false)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(56,189,248,.5)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                      data-testid="onboarding-edit-email"
                    >[edit]</button>
                  </>
                )}
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  {haveName ? `Welcome back, ${defaultName.split(' ')[0]}. Sit down — let's make this official.` : `Sit down. We're going to make this official.`}
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', marginTop: '.55rem', lineHeight: 1.85 }}>
                  {haveName && haveEmail ? (
                    <>One question left — what you intend to do in my city. Open a business, or stay a free agent at the mercy of the wastes.<br/><br/>Pick wrong and the savages eat you. Pick right and we both make money. Easy.</>
                  ) : (
                    <>Three questions. Your name. Your contact. And what you intend to do in my city — open a business, or stay a free agent at the mercy of the wastes.<br/><br/>Pick wrong and the savages eat you. Pick right and we both make money. Easy.</>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'pace' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>How thorough are we doing this?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                FULL DOSSIER builds you out — name, faction, class, residence, office, payroll. QUICK START signs you in with defaults; you can fix the rest later from your profile.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.5rem', marginTop: '.7rem' }}>
                {[
                  { id: 'full' as const,  label: 'FULL DOSSIER',  desc: 'Character name, job, faction allegiance, residence, office tier, payroll. The works.' },
                  { id: 'quick' as const, label: 'QUICK START',   desc: 'Just name, contact, and lane. I file defaults for the rest. Faster, but blander.' },
                ].map(opt => (
                  <button key={opt.id} onClick={() => setPace(opt.id)} data-testid={`onboarding-pace-${opt.id}`} style={{
                    background: pace === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                    border: pace === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                    padding: '.6rem .75rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ ...VT, fontSize: '1rem', color: pace === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
                      {pace === opt.id ? '▸ ' : ''}{opt.label}
                    </div>
                    <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.35)', marginTop: '.25rem', lineHeight: 1.6 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'name' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>What do they call you?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                This goes on the registry, the contracts, the bounty board. Make sure it matches the name on your account — the city likes consistency.
              </div>
              {Field({ label: 'OPERATIVE NAME', value: playerName, onChange: setPlayerName, placeholder: 'e.g. JOHN MINX' })}
              <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.25)', marginTop: '.35rem', letterSpacing: '.06em' }}>
                Pre-filled from your sign-in profile. Edit if you go by something else in the field.
              </div>
            </div>
          )}

          {step === 'email' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>How do I reach you when it matters?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Payroll receipts, eviction notices, contract offers. Same address as your login keeps the books clean.
              </div>
              {Field({ label: 'CONTACT EMAIL', value: contactEmail, onChange: setContactEmail, placeholder: 'you@domain.com', type: 'email' })}
            </div>
          )}

          {step === 'choice' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Pick your lane, {playerName.split(' ')[0]}.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Choose wisely. The streets don't care which one you pick — but I do.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.5rem', marginTop: '.7rem' }}>
                {[
                  { id: 'business' as const, label: 'OPEN A BUSINESS', desc: 'Sign the papers. Get a workstation, a registry slot, payroll. You answer to me — but you eat every day.' },
                  { id: 'unemployed' as const, label: 'STAY UNEMPLOYED', desc: 'No payroll. No address. You hustle the wastes for FIAT and pray the savages skip your block tonight.' },
                ].map(opt => (
                  <button key={opt.id} onClick={() => setBizPath(opt.id)} style={{
                    background: bizPath === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                    border: bizPath === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                    padding: '.6rem .75rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ ...VT, fontSize: '1rem', color: bizPath === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
                      {bizPath === opt.id ? '▸ ' : ''}{opt.label}
                    </div>
                    <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.35)', marginTop: '.25rem', lineHeight: 1.6 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'business' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Tell me about the business.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Real outfit or fictitious cover — I don't judge. Either way it goes on the registry under your name.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.6rem' }}>
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

              {submitErr && (
                <div style={{ marginTop: '.6rem', padding: '.4rem .55rem', border: '1px solid rgba(255,80,80,.4)', background: 'rgba(255,80,80,.05)', ...ST, fontSize: '.5rem', color: '#ff8a8a', letterSpacing: '.05em' }}>
                  {submitErr}
                </div>
              )}
            </div>
          )}

          {step === 'faction' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Pick your colors.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Faction shapes who fronts you cash, who shoots first, and who picks up when you call. Pick wrong and the streets will let you know.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.4rem', marginTop: '.6rem' }}>
                {FACTIONS.map(opt => (
                  <button key={opt.id} onClick={() => setFaction(opt.id)} data-testid={`onboarding-faction-${opt.id}`} style={{
                    background: faction === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                    border: faction === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                    padding: '.55rem .7rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ ...VT, fontSize: '.95rem', color: faction === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
                      {faction === opt.id ? '▸ ' : ''}{opt.label}
                    </div>
                    <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.35)', marginTop: '.2rem', lineHeight: 1.55 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'job' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>What do you actually do for money?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Pick a class. Determines starter gear and what jobs the bounty board floats your way.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.6rem' }}>
                {JOB_CLASSES.map(jc => (
                  <button key={jc} onClick={() => setJobClass(jc)} data-testid={`onboarding-job-${jc.toLowerCase()}`} style={{
                    background: jobClass === jc ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
                    border: jobClass === jc ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
                    padding: '.5rem .6rem', cursor: 'pointer', textAlign: 'center',
                    ...VT, fontSize: '.95rem', color: jobClass === jc ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em',
                  }}>
                    {jc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'team' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>How big is the operation?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Headcount on day one. Solo is fine — bigger means heavier payroll. Pablo doesn't extend credit on payroll.
              </div>
              <div style={{ marginTop: '.55rem' }}>
                <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>EMPLOYEES (besides yourself)</div>
                <input
                  type="number" inputMode="numeric" min={0} max={1000}
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                    background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                    color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                    outline: 'none', caretColor: '#38bdf8',
                  }}
                />
              </div>
              {employeeCount > 0 && (
                <div style={{ marginTop: '.55rem' }}>
                  <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>AVG MONTHLY PAY PER EMPLOYEE (ƒ)</div>
                  <input
                    type="number" inputMode="numeric" min={0} max={1_000_000}
                    value={employeeSalary}
                    onChange={(e) => setEmployeeSalary(Math.max(0, Math.min(1_000_000, Number(e.target.value) || 0)))}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                      background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                      color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                      outline: 'none', caretColor: '#38bdf8',
                    }}
                  />
                  <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(248,113,113,.55)', marginTop: '.35rem', letterSpacing: '.06em' }}>
                    PROJECTED PAYROLL: ƒ{(employeeCount * employeeSalary).toLocaleString()} / MO
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'salary' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>What do you draw for yourself?</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                {bizPath === 'business'
                  ? 'Your monthly take-home from the company. Pablo files this with the city. Lying to me is fine — lying to the city is not.'
                  : 'Whatever you bring in monthly from contracts, gigs, or hustle. Pick a number you can defend.'}
              </div>
              {bizPath === 'business' && businessType === 'real' && (
                <div data-testid="onboarding-salary-pending-notice" style={{ marginTop: '.55rem', padding: '.45rem .6rem', border: '1px solid rgba(251,191,36,.45)', background: 'rgba(251,191,36,.06)', ...ST, fontSize: '.5rem', color: '#fbbf24', letterSpacing: '.06em', lineHeight: 1.6 }}>
                  PENDING ATTESTATION — A real-business salary doesn't count toward payouts until an org owner verifies it on the registry. Connect a payroll provider (Gusto/ADP) to skip this step entirely.
                </div>
              )}
              <div style={{ marginTop: '.55rem' }}>
                <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>DECLARED MONTHLY INCOME (ƒ)</div>
                <input
                  type="number" inputMode="numeric" min={0} max={1_000_000}
                  value={declaredSalary}
                  onChange={(e) => setDeclaredSalary(Math.max(0, Math.min(1_000_000, Number(e.target.value) || 0)))}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '.5rem .7rem',
                    background: 'rgba(0,8,8,.95)', border: '1px solid rgba(56,189,248,.3)',
                    color: '#38bdf8', ...ST, fontSize: '.85rem', letterSpacing: '.06em',
                    outline: 'none', caretColor: '#38bdf8',
                  }}
                />
              </div>
            </div>
          )}

          {step === 'office' && (
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em' }}>Pick where you sleep and where you work.</div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, marginTop: '.25rem' }}>
                Rent is monthly and due on day one. Short on the bill? Pablo eats the difference and the tax collectors visit your block.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.4rem', marginTop: '.6rem' }}>
                {OFFICE_TIERS.map(opt => (
                  <button key={opt.id} onClick={() => setOfficeTier(opt.id)} style={{
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
                &gt; OPERATIVE: <span style={{ color: '#38bdf8' }}>{playerName}</span><br/>
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
            ditching the modal. Hidden on the submitting/done steps where the
            registry is already filing and there's nothing to clarify. */}
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
          <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.06em' }}>
            PABLO CORP REGISTRY · {CITY_NAME}
          </div>
          {step === 'submitting' ? (
            <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.1em' }}>FILING...</div>
          ) : step === 'done' ? (
            <button onClick={() => onComplete({
              bizPath: bizPath === 'business' ? 'business' : 'unemployed',
              businessType: bizPath === 'business' ? businessType : 'unemployed',
              companyName: bizPath === 'business' ? companyName.trim().toUpperCase() : '',
              industry: bizPath === 'business' ? (industry === 'CUSTOM / OTHER' ? customIndustry.trim().toUpperCase() : industry) : '',
              contactEmail: contactEmail.trim().toLowerCase(),
              playerName: (playerName || defaultName).trim().toUpperCase(),
              perception: 5,
              combatStyle: 'balanced',
              playstyle: bizPath === 'business' ? 'trader' : 'explorer',
              goal: bizPath === 'business' ? 'wealth' : 'survive',
              officeTier,
              declaredMonthlyIncome: Math.max(0, Math.floor(declaredSalary)),
              employeeCount: bizPath === 'business' ? Math.max(0, Math.floor(employeeCount)) : 0,
              employeeMonthlySalary: bizPath === 'business' ? Math.max(0, Math.floor(employeeSalary)) : 0,
              pace: pace || 'full',
              faction,
              jobClass,
              pendingOwnerVerification: bizPath === 'business' && businessType === 'real' && Math.max(0, Math.floor(declaredSalary)) > 0,
            })} style={{
              ...VT, fontSize: '1.1rem', letterSpacing: '.12em',
              padding: '.4rem 1.2rem',
              background: 'rgba(56,189,248,.15)',
              border: '1px solid rgba(56,189,248,.7)',
              color: '#38bdf8', cursor: 'pointer',
              animation: 'pulse-save 1.5s ease-in-out infinite',
            }}>
              ▸ STEP OUTSIDE ◂
            </button>
          ) : visibleSteps[visibleSteps.indexOf(step) + 1] === 'submitting' ? (
            // Last data-collection step before filing. In FULL pace this is
            // 'office'; in QUICK pace this is whatever the last surviving
            // step is (typically 'business' for biz path or 'choice' for
            // unemployed). The submit handler is the same — we just relabel
            // the button so the user knows this is the final tap.
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
            <button onClick={advance} disabled={!canAdvance()} style={{
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
