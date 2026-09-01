import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Handshake, Search, Plus, Check, X, Loader2, Building2, ArrowLeft, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '').replace(/^\//, '');
function apiUrl(path: string) { return `/${BASE}/api/${path}`; }

interface Partnership {
  id: number;
  orgAId: number;
  orgBId: number;
  type: string;
  label: string | null;
  sharedOffice: string | null;
  rentalAgreement: string | null;
  status: string;
  requestedByUserId: string;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  partnerOrg?: { id: number; name: string };
}

interface OrgOption {
  id: number;
  name: string;
  industry?: string;
}

export default function Partnerships() {
  const { user, isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [orgs, setOrgs] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OrgOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestForm, setRequestForm] = useState({ partnerOrgName: '', type: 'partnership', label: '', sharedOffice: '', rentalAgreement: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await apiFetch(apiUrl('orgs/mine'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.orgs ?? []);
        if (data.orgs?.length > 0 && !selectedOrgId) {
          setSelectedOrgId(data.orgs[0].id);
        }
      }
    } catch {}
  }, [selectedOrgId]);

  const fetchPartnerships = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl(`orgs/${selectedOrgId}/partnerships`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPartnerships(data.partnerships ?? []);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedOrgId]);

  useEffect(() => { if (user) fetchOrgs(); }, [user, fetchOrgs]);
  useEffect(() => { if (selectedOrgId) fetchPartnerships(); }, [selectedOrgId, fetchPartnerships]);

  const searchOrgs = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch(apiUrl(`orgs/search?q=${encodeURIComponent(q)}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults((data.orgs ?? []).filter((o: OrgOption) => o.id !== selectedOrgId));
      }
    } catch {} finally { setSearching(false); }
  }, [selectedOrgId]);

  useEffect(() => {
    const timer = setTimeout(() => searchOrgs(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOrgs]);

  async function requestPartnership() {
    if (!selectedOrgId || !requestForm.partnerOrgName.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(apiUrl(`orgs/${selectedOrgId}/partnerships/request`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestForm),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Partnership request sent' });
        setShowRequest(false);
        setRequestForm({ partnerOrgName: '', type: 'partnership', label: '', sharedOffice: '', rentalAgreement: '' });
        fetchPartnerships();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to send request', variant: 'destructive' });
      }
    } catch { toast({ title: 'Network error', variant: 'destructive' }); } finally { setSubmitting(false); }
  }

  async function updatePartnership(partnershipId: number, status: string) {
    if (!selectedOrgId) return;
    try {
      const res = await apiFetch(apiUrl(`orgs/${selectedOrgId}/partnerships/${partnershipId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: status === 'active' ? 'Partnership accepted' : status === 'declined' ? 'Partnership declined' : 'Partnership dissolved' });
        fetchPartnerships();
      }
    } catch { toast({ title: 'Error', variant: 'destructive' }); }
  }

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage partnerships.' : 'Salaryman credentials required.'} />;
  }

  const currentOrg = orgs.find(o => o.id === selectedOrgId);
  const canManage = currentOrg && ['owner', 'admin', 'executive', 'manager'].includes(currentOrg.role);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/business')} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <Handshake className="w-5 h-5 text-rose-400" />
        <h1 className="text-lg font-bold tracking-wider" style={{ fontFamily: "var(--font-sans)" }}>
          {boomerMode ? 'PARTNERSHIPS' : 'ORG LINK MATRIX'}
        </h1>
      </div>

      {orgs.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">ORG:</span>
          <select
            value={selectedOrgId ?? ''}
            onChange={e => setSelectedOrgId(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-300"
          >
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {canManage && (
        <button
          onClick={() => setShowRequest(!showRequest)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-bold tracking-wider hover:bg-rose-500/20 transition-colors mb-6"
        >
          <Plus className="w-3.5 h-3.5" />
          REQUEST PARTNERSHIP
        </button>
      )}

      <AnimatePresence>
        {showRequest && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-rose-400 mb-2">NEW PARTNERSHIP REQUEST</h3>

              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">SEARCH ORGANIZATION</label>
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setRequestForm(f => ({ ...f, partnerOrgName: e.target.value })); }}
                  placeholder="Type org name..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600"
                />
                {searching && <Loader2 className="w-3 h-3 animate-spin text-rose-400 mt-1" />}
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-zinc-700 rounded bg-zinc-800 max-h-32 overflow-y-auto">
                    {searchResults.map(o => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setRequestForm(f => ({ ...f, partnerOrgName: o.name }));
                          setSearchQuery(o.name);
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <Building2 className="w-3 h-3 text-zinc-500" />
                        {o.name}
                        {o.industry && <span className="text-zinc-500 ml-auto">{o.industry}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground font-mono block mb-1">TYPE</label>
                  <select
                    value={requestForm.type}
                    onChange={e => setRequestForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200"
                  >
                    <option value="partnership">PARTNERSHIP</option>
                    <option value="shared_office">SHARED OFFICE</option>
                    <option value="rental">RENTAL AGREEMENT</option>
                    <option value="affiliate">AFFILIATE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-mono block mb-1">LABEL</label>
                  <input
                    value={requestForm.label}
                    onChange={e => setRequestForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Optional label..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {(requestForm.type === 'shared_office' || requestForm.type === 'rental') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">SHARED OFFICE</label>
                    <input
                      value={requestForm.sharedOffice}
                      onChange={e => setRequestForm(f => ({ ...f, sharedOffice: e.target.value }))}
                      placeholder="Office name / location..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">RENTAL AGREEMENT</label>
                    <input
                      value={requestForm.rentalAgreement}
                      onChange={e => setRequestForm(f => ({ ...f, rentalAgreement: e.target.value }))}
                      placeholder="Agreement details..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={requestPartnership}
                  disabled={submitting || !requestForm.partnerOrgName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold tracking-wider hover:bg-rose-500/30 transition-colors disabled:opacity-40"
                >
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Handshake className="w-3 h-3" />}
                  SEND REQUEST
                </button>
                <button
                  onClick={() => setShowRequest(false)}
                  className="px-3 py-2 text-xs text-muted-foreground hover:text-zinc-300 transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
        </div>
      ) : partnerships.length === 0 ? (
        <div className="text-center py-20">
          <Handshake className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-xs text-muted-foreground font-mono tracking-wider">
            {boomerMode ? 'NO PARTNERSHIPS YET' : 'NO ACTIVE LINKS IN THE MATRIX'}
          </p>
          <p className="text-[10px] text-zinc-600 mt-1 font-mono">
            {boomerMode ? 'Connect with other organizations' : 'REQUEST A PARTNERSHIP TO LINK ORGANIZATIONS'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {partnerships.map(p => {
            const isPending = p.status === 'pending';
            const isActive = p.status === 'active';
            const isIncoming = p.requestedByUserId !== user?.id && isPending;

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`border rounded-xl p-4 ${
                  isActive ? 'border-emerald-500/30 bg-emerald-500/5' :
                  isPending ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-zinc-800 bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className={`w-4 h-4 ${isActive ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <div>
                      <h3 className="text-sm font-bold tracking-wider" style={{ fontFamily: "var(--font-sans)" }}>
                        {p.partnerOrg?.name ?? 'UNKNOWN ORG'}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono uppercase">{p.type.replace('_', ' ')}</span>
                        {p.label && <span className="text-[10px] text-zinc-500 font-mono">· {p.label}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-[10px] font-bold font-mono tracking-wider ${
                      isActive ? 'text-emerald-400' : isPending ? 'text-amber-400' : p.status === 'declined' ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {isActive ? <CheckCircle2 className="w-3 h-3" /> : isPending ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {(p.sharedOffice || p.rentalAgreement) && (
                  <div className="mt-2 pt-2 border-t border-zinc-800/50 flex gap-4">
                    {p.sharedOffice && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        <span className="text-zinc-600">OFFICE:</span> {p.sharedOffice}
                      </span>
                    )}
                    {p.rentalAgreement && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        <span className="text-zinc-600">RENTAL:</span> {p.rentalAgreement}
                      </span>
                    )}
                  </div>
                )}

                {canManage && isIncoming && (
                  <div className="mt-3 pt-2 border-t border-zinc-800/50 flex gap-2">
                    <button
                      onClick={() => updatePartnership(p.id, 'active')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wider hover:bg-emerald-500/20 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      ACCEPT
                    </button>
                    <button
                      onClick={() => updatePartnership(p.id, 'declined')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold tracking-wider hover:bg-red-500/20 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      DECLINE
                    </button>
                  </div>
                )}

                {canManage && isActive && (
                  <div className="mt-3 pt-2 border-t border-zinc-800/50">
                    <button
                      onClick={() => updatePartnership(p.id, 'dissolved')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-zinc-500 hover:text-red-400 text-[10px] font-mono tracking-wider transition-colors"
                    >
                      <X className="w-3 h-3" />
                      DISSOLVE
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
