import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";

interface OrgMember {
  orgId: number;
  userId: string;
  role: string;
  status: string;
}

interface OrgData {
  org: { id: number; name: string; ownerUserId: string } | null;
  member: OrgMember | null;
  loading: boolean;
}

let _cachedOrg: OrgData | null = null;
let _cachedForAuth: boolean | undefined = undefined;
let _orgListeners: Array<() => void> = [];

export function invalidateOrgCache() {
  _cachedOrg = null;
  _cachedForAuth = undefined;
  _orgListeners.forEach(fn => fn());
}

export function useOrg(): OrgData {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<OrgData>(
    _cachedOrg && _cachedForAuth === isAuthenticated
      ? _cachedOrg
      : { org: null, member: null, loading: true }
  );

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      const s = { org: null, member: null, loading: false };
      _cachedOrg = s;
      _cachedForAuth = false;
      setState(s);
      return;
    }
    try {
      const res = await apiFetch('/api/orgs/me', { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const s: OrgData = {
        org: data.org ?? null,
        member: data.member ?? null,
        loading: false,
      };
      _cachedOrg = s;
      _cachedForAuth = isAuthenticated;
      setState(s);
    } catch {
      const s = { org: null, member: null, loading: false };
      _cachedOrg = s;
      _cachedForAuth = isAuthenticated;
      setState(s);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === undefined) return;
    if (_cachedOrg && _cachedForAuth === isAuthenticated) {
      setState(_cachedOrg);
      return;
    }
    fetch();
  }, [isAuthenticated, fetch]);

  useEffect(() => {
    const invalidate = () => { _cachedOrg = null; _cachedForAuth = undefined; fetch(); };
    _orgListeners.push(invalidate);
    return () => { _orgListeners = _orgListeners.filter(fn => fn !== invalidate); };
  }, [fetch]);

  return state;
}
