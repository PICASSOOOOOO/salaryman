import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useUpload } from '@workspace/object-storage-web';
import { SignInPage } from '@/components/SignInPrompt';
import { AvatarCropModal } from '@/components/AvatarCropModal';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { invalidateCommsSummary } from '@/hooks/use-comms-summary';
import { resolveAvatarUrl } from '@/lib/avatar';
import { Users, UserPlus, Check, X, Loader2, Inbox, Send, Trash2, AtSign, Pencil, ImageIcon } from 'lucide-react';

interface Colleague {
  userId: string;
  name: string;
  email: string | null;
  username?: string | null;
  profileImageUrl?: string | null;
}
interface PendingRequest {
  userId: string;
  name: string;
  email: string | null;
  username?: string | null;
  profileImageUrl?: string | null;
  createdAt: string;
}
interface Coworker {
  userId: string;
  name: string;
  email: string | null;
  username?: string | null;
  profileImageUrl?: string | null;
  relation: 'coworker' | 'colleague';
}

interface UsernameState {
  username: string | null;
  canChangeAt: string | null;
  canChangeNow: boolean;
}

function Avatar({ name, url, size = 30 }: { name: string; url?: string | null; size?: number }) {
  const resolved = resolveAvatarUrl(url);
  if (resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        className="rounded-full object-cover border border-cyan-500/20 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full border border-cyan-500/20 shrink-0 flex items-center justify-center bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 text-cyan-300/70 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name?.trim()?.[0] ?? '?').toUpperCase()}
    </div>
  );
}

function UsernameCard({ onAvatarChange }: { onAvatarChange?: () => void }) {
  const [state, setState] = useState<UsernameState | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUpload({ basePath: `${import.meta.env.BASE_URL}api/storage` });

  const load = useCallback(async () => {
    const r = await apiFetch('/api/account/username');
    if (r.ok) {
      const data = await r.json();
      setState({ username: data.username ?? null, canChangeAt: data.canChangeAt ?? null, canChangeNow: data.canChangeNow ?? true });
      setAvatarUrl(data.profileImageUrl ?? null);
    }
    const acc = await apiFetch('/api/account');
    if (acc.ok) {
      const a = await acc.json();
      const u = a.user ?? {};
      setName([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'You');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const handle = value.trim().replace(/^@+/, '');
    if (!handle) return;
    setSaving(true); setError(null);
    const r = await apiFetch('/api/account/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: handle }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data.error || 'Could not update username');
    } else {
      setState({ username: data.username ?? null, canChangeAt: data.canChangeAt ?? null, canChangeNow: data.canChangeNow ?? false });
      setEditing(false);
    }
    setSaving(false);
  };

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith('image/')) { setAvatarError('Pick an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB'); return; }
    // Hand the raw file to the cropper; we upload only the square-cropped,
    // downscaled result it produces.
    setCropFile(file);
  };

  const uploadAvatar = async (file: File) => {
    setCropFile(null);
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const up = await uploadFile(file);
      if (!up) { setAvatarError('Upload failed'); return; }
      const r = await apiFetch('/api/account/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectPath: up.objectPath }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setAvatarError(data.error || 'Could not save photo'); return; }
      setAvatarUrl(data.profileImageUrl ?? null);
      onAvatarChange?.();
    } catch {
      setAvatarError('Could not upload photo');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removePhoto = async () => {
    setAvatarBusy(true); setAvatarError(null);
    try {
      const r = await apiFetch('/api/account/avatar', { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setAvatarError(data.error || 'Could not remove photo'); return; }
      setAvatarUrl(null);
      onAvatarChange?.();
    } catch {
      setAvatarError('Could not remove photo');
    } finally {
      setAvatarBusy(false);
    }
  };

  const unlockDate = state?.canChangeAt ? new Date(state.canChangeAt).toLocaleDateString() : null;

  return (
    <section className="mb-6 bg-[#0d100d] border border-cyan-500/15 rounded-lg p-4">
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={uploadAvatar}
        />
      )}
      <h2 className="text-xs tracking-widest text-cyan-400/70 mb-3 flex items-center gap-2">
        <AtSign size={14} /> YOUR PROFILE
      </h2>

      <div className="flex items-center gap-3 mb-4">
        <Avatar name={name} url={avatarUrl} size={56} />
        <div className="flex flex-col gap-1.5">
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-wider rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
            >
              {avatarBusy ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
              {avatarUrl ? 'CHANGE PHOTO' : 'ADD PHOTO'}
            </button>
            {avatarUrl && !avatarBusy && (
              <button
                onClick={removePhoto}
                className="px-2.5 py-1 text-[10px] tracking-wider rounded border border-zinc-700 text-zinc-500 hover:text-red-300 hover:border-red-500/40"
              >
                REMOVE
              </button>
            )}
          </div>
          <p className="text-[10px] text-cyan-400/30">Shown next to your @handle. Square images work best.</p>
          {avatarError && <p className="text-[10px] text-red-300">⚠ {avatarError}</p>}
        </div>
      </div>

      {!editing ? (
        <div className="flex items-center gap-3">
          <span className="text-lg text-cyan-200 font-bold">
            {state?.username ? `@${state.username}` : '—'}
          </span>
          <button
            onClick={() => { setEditing(true); setValue(state?.username ?? ''); setError(null); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-wider rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
          >
            <Pencil size={11} /> {state?.username ? 'CHANGE' : 'SET'}
          </button>
          {state && !state.canChangeNow && unlockDate && (
            <span className="text-[10px] text-cyan-400/40">Changeable again on {unlockDate}</span>
          )}
        </div>
      ) : (
        <div>
          <div className="flex gap-2 items-center">
            <span className="text-cyan-400/50">@</span>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="your_handle"
              autoFocus
              className="flex-1 px-3 py-1.5 text-xs tracking-wider bg-[#080b08] border border-cyan-500/15 rounded text-cyan-300 placeholder:text-cyan-400/20 outline-none focus:border-cyan-500/40"
            />
            <button
              onClick={save}
              disabled={saving || !value.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/15 border border-cyan-500/30 rounded hover:bg-cyan-500/25 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              SAVE
            </button>
            <button onClick={() => { setEditing(false); setError(null); }} className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">CANCEL</button>
          </div>
          <p className="text-[10px] text-cyan-400/30 mt-2">
            3–32 chars, start with a letter, lowercase letters/numbers/underscores. Changeable once every 60 days.
          </p>
          {error && <p className="text-[10px] text-red-300 mt-1">⚠ {error}</p>}
        </div>
      )}
    </section>
  );
}

export default function Colleagues({ embedded = false }: { embedded?: boolean } = {}) {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [incoming, setIncoming] = useState<PendingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PendingRequest[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, contacts] = await Promise.all([
        apiFetch('/api/colleagues').then(x => x.ok ? x.json() : { colleagues: [] }),
        apiFetch('/api/colleagues/requests').then(x => x.ok ? x.json() : { incoming: [], outgoing: [] }),
        apiFetch('/api/colleagues/contacts').then(x => x.ok ? x.json() : { contacts: [] }),
      ]);
      setColleagues(c.colleagues ?? []);
      setIncoming(r.incoming ?? []);
      setOutgoing(r.outgoing ?? []);
      setCoworkers(((contacts.contacts ?? []) as Coworker[]).filter(x => x.relation === 'coworker'));
    } catch {
      setError('Failed to load');
    }
    setLoading(false);
  }, []);
  useEffect(() => { if (isAuthenticated) reload(); }, [isAuthenticated, reload]);

  const sendRequest = async () => {
    const input = emailInput.trim();
    if (!input) return;
    setSending(true); setError(null); setInfo(null);
    // Backend accepts either an email or an @username in the same `email` field.
    const r = await apiFetch('/api/colleagues/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data.error || 'Could not send request');
    } else {
      setInfo(data.status === 'accepted' ? 'They had already requested you — now associates.' : 'Request sent.');
      setEmailInput('');
      reload();
    }
    setSending(false);
  };

  const accept = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}/accept`, { method: 'POST' });
    if (!r.ok) setError('Failed to accept');
    setActionId(null); reload();
    invalidateCommsSummary();
  };
  const decline = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}/decline`, { method: 'POST' });
    if (!r.ok) setError('Failed to decline');
    setActionId(null); reload();
    invalidateCommsSummary();
  };
  const remove = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!r.ok) setError('Failed to remove');
    setActionId(null); reload();
  };

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage associates.' : 'Salaryman credentials required.'} />;
  }

  const handleSub = (name: string | undefined | null, username: string | null | undefined, email: string | null, extra?: string) => {
    const parts: string[] = [];
    if (username) parts.push(`@${username}`);
    if (email) parts.push(email);
    if (extra) parts.push(extra);
    return parts.join(' · ') || null;
  };

  const body = (
    <>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyan-400" style={{ fontFamily: "var(--font-sans)" }}>
            <Users className="inline w-5 h-5 mr-2" />
            {boomerMode ? 'ASSOCIATES' : 'ASSOCIATES NETWORK'}
          </h1>
          <p className="text-[10px] tracking-wider text-cyan-400/30 uppercase mt-1">
            COWORKERS ARE AUTOMATIC. ADD ASSOCIATES BY @HANDLE OR EMAIL TO SHARE FILES ACROSS ORGS.
          </p>
        </div>
      )}

      <UsernameCard onAvatarChange={reload} />

      {error && (
        <div className="mb-3 px-3 py-2 text-[11px] tracking-wider bg-red-500/10 border border-red-500/30 rounded text-red-300 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
      {info && (
        <div className="mb-3 px-3 py-2 text-[11px] tracking-wider bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-300 flex items-center justify-between">
          <span>✓ {info}</span>
          <button onClick={() => setInfo(null)}><X size={12} /></button>
        </div>
      )}

      <section className="mb-6 bg-[#0d100d] border border-cyan-500/15 rounded-lg p-4">
        <h2 className="text-xs tracking-widest text-cyan-400/70 mb-3 flex items-center gap-2">
          <UserPlus size={14} /> ADD AN ASSOCIATE
        </h2>
        <div className="flex gap-2">
          <input
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendRequest(); }}
            placeholder="@username or email@example.com"
            className="flex-1 px-3 py-1.5 text-xs tracking-wider bg-[#080b08] border border-cyan-500/15 rounded text-cyan-300 placeholder:text-cyan-400/20 outline-none focus:border-cyan-500/40"
          />
          <button
            onClick={sendRequest}
            disabled={sending || !emailInput.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/15 border border-cyan-500/30 rounded hover:bg-cyan-500/25 disabled:opacity-40"
          >
            {sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
            REQUEST
          </button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-cyan-400/40" size={24}/></div>
      ) : (
        <>
          {incoming.length > 0 && (
            <Section title="INCOMING REQUESTS" icon={<Inbox size={14}/>} count={incoming.length}>
              {incoming.map(p => (
                <Row key={p.userId} name={p.name} avatarUrl={p.profileImageUrl} sub={handleSub(p.name, p.username, p.email)}>
                  <button onClick={() => accept(p.userId)} disabled={actionId === p.userId}
                    className="px-2 py-1 text-[10px] tracking-wider rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                    {actionId === p.userId ? <Loader2 size={12} className="animate-spin"/> : <><Check size={12} className="inline"/> ACCEPT</>}
                  </button>
                  <button onClick={() => decline(p.userId)} disabled={actionId === p.userId}
                    className="px-2 py-1 text-[10px] tracking-wider rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                    <X size={12} className="inline"/> DECLINE
                  </button>
                </Row>
              ))}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title="SENT REQUESTS" icon={<Send size={14}/>} count={outgoing.length}>
              {outgoing.map(p => (
                <Row key={p.userId} name={p.name} avatarUrl={p.profileImageUrl} sub={handleSub(p.name, p.username, p.email, 'awaiting reply')}>
                  <button onClick={() => decline(p.userId)} disabled={actionId === p.userId}
                    className="px-2 py-1 text-[10px] tracking-wider rounded border border-zinc-600 text-zinc-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50">
                    CANCEL
                  </button>
                </Row>
              ))}
            </Section>
          )}

          <Section title={`ASSOCIATES (CROSS-ORG)`} icon={<Users size={14}/>} count={colleagues.length}>
            {colleagues.length === 0 ? (
              <div className="text-[11px] text-cyan-400/30 px-3 py-4 text-center">No associates yet — send a request above.</div>
            ) : colleagues.map(c => (
              <Row key={c.userId} name={c.name} avatarUrl={c.profileImageUrl} sub={handleSub(c.name, c.username, c.email)}>
                <button onClick={() => window.dispatchEvent(new CustomEvent('salaryman:open-dm', { detail: { userId: c.userId } }))}
                  className="px-2 py-1 text-[10px] tracking-wider rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
                  MESSAGE
                </button>
                <button onClick={() => remove(c.userId)} disabled={actionId === c.userId}
                  className="px-2 py-1 text-[10px] tracking-wider rounded border border-zinc-700 text-zinc-500 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50">
                  {actionId === c.userId ? <Loader2 size={12} className="animate-spin"/> : <><Trash2 size={12} className="inline"/> REMOVE</>}
                </button>
              </Row>
            ))}
          </Section>

          <Section title="COWORKERS (SAME ORG · AUTO)" icon={<Users size={14}/>} count={coworkers.length}>
            {coworkers.length === 0 ? (
              <div className="text-[11px] text-cyan-400/30 px-3 py-4 text-center">You're not in an organization, or no other members yet.</div>
            ) : coworkers.map(c => (
              <Row key={c.userId} name={c.name} avatarUrl={c.profileImageUrl} sub={handleSub(c.name, c.username, c.email, 'automatic')}>
                <button onClick={() => window.dispatchEvent(new CustomEvent('salaryman:open-dm', { detail: { userId: c.userId } }))}
                  className="px-2 py-1 text-[10px] tracking-wider rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
                  MESSAGE
                </button>
              </Row>
            ))}
          </Section>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="p-4 max-w-3xl mx-auto w-full">{body}</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0d0a] text-cyan-300 font-mono">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">{body}</div>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6 bg-[#0d100d] border border-cyan-500/15 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-cyan-500/10 flex items-center justify-between">
        <h2 className="text-xs tracking-widest text-cyan-400/70 flex items-center gap-2">{icon} {title}</h2>
        <span className="text-[10px] text-cyan-400/30">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ name, sub, avatarUrl, children }: { name: string; sub?: string | null; avatarUrl?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2 border-b border-cyan-500/5 last:border-b-0">
      <Avatar name={name} url={avatarUrl} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-cyan-200 truncate">{name}</div>
        {sub && <div className="text-[10px] text-cyan-400/30 truncate">{sub}</div>}
      </div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}
