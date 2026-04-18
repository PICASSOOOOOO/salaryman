import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Briefcase, Building2, DollarSign, Clock, X, Check, Loader2, MapPin } from 'lucide-react';
import { useLocation } from 'wouter';

type JobOffer = {
  id: number;
  token: string;
  orgId: number;
  orgName: string;
  orgIndustry: string | null;
  offeredRole: string | null;
  offeredTitle: string | null;
  offeredDepartment: string | null;
  offeredMemberType: string | null;
  offeredSalary: number | null;
  offerMessage: string | null;
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
};

const ROLE_LABELS: Record<string, string> = {
  specialist: 'Specialist',
  manager: 'Manager',
  director: 'Director',
  executive: 'Executive',
};

function formatRelative(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const sign = ms < 0 ? -1 : 1;
  const mins = Math.floor(abs / 60000);
  if (mins < 60) return `${sign < 0 ? mins + 'm ago' : 'in ' + mins + 'm'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${sign < 0 ? hrs + 'h ago' : 'in ' + hrs + 'h'}`;
  const days = Math.floor(hrs / 24);
  return `${sign < 0 ? days + 'd ago' : 'in ' + days + 'd'}`;
}

export default function JobOffers() {
  const [, navigate] = useLocation();
  const [offers, setOffers] = useState<JobOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch('/api/me/job-offers');
      if (!res.ok) throw new Error('Failed to load offers');
      const data = await res.json();
      setOffers(data.offers ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    }
  };

  useEffect(() => { void load(); }, []);

  const accept = async (offer: JobOffer) => {
    setActing(offer.id);
    try {
      const res = await apiFetch('/api/orgs/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: offer.token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to accept');
      }
      navigate('/bots/office');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to accept');
      setActing(null);
    }
  };

  const decline = async (offer: JobOffer) => {
    setActing(offer.id);
    try {
      const res = await apiFetch(`/api/me/job-offers/${offer.id}/decline`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to decline');
      }
      setOffers((prev) => (prev ?? []).filter((o) => o.id !== offer.id));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to decline');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-emerald-300 p-6 font-mono">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl tracking-widest text-amber-300">JOB OFFERS</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-300 text-sm rounded">{error}</div>
        )}

        {offers === null && (
          <div className="flex items-center gap-2 text-emerald-400/60 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading offers…
          </div>
        )}

        {offers && offers.length === 0 && (
          <div className="border border-emerald-500/20 bg-emerald-950/20 p-8 text-center text-emerald-400/60 rounded">
            <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-40" />
            No pending offers. When a company invites you to join, it will show up here.
          </div>
        )}

        <div className="space-y-4">
          {offers?.map((offer) => (
            <div key={offer.id} className="border border-amber-500/30 bg-amber-950/10 rounded p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-amber-300" />
                    <span className="text-amber-200 text-lg">{offer.orgName}</span>
                    {offer.orgIndustry && (
                      <span className="text-amber-400/50 text-xs">· {offer.orgIndustry}</span>
                    )}
                  </div>
                  <div className="text-emerald-300/80 text-sm">
                    {offer.offeredTitle ?? ROLE_LABELS[offer.offeredRole ?? 'specialist']}
                    {offer.offeredRole && offer.offeredTitle && (
                      <span className="text-emerald-400/50 ml-2">· {ROLE_LABELS[offer.offeredRole]}</span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {offer.offeredSalary != null && (
                      <div>
                        <div className="text-emerald-500/50 uppercase tracking-wider">Salary</div>
                        <div className="text-emerald-200 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />{offer.offeredSalary.toLocaleString()}
                        </div>
                      </div>
                    )}
                    {offer.offeredDepartment && (
                      <div>
                        <div className="text-emerald-500/50 uppercase tracking-wider">Department</div>
                        <div className="text-emerald-200 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{offer.offeredDepartment}
                        </div>
                      </div>
                    )}
                    {offer.offeredMemberType && (
                      <div>
                        <div className="text-emerald-500/50 uppercase tracking-wider">Billing</div>
                        <div className="text-emerald-200">{offer.offeredMemberType}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-emerald-500/50 uppercase tracking-wider">Expires</div>
                      <div className="text-emerald-200 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{formatRelative(offer.expiresAt)}
                      </div>
                    </div>
                  </div>
                  {offer.offerMessage && (
                    <div className="mt-3 p-3 border-l-2 border-amber-400/40 bg-black/40 text-emerald-300/90 text-sm whitespace-pre-wrap">
                      {offer.offerMessage}
                    </div>
                  )}
                  <div className="mt-3 text-emerald-500/50 text-xs">
                    From {offer.invitedBy} · sent {formatRelative(offer.createdAt)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 justify-end">
                <button
                  onClick={() => decline(offer)}
                  disabled={acting === offer.id}
                  className="px-4 py-2 border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs tracking-widest rounded disabled:opacity-50 flex items-center gap-2"
                >
                  <X className="w-3.5 h-3.5" /> DECLINE
                </button>
                <button
                  onClick={() => accept(offer)}
                  disabled={acting === offer.id}
                  className="px-4 py-2 border border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 text-xs tracking-widest rounded disabled:opacity-50 flex items-center gap-2"
                >
                  {acting === offer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  ACCEPT
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
