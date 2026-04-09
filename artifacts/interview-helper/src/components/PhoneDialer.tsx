import { useState, useEffect, useRef, useCallback } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import {
  Phone, PhoneOff, X, Clock, Users, Zap, CheckSquare, Square, PhoneCall, Loader2,
  Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, Merge, Plus, Settings,
  MessageSquare, Bot, Mail, BookOpen, Bell, Hash, ChevronDown, ChevronRight,
  Trash2, Check, Building2, Volume2, VolumeX, Radio, Voicemail, Search,
  Calendar, RefreshCw, AlertCircle, LayoutGrid, PhoneIncoming,
} from 'lucide-react';
import {
  formatDuration, formatPhone, ENDED_STATUSES,
  type CRMContact, type ActiveCall, type BatchResult, type CallRecord,
  type VoicemailRecord, type PhoneNumber, type SecretaryConfig, type ConferenceRoom,
} from '@/lib/phone-utils';
import { useTwilioDevice } from '@/lib/useTwilioDevice';

type TabMode = 'contacts' | 'dialer' | 'active' | 'history' | 'voicemail' | 'conference' | 'ai' | 'secretary' | 'numbers' | 'dialing';

export function PhoneDialer({
  userId,
  callerName,
  compact = false,
  onClose,
}: {
  userId: string;
  callerName?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const [tab, setTab] = useState<TabMode>('contacts');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [voicemails, setVoicemails] = useState<VoicemailRecord[]>([]);
  const [unreadVoicemail, setUnreadVoicemail] = useState(0);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [secretaryConfig, setSecretaryConfig] = useState<SecretaryConfig | null>(null);
  const [conferences, setConferences] = useState<ConferenceRoom[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallsRef = useRef<ActiveCall[]>(activeCalls);
  activeCallsRef.current = activeCalls;

  const [dialingMode, setDialingMode] = useState<'power' | 'auto' | 'predictive'>('power');
  const [dialingSession, setDialingSession] = useState<{ id: number; mode: string; total: number; dialed: number } | null>(null);
  const [dialConcurrency, setDialConcurrency] = useState(3);
  const [dialDelay, setDialDelay] = useState(5);

  const [aiTranscript, setAiTranscript] = useState('');
  const [aiCoachQuestion, setAiCoachQuestion] = useState('');
  const [aiCoachResponse, setAiCoachResponse] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [activeDictationCallSid, setActiveDictationCallSid] = useState('');

  const [confRoomName, setConfRoomName] = useState('');
  const [confAddNumber, setConfAddNumber] = useState('');
  const [confAddName, setConfAddName] = useState('');

  const [secretarySaving, setSecretarySaving] = useState(false);
  const [secretaryForm, setSecretaryForm] = useState<Partial<SecretaryConfig>>({});

  const [newNumberForm, setNewNumberForm] = useState({ number: '', label: '', greeting: '', routingMode: 'voicemail' });
  const [addingNumber, setAddingNumber] = useState(false);

  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [followupCallSid, setFollowupCallSid] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState({ title: '', startAt: '', endAt: '' });

  const crt = (opacity: number) => `rgba(56,189,248,${opacity})`;
  const red = (opacity: number) => `rgba(255,40,40,${opacity})`;
  const amber = (opacity: number) => `rgba(255,180,0,${opacity})`;
  const blue = (opacity: number) => `rgba(0,150,255,${opacity})`;
  const purple = (opacity: number) => `rgba(180,0,255,${opacity})`;

  const apiUrl = (path: string) => `${BASE}api/${path}`;
  const { connectToConference } = useTwilioDevice({ BASE });

  const fetchContacts = useCallback(() => {
    fetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contacts) setContacts(d.contacts); })
      .catch(() => {});
  }, [userId, BASE]);

  const fetchHistory = useCallback(() => {
    const q = historySearch ? `?search=${encodeURIComponent(historySearch)}` : '';
    fetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}${q}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.calls) setHistory(d.calls); })
      .catch(() => {});
  }, [userId, BASE, historySearch]);

  const fetchVoicemails = useCallback(() => {
    fetch(apiUrl('twilio/voicemail'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.voicemails) { setVoicemails(d.voicemails); setUnreadVoicemail(d.unread ?? 0); } })
      .catch(() => {});
  }, [BASE]);

  const fetchPhoneNumbers = useCallback(() => {
    fetch(apiUrl('twilio/phone-numbers'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.numbers) setPhoneNumbers(d.numbers); })
      .catch(() => {});
  }, [BASE]);

  const fetchSecretaryConfig = useCallback(() => {
    fetch(apiUrl('twilio/secretary/config'))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.config) {
          setSecretaryConfig(d.config);
          setSecretaryForm(d.config);
        }
      })
      .catch(() => {});
  }, [BASE]);

  const fetchConferences = useCallback(() => {
    fetch(apiUrl('twilio/conference/list'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rooms) setConferences(d.rooms); })
      .catch(() => {});
  }, [BASE]);

  useEffect(() => {
    fetchContacts();
    fetchHistory();
    fetchVoicemails();
    fetchPhoneNumbers();
    fetchSecretaryConfig();
    fetchConferences();
  }, [fetchContacts, fetchHistory, fetchVoicemails, fetchPhoneNumbers, fetchSecretaryConfig, fetchConferences]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (_calls: ActiveCall[]) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveCalls(prev => prev.map(c => ({ ...c, elapsed: Math.floor((Date.now() - c.startTime) / 1000) })));
    }, 1000);
    pollRef.current = setInterval(async () => {
      const current = activeCallsRef.current.filter(c => c.callSid && !ENDED_STATUSES.includes(c.status));
      if (current.length === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        fetchHistory();
        return;
      }
      try {
        const callSids = current.map(c => c.callSid);
        const r = await fetch(apiUrl('twilio/call-status-batch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSids }),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.statuses) {
          setActiveCalls(prev => prev.map(ac => {
            const found = d.statuses.find((s: { callSid: string; status?: string }) => s.callSid === ac.callSid);
            return found?.status ? { ...ac, status: found.status } : ac;
          }));
        }
      } catch (e) { console.error("[CalllHome] poll error:", e); }
    }, 3000);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filtered = filteredContacts();
    if (selected.size === filtered.length) { setSelected(new Set()); }
    else { setSelected(new Set(filtered.map(c => c.id))); }
  };

  const filteredContacts = () => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q) ||
      c.email.toLowerCase().includes(q) || c.hometown.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q)
    );
  };

  const blastSelected = async () => {
    if (selected.size === 0 || blasting) return;
    setBlasting(true);
    setError('');
    const numbers = contacts.filter(c => selected.has(c.id)).map(c => ({ phone: c.phone, name: c.name }));
    try {
      const r = await fetch(apiUrl('twilio/batch-call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers, userId, callerName }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Batch call failed'); setBlasting(false); return; }
      const batchCalls = d.calls as (BatchResult & { conferenceName?: string })[];
      const newCalls: ActiveCall[] = batchCalls
        .filter((c) => c.ok && c.callSid)
        .map((c) => ({ callSid: c.callSid!, phone: c.phone, name: c.name || '', status: c.status || 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: c.conferenceName }));
      const failCount = batchCalls.filter((c) => !c.ok).length;
      if (failCount > 0) setError(`${failCount} call(s) failed to initiate`);
      if (newCalls.length > 0) {
        setActiveCalls(prev => [...prev, ...newCalls]);
        startPolling(newCalls);
        const firstConf = batchCalls.find(c => c.ok && c.conferenceName)?.conferenceName;
        if (firstConf) {
          connectToConference(firstConf).catch(err => {
            console.warn('[CalllHome] browser device connect failed:', err instanceof Error ? err.message : err);
          });
        }
        setTab('active');
      }
      setSelected(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setBlasting(false);
  };

  const callSingle = async (phone: string, name?: string, contactId?: number) => {
    setError('');
    setLoading(true);
    try {
      const r = await fetch(apiUrl('twilio/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Call failed'); setLoading(false); return; }
      const newCall: ActiveCall = { callSid: d.callSid, phone: d.to || phone, name: name || '', status: d.status || 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: d.conferenceName };
      setActiveCalls(prev => [...prev, newCall]);
      startPolling([newCall]);
      if (d.conferenceName) {
        connectToConference(d.conferenceName).catch(err => {
          console.warn('[CalllHome] browser device connect failed:', err instanceof Error ? err.message : err);
        });
      }
      setTab('active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  };

  const toggleMute = async (sid: string, currentMuted: boolean) => {
    try {
      await fetch(apiUrl(`twilio/call/${sid}/mute`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: !currentMuted }),
      });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, muted: !currentMuted } : c));
    } catch (e) { console.error("[CalllHome] mute error:", e); }
  };

  const toggleHold = async (sid: string, currentHold: boolean) => {
    try {
      await fetch(apiUrl(`twilio/call/${sid}/hold`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold: !currentHold }),
      });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, onHold: !currentHold } : c));
    } catch (e) { console.error("[CalllHome] hold error:", e); }
  };

  const transferCall = async (sid: string) => {
    if (!transferNumber.trim()) return;
    try {
      await fetch(apiUrl(`twilio/call/${sid}/transfer`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferTo: transferNumber }),
      });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'transferred' } : c));
      setTransferTarget(null);
      setTransferNumber('');
    } catch (e) { console.error("[CalllHome] transfer error:", e); }
  };

  const hangupOne = async (sid: string) => {
    try {
      await fetch(apiUrl(`twilio/hangup/${sid}`), { method: 'POST' });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'completed' } : c));
    } catch (e) { console.error("[CalllHome] hangup error:", e); }
  };

  const hangupAll = async () => {
    const sids = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).map(c => c.callSid);
    if (sids.length === 0) return;
    try {
      await fetch(apiUrl('twilio/hangup-all'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSids: sids }),
      });
      setActiveCalls(prev => prev.map(c => ({ ...c, status: 'completed' })));
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      fetchHistory();
    } catch (e) { console.error("[CalllHome] hangup-all error:", e); }
  };

  const createConference = async () => {
    try {
      const r = await fetch(apiUrl('twilio/conference/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: confRoomName || 'New Conference' }),
      });
      if (r.ok) { fetchConferences(); setConfRoomName(''); }
    } catch (e) { console.error("[CalllHome] create conference error:", e); }
  };

  const addToConference = async (roomName: string) => {
    if (!confAddNumber) return;
    try {
      await fetch(apiUrl(`twilio/conference/${roomName}/add`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: confAddNumber, name: confAddName }),
      });
      setConfAddNumber(''); setConfAddName('');
    } catch (e) { console.error("[CalllHome] add to conference error:", e); }
  };

  const endConference = async (roomName: string) => {
    try {
      await fetch(apiUrl(`twilio/conference/${roomName}/end`), { method: 'POST' });
      fetchConferences();
    } catch (e) { console.error("[CalllHome] end conference error:", e); }
  };

  const startDialingSession = async () => {
    const selectedContacts = contacts.filter(c => selected.has(c.id));
    if (selectedContacts.length === 0) { setError('Select contacts first'); return; }
    try {
      const r = await fetch(apiUrl('twilio/dialing/start'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: dialingMode, numbers: selectedContacts.map(c => ({ phone: c.phone, name: c.name })), settings: dialingMode === 'predictive' ? { concurrency: dialConcurrency } : { delayBetweenCalls: dialDelay } }),
      });
      const d = await r.json();
      if (r.ok) {
        const dialCalls = d.calls as (BatchResult & { conferenceName?: string })[];
        setDialingSession({ id: d.sessionId, mode: d.mode, total: selectedContacts.length, dialed: dialCalls.filter((c) => c.ok).length });
        const newCalls: ActiveCall[] = dialCalls.filter((c) => c.ok).map((c) => ({ callSid: c.callSid ?? '', phone: c.phone, name: c.name || '', status: 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: c.conferenceName }));
        if (newCalls.length > 0) { setActiveCalls(prev => [...prev, ...newCalls]); startPolling(newCalls); }
        setTab('active');
        setSelected(new Set());
      } else {
        setError(d.error || 'Failed to start dialing session');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dialing failed');
    }
  };

  const stopDialingSession = async () => {
    if (!dialingSession) return;
    try {
      await fetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST' });
      setDialingSession(null);
    } catch (e) { console.error("[CalllHome] stop dialing error:", e); }
  };

  const askAICoach = async () => {
    if (!aiCoachQuestion.trim()) return;
    setAiLoading(true);
    try {
      const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
      const r = await fetch(apiUrl('twilio/ai/coach'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiCoachQuestion, transcript: aiTranscript, context: liveCall?.name }),
      });
      const d = await r.json();
      if (r.ok) { setAiCoachResponse(d.response); setAiCoachQuestion(''); }
    } catch (e) { console.error("[CalllHome] AI coach error:", e); }
    setAiLoading(false);
  };

  const getAISuggestions = async () => {
    setAiLoading(true);
    try {
      const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
      const r = await fetch(apiUrl('twilio/ai/suggest'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: aiTranscript, contactName: liveCall?.name }),
      });
      const d = await r.json();
      if (r.ok) setAiSuggestions(d.suggestions);
    } catch (e) { console.error("[CalllHome] AI suggestions error:", e); }
    setAiLoading(false);
  };

  const saveTranscript = async (callSid: string) => {
    if (!aiTranscript.trim()) return;
    try {
      await fetch(apiUrl('twilio/ai/transcribe'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid, transcript: aiTranscript }),
      });
    } catch (e) { console.error("[CalllHome] save transcript error:", e); }
  };

  const saveDictation = async () => {
    if (!dictationText.trim()) return;
    try {
      await fetch(apiUrl('twilio/ai/dictation'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dictationText, callSid: activeDictationCallSid || undefined }),
      });
      setDictationText('');
    } catch (e) { console.error("[CalllHome] save dictation error:", e); }
  };

  const saveSecretaryConfig = async () => {
    setSecretarySaving(true);
    try {
      const r = await fetch(apiUrl('twilio/secretary/config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secretaryForm),
      });
      const d = await r.json();
      if (r.ok) { setSecretaryConfig(d.config); setSecretaryForm(d.config); }
    } catch (e) { console.error("[CalllHome] save secretary config error:", e); }
    setSecretarySaving(false);
  };

  const addPhoneNumber = async () => {
    if (!newNumberForm.number) return;
    setAddingNumber(true);
    try {
      const r = await fetch(apiUrl('twilio/phone-numbers'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNumberForm),
      });
      if (r.ok) { fetchPhoneNumbers(); setNewNumberForm({ number: '', label: '', greeting: '', routingMode: 'voicemail' }); }
    } catch (e) { console.error("[CalllHome] add phone number error:", e); }
    setAddingNumber(false);
  };

  const deletePhoneNumber = async (id: number) => {
    try {
      await fetch(apiUrl(`twilio/phone-numbers/${id}`), { method: 'DELETE' });
      fetchPhoneNumbers();
    } catch (e) { console.error("[CalllHome] delete phone number error:", e); }
  };

  const markVoicemailRead = async (id: number) => {
    try {
      await fetch(apiUrl(`twilio/voicemail/${id}/read`), { method: 'POST' });
      setVoicemails(prev => prev.map(v => v.id === id ? { ...v, isRead: true } : v));
      setUnreadVoicemail(prev => Math.max(0, prev - 1));
    } catch (e) { console.error("[CalllHome] mark voicemail read error:", e); }
  };

  const deleteVoicemail = async (id: number) => {
    try {
      await fetch(apiUrl(`twilio/voicemail/${id}`), { method: 'DELETE' });
      setVoicemails(prev => prev.filter(v => v.id !== id));
    } catch (e) { console.error("[CalllHome] delete voicemail error:", e); }
  };

  const scheduleFollowup = async () => {
    if (!followupCallSid || !followupForm.title || !followupForm.startAt) return;
    try {
      const startAt = new Date(followupForm.startAt);
      const endAt = followupForm.endAt ? new Date(followupForm.endAt) : new Date(startAt.getTime() + 30 * 60 * 1000);
      await fetch(apiUrl(`twilio/call/${followupCallSid}/schedule-followup`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: followupForm.title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      setFollowupCallSid(null);
      setFollowupForm({ title: '', startAt: '', endAt: '' });
      fetchHistory();
    } catch (e) { console.error("[CalllHome] schedule followup error:", e); }
  };

  const emailCallSummary = async (callId: number) => {
    try {
      await fetch(apiUrl(`twilio/history/${callId}/email-summary`), { method: 'POST' });
    } catch (e) { console.error("[CalllHome] email summary error:", e); }
  };

  const liveCount = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).length;
  const filtered = filteredContacts();

  const inputStyle = {
    background: 'rgba(0,20,0,0.8)', border: `1px solid ${crt(0.2)}`,
    color: crt(0.9), padding: '5px 8px', fontSize: '0.55rem',
    ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), outline: 'none',
  };

  const btnStyle = (color: (o: number) => string, active?: boolean) => ({
    background: color(active ? 0.2 : 0.08), border: `1px solid ${color(0.3)}`,
    color: color(0.8), cursor: 'pointer', padding: '4px 8px', fontSize: '0.45rem',
    ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), letterSpacing: '0.08em',
    display: 'flex', alignItems: 'center', gap: 3,
  });

  const sectionHeader = (label: string) => (
    <div style={{ padding: '4px 10px', fontSize: '0.45rem', color: crt(0.3), letterSpacing: '0.15em', borderBottom: `1px solid ${crt(0.08)}`, background: crt(0.02) }}>
      {label}
    </div>
  );

  const tabs: { key: TabMode; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'contacts', label: 'CONTACTS', icon: <Users size={9} />, badge: contacts.length },
    { key: 'dialer', label: 'DIAL', icon: <PhoneCall size={9} /> },
    { key: 'active', label: 'LIVE', icon: <Zap size={9} />, badge: liveCount },
    { key: 'history', label: 'LOG', icon: <Clock size={9} /> },
    { key: 'voicemail', label: 'VM', icon: <Voicemail size={9} />, badge: unreadVoicemail },
    { key: 'conference', label: 'CONF', icon: <Users size={9} /> },
    { key: 'dialing', label: 'AUTO', icon: <Radio size={9} /> },
    { key: 'ai', label: 'AI', icon: <Bot size={9} /> },
    { key: 'secretary', label: 'SEC', icon: <Settings size={9} /> },
    { key: 'numbers', label: 'NUMS', icon: <Hash size={9} /> },
  ];

  return (
    <div style={{
      background: 'rgba(0,8,0,0.97)', border: `1px solid ${crt(0.3)}`,
      boxShadow: `0 0 30px ${crt(0.1)}, inset 0 0 30px rgba(0,0,0,0.5)`,
      ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
      width: compact ? '340px' : '400px', maxHeight: '600px',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 6, right: 6, color: crt(0.4), background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}>
          <X size={14} />
        </button>
      )}

      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${crt(0.15)}`, background: 'rgba(0,4,0,0.8)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/brand/callhome/calll-home-brush.png" alt="CALLL HOME" style={{ height: 28, width: 'auto', opacity: 0.9, filter: 'brightness(1.4) saturate(0)' }} />
        <span style={{ fontSize: '0.4rem', color: crt(0.25), marginLeft: 'auto', letterSpacing: '0.08em' }}>ALPHA {__BUILD_VERSION__}</span>
      </div>

      {error && (
        <div style={{ padding: '5px 12px', fontSize: '0.5rem', color: red(0.9), background: red(0.05), borderBottom: `1px solid ${red(0.15)}`, letterSpacing: '0.08em' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: red(0.5), cursor: 'pointer', fontSize: '0.45rem' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: `1px solid ${crt(0.1)}`, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: '0 0 auto', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 3,
            background: tab === t.key ? crt(0.08) : 'transparent',
            border: 'none', borderBottom: tab === t.key ? `2px solid ${crt(0.6)}` : '2px solid transparent',
            color: tab === t.key ? crt(0.9) : crt(0.3), cursor: 'pointer',
            fontSize: '0.42rem', letterSpacing: '0.08em', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), position: 'relative',
          }}>
            {t.icon}{t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span style={{ background: t.key === 'voicemail' ? amber(0.8) : red(0.8), color: '#fff', fontSize: '0.38rem', padding: '1px 3px', borderRadius: 4, minWidth: 12, textAlign: 'center' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>

        {tab === 'contacts' && (
          <div>
            <div style={{ padding: '6px 8px', display: 'flex', gap: 4, borderBottom: `1px solid ${crt(0.08)}` }}>
              <input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={selectAll} style={btnStyle(crt)}>
                {selected.size === filtered.length && filtered.length > 0 ? 'NONE' : 'ALL'}
              </button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: '0.5rem', color: crt(0.25) }}>
                {contacts.length === 0 ? 'NO CONTACTS WITH PHONE NUMBERS' : 'NO MATCHES'}
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {filtered.map(c => (
                  <div key={c.id} style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${crt(0.05)}`, cursor: 'pointer', background: selected.has(c.id) ? crt(0.06) : 'transparent' }} onClick={() => toggleSelect(c.id)}>
                    <div style={{ color: selected.has(c.id) ? crt(0.8) : crt(0.2), flexShrink: 0 }}>
                      {selected.has(c.id) ? <CheckSquare size={12} /> : <Square size={12} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.55rem', color: crt(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.42rem', color: crt(0.35) }}>{formatPhone(c.phone)}{c.company ? ` · ${c.company}` : ''}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); callSingle(c.phone, c.name, c.id); }} style={{ background: crt(0.08), border: `1px solid ${crt(0.25)}`, color: crt(0.6), cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center', flexShrink: 0 }} title={`Call ${c.name}`}>
                      <Phone size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selected.size > 0 && (
              <div style={{ padding: '6px 8px', borderTop: `1px solid ${crt(0.15)}`, background: crt(0.04), display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.5rem', color: crt(0.6), flex: 1 }}>{selected.size} SELECTED</span>
                <button onClick={blastSelected} disabled={blasting} style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, background: blasting ? amber(0.15) : 'rgba(0,200,50,0.15)', border: `1px solid ${blasting ? amber(0.5) : 'rgba(0,200,50,0.5)'}`, color: blasting ? amber(0.9) : crt(0.95), cursor: blasting ? 'wait' : 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>
                  {blasting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                  {blasting ? 'DIALING...' : `BLAST ${selected.size}`}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'dialer' && (
          <div style={{ padding: '10px' }}>
            <div style={{ background: 'rgba(0,20,0,0.8)', border: `1px solid ${crt(0.2)}`, padding: '8px 10px', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
              <input value={manualNumber} onChange={e => setManualNumber(e.target.value)} placeholder="Enter phone number..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: crt(0.9), fontSize: '0.9rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), outline: 'none', letterSpacing: '0.05em' }}
                onKeyDown={e => { if (e.key === 'Enter' && manualNumber.trim()) callSingle(manualNumber); }}
              />
              {manualNumber && <button onClick={() => setManualNumber('')} style={{ background: 'none', border: 'none', color: crt(0.3), cursor: 'pointer' }}><X size={12} /></button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 8 }}>
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(key => (
                <button key={key} onClick={() => setManualNumber(prev => prev + key)} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: crt(0.04), border: `1px solid ${crt(0.15)}`, color: crt(0.8), cursor: 'pointer', fontSize: '0.9rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>
                  {key}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setManualNumber(prev => prev.slice(0, -1))} disabled={!manualNumber} style={{ flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: crt(0.04), border: `1px solid ${crt(0.15)}`, color: manualNumber ? crt(0.6) : crt(0.15), cursor: manualNumber ? 'pointer' : 'default', fontSize: '0.55rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>DEL</button>
              <button onClick={() => { if (manualNumber.trim()) callSingle(manualNumber); }} disabled={!manualNumber.trim() || loading} style={{ flex: 2, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: manualNumber ? 'rgba(0,200,50,0.15)' : crt(0.04), border: `1px solid ${manualNumber ? 'rgba(0,200,50,0.5)' : crt(0.15)}`, color: manualNumber ? crt(0.95) : crt(0.2), cursor: manualNumber ? 'pointer' : 'default', fontSize: '0.6rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), letterSpacing: '0.1em' }}>
                <Phone size={12} />{loading ? 'CALLING...' : 'CALL'}
              </button>
            </div>
          </div>
        )}

        {tab === 'active' && (
          <div>
            {activeCalls.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: crt(0.2), letterSpacing: '0.1em' }}>NO ACTIVE CALLS</div>
            ) : (
              <>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {activeCalls.map((c, i) => {
                    const ended = ENDED_STATUSES.includes(c.status);
                    const showTransfer = transferTarget === c.callSid;
                    return (
                      <div key={c.callSid || i} style={{ borderBottom: `1px solid ${crt(0.06)}`, opacity: ended ? 0.45 : 1 }}>
                        <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: ended ? crt(0.2) : c.status === 'ringing' ? amber(0.8) : c.status === 'in-progress' ? crt(0.8) : crt(0.4), boxShadow: ended ? 'none' : `0 0 5px ${c.status === 'ringing' ? amber(0.5) : crt(0.4)}` }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.55rem', color: crt(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || formatPhone(c.phone)}</div>
                            <div style={{ fontSize: '0.4rem', color: crt(0.35) }}>{formatPhone(c.phone)} · {c.status.toUpperCase()} · {formatDuration(c.elapsed)}</div>
                          </div>
                          {!ended && (
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button onClick={() => toggleMute(c.callSid, !!c.muted)} style={{ ...btnStyle(c.muted ? amber : crt), padding: '2px 4px' }} title={c.muted ? 'Unmute' : 'Mute'}>
                                {c.muted ? <MicOff size={8} /> : <Mic size={8} />}
                              </button>
                              <button onClick={() => toggleHold(c.callSid, !!c.onHold)} style={{ ...btnStyle(c.onHold ? amber : crt), padding: '2px 4px' }} title={c.onHold ? 'Resume' : 'Hold'}>
                                {c.onHold ? <PlayCircle size={8} /> : <PauseCircle size={8} />}
                              </button>
                              <button onClick={() => setTransferTarget(showTransfer ? null : c.callSid)} style={{ ...btnStyle(blue), padding: '2px 4px' }} title="Transfer">
                                <ArrowRightLeft size={8} />
                              </button>
                              <button onClick={() => hangupOne(c.callSid)} style={{ background: red(0.15), border: `1px solid ${red(0.4)}`, color: red(0.9), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                                <PhoneOff size={8} />
                              </button>
                            </div>
                          )}
                        </div>
                        {showTransfer && (
                          <div style={{ padding: '4px 8px 6px', display: 'flex', gap: 4, background: blue(0.04), borderTop: `1px solid ${blue(0.1)}` }}>
                            <input value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Transfer to number..." style={{ ...inputStyle, flex: 1 }} />
                            <button onClick={() => transferCall(c.callSid)} style={{ ...btnStyle(blue), padding: '4px 8px' }}>TRANSFER</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {liveCount > 0 && (
                  <div style={{ padding: '6px 8px', borderTop: `1px solid ${crt(0.15)}` }}>
                    <button onClick={hangupAll} style={{ width: '100%', padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: red(0.15), border: `1px solid ${red(0.4)}`, color: red(0.9), cursor: 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), fontWeight: 'bold' }}>
                      <PhoneOff size={10} />HANG UP ALL ({liveCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            <div style={{ padding: '6px 8px', borderBottom: `1px solid ${crt(0.08)}`, display: 'flex', gap: 4 }}>
              <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search transcripts..." style={{ ...inputStyle, flex: 1 }} onKeyDown={e => e.key === 'Enter' && fetchHistory()} />
              <button onClick={fetchHistory} style={btnStyle(crt)}><Search size={10} /></button>
            </div>
            {history.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: crt(0.2), letterSpacing: '0.1em' }}>NO CALL HISTORY</div>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {history.map(h => (
                  <div key={h.id} style={{ borderBottom: `1px solid ${crt(0.05)}` }}>
                    <div onClick={() => setExpandedCall(expandedCall === h.id ? null : h.id)} style={{ cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.55rem', color: crt(0.7) }}>{h.callerName || formatPhone(h.recipientNumber)}</div>
                        <div style={{ fontSize: '0.4rem', color: crt(0.3) }}>
                          {formatPhone(h.recipientNumber)} · {h.status}
                          {h.durationSeconds ? ` · ${formatDuration(h.durationSeconds)}` : ''}
                          {' · '}{new Date(h.startedAt).toLocaleDateString()}
                          {h.direction === 'inbound' && <span style={{ color: blue(0.7), marginLeft: 4 }}>↙</span>}
                          {h.callType && h.callType !== 'single' && <span style={{ color: amber(0.6), marginLeft: 4 }}>[{h.callType}]</span>}
                        </div>
                        {h.summary && <div style={{ fontSize: '0.4rem', color: crt(0.5), marginTop: 2, fontStyle: 'italic' }}>{h.summary.slice(0, 80)}…</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); callSingle(h.recipientNumber, h.callerName || undefined); }} style={{ background: crt(0.06), border: `1px solid ${crt(0.2)}`, color: crt(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                          <Phone size={9} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setFollowupCallSid(h.twilioCallSid ?? null); }} style={{ background: crt(0.06), border: `1px solid ${crt(0.2)}`, color: crt(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Schedule follow-up">
                          <Calendar size={9} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); emailCallSummary(h.id); }} style={{ background: crt(0.06), border: `1px solid ${crt(0.2)}`, color: crt(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Email summary">
                          <Mail size={9} />
                        </button>
                      </div>
                    </div>
                    {expandedCall === h.id && (h.transcript || h.notes || h.summary) && (
                      <div style={{ padding: '4px 10px 8px', background: crt(0.02), borderTop: `1px solid ${crt(0.06)}` }}>
                        {h.summary && <div style={{ marginBottom: 4 }}><span style={{ fontSize: '0.38rem', color: crt(0.3), letterSpacing: '0.1em' }}>SUMMARY </span><span style={{ fontSize: '0.45rem', color: crt(0.6) }}>{h.summary}</span></div>}
                        {h.transcript && <div style={{ marginBottom: 4 }}><span style={{ fontSize: '0.38rem', color: crt(0.3), letterSpacing: '0.1em' }}>TRANSCRIPT </span><div style={{ fontSize: '0.42rem', color: crt(0.5), maxHeight: 80, overflowY: 'auto', marginTop: 2, whiteSpace: 'pre-wrap' }}>{h.transcript}</div></div>}
                        {h.notes && <div><span style={{ fontSize: '0.38rem', color: crt(0.3), letterSpacing: '0.1em' }}>NOTES </span><span style={{ fontSize: '0.42rem', color: crt(0.5) }}>{h.notes}</span></div>}
                      </div>
                    )}
                    {followupCallSid && followupCallSid === (h.twilioCallSid ?? '') && (
                      <div style={{ padding: '6px 8px', background: crt(0.03), borderTop: `1px solid ${crt(0.08)}` }}>
                        {sectionHeader('SCHEDULE FOLLOW-UP')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                          <input value={followupForm.title} onChange={e => setFollowupForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow-up title..." style={{ ...inputStyle, width: '100%' }} />
                          <input type="datetime-local" value={followupForm.startAt} onChange={e => setFollowupForm(f => ({ ...f, startAt: e.target.value }))} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={scheduleFollowup} disabled={!followupForm.title || !followupForm.startAt} style={{ flex: 1, padding: '4px', background: crt(0.1), border: `1px solid ${crt(0.3)}`, color: crt(0.8), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>SCHEDULE</button>
                            <button onClick={() => setFollowupCallSid(null)} style={{ padding: '4px 8px', background: red(0.06), border: `1px solid ${red(0.2)}`, color: red(0.6), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>CANCEL</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'voicemail' && (
          <div>
            {sectionHeader(`VOICEMAIL INBOX · ${unreadVoicemail} UNREAD`)}
            {voicemails.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: crt(0.2) }}>NO VOICEMAILS</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {voicemails.map(v => (
                  <div key={v.id} style={{ padding: '6px 8px', borderBottom: `1px solid ${crt(0.05)}`, background: !v.isRead ? crt(0.03) : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: !v.isRead ? amber(0.8) : crt(0.15), flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.55rem', color: crt(0.8) }}>{v.fromName || formatPhone(v.fromNumber)}</div>
                        <div style={{ fontSize: '0.4rem', color: crt(0.3) }}>
                          {formatPhone(v.fromNumber)} · {v.durationSeconds ?? 0}s · {new Date(v.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {!v.isRead && <button onClick={() => markVoicemailRead(v.id)} style={{ ...btnStyle(crt), padding: '2px 4px' }} title="Mark read"><Check size={9} /></button>}
                        <button onClick={() => callSingle(v.fromNumber, v.fromName || undefined)} style={{ ...btnStyle(crt), padding: '2px 4px' }} title="Call back"><Phone size={9} /></button>
                        <button onClick={() => deleteVoicemail(v.id)} style={{ background: red(0.06), border: `1px solid ${red(0.2)}`, color: red(0.6), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Delete"><Trash2 size={9} /></button>
                      </div>
                    </div>
                    {v.recordingUrl && (
                      <audio controls src={v.recordingUrl} style={{ width: '100%', height: 28, marginTop: 4, filter: 'invert(1) hue-rotate(90deg) brightness(0.7)' }} />
                    )}
                    {v.summary && <div style={{ marginTop: 3, fontSize: '0.42rem', color: crt(0.5), fontStyle: 'italic' }}>{v.summary}</div>}
                    {v.transcript && <div style={{ marginTop: 2, fontSize: '0.4rem', color: crt(0.35) }}>{v.transcript.slice(0, 100)}{v.transcript.length > 100 ? '...' : ''}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'conference' && (
          <div>
            {sectionHeader('CONFERENCE BRIDGE')}
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <input value={confRoomName} onChange={e => setConfRoomName(e.target.value)} placeholder="Room name (optional)..." style={{ ...inputStyle, flex: 1 }} />
                <button onClick={createConference} style={{ ...btnStyle(crt), padding: '5px 10px' }}><Plus size={10} />NEW</button>
              </div>
              {conferences.length === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', fontSize: '0.45rem', color: crt(0.2) }}>NO ACTIVE CONFERENCES</div>
              ) : (
                <div>
                  {conferences.map(conf => (
                    <div key={conf.id} style={{ border: `1px solid ${crt(0.15)}`, marginBottom: 8, background: crt(0.03) }}>
                      <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${crt(0.1)}` }}>
                        <Users size={10} style={{ color: crt(0.6) }} />
                        <span style={{ fontSize: '0.5rem', color: crt(0.8), flex: 1 }}>{conf.roomName}</span>
                        <button onClick={() => endConference(conf.roomName)} style={{ background: red(0.1), border: `1px solid ${red(0.3)}`, color: red(0.7), cursor: 'pointer', padding: '2px 6px', fontSize: '0.4rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>END</button>
                      </div>
                      <div style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          <input value={confAddNumber} onChange={e => setConfAddNumber(e.target.value)} placeholder="Add participant number..." style={{ ...inputStyle, flex: 2 }} />
                          <input value={confAddName} onChange={e => setConfAddName(e.target.value)} placeholder="Name..." style={{ ...inputStyle, flex: 1 }} />
                          <button onClick={() => addToConference(conf.roomName)} style={{ ...btnStyle(crt), padding: '4px 6px' }}><Phone size={9} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sectionHeader('MERGE ACTIVE CALLS')}
            <div style={{ padding: '8px' }}>
              {liveCount < 2 ? (
                <div style={{ fontSize: '0.45rem', color: crt(0.2) }}>Need 2+ active calls to merge</div>
              ) : (
                <div style={{ fontSize: '0.45rem', color: crt(0.5) }}>
                  {liveCount} active calls — use Transfer to merge into conference room
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'dialing' && (
          <div>
            {sectionHeader('DIALING MODES')}
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
                {(['power', 'auto', 'predictive'] as const).map(mode => (
                  <button key={mode} onClick={() => setDialingMode(mode)} style={{ padding: '8px 4px', textAlign: 'center', background: dialingMode === mode ? crt(0.12) : crt(0.04), border: `1px solid ${dialingMode === mode ? crt(0.5) : crt(0.15)}`, color: dialingMode === mode ? crt(0.9) : crt(0.4), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), letterSpacing: '0.08em' }}>
                    <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>{mode === 'power' ? '⚡' : mode === 'auto' ? '🤖' : '🎯'}</div>
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ border: `1px solid ${crt(0.12)}`, padding: '8px', marginBottom: 8, background: crt(0.02) }}>
                {dialingMode === 'power' && <div style={{ fontSize: '0.45rem', color: crt(0.5) }}>POWER DIALING: Calls the next number automatically when agent is free. One call at a time.</div>}
                {dialingMode === 'auto' && <div style={{ fontSize: '0.45rem', color: crt(0.5) }}>AUTO DIALING: Plays recorded message on answer, then connects agent. Hands-free outreach.</div>}
                {dialingMode === 'predictive' && <div style={{ fontSize: '0.45rem', color: crt(0.5) }}>PREDICTIVE DIALING: Dials multiple numbers simultaneously using answer-rate prediction to minimize idle time.</div>}
              </div>

              <div style={{ border: `1px solid ${crt(0.2)}`, padding: '8px', marginBottom: 8, background: crt(0.03) }}>
                <div style={{ fontSize: '0.42rem', color: crt(0.7), letterSpacing: '0.1em', marginBottom: 6, borderBottom: `1px solid ${crt(0.12)}`, paddingBottom: 4 }}>⚙ SPEED CONTROL</div>
                {dialingMode === 'predictive' ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', color: crt(0.5) }}>SIMULTANEOUS LINES</span>
                      <span style={{ fontSize: '0.5rem', color: crt(0.9), ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), minWidth: 16, textAlign: 'right' }}>{dialConcurrency}</span>
                    </div>
                    <input type="range" min={2} max={5} step={1} value={dialConcurrency} onChange={e => setDialConcurrency(Number(e.target.value))} style={{ width: '100%', accentColor: crt(0.7), cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: crt(0.35), marginTop: 2 }}>
                      <span>2 LINES</span><span>5 LINES</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', color: crt(0.5) }}>DELAY BETWEEN CALLS</span>
                      <span style={{ fontSize: '0.5rem', color: crt(0.9), ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), minWidth: 24, textAlign: 'right' }}>{dialDelay}s</span>
                    </div>
                    <input type="range" min={0} max={30} step={1} value={dialDelay} onChange={e => setDialDelay(Number(e.target.value))} style={{ width: '100%', accentColor: crt(0.7), cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: crt(0.35), marginTop: 2 }}>
                      <span>0s (MAX SPEED)</span><span>30s</span>
                    </div>
                  </div>
                )}
              </div>

              {dialingSession ? (
                <div style={{ border: `1px solid ${amber(0.3)}`, padding: '8px', background: amber(0.05) }}>
                  <div style={{ fontSize: '0.5rem', color: amber(0.8), marginBottom: 4 }}>SESSION ACTIVE: {dialingSession.mode.toUpperCase()}</div>
                  <div style={{ fontSize: '0.42rem', color: amber(0.6) }}>
                    Progress: {dialingSession.dialed}/{dialingSession.total} dialed
                  </div>
                  <button onClick={stopDialingSession} style={{ marginTop: 6, padding: '5px 12px', background: red(0.15), border: `1px solid ${red(0.4)}`, color: red(0.8), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>STOP SESSION</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.45rem', color: crt(0.4), marginBottom: 6 }}>Select contacts from CONTACTS tab, then GO ACTIVE:</div>
                  <div style={{ fontSize: '0.45rem', color: crt(0.6), marginBottom: 8 }}>{selected.size} contacts selected</div>
                  <button onClick={startDialingSession} disabled={selected.size === 0} style={{ width: '100%', padding: '8px', background: selected.size > 0 ? crt(0.1) : crt(0.04), border: `1px solid ${selected.size > 0 ? crt(0.4) : crt(0.1)}`, color: selected.size > 0 ? crt(0.9) : crt(0.2), cursor: selected.size > 0 ? 'pointer' : 'default', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Radio size={11} />START {dialingMode.toUpperCase()} DIALING ({selected.size})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div>
            {sectionHeader('AI CALL ASSISTANT')}
            <div style={{ padding: '8px' }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.45rem', color: crt(0.4), marginBottom: 3 }}>LIVE TRANSCRIPT (paste or type)</div>
                <textarea
                  value={aiTranscript}
                  onChange={e => setAiTranscript(e.target.value)}
                  placeholder="Paste transcript or type notes..."
                  style={{ ...inputStyle, width: '100%', height: 70, resize: 'none', display: 'block' }}
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button onClick={getAISuggestions} disabled={aiLoading} style={{ flex: 1, ...btnStyle(crt), justifyContent: 'center' }}>
                    {aiLoading ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}SUGGESTIONS
                  </button>
                  <button onClick={() => {
                    const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
                    if (liveCall) saveTranscript(liveCall.callSid);
                  }} style={{ flex: 1, ...btnStyle(crt), justifyContent: 'center' }}>SAVE</button>
                </div>
              </div>

              {aiSuggestions && (
                <div style={{ border: `1px solid ${crt(0.15)}`, padding: '6px', background: crt(0.02), marginBottom: 8 }}>
                  <div style={{ fontSize: '0.4rem', color: crt(0.35), marginBottom: 3 }}>TALKING POINTS</div>
                  <div style={{ fontSize: '0.45rem', color: crt(0.7), whiteSpace: 'pre-line' }}>{aiSuggestions}</div>
                </div>
              )}

              {sectionHeader('ASK AI COACH')}
              <div style={{ marginTop: 6 }}>
                <textarea
                  value={aiCoachQuestion}
                  onChange={e => setAiCoachQuestion(e.target.value)}
                  placeholder="Ask the AI coach a question..."
                  style={{ ...inputStyle, width: '100%', height: 50, resize: 'none', display: 'block', marginBottom: 4 }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAICoach(); } }}
                />
                <button onClick={askAICoach} disabled={aiLoading || !aiCoachQuestion.trim()} style={{ width: '100%', ...btnStyle(purple), justifyContent: 'center', padding: '6px' }}>
                  {aiLoading ? <Loader2 size={9} className="animate-spin" /> : <Bot size={9} />}ASK COACH
                </button>
                {aiCoachResponse && (
                  <div style={{ marginTop: 6, border: `1px solid ${purple(0.2)}`, padding: '6px', background: purple(0.03) }}>
                    <div style={{ fontSize: '0.4rem', color: purple(0.4), marginBottom: 2 }}>COACH RESPONSE</div>
                    <div style={{ fontSize: '0.45rem', color: purple(0.8) }}>{aiCoachResponse}</div>
                  </div>
                )}
              </div>

              {sectionHeader('DICTATION')}
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input value={activeDictationCallSid} onChange={e => setActiveDictationCallSid(e.target.value)} placeholder="Call SID (optional)..." style={{ ...inputStyle, flex: 1 }} />
                </div>
                <textarea
                  value={dictationText}
                  onChange={e => setDictationText(e.target.value)}
                  placeholder="Dictate notes here..."
                  style={{ ...inputStyle, width: '100%', height: 50, resize: 'none', display: 'block', marginBottom: 4 }}
                />
                <button onClick={saveDictation} disabled={!dictationText.trim()} style={{ width: '100%', ...btnStyle(blue), justifyContent: 'center', padding: '5px' }}>
                  <MessageSquare size={9} />SAVE DICTATION
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'secretary' && (
          <div>
            {sectionHeader('SECRETARY AI CONFIGURATION')}
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.5rem', color: crt(0.6), flex: 1 }}>SECRETARY AI ENABLED</span>
                <button
                  onClick={() => setSecretaryForm(f => ({ ...f, isEnabled: !f.isEnabled }))}
                  style={{ padding: '4px 12px', background: secretaryForm.isEnabled ? crt(0.15) : red(0.08), border: `1px solid ${secretaryForm.isEnabled ? crt(0.4) : red(0.3)}`, color: secretaryForm.isEnabled ? crt(0.9) : red(0.7), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }) }}>
                  {secretaryForm.isEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>PERSONALITY</div>
                <select value={secretaryForm.personality ?? 'professional'} onChange={e => setSecretaryForm(f => ({ ...f, personality: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  <option value="professional" style={{ background: '#030803' }}>Professional</option>
                  <option value="friendly" style={{ background: '#030803' }}>Friendly</option>
                  <option value="formal" style={{ background: '#030803' }}>Formal</option>
                  <option value="casual" style={{ background: '#030803' }}>Casual</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>GREETING SCRIPT</div>
                <textarea value={secretaryForm.greetingScript ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, greetingScript: e.target.value }))}
                  placeholder="Thank you for calling. How can I help you?"
                  style={{ ...inputStyle, width: '100%', height: 55, resize: 'none', display: 'block' }} />
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>SCREENING RULES</div>
                <textarea value={secretaryForm.screeningRules ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, screeningRules: e.target.value }))}
                  placeholder="Ask for caller's name and reason for call..."
                  style={{ ...inputStyle, width: '100%', height: 45, resize: 'none', display: 'block' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div>
                  <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>OPEN</div>
                  <input type="time" value={secretaryForm.businessHoursStart ?? '09:00'} onChange={e => setSecretaryForm(f => ({ ...f, businessHoursStart: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>CLOSE</div>
                  <input type="time" value={secretaryForm.businessHoursEnd ?? '17:00'} onChange={e => setSecretaryForm(f => ({ ...f, businessHoursEnd: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>FORWARD TO NUMBER (for transfers)</div>
                <input value={secretaryForm.forwardToNumber ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, forwardToNumber: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.4), marginBottom: 3 }}>AFTER-HOURS ACTION</div>
                <select value={secretaryForm.afterHoursAction ?? 'voicemail'} onChange={e => setSecretaryForm(f => ({ ...f, afterHoursAction: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  <option value="voicemail" style={{ background: '#030803' }}>Voicemail</option>
                  <option value="forward" style={{ background: '#030803' }}>Forward</option>
                  <option value="hangup" style={{ background: '#030803' }}>Hang Up</option>
                </select>
              </div>

              <button onClick={saveSecretaryConfig} disabled={secretarySaving} style={{ padding: '8px', background: crt(0.1), border: `1px solid ${crt(0.35)}`, color: crt(0.9), cursor: 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                {secretarySaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}SAVE CONFIGURATION
              </button>

              {secretaryConfig && (
                <div style={{ fontSize: '0.4rem', color: crt(0.3), textAlign: 'center' }}>
                  STATUS: {secretaryConfig.isEnabled ? <span style={{ color: crt(0.7) }}>ACTIVE</span> : <span style={{ color: red(0.6) }}>INACTIVE</span>}
                </div>
              )}

              <div style={{ fontSize: '0.4rem', color: crt(0.25), borderTop: `1px solid ${crt(0.08)}`, paddingTop: 6 }}>
                Inbound webhook: /api/twilio/inbound/webhook?userId={userId}
              </div>
            </div>
          </div>
        )}

        {tab === 'numbers' && (
          <div>
            {sectionHeader('PHONE NUMBERS')}
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, border: `1px solid ${crt(0.12)}`, padding: '6px', background: crt(0.02) }}>
                <div style={{ fontSize: '0.42rem', color: crt(0.35), letterSpacing: '0.1em' }}>ADD NUMBER</div>
                <input value={newNumberForm.number} onChange={e => setNewNumberForm(f => ({ ...f, number: e.target.value }))} placeholder="Phone number..." style={{ ...inputStyle, width: '100%' }} />
                <input value={newNumberForm.label} onChange={e => setNewNumberForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. main, support)..." style={{ ...inputStyle, width: '100%' }} />
                <input value={newNumberForm.greeting} onChange={e => setNewNumberForm(f => ({ ...f, greeting: e.target.value }))} placeholder="Greeting script (optional)..." style={{ ...inputStyle, width: '100%' }} />
                <select value={newNumberForm.routingMode} onChange={e => setNewNumberForm(f => ({ ...f, routingMode: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  <option value="voicemail" style={{ background: '#030803' }}>Route to Voicemail</option>
                  <option value="secretary" style={{ background: '#030803' }}>Route to Secretary AI</option>
                  <option value="forward" style={{ background: '#030803' }}>Forward to Number</option>
                </select>
                <button onClick={addPhoneNumber} disabled={!newNumberForm.number || addingNumber} style={{ padding: '5px', background: crt(0.1), border: `1px solid ${crt(0.3)}`, color: crt(0.8), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {addingNumber ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}ADD NUMBER
                </button>
              </div>

              {phoneNumbers.length === 0 ? (
                <div style={{ fontSize: '0.45rem', color: crt(0.2), textAlign: 'center', padding: '12px 0' }}>NO NUMBERS CONFIGURED</div>
              ) : (
                phoneNumbers.map(n => (
                  <div key={n.id} style={{ padding: '5px 6px', border: `1px solid ${crt(0.12)}`, marginBottom: 4, background: n.isActive ? crt(0.02) : 'transparent', opacity: n.isActive ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Hash size={9} style={{ color: crt(0.5), flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.5rem', color: crt(0.8) }}>{formatPhone(n.number)}</div>
                        <div style={{ fontSize: '0.4rem', color: crt(0.3) }}>{n.label} · {n.routingMode}</div>
                      </div>
                      <button onClick={() => callSingle(n.number)} style={{ ...btnStyle(crt), padding: '2px 4px' }}><Phone size={9} /></button>
                      <button onClick={() => deletePhoneNumber(n.id)} style={{ background: red(0.06), border: `1px solid ${red(0.2)}`, color: red(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}><Trash2 size={9} /></button>
                    </div>
                    {n.greeting && <div style={{ marginTop: 3, fontSize: '0.4rem', color: crt(0.4), fontStyle: 'italic' }}>"{n.greeting.slice(0, 60)}{n.greeting.length > 60 ? '...' : ''}"</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '3px 8px', borderTop: `1px solid ${crt(0.1)}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: crt(0.15), letterSpacing: '0.06em' }}>
        <span>TTC ALPHA {__BUILD_VERSION__}</span>
        <span>TWILIO PSTN · AI POWERED</span>
      </div>
    </div>
  );
}
