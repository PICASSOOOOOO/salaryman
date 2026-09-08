import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  getLocalTimezone,
  getOperationalCities,
  resolveHomeCity,
} from '@/lib/world-servers';
import { defaultAppearance } from '@/lib/character-identity';
import { getSalarymanEmail } from '@/lib/tutorial-progress';
import type { OnboardingAnswers } from './PabloOnboarding';

interface QuickOnboardingProps {
  charName: string;
  onComplete: (answers: OnboardingAnswers) => void;
}

/**
 * The first-run path is intentionally one screen.
 *
 * The old intake tried to make onboarding, character creation, real estate,
 * business setup, and a cinematic happen at once. That made the smallest
 * viewport the least usable one. The deeper choices remain available after
 * entry; this component only collects the minimum valid registry payload.
 */
export function QuickOnboarding({ charName, onComplete }: QuickOnboardingProps) {
  const cities = useMemo(() => getOperationalCities(), []);
  const suggestedCity = useMemo(
    () => resolveHomeCity(getLocalTimezone())?.city.cityId ?? cities[0]?.cityId ?? '',
    [cities],
  );
  const [name, setName] = useState(charName.trim() || 'SALARYMAN');
  const [cityId, setCityId] = useState(suggestedCity);
  const [path, setPath] = useState<'office' | 'business'>('office');
  const [submitting, setSubmitting] = useState(false);

  const selectedCity = cities.find((city) => city.cityId === cityId);
  const canEnter = name.trim().length >= 2 && Boolean(cityId) && !submitting;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEnter) return;
    setSubmitting(true);

    const isBusiness = path === 'business';
    onComplete({
      bizPath: isBusiness ? 'business' : 'unemployed',
      businessType: isBusiness ? 'minx' : 'unemployed',
      companyName: isBusiness ? `${name.trim().toUpperCase()} WORKS` : '',
      industry: isBusiness ? 'CUSTOM / OTHER' : '',
      contactEmail: getSalarymanEmail() ?? '',
      playerName: name.trim().slice(0, 80),
      perception: 5,
      combatStyle: '',
      playstyle: '',
      goal: isBusiness ? 'build a business' : 'find work',
      officeTier: 'capsule',
      declaredMonthlyIncome: 0,
      employeeCount: 0,
      employeeMonthlySalary: 0,
      pace: 'quick',
      faction: 'nomad',
      gender: 'neither',
      jobClass: 'COURIER',
      pendingOwnerVerification: false,
      appearance: defaultAppearance(),
      homeCityId: cityId,
      locationConsent: false,
      coarseLocation: null,
    });
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 6,
    color: 'rgba(148, 163, 184, .78)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.12em',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    minHeight: 48,
    boxSizing: 'border-box',
    border: '1px solid rgba(125, 211, 252, .22)',
    borderRadius: 10,
    background: 'rgba(2, 6, 23, .78)',
    color: '#f8fafc',
    padding: '0 14px',
    fontFamily: 'inherit',
    fontSize: 16,
    outline: 'none',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        padding: 'max(72px, calc(env(safe-area-inset-top, 0px) + 56px)) 12px max(76px, calc(env(safe-area-inset-bottom, 0px) + 52px))',
        boxSizing: 'border-box',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 440,
          margin: '0 auto',
          boxSizing: 'border-box',
          border: '1px solid rgba(125, 211, 252, .24)',
          borderRadius: 16,
          background: 'rgba(3, 8, 18, .94)',
          boxShadow: '0 18px 60px rgba(0, 0, 0, .42)',
          padding: 'clamp(18px, 5vw, 28px)',
        }}
      >
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: '#7dd3fc', fontSize: 11, fontWeight: 800, letterSpacing: '.16em' }}>
            TOWER ENTRY
          </div>
          <h1
            style={{
              margin: '8px 0 6px',
              color: '#f8fafc',
              fontSize: 'clamp(24px, 7vw, 34px)',
              lineHeight: 1.05,
              letterSpacing: '-.03em',
            }}
          >
            Start in 10 seconds.
          </h1>
          <p style={{ margin: 0, color: 'rgba(203, 213, 225, .74)', fontSize: 14, lineHeight: 1.5 }}>
            Pick your city. We can fill in the rest later.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label>
            <span style={labelStyle}>YOUR NAME</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              maxLength={80}
              style={inputStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>CITY</span>
            <select
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
              style={{ ...inputStyle, appearance: 'auto' }}
            >
              {cities.map((city) => (
                <option key={city.cityId} value={city.cityId}>
                  {city.icon} {city.cityName}
                </option>
              ))}
            </select>
            {selectedCity && (
              <span style={{ display: 'block', marginTop: 6, color: 'rgba(148, 163, 184, .62)', fontSize: 12 }}>
                {selectedCity.tagline}
              </span>
            )}
          </label>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={labelStyle}>START AS</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                ['office', 'OFFICE'],
                ['business', 'BUILD A BUSINESS'],
              ] as const).map(([value, label]) => {
                const selected = path === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPath(value)}
                    aria-pressed={selected}
                    style={{
                      minHeight: 48,
                      border: `1px solid ${selected ? 'rgba(125, 211, 252, .75)' : 'rgba(125, 211, 252, .2)'}`,
                      borderRadius: 10,
                      background: selected ? 'rgba(56, 189, 248, .16)' : 'rgba(2, 6, 23, .62)',
                      color: selected ? '#e0f2fe' : 'rgba(203, 213, 225, .7)',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '.08em',
                      padding: '0 8px',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <button
          type="submit"
          disabled={!canEnter}
          style={{
            width: '100%',
            minHeight: 52,
            marginTop: 24,
            border: 0,
            borderRadius: 10,
            background: canEnter ? '#38bdf8' : 'rgba(56, 189, 248, .24)',
            color: canEnter ? '#03111d' : 'rgba(226, 232, 240, .45)',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: '.12em',
            cursor: canEnter ? 'pointer' : 'not-allowed',
            touchAction: 'manipulation',
          }}
        >
          {submitting ? 'ENTERING…' : 'ENTER THE TOWER'}
        </button>

        <p style={{ margin: '14px 0 0', color: 'rgba(148, 163, 184, .52)', fontSize: 11, lineHeight: 1.45, textAlign: 'center' }}>
          You can update your business, avatar, and housing after you arrive.
        </p>
      </form>
    </div>
  );
}

export default QuickOnboarding;