import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

// The live-session / classroom area is named dynamically: education orgs see
// "Classroom", everyone else sees "Conference". The flag is derived server-side
// from the user's org (organizations.is_education) via GET /api/education/label.

export type FeatureLabel = {
  label: string;
  isEducation: boolean;
  loading: boolean;
};

const DEFAULT: { label: string; isEducation: boolean } = { label: 'Conference', isEducation: false };

// Module-level cache so the label is fetched once and shared across every nav
// surface and the Classroom page, regardless of how many components mount.
let cached: { label: string; isEducation: boolean } | null = null;
let cachedForUser: string | null = null;
let inflight: Promise<{ label: string; isEducation: boolean }> | null = null;

function fetchLabel(userId: string): Promise<{ label: string; isEducation: boolean }> {
  if (cached && cachedForUser === userId) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = apiFetch('/api/education/label')
    .then(async (r) => {
      if (!r.ok) return { data: DEFAULT, ok: false };
      const d = (await r.json().catch(() => DEFAULT)) as { label?: string; isEducation?: boolean };
      return {
        data: {
          label: typeof d.label === 'string' && d.label ? d.label : DEFAULT.label,
          isEducation: !!d.isEducation,
        },
        ok: true,
      };
    })
    .catch(() => ({ data: DEFAULT, ok: false }))
    .then(({ data, ok }) => {
      // Only memoize a SUCCESSFUL response. A transient failure (401 during
      // auth bootstrap, network blip) returns the Conference default for this
      // call but stays uncached, so a later mount retries instead of being
      // permanently stuck on the fallback.
      if (ok) {
        cached = data;
        cachedForUser = userId;
      }
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useFeatureLabel(): FeatureLabel {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const hasCachedLabel = !!userId && cachedForUser === userId && !!cached;
  const [state, setState] = useState<{ label: string; isEducation: boolean }>(
    hasCachedLabel ? cached! : DEFAULT,
  );
  const [loading, setLoading] = useState<boolean>(!hasCachedLabel && authLoading);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !userId) {
      setState(DEFAULT);
      setLoading(false);
      return;
    }
    if (cached && cachedForUser === userId) {
      setState(cached);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchLabel(userId).then((d) => {
      if (active) {
        setState(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, userId]);

  return { ...state, loading };
}
