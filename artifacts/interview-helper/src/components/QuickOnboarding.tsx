import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { getLocalTimezone, getOperationalCities, resolveHomeCity } from '@/lib/world-servers';
import { getSalarymanEmail } from '@/lib/tutorial-progress';
import { defaultAppearance } from '@/lib/character-identity';
import { BUSINESS_INDUSTRY_GROUPS, findBusinessIndustry } from '@/lib/business-industries';
import { trackEvent } from '@/lib/analytics';
import type { OnboardingAnswers } from './PabloOnboarding';

interface QuickOnboardingProps {
  charName: string;
  contactEmail?: string;
  onComplete: (answers: OnboardingAnswers) => void | Promise<void>;
}

type WorkPath = 'business' | 'unemployed';

/**
 * Browser onboarding is intentionally small. It establishes the user's work
 * path without creating a fictional company or pulling them into the
 * downloadable game's immigration flow.
 */
export function QuickOnboarding({ charName, contactEmail: initialEmail, onComplete }: QuickOnboardingProps) {
  const cities = useMemo(() => getOperationalCities(), []);
  const suggestedCity = useMemo(
    () => resolveHomeCity(getLocalTimezone())?.city.cityId ?? cities[0]?.cityId ?? 'minx_city',
    [cities],
  );
  const [name, setName] = useState(charName.trim() || 'SALARYMAN');
  const [email, setEmail] = useState(initialEmail?.trim() || getSalarymanEmail() || '');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [path, setPath] = useState<WorkPath>('unemployed');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canEnter =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    phone.replace(/\D/g, '').length >= 7 &&
    (path === 'unemployed' || (companyName.trim().length >= 2 && Boolean(industry))) &&
    !submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEnter) return;
    setSubmitting(true);
    setError('');

    try {
      await onComplete({
        bizPath: path,
        businessType: path === 'business' ? 'real' : 'unemployed',
        companyName: path === 'business' ? companyName.trim() : '',
         industry: path === 'business' ? industry : '',
        contactEmail: email.trim(),
        contactPhone: phone.trim(),
        playerName: name.trim().slice(0, 80),
        perception: 5,
        combatStyle: '',
        playstyle: '',
        goal: path === 'business' ? 'create jobs' : 'find work',
        officeTier: 'capsule',
        declaredMonthlyIncome: 0,
        employeeCount: 0,
        employeeMonthlySalary: 0,
        pace: 'quick',
        faction: 'nomad',
        gender: 'neither',
        jobClass: 'WORKER',
        pendingOwnerVerification: false,
        appearance: defaultAppearance(),
        homeCityId: suggestedCity,
        locationConsent: false,
        coarseLocation: null,
      });
      trackEvent('onboarding_completed', { work_path: path });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save onboarding.');
      setSubmitting(false);
    }
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 7,
    color: '#5F594F',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '.14em',
  };
  const inputStyle: CSSProperties = {
    width: '100%',
    minHeight: 48,
    boxSizing: 'border-box',
    border: '1px solid #CFC6B7',
    borderRadius: 3,
    background: '#FFFCF5',
    color: '#111111',
    padding: '0 13px',
    fontFamily: 'inherit',
    fontSize: 16,
    outline: 'none',
  };

  return (
    <form
      onSubmit={submit}
      data-testid="onboarding-form"
      style={{
        width: '100%',
        maxWidth: 520,
        boxSizing: 'border-box',
        border: '1px solid #CFC6B7',
        background: '#FFFCF5',
        boxShadow: '8px 8px 0 #111111',
        padding: 'clamp(22px, 5vw, 34px)',
      }}
    >
      <div style={{ marginBottom: 26 }}>
        <div style={{ color: '#111111', fontSize: 11, fontWeight: 800, letterSpacing: '.18em' }}>
          ONBOARDING
        </div>
        <h1
          style={{
            margin: '10px 0 8px',
            color: '#111111',
            fontSize: 'clamp(28px, 7vw, 42px)',
            lineHeight: 1,
            letterSpacing: '-.04em',
          }}
        >
          Choose your work path.
        </h1>
        <p style={{ margin: 0, color: '#5F594F', fontSize: 14, lineHeight: 1.55 }}>
          Start a real business, or look for work.
          You can change direction later.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        <label>
          <span style={labelStyle}>YOUR NAME</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={80}
            style={inputStyle}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <label>
            <span style={labelStyle}>EMAIL</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={120}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>PHONE NUMBER</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              maxLength={40}
              placeholder="+1 555 000 0000"
              style={inputStyle}
            />
          </label>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={labelStyle}>I WANT TO</legend>
          <div style={{ display: 'grid', gap: 8 }}>
            {([
              ['business', 'START A BUSINESS', 'Create a real business and create jobs.'],
              ['unemployed', 'LOOKING FOR WORK', 'Find work, build skills, or join an organization.'],
            ] as const).map(([value, label, description]) => {
              const selected = path === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPath(value)}
                  aria-pressed={selected}
                  style={{
                    display: 'grid',
                    gap: 4,
                    minHeight: 62,
                    textAlign: 'left',
                    border: `1px solid ${selected ? '#111111' : '#CFC6B7'}`,
                    borderRadius: 3,
                    background: selected ? '#111111' : '#FFFCF5',
                    color: selected ? '#FFFAF0' : '#111111',
                    fontFamily: 'inherit',
                    padding: '11px 13px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>{label}</span>
                  <span style={{ fontSize: 12, color: selected ? '#D8D1C3' : '#5F594F' }}>{description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {path === 'business' && (
          <>
            <label>
              <span style={labelStyle}>BUSINESS NAME</span>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                autoComplete="organization"
                maxLength={80}
                placeholder="Your real business name"
                style={inputStyle}
              />
              <span style={{ display: 'block', marginTop: 7, color: '#777066', fontSize: 12 }}>
                This creates a real business workspace. No fictional company is created here.
              </span>
            </label>

            <label>
              <span style={labelStyle}>INDUSTRY</span>
              <select
                data-testid="onboarding-industry"
                aria-required="true"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select your industry</option>
                {BUSINESS_INDUSTRY_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {findBusinessIndustry(industry) && (
                <span style={{ display: 'block', marginTop: 7, color: '#777066', fontSize: 12, lineHeight: 1.45 }}>
                  {findBusinessIndustry(industry)?.description}
                </span>
              )}
            </label>
          </>
        )}
      </div>

      {error && (
        <p role="alert" style={{ margin: '18px 0 0', color: '#A51D2D', fontSize: 12, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canEnter}
        style={{
          width: '100%',
          minHeight: 52,
          marginTop: 26,
          border: 0,
          borderRadius: 3,
          background: canEnter ? '#111111' : '#CFC6B7',
          color: '#FFFAF0',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '.14em',
          cursor: canEnter ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? 'SAVING…' : 'CONTINUE'}
      </button>
    </form>
  );
}

export default QuickOnboarding;