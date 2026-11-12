import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { markTutorialDone } from '@/lib/tutorial-progress';
import { sanitizeReturnPath } from '@/lib/safe-path';
import { QuickOnboarding } from '@/components/QuickOnboarding';
import type { OnboardingAnswers } from '@/components/PabloOnboarding';

export function getPostOnboardingDestination(search = ''): string {
  const requested = sanitizeReturnPath(new URLSearchParams(search).get('returnTo'));
  if (requested && requested !== '/onboarding') return requested;
  return '/workspace';
}

function getPlayerName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'SALARYMAN';
}

type OnboardingCheck = 'checking' | 'complete' | 'incomplete' | 'error';

export default function Onboarding() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const charName = useMemo(() => getPlayerName(user), [user]);
  const [onboardingCheck, setOnboardingCheck] = useState<OnboardingCheck>('checking');
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(`/sign-in?returnTo=${encodeURIComponent(`/onboarding${search}`)}`, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, search]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let active = true;
    setOnboardingCheck('checking');

    const checkServerState = async () => {
      try {
        let response = await apiFetch('/api/world/onboarding-status', {
          credentials: 'include',
          skipSessionExpiryRedirect: true,
        });
        for (let attempt = 1; response.status === 401 && attempt < 4; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
          response = await apiFetch('/api/world/onboarding-status', {
            credentials: 'include',
            skipSessionExpiryRedirect: true,
          });
        }
        if (!response.ok) throw new Error('Could not verify onboarding status.');
        const data = await response.json() as { completed?: unknown };
        if (typeof data.completed !== 'boolean') throw new Error('Onboarding status was incomplete.');
        if (!active) return;
        if (data.completed) {
          setOnboardingCheck('complete');
        } else {
          // Do not use the shared local tutorial marker here: it can reflect
          // game onboarding, not completion of the browser account intake.
          setOnboardingCheck('incomplete');
        }
      } catch {
        if (active) setOnboardingCheck('error');
      }
    };

    void checkServerState();
    return () => { active = false; };
  }, [checkAttempt, isAuthenticated, isLoading, user?.id]);

  useEffect(() => {
    if (onboardingCheck === 'complete') {
      navigate(getPostOnboardingDestination(search), { replace: true });
    }
  }, [navigate, onboardingCheck, search]);

  const completeOnboarding = async (answers: OnboardingAnswers) => {
    if (!isAuthenticated) throw new Error('Sign in before completing onboarding.');

    const business = answers.bizPath === 'business';
    const response = await apiFetch('/api/world/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        playerName: answers.playerName,
        businessType: business ? 'real' : 'unemployed',
        companyName: business ? answers.companyName : null,
        industry: business ? 'GENERAL SERVICES' : null,
        companySize: business ? 'SOLO OPERATOR' : null,
        contactEmail: answers.contactEmail,
        contactPhone: answers.contactPhone,
        source: 'browser_onboarding',
        isPaid: false,
        payrollProvider: 'NONE',
        declaredMonthlyIncome: 0,
        incomeVerified: false,
        faction: 'nomad',
        jobClass: 'WORKER',
        pace: 'quick',
        isEducation: false,
        homeCityId: answers.homeCityId,
        locationConsent: false,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || `Could not complete onboarding (${response.status}).`);
    }

    if (!business) {
      const unemployment = await apiFetch('/api/world/employment/unemployment', {
        method: 'POST',
        credentials: 'include',
      });
      if (!unemployment.ok) {
        const body = await unemployment.json().catch(() => ({}));
        throw new Error(body?.error || `Could not save unemployment status (${unemployment.status}).`);
      }
    }

    markTutorialDone();
    navigate(getPostOnboardingDestination(search), { replace: true });
  };

  if (isLoading || !isAuthenticated || onboardingCheck === 'complete') return null;

  if (onboardingCheck === 'checking' || onboardingCheck === 'error') {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#FFFAF0',
          color: '#111111',
          padding: 24,
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div role={onboardingCheck === 'error' ? 'alert' : 'status'} style={{ textAlign: 'center' }}>
          <p>{onboardingCheck === 'error' ? "We couldn't verify your setup." : 'Checking your setup…'}</p>
          {onboardingCheck === 'error' && (
            <button type="button" onClick={() => setCheckAttempt((attempt) => attempt + 1)}>
              RETRY
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        background: '#FFFAF0',
        color: '#111111',
        padding: '76px 16px 40px',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 720 }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.2em' }}>SALARYMAN</div>
          <div style={{ marginTop: 6, color: '#777066', fontSize: 12 }}>
            Set up your work path. Business setup is optional.
          </div>
        </header>
        <QuickOnboarding
          charName={charName}
          contactEmail={(user as { email?: string | null } | null)?.email ?? ''}
          onComplete={completeOnboarding}
        />
      </div>
    </main>
  );
}