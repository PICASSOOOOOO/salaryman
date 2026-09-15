import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { isTutorialDone, markTutorialDone } from '@/lib/tutorial-progress';
import { sanitizeReturnPath } from '@/lib/safe-path';
import { QuickOnboarding } from '@/components/QuickOnboarding';
import type { OnboardingAnswers } from '@/components/PabloOnboarding';

export function getPostOnboardingDestination(
  search = '',
  workPath: OnboardingAnswers['bizPath'] = 'unemployed',
): string {
  const requested = sanitizeReturnPath(new URLSearchParams(search).get('returnTo'));
  if (requested && requested !== '/onboarding') return requested;
  return workPath === 'business' ? '/business' : '/business/jobs';
}

function getPlayerName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'SALARYMAN';
}

export default function Onboarding() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const alreadyComplete = isTutorialDone();
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const charName = useMemo(() => getPlayerName(user), [user]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(`/sign-in?returnTo=${encodeURIComponent('/onboarding')}`, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (isAuthenticated && !isLoading && alreadyComplete) {
      navigate('/', { replace: true });
    }
  }, [alreadyComplete, isAuthenticated, isLoading, navigate]);

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
        contactEmail: business ? ((user as { email?: string | null } | null)?.email ?? null) : null,
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
    navigate(getPostOnboardingDestination(search, answers.bizPath), { replace: true });
  };

  if (isLoading || !isAuthenticated || alreadyComplete) return null;

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
        <QuickOnboarding charName={charName} onComplete={completeOnboarding} />
      </div>
    </main>
  );
}