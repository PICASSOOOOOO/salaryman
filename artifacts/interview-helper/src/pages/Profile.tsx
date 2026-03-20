import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Brain, Database, Trash2, Download, Save, Loader2, Check, AlertTriangle, Users, LogOut, Smartphone, Share2, Zap, CreditCard } from 'lucide-react';
import { useLocation } from 'wouter';

import { useAuth } from '@workspace/replit-auth-web';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { usePlan } from '@/hooks/use-plan';

interface AccountData {
  user: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string; createdAt: string };
  contactCount: number;
  memory: string;
  memoryUpdatedAt: string | null;
}

function MobileInstallSection() {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=ffffff&bgcolor=09090b&data=${encodeURIComponent(appUrl)}`;
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
          <Smartphone className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Get the Mobile App</p>
          <p className="text-xs text-muted-foreground">Install Salaryman on your phone — no App Store needed</p>
        </div>
      </div>

      {isIOS || isAndroid ? (
        /* On mobile — show inline instructions */
        <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-3">
          {isIOS ? (
            <>
              <p className="text-xs font-semibold text-foreground">You're on iOS — here's how:</p>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  Tap the <Share2 className="w-3 h-3 inline mx-0.5 text-violet-400" /> Share button in Safari (bottom toolbar)
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  Scroll down and tap <strong className="text-foreground">"Add to Home Screen"</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  Tap <strong className="text-foreground">Add</strong> — Salaryman will appear on your home screen like an app
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-foreground">You're on Android — here's how:</p>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  Tap the <strong className="text-foreground">⋮</strong> menu in Chrome (top-right)
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  Tap <strong className="text-foreground">"Add to Home screen"</strong> or <strong className="text-foreground">"Install app"</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  Confirm — Salaryman launches like a native app
                </li>
              </ol>
            </>
          )}
        </div>
      ) : (
        /* On desktop — show QR code + instructions side by side */
        <div className="flex gap-5 items-start">
          <div className="shrink-0">
            <div className="w-[100px] h-[100px] rounded-xl border border-border overflow-hidden bg-[#09090b] flex items-center justify-center">
              <img
                src={qrUrl}
                alt="QR code to open Salaryman on your phone"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">Scan with your phone</p>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">On iPhone (Safari):</p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">1.</span>
                  Scan the QR code to open the app
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">2.</span>
                  Tap <Share2 className="w-3 h-3 inline mx-0.5" /> Share → <strong className="text-foreground">Add to Home Screen</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">3.</span>
                  Tap <strong className="text-foreground">Add</strong> — done!
                </li>
              </ol>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground mb-2">On Android (Chrome):</p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">1.</span>
                  Scan the QR code to open the app
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">2.</span>
                  Tap <strong className="text-foreground">⋮</strong> menu → <strong className="text-foreground">Install app</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">3.</span>
                  Confirm — it's on your home screen
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <a
          href={`${appUrl}${import.meta.env.BASE_URL}mobile`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-sm">
            📱
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-emerald-400">Mobile Game Terminal</p>
            <p className="text-[10px] text-muted-foreground">Check stats, chat with Pablo AI, and view your business overview from your phone</p>
          </div>
        </a>
      </div>
    </motion.section>
  );
}

export default function Profile() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const { isPro, isOwner, features } = usePlan();
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'memory' | 'contacts' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    apiFetch('/api/account')
      .then(r => r.json())
      .then((d: AccountData) => {
        setData(d);
        setMemoryDraft(d.memory ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const saveMemory = async () => {
    setSavingMemory(true);
    try {
      await apiFetch('/api/account/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: memoryDraft }),
      });
      setData(prev => prev ? { ...prev, memory: memoryDraft } : prev);
      setMemorySaved(true);
      setTimeout(() => setMemorySaved(false), 2500);
    } catch {}
    setSavingMemory(false);
  };

  const deleteData = async (scope: 'memory' | 'contacts' | 'all') => {
    setDeleting(true);
    try {
      const s = scope === 'all' ? '' : scope;
      await apiFetch(`/api/account/data${s ? `?scope=${s}` : ''}`, { method: 'DELETE' });
      setDeleted(scope);
      if (scope === 'memory' || scope === 'all') {
        setMemoryDraft('');
        setData(prev => prev ? { ...prev, memory: '' } : prev);
      }
      if (scope === 'contacts' || scope === 'all') {
        setData(prev => prev ? { ...prev, contactCount: 0 } : prev);
      }
      setTimeout(() => { setDeleted(null); setDeleteTarget(null); }, 2500);
    } catch {}
    setDeleting(false);
  };

  const exportData = () => {
    if (!data) return;
    const exportObj = {
      exportedAt: new Date().toISOString(),
      profile: {
        name: [data.user.firstName, data.user.lastName].filter(Boolean).join(' '),
        email: data.user.email,
        memberSince: data.user.createdAt,
      },
      pabloMemory: data.memory,
      contactCount: data.contactCount,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'salaryman-my-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Sign in to manage your account.</p>
        </div>
      </div>
    );
  }

  const displayName = user?.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : user?.email?.split('@')[0] ?? 'User';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full relative z-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'My Account' : 'My Account'}</h2>
            <p className="text-sm text-muted-foreground">{boomerMode ? 'Manage your profile, memory, and saved data' : 'Manage your profile, memory, and data'}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* Profile Card */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-4">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt={displayName}
                    className="w-16 h-16 rounded-2xl border border-border object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-2xl font-bold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-foreground truncate">{displayName}</p>
                  {user?.email && <p className="text-sm text-muted-foreground truncate">{user.email}</p>}
                  {data?.user.createdAt && (
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      Member since {new Date(data.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <button onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-border hover:border-red-500/20 transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            </motion.section>

            {/* Subscription Status */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPro ? 'bg-amber-500/15 border border-amber-500/25' : 'bg-muted/30 border border-border'}`}>
                  {isPro ? <Zap className="w-4 h-4 text-amber-400" /> : <CreditCard className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {boomerMode ? 'Membership Status' : 'Corporate Clearance Level'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {boomerMode ? 'Your current plan and subscription details' : 'Your Pablo Corp employee classification'}
                  </p>
                </div>
              </div>

              {isOwner ? (
                <div className="flex items-center justify-between bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-sm font-bold text-amber-300">
                        {boomerMode ? 'Corporate Admin' : 'CORP ADMIN — All Modules Unlocked'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {boomerMode ? 'Owner-level access — all features unlocked' : 'Owner implant active — all protocols accessible'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : features.size > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-bold text-amber-300">
                          {boomerMode ? `${features.size} Active Subscription${features.size !== 1 ? 's' : ''}` : `${features.size} MODULE${features.size !== 1 ? 'S' : ''} ACTIVE`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[...features].join(', ').replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://billing.stripe.com/p/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
                    >
                      Manage
                    </a>
                  </div>
                  <button
                    onClick={() => navigate('/upgrade')}
                    className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-muted/15 border border-border text-muted-foreground text-xs font-mono hover:bg-muted/25 transition-colors"
                  >
                    {boomerMode ? 'Add More Tools' : 'Browse Modules'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-muted/15 border border-border rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {boomerMode ? 'Free Plan' : 'Standard Employee — No Modules Active'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {boomerMode ? 'Core features included — subscribe to individual tools for more' : 'Standard-issue modules available — premium modules require activation'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/upgrade')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors shrink-0 ml-3"
                  >
                    <Zap className="w-3 h-3" />
                    {boomerMode ? 'Browse' : 'Modules'}
                  </button>
                </div>
              )}
            </motion.section>

            {/* PABLO Memory */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{boomerMode ? 'My Notes / AI Memory' : 'PABLO Memory'}</p>
                  <p className="text-xs text-muted-foreground">What PABLO knows about you — edit or clear anytime</p>
                </div>
              </div>

              <textarea
                value={memoryDraft}
                onChange={e => setMemoryDraft(e.target.value)}
                placeholder="PABLO hasn't learned anything about you yet. Start a conversation or complete the onboarding."
                rows={6}
                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/40 transition-colors resize-none mb-3"
              />

              <div className="flex items-center justify-between">
                {data?.memoryUpdatedAt && (
                  <p className="text-[11px] text-muted-foreground/40">
                    Last updated {new Date(data.memoryUpdatedAt).toLocaleDateString()}
                  </p>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setDeleteTarget('memory')}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    Clear
                  </button>
                  <button onClick={saveMemory} disabled={savingMemory || memoryDraft === data?.memory}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-40">
                    {savingMemory ? <Loader2 className="w-3 h-3 animate-spin" /> : memorySaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {memorySaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </motion.section>

            {/* Mobile Install */}
            <MobileInstallSection />

            {/* Data Management */}
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Database className="w-4 h-4 text-primary/70" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">My Data</p>
                  <p className="text-xs text-muted-foreground">Export or delete your information anytime</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Stats */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacts</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{data?.contactCount ?? 0}</p>
                  </div>
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Brain className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Memory</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{data?.memory ? data.memory.split('\n').filter(Boolean).length : 0}
                      <span className="text-sm font-normal text-muted-foreground ml-1">lines</span>
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <button onClick={exportData}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left">
                  <Download className="w-4 h-4 text-primary/60" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Export my data</p>
                    <p className="text-xs text-muted-foreground">Download everything as a JSON file</p>
                  </div>
                </button>

                <button onClick={() => setDeleteTarget('contacts')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-border hover:border-red-500/20 hover:bg-red-500/5 transition-colors text-left">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Delete all contacts</p>
                    <p className="text-xs text-muted-foreground">Permanently remove all saved contacts</p>
                  </div>
                </button>

                <button onClick={() => setDeleteTarget('all')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/15 hover:border-red-500/30 hover:bg-red-500/10 transition-colors text-left">
                  <Trash2 className="w-4 h-4 text-red-400/70" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">Delete all my data</p>
                    <p className="text-xs text-muted-foreground">Contacts + PABLO memory — cannot be undone</p>
                  </div>
                </button>
              </div>
            </motion.section>

          </div>
        )}
      </main>

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl"
          >
            {deleted ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">Done — data deleted.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Are you sure?</p>
                    <p className="text-xs text-muted-foreground">
                      {deleteTarget === 'memory' && 'This will clear all of PABLO\'s memory about you.'}
                      {deleteTarget === 'contacts' && 'This will permanently delete all your contacts.'}
                      {deleteTarget === 'all' && 'This will delete your contacts and PABLO memory. Cannot be undone.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => deleteData(deleteTarget)} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50">
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
