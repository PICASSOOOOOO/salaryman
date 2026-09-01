import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import {
  Phone, PhoneOff, X, Clock, Users, Zap, CheckSquare, Square, PhoneCall, Loader2,
  Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, Merge, Plus, Settings,
  MessageSquare, Bot, Mail, BookOpen, Bell, Hash, ChevronDown, ChevronRight,
  Trash2, Check, Building2, Volume2, VolumeX, Radio, Voicemail, Search,
  Calendar, RefreshCw, AlertCircle, LayoutGrid, PhoneIncoming } from 'lucide-react';
import {
  formatDuration, formatPhone, ENDED_STATUSES,
  type CRMContact, type ActiveCall, type BatchResult, type CallRecord,
  type VoicemailRecord, type PhoneNumber, type SecretaryConfig, type ConferenceRoom,
  type CountryDialInfo, type RegulatoryRequirement, type AvailableNumber } from '@/lib/phone-utils';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';

type TabMode = 'contacts' | 'dialer' | 'active' | 'history' | 'voicemail' | 'conference' | 'ai' | 'secretary' | 'numbers' | 'dialing';

export function PhoneDialer({

  userId,
  callerName,
  compact = false,
  onClose }: {
  userId: string;
  callerName?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const isMobile = useIsMobile();
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

  const [regionDefaults, setRegionDefaults] = useState<{ cityId: string | null; country: string; countryInfo: CountryDialInfo; countries: CountryDialInfo[] } | null>(null);
  const [buyCountry, setBuyCountry] = useState('');
  const [regulatory, setRegulatory] = useState<RegulatoryRequirement | null>(null);
  const [numberSearch, setNumberSearch] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [purchasingNumber, setPurchasingNumber] = useState('');

  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [followupCallSid, setFollowupCallSid] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState({ title: '', startAt: '', endAt: '' });

  const slate = (opacity: number) => `rgba(56,189,248,${opacity})`;
  const destructive = (opacity: number) => `rgba(255,40,40,${opacity})`;
  const warning = (opacity: number) => `rgba(255,180,0,${opacity})`;
  const primary = (opacity: number) => `rgba(0,150,255,${opacity})`;
  const accent = (opacity: number) => `rgba(180,0,255,${opacity})`;

  const apiUrl = (path: string) => `${BASE}api/${path}`;
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  const fetchContacts = useCallback(() => {
    apiFetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contacts) setContacts(d.contacts); })
      .catch(() => {});
  }, [userId, BASE]);

  const fetchHistory = useCallback(() => {
    const q = historySearch ? `?search=${encodeURIComponent(historySearch)}` : '';
    apiFetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}${q}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.calls) setHistory(d.calls); })
      .catch(() => {});
  }, [userId, BASE, historySearch]);

  const fetchVoicemails = useCallback(() => {
    apiFetch(apiUrl('twilio/voicemail'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.voicemails) { setVoicemails(d.voicemails); setUnreadVoicemail(d.unread ?? 0); } })
      .catch(() => {});
  }, [BASE]);

  const fetchPhoneNumbers = useCallback(() => {
    apiFetch(apiUrl('twilio/phone-numbers'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.numbers) setPhoneNumbers(d.numbers); })
      .catch(() => {});
  }, [BASE]);

  const fetchRegionDefaults = useCallback(() => {
    apiFetch(apiUrl('twilio/region-defaults'))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.country) {
          setRegionDefaults(d);
          setBuyCountry(prev => prev || d.country);
        }
      })
      .catch(() => {});
  }, [BASE]);

  const fetchSecretaryConfig = useCallback(() => {
    apiFetch(apiUrl('twilio/secretary/config'))
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
    apiFetch(apiUrl('twilio/conference/list'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rooms) setConferences(d.rooms); })
      .catch(() => {});
  }, [BASE]);

  useEffect(() => {
    fetchContacts();
    fetchHistory();
    fetchVoicemails();
    fetchPhoneNumbers();
    fetchRegionDefaults();
    fetchSecretaryConfig();
    fetchConferences();
  }, [fetchContacts, fetchHistory, fetchVoicemails, fetchPhoneNumbers, fetchRegionDefaults, fetchSecretaryConfig, fetchConferences]);

  useEffect(() => {
    if (!buyCountry) return;
    let cancelled = false;
    apiFetch(apiUrl(`twilio/regulatory?country=${encodeURIComponent(buyCountry)}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.requirement) setRegulatory(d.requirement); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [buyCountry, BASE]);

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
        const r = await apiFetch(apiUrl('twilio/call-status-batch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSids }) });
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
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/batch-call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numbers, userId, callerName }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Batch call failed');
        return body;
      }, created => (created.calls ?? []).filter((c: BatchResult) => c.ok && c.callSid).map((c: BatchResult & { conferenceName?: string }) => ({ callSid: c.callSid!, conferenceName: c.conferenceName })));
      const batchCalls = d.calls as (BatchResult & { conferenceName?: string })[];
      const newCalls: ActiveCall[] = batchCalls
        .filter((c) => c.ok && c.callSid)
        .map((c) => ({ callSid: c.callSid!, phone: c.phone, name: c.name || '', status: c.status || 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: c.conferenceName }));
      const failCount = batchCalls.filter((c) => !c.ok).length;
      if (failCount > 0) setError(`${failCount} call(s) failed to initiate`);
      if (newCalls.length > 0) {
        setActiveCalls(prev => [...prev, ...newCalls]);
        startPolling(newCalls);
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
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Call failed');
        return body;
      }, created => [{ callSid: created.callSid, conferenceName: created.conferenceName }]);
      const newCall: ActiveCall = { callSid: d.callSid, phone: d.to || phone, name: name || '', status: d.status || 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: d.conferenceName };
      setActiveCalls(prev => [...prev, newCall]);
      startPolling([newCall]);
      setTab('active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  };

  const toggleMute = async (sid: string, currentMuted: boolean) => {
    try {
      await apiFetch(apiUrl(`twilio/call/${sid}/mute`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: !currentMuted }) });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, muted: !currentMuted } : c));
    } catch (e) { console.error("[CalllHome] mute error:", e); }
  };

  const toggleHold = async (sid: string, currentHold: boolean) => {
    try {
      await apiFetch(apiUrl(`twilio/call/${sid}/hold`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold: !currentHold }) });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, onHold: !currentHold } : c));
    } catch (e) { console.error("[CalllHome] hold error:", e); }
  };

  const transferCall = async (sid: string) => {
    if (!transferNumber.trim()) return;
    try {
      await apiFetch(apiUrl(`twilio/call/${sid}/transfer`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferTo: transferNumber }) });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'transferred' } : c));
      setTransferTarget(null);
      setTransferNumber('');
    } catch (e) { console.error("[CalllHome] transfer error:", e); }
  };

  const hangupOne = async (sid: string) => {
    try {
      await apiFetch(apiUrl(`twilio/hangup/${sid}`), { method: 'POST' });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'completed' } : c));
    } catch (e) { console.error("[CalllHome] hangup error:", e); }
  };

  const hangupAll = async () => {
    const sids = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).map(c => c.callSid);
    if (sids.length === 0) return;
    try {
      await apiFetch(apiUrl('twilio/hangup-all'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSids: sids }) });
      setActiveCalls(prev => prev.map(c => ({ ...c, status: 'completed' })));
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      fetchHistory();
    } catch (e) { console.error("[CalllHome] hangup-all error:", e); }
  };

  const createConference = async () => {
    try {
      const r = await apiFetch(apiUrl('twilio/conference/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: confRoomName || 'New Conference' }) });
      if (r.ok) { fetchConferences(); setConfRoomName(''); }
    } catch (e) { console.error("[CalllHome] create conference error:", e); }
  };

  const addToConference = async (roomName: string) => {
    if (!confAddNumber) return;
    try {
      await apiFetch(apiUrl(`twilio/conference/${roomName}/add`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: confAddNumber, name: confAddName }) });
      setConfAddNumber(''); setConfAddName('');
    } catch (e) { console.error("[CalllHome] add to conference error:", e); }
  };

  const endConference = async (roomName: string) => {
    try {
      await apiFetch(apiUrl(`twilio/conference/${roomName}/end`), { method: 'POST' });
      fetchConferences();
    } catch (e) { console.error("[CalllHome] end conference error:", e); }
  };

  const startDialingSession = async () => {
    const selectedContacts = contacts.filter(c => selected.has(c.id));
    if (selectedContacts.length === 0) { setError('Select contacts first'); return; }
    try {
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/dialing/start'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: dialingMode, numbers: selectedContacts.map(c => ({ phone: c.phone, name: c.name })), settings: dialingMode === 'predictive' ? { concurrency: dialConcurrency } : { delayBetweenCalls: dialDelay } }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Failed to start dialing session');
        return body;
      }, created => (created.calls ?? []).filter((c: BatchResult) => c.ok && c.callSid).map((c: BatchResult & { conferenceName?: string }) => ({ callSid: c.callSid!, conferenceName: c.conferenceName })));
      {
        const dialCalls = d.calls as (BatchResult & { conferenceName?: string })[];
        setDialingSession({ id: d.sessionId, mode: d.mode, total: selectedContacts.length, dialed: dialCalls.filter((c) => c.ok).length });
        const newCalls: ActiveCall[] = dialCalls.filter((c) => c.ok).map((c) => ({ callSid: c.callSid ?? '', phone: c.phone, name: c.name || '', status: 'initiated', startTime: Date.now(), elapsed: 0, conferenceName: c.conferenceName }));
        if (newCalls.length > 0) { setActiveCalls(prev => [...prev, ...newCalls]); startPolling(newCalls); }
        setTab('active');
        setSelected(new Set());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dialing failed');
    }
  };

  const stopDialingSession = async () => {
    if (!dialingSession) return;
    try {
      await apiFetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST' });
      setDialingSession(null);
    } catch (e) { console.error("[CalllHome] stop dialing error:", e); }
  };

  const askAICoach = async () => {
    if (!aiCoachQuestion.trim()) return;
    setAiLoading(true);
    try {
      const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
      const r = await apiFetch(apiUrl('twilio/ai/coach'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiCoachQuestion, transcript: aiTranscript, context: liveCall?.name }) });
      const d = await r.json();
      if (r.ok) { setAiCoachResponse(d.response); setAiCoachQuestion(''); }
    } catch (e) { console.error("[CalllHome] AI coach error:", e); }
    setAiLoading(false);
  };

  const getAISuggestions = async () => {
    setAiLoading(true);
    try {
      const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
      const r = await apiFetch(apiUrl('twilio/ai/suggest'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: aiTranscript, contactName: liveCall?.name }) });
      const d = await r.json();
      if (r.ok) setAiSuggestions(d.suggestions);
    } catch (e) { console.error("[CalllHome] AI suggestions error:", e); }
    setAiLoading(false);
  };

  const saveTranscript = async (callSid: string) => {
    if (!aiTranscript.trim()) return;
    try {
      await apiFetch(apiUrl('twilio/ai/transcribe'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid, transcript: aiTranscript }) });
    } catch (e) { console.error("[CalllHome] save transcript error:", e); }
  };

  const saveDictation = async () => {
    if (!dictationText.trim()) return;
    try {
      await apiFetch(apiUrl('twilio/ai/dictation'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dictationText, callSid: activeDictationCallSid || undefined }) });
      setDictationText('');
    } catch (e) { console.error("[CalllHome] save dictation error:", e); }
  };

  const saveSecretaryConfig = async () => {
    setSecretarySaving(true);
    try {
      const r = await apiFetch(apiUrl('twilio/secretary/config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secretaryForm) });
      const d = await r.json();
      if (r.ok) { setSecretaryConfig(d.config); setSecretaryForm(d.config); }
    } catch (e) { console.error("[CalllHome] save secretary config error:", e); }
    setSecretarySaving(false);
  };

  const addPhoneNumber = async () => {
    if (!newNumberForm.number) return;
    setAddingNumber(true);
    try {
      const r = await apiFetch(apiUrl('twilio/phone-numbers'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNumberForm) });
      if (r.ok) { fetchPhoneNumbers(); setNewNumberForm({ number: '', label: '', greeting: '', routingMode: 'voicemail' }); }
    } catch (e) { console.error("[CalllHome] add phone number error:", e); }
    setAddingNumber(false);
  };

  const searchAvailableNumbers = async () => {
    setSearchingNumbers(true);
    setSearchError('');
    setAvailableNumbers([]);
    try {
      const params = new URLSearchParams({ country: buyCountry });
      if (numberSearch.trim()) params.set('contains', numberSearch.trim());
      const r = await apiFetch(apiUrl(`twilio/available-numbers?${params.toString()}`));
      const d = await r.json();
      if (r.ok) { setAvailableNumbers(d.numbers ?? []); }
      else { setSearchError(d.error || 'Search failed'); }
    } catch (e) { setSearchError('Search failed'); console.error("[CalllHome] search numbers error:", e); }
    setSearchingNumbers(false);
  };

  const purchaseNumber = async (phoneNumber: string) => {
    setPurchasingNumber(phoneNumber);
    try {
      const r = await apiFetch(apiUrl('twilio/purchase-number'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }) });
      const d = await r.json();
      if (r.ok) {
        fetchPhoneNumbers();
        setAvailableNumbers(prev => prev.filter(n => n.phoneNumber !== phoneNumber));
      } else if (d.error === 'regulatory_bundle_required') {
        setSearchError(d.requirement?.message || 'A regulatory bundle is required for this country.');
      } else {
        setSearchError(d.detail || d.error || 'Purchase failed');
      }
    } catch (e) { setSearchError('Purchase failed'); console.error("[CalllHome] purchase number error:", e); }
    setPurchasingNumber('');
  };

  const deletePhoneNumber = async (id: number) => {
    try {
      await apiFetch(apiUrl(`twilio/phone-numbers/${id}`), { method: 'DELETE' });
      fetchPhoneNumbers();
    } catch (e) { console.error("[CalllHome] delete phone number error:", e); }
  };

  const setActiveNumber = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/phone-numbers/${id}`), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }) });
      if (r.ok) fetchPhoneNumbers();
    } catch (e) { console.error("[CalllHome] set active number error:", e); }
  };

  const markVoicemailRead = async (id: number) => {
    try {
      await apiFetch(apiUrl(`twilio/voicemail/${id}/read`), { method: 'POST' });
      setVoicemails(prev => prev.map(v => v.id === id ? { ...v, isRead: true } : v));
      setUnreadVoicemail(prev => Math.max(0, prev - 1));
    } catch (e) { console.error("[CalllHome] mark voicemail read error:", e); }
  };

  const deleteVoicemail = async (id: number) => {
    try {
      await apiFetch(apiUrl(`twilio/voicemail/${id}`), { method: 'DELETE' });
      setVoicemails(prev => prev.filter(v => v.id !== id));
    } catch (e) { console.error("[CalllHome] delete voicemail error:", e); }
  };

  const scheduleFollowup = async () => {
    if (!followupCallSid || !followupForm.title || !followupForm.startAt) return;
    try {
      const startAt = new Date(followupForm.startAt);
      const endAt = followupForm.endAt ? new Date(followupForm.endAt) : new Date(startAt.getTime() + 30 * 60 * 1000);
      await apiFetch(apiUrl(`twilio/call/${followupCallSid}/schedule-followup`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: followupForm.title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }) });
      setFollowupCallSid(null);
      setFollowupForm({ title: '', startAt: '', endAt: '' });
      fetchHistory();
    } catch (e) { console.error("[CalllHome] schedule followup error:", e); }
  };

  const emailCallSummary = async (callId: number) => {
    try {
      await apiFetch(apiUrl(`twilio/history/${callId}/email-summary`), { method: 'POST' });
    } catch (e) { console.error("[CalllHome] email summary error:", e); }
  };

  const liveCount = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).length;
  const filtered = filteredContacts();

  const inputStyle = {
    background: slate(0.8), border: `1px solid ${slate(0.2)}`,
    color: slate(0.9), padding: '5px 8px', fontSize: '0.55rem',
    ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), outline: 'none' };

  const btnStyle = (color: (o: number) => string, active?: boolean) => ({
    background: color(active ? 0.2 : 0.08), border: `1px solid ${color(0.3)}`,
    color: color(0.8), cursor: 'pointer', padding: '4px 8px', fontSize: '0.45rem',
    ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), letterSpacing: '0.08em',
    display: 'flex', alignItems: 'center', gap: 3 });

  const sectionHeader = (label: string) => (
    <div style={{ padding: '4px 10px', fontSize: '0.45rem', color: slate(0.55), letterSpacing: '0.15em', borderBottom: `1px solid ${slate(0.08)}`, background: slate(0.02) }}>
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
      background: slate(0.97), border: `1px solid ${slate(0.3)}`,

      ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
      width: compact ? '340px' : '400px', maxWidth: 'calc(100vw - 16px)', maxHeight: '600px',
      display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {onClose && (
        <button onClick={onClose} style={{ position: 'absolute', top: 6, right: 6, color: slate(0.55), background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}>
          <X size={14} />
        </button>
      )}

      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${slate(0.15)}`, background: slate(0.8), display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/brand/callhome/calll-home-brush.png" alt="CALLL HOME" style={{ height: 28, width: 'auto', opacity: 0.9, filter: 'brightness(1.4) saturate(0)' }} />
        <span style={{ fontSize: '0.4rem', color: slate(0.55), marginLeft: 'auto', letterSpacing: '0.08em' }}>ALPHA {__BUILD_VERSION__}</span>
      </div>

      {error && (
        <div style={{ padding: '5px 12px', fontSize: '0.5rem', color: destructive(0.9), background: destructive(0.05), borderBottom: `1px solid ${destructive(0.15)}`, letterSpacing: '0.08em' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: destructive(0.5), cursor: 'pointer', fontSize: '0.45rem' }}><X size={10} /></button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: `1px solid ${slate(0.1)}`, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: '0 0 auto', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 3,
            background: tab === t.key ? slate(0.08) : 'transparent',
            border: 'none', borderBottom: tab === t.key ? `2px solid ${slate(0.6)}` : '2px solid transparent',
            color: tab === t.key ? slate(0.9) : slate(0.3), cursor: 'pointer',
            fontSize: '0.42rem', letterSpacing: '0.08em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), position: 'relative' }}>
            {t.icon}{t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span style={{ background: t.key === 'voicemail' ? warning(0.8) : destructive(0.8), color: '#fff', fontSize: '0.38rem', padding: '1px 3px', borderRadius: 4, minWidth: 12, textAlign: 'center' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>

        {tab === 'contacts' && (
          <div>
            <div style={{ padding: '6px 8px', display: 'flex', gap: 4, borderBottom: `1px solid ${slate(0.08)}` }}>
              <input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={selectAll} style={btnStyle(slate)}>
                {selected.size === filtered.length && filtered.length > 0 ? 'NONE' : 'ALL'}
              </button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: '0.5rem', color: slate(0.55) }}>
                {contacts.length === 0 ? 'NO CONTACTS WITH PHONE NUMBERS' : 'NO MATCHES'}
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {filtered.map(c => (
                  <div key={c.id} style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${slate(0.05)}`, cursor: 'pointer', background: selected.has(c.id) ? slate(0.06) : 'transparent' }} onClick={() => toggleSelect(c.id)}>
                    <div style={{ color: selected.has(c.id) ? slate(0.8) : slate(0.2), flexShrink: 0 }}>
                      {selected.has(c.id) ? <CheckSquare size={12} /> : <Square size={12} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.55rem', color: slate(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.42rem', color: slate(0.55) }}>{formatPhone(c.phone)}{c.company ? ` · ${c.company}` : ''}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); callSingle(c.phone, c.name, c.id); }} style={{ background: slate(0.08), border: `1px solid ${slate(0.25)}`, color: slate(0.6), cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center', flexShrink: 0 }} title={`Call ${c.name}`}>
                      <Phone size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selected.size > 0 && (
              <div style={{ padding: '6px 8px', borderTop: `1px solid ${slate(0.15)}`, background: slate(0.04), display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.5rem', color: slate(0.6), flex: 1 }}>{selected.size} SELECTED</span>
                <button onClick={blastSelected} disabled={blasting} style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, background: blasting ? warning(0.15) : primary(0.15), border: `1px solid ${blasting ? warning(0.5) : primary(0.5)}`, color: blasting ? warning(0.9) : slate(0.95), cursor: blasting ? 'wait' : 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
                  {blasting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                  {blasting ? 'DIALING...' : `BLAST ${selected.size}`}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'dialer' && (
          <div style={{ padding: '10px' }}>
            <div style={{ background: slate(0.8), border: `1px solid ${slate(0.2)}`, padding: '8px 10px', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
              <input value={manualNumber} onChange={e => setManualNumber(e.target.value)} placeholder="Enter phone number..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: slate(0.9), fontSize: '0.9rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), outline: 'none', letterSpacing: '0.05em' }}
                onKeyDown={e => { if (e.key === 'Enter' && manualNumber.trim()) callSingle(manualNumber); }}
              />
              {manualNumber && <button onClick={() => setManualNumber('')} style={{ background: 'none', border: 'none', color: slate(0.55), cursor: 'pointer' }}><X size={12} /></button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 5, marginBottom: 8 }}>
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(key => (
                <button key={key} onClick={() => setManualNumber(prev => prev + key)} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: slate(0.04), border: `1px solid ${slate(0.15)}`, color: slate(0.8), cursor: 'pointer', fontSize: '0.9rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
                  {key}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setManualNumber(prev => prev.slice(0, -1))} disabled={!manualNumber} style={{ flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: slate(0.04), border: `1px solid ${slate(0.15)}`, color: manualNumber ? slate(0.6) : slate(0.15), cursor: manualNumber ? 'pointer' : 'default', fontSize: '0.55rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>DEL</button>
              <button onClick={() => { if (manualNumber.trim()) callSingle(manualNumber); }} disabled={!manualNumber.trim() || loading} style={{ flex: 2, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: manualNumber ? primary(0.15) : slate(0.04), border: `1px solid ${manualNumber ? primary(0.5) : slate(0.15)}`, color: manualNumber ? slate(0.95) : slate(0.2), cursor: manualNumber ? 'pointer' : 'default', fontSize: '0.6rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), letterSpacing: '0.1em' }}>
                <Phone size={12} />{loading ? 'CALLING...' : 'CALL'}
              </button>
            </div>
          </div>
        )}

        {tab === 'active' && (
          <div>
            {activeCalls.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: slate(0.55), letterSpacing: '0.1em' }}>NO ACTIVE CALLS</div>
            ) : (
              <>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {activeCalls.map((c, i) => {
                    const ended = ENDED_STATUSES.includes(c.status);
                    const showTransfer = transferTarget === c.callSid;
                    return (
                      <div key={c.callSid || i} style={{ borderBottom: `1px solid ${slate(0.06)}`, opacity: ended ? 0.45 : 1 }}>
                        <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: ended ? slate(0.2) : c.status === 'ringing' ? warning(0.8) : c.status === 'in-progress' ? slate(0.8) : slate(0.4) }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.55rem', color: slate(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || formatPhone(c.phone)}</div>
                            <div style={{ fontSize: '0.4rem', color: slate(0.55) }}>{formatPhone(c.phone)} · {c.status.toUpperCase()} · {formatDuration(c.elapsed)}</div>
                          </div>
                          {!ended && (
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button onClick={() => toggleMute(c.callSid, !!c.muted)} style={{ ...btnStyle(c.muted ? warning : slate), padding: '2px 4px' }} title={c.muted ? 'Unmute' : 'Mute'}>
                                {c.muted ? <MicOff size={8} /> : <Mic size={8} />}
                              </button>
                              <button onClick={() => toggleHold(c.callSid, !!c.onHold)} style={{ ...btnStyle(c.onHold ? warning : slate), padding: '2px 4px' }} title={c.onHold ? 'Resume' : 'Hold'}>
                                {c.onHold ? <PlayCircle size={8} /> : <PauseCircle size={8} />}
                              </button>
                              <button onClick={() => setTransferTarget(showTransfer ? null : c.callSid)} style={{ ...btnStyle(primary), padding: '2px 4px' }} title="Transfer">
                                <ArrowRightLeft size={8} />
                              </button>
                              <button onClick={() => hangupOne(c.callSid)} style={{ background: destructive(0.15), border: `1px solid ${destructive(0.4)}`, color: destructive(0.9), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                                <PhoneOff size={8} />
                              </button>
                            </div>
                          )}
                        </div>
                        {showTransfer && (
                          <div style={{ padding: '4px 8px 6px', display: 'flex', gap: 4, background: primary(0.04), borderTop: `1px solid ${primary(0.1)}` }}>
                            <input value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Transfer to number..." style={{ ...inputStyle, flex: 1 }} />
                            <button onClick={() => transferCall(c.callSid)} style={{ ...btnStyle(primary), padding: '4px 8px' }}>TRANSFER</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {liveCount > 0 && (
                  <div style={{ padding: '6px 8px', borderTop: `1px solid ${slate(0.15)}` }}>
                    <button onClick={hangupAll} style={{ width: '100%', padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: destructive(0.15), border: `1px solid ${destructive(0.4)}`, color: destructive(0.9), cursor: 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontWeight: 'bold' }}>
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
            <div style={{ padding: '6px 8px', borderBottom: `1px solid ${slate(0.08)}`, display: 'flex', gap: 4 }}>
              <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search transcripts..." style={{ ...inputStyle, flex: 1 }} onKeyDown={e => e.key === 'Enter' && fetchHistory()} />
              <button onClick={fetchHistory} style={btnStyle(slate)}><Search size={10} /></button>
            </div>
            {history.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: slate(0.55), letterSpacing: '0.1em' }}>NO CALL HISTORY</div>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {history.map(h => (
                  <div key={h.id} style={{ borderBottom: `1px solid ${slate(0.05)}` }}>
                    <div onClick={() => setExpandedCall(expandedCall === h.id ? null : h.id)} style={{ cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.55rem', color: slate(0.7) }}>{h.callerName || formatPhone(h.recipientNumber)}</div>
                        <div style={{ fontSize: '0.4rem', color: slate(0.55) }}>
                          {formatPhone(h.recipientNumber)} · {h.status}
                          {h.durationSeconds ? ` · ${formatDuration(h.durationSeconds)}` : ''}
                          {' · '}{new Date(h.startedAt).toLocaleDateString()}
                          {h.direction === 'inbound' && <span style={{ color: primary(0.7), marginLeft: 4 }}>↙</span>}
                          {h.callType && h.callType !== 'single' && <span style={{ color: warning(0.6), marginLeft: 4 }}>[{h.callType}]</span>}
                        </div>
                        {h.summary && <div style={{ fontSize: '0.4rem', color: slate(0.5), marginTop: 2, fontStyle: 'italic' }}>{h.summary.slice(0, 80)}…</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); callSingle(h.recipientNumber, h.callerName || undefined); }} style={{ background: slate(0.06), border: `1px solid ${slate(0.2)}`, color: slate(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                          <Phone size={9} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setFollowupCallSid(h.twilioCallSid ?? null); }} style={{ background: slate(0.06), border: `1px solid ${slate(0.2)}`, color: slate(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Schedule follow-up">
                          <Calendar size={9} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); emailCallSummary(h.id); }} style={{ background: slate(0.06), border: `1px solid ${slate(0.2)}`, color: slate(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Email summary">
                          <Mail size={9} />
                        </button>
                      </div>
                    </div>
                    {expandedCall === h.id && (h.transcript || h.notes || h.summary) && (
                      <div style={{ padding: '4px 10px 8px', background: slate(0.02), borderTop: `1px solid ${slate(0.06)}` }}>
                        {h.summary && <div style={{ marginBottom: 4 }}><span style={{ fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.1em' }}>SUMMARY </span><span style={{ fontSize: '0.45rem', color: slate(0.6) }}>{h.summary}</span></div>}
                        {h.transcript && <div style={{ marginBottom: 4 }}><span style={{ fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.1em' }}>TRANSCRIPT </span><div style={{ fontSize: '0.42rem', color: slate(0.5), maxHeight: 80, overflowY: 'auto', marginTop: 2, whiteSpace: 'pre-wrap' }}>{h.transcript}</div></div>}
                        {h.notes && <div><span style={{ fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.1em' }}>NOTES </span><span style={{ fontSize: '0.42rem', color: slate(0.5) }}>{h.notes}</span></div>}
                      </div>
                    )}
                    {followupCallSid && followupCallSid === (h.twilioCallSid ?? '') && (
                      <div style={{ padding: '6px 8px', background: slate(0.03), borderTop: `1px solid ${slate(0.08)}` }}>
                        {sectionHeader('SCHEDULE FOLLOW-UP')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                          <input value={followupForm.title} onChange={e => setFollowupForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow-up title..." style={{ ...inputStyle, width: '100%' }} />
                          <input type="datetime-local" value={followupForm.startAt} onChange={e => setFollowupForm(f => ({ ...f, startAt: e.target.value }))} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={scheduleFollowup} disabled={!followupForm.title || !followupForm.startAt} style={{ flex: 1, padding: '4px', background: slate(0.1), border: `1px solid ${slate(0.3)}`, color: slate(0.8), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>SCHEDULE</button>
                            <button onClick={() => setFollowupCallSid(null)} style={{ padding: '4px 8px', background: destructive(0.06), border: `1px solid ${destructive(0.2)}`, color: destructive(0.6), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>CANCEL</button>
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
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.5rem', color: slate(0.55) }}>NO VOICEMAILS</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {voicemails.map(v => (
                  <div key={v.id} style={{ padding: '6px 8px', borderBottom: `1px solid ${slate(0.05)}`, background: !v.isRead ? slate(0.03) : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: !v.isRead ? warning(0.8) : slate(0.15), flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.55rem', color: slate(0.8) }}>{v.fromName || formatPhone(v.fromNumber)}</div>
                        <div style={{ fontSize: '0.4rem', color: slate(0.55) }}>
                          {formatPhone(v.fromNumber)} · {v.durationSeconds ?? 0}s · {new Date(v.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {!v.isRead && <button onClick={() => markVoicemailRead(v.id)} style={{ ...btnStyle(slate), padding: '2px 4px' }} title="Mark read"><Check size={9} /></button>}
                        <button onClick={() => callSingle(v.fromNumber, v.fromName || undefined)} style={{ ...btnStyle(slate), padding: '2px 4px' }} title="Call back"><Phone size={9} /></button>
                        <button onClick={() => deleteVoicemail(v.id)} style={{ background: destructive(0.06), border: `1px solid ${destructive(0.2)}`, color: destructive(0.6), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }} title="Delete"><Trash2 size={9} /></button>
                      </div>
                    </div>
                    {v.recordingUrl && (
                      <audio controls src={v.recordingUrl} style={{ width: '100%', height: 28, marginTop: 4, filter: 'invert(1) hue-rotate(90deg) brightness(0.7)' }} />
                    )}
                    {v.summary && <div style={{ marginTop: 3, fontSize: '0.42rem', color: slate(0.5), fontStyle: 'italic' }}>{v.summary}</div>}
                    {v.transcript && <div style={{ marginTop: 2, fontSize: '0.4rem', color: slate(0.55) }}>{v.transcript.slice(0, 100)}{v.transcript.length > 100 ? '...' : ''}</div>}
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
                <button onClick={createConference} style={{ ...btnStyle(slate), padding: '5px 10px' }}><Plus size={10} />NEW</button>
              </div>
              {conferences.length === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', fontSize: '0.45rem', color: slate(0.55) }}>NO ACTIVE CONFERENCES</div>
              ) : (
                <div>
                  {conferences.map(conf => (
                    <div key={conf.id} style={{ border: `1px solid ${slate(0.15)}`, marginBottom: 8, background: slate(0.03) }}>
                      <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${slate(0.1)}` }}>
                        <Users size={10} style={{ color: slate(0.6) }} />
                        <span style={{ fontSize: '0.5rem', color: slate(0.8), flex: 1 }}>{conf.roomName}</span>
                        <button onClick={() => endConference(conf.roomName)} style={{ background: destructive(0.1), border: `1px solid ${destructive(0.3)}`, color: destructive(0.7), cursor: 'pointer', padding: '2px 6px', fontSize: '0.4rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>END</button>
                      </div>
                      <div style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          <input value={confAddNumber} onChange={e => setConfAddNumber(e.target.value)} placeholder="Add participant number..." style={{ ...inputStyle, flex: 2 }} />
                          <input value={confAddName} onChange={e => setConfAddName(e.target.value)} placeholder="Name..." style={{ ...inputStyle, flex: 1 }} />
                          <button onClick={() => addToConference(conf.roomName)} style={{ ...btnStyle(slate), padding: '4px 6px' }}><Phone size={9} /></button>
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
                <div style={{ fontSize: '0.45rem', color: slate(0.55) }}>Need 2+ active calls to merge</div>
              ) : (
                <div style={{ fontSize: '0.45rem', color: slate(0.5) }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
                {(['power', 'auto', 'predictive'] as const).map(mode => (
                  <button key={mode} onClick={() => setDialingMode(mode)} style={{ padding: '8px 4px', textAlign: 'center', background: dialingMode === mode ? slate(0.12) : slate(0.04), border: `1px solid ${dialingMode === mode ? slate(0.5) : slate(0.15)}`, color: dialingMode === mode ? slate(0.9) : slate(0.4), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), letterSpacing: '0.08em' }}>
                    <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>{mode === 'power' ? <Zap size={14} /> : mode === 'auto' ? <Bot size={14} /> : <Check size={14} />}</div>
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ border: `1px solid ${slate(0.12)}`, padding: '8px', marginBottom: 8, background: slate(0.02) }}>
                {dialingMode === 'power' && <div style={{ fontSize: '0.45rem', color: slate(0.5) }}>POWER DIALING: Calls the next number automatically when agent is free. One call at a time.</div>}
                {dialingMode === 'auto' && <div style={{ fontSize: '0.45rem', color: slate(0.5) }}>AUTO DIALING: Plays recorded message on answer, then connects agent. Hands-free outreach.</div>}
                {dialingMode === 'predictive' && <div style={{ fontSize: '0.45rem', color: slate(0.5) }}>PREDICTIVE DIALING: Dials multiple numbers simultaneously using answer-rate prediction to minimize idle time.</div>}
              </div>

              <div style={{ border: `1px solid ${slate(0.2)}`, padding: '8px', marginBottom: 8, background: slate(0.03) }}>
                <div style={{ fontSize: '0.42rem', color: slate(0.7), letterSpacing: '0.1em', marginBottom: 6, borderBottom: `1px solid ${slate(0.12)}`, paddingBottom: 4 }}>⚙ SPEED CONTROL</div>
                {dialingMode === 'predictive' ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', color: slate(0.5) }}>SIMULTANEOUS LINES</span>
                      <span style={{ fontSize: '0.5rem', color: slate(0.9), ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), minWidth: 16, textAlign: 'right' }}>{dialConcurrency}</span>
                    </div>
                    <input type="range" min={2} max={5} step={1} value={dialConcurrency} onChange={e => setDialConcurrency(Number(e.target.value))} style={{ width: '100%', accentColor: slate(0.7), cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: slate(0.55), marginTop: 2 }}>
                      <span>2 LINES</span><span>5 LINES</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', color: slate(0.5) }}>DELAY BETWEEN CALLS</span>
                      <span style={{ fontSize: '0.5rem', color: slate(0.9), ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), minWidth: 24, textAlign: 'right' }}>{dialDelay}s</span>
                    </div>
                    <input type="range" min={0} max={30} step={1} value={dialDelay} onChange={e => setDialDelay(Number(e.target.value))} style={{ width: '100%', accentColor: slate(0.7), cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: slate(0.55), marginTop: 2 }}>
                      <span>0s (MAX SPEED)</span><span>30s</span>
                    </div>
                  </div>
                )}
              </div>

              {dialingSession ? (
                <div style={{ border: `1px solid ${warning(0.3)}`, padding: '8px', background: warning(0.05) }}>
                  <div style={{ fontSize: '0.5rem', color: warning(0.8), marginBottom: 4 }}>SESSION ACTIVE: {dialingSession.mode.toUpperCase()}</div>
                  <div style={{ fontSize: '0.42rem', color: warning(0.6) }}>
                    Progress: {dialingSession.dialed}/{dialingSession.total} dialed
                  </div>
                  <button onClick={stopDialingSession} style={{ marginTop: 6, padding: '5px 12px', background: destructive(0.15), border: `1px solid ${destructive(0.4)}`, color: destructive(0.8), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>STOP SESSION</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.45rem', color: slate(0.55), marginBottom: 6 }}>Select contacts from CONTACTS tab, then GO ACTIVE:</div>
                  <div style={{ fontSize: '0.45rem', color: slate(0.6), marginBottom: 8 }}>{selected.size} contacts selected</div>
                  <button onClick={startDialingSession} disabled={selected.size === 0} style={{ width: '100%', padding: '8px', background: selected.size > 0 ? slate(0.1) : slate(0.04), border: `1px solid ${selected.size > 0 ? slate(0.4) : slate(0.1)}`, color: selected.size > 0 ? slate(0.9) : slate(0.2), cursor: selected.size > 0 ? 'pointer' : 'default', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
                <div style={{ fontSize: '0.45rem', color: slate(0.55), marginBottom: 3 }}>LIVE TRANSCRIPT (paste or type)</div>
                <textarea
                  value={aiTranscript}
                  onChange={e => setAiTranscript(e.target.value)}
                  placeholder="Paste transcript or type notes..."
                  style={{ ...inputStyle, width: '100%', height: 70, resize: 'none', display: 'block' }}
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button onClick={getAISuggestions} disabled={aiLoading} style={{ flex: 1, ...btnStyle(slate), justifyContent: 'center' }}>
                    {aiLoading ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}SUGGESTIONS
                  </button>
                  <button onClick={() => {
                    const liveCall = activeCalls.find(c => !ENDED_STATUSES.includes(c.status));
                    if (liveCall) saveTranscript(liveCall.callSid);
                  }} style={{ flex: 1, ...btnStyle(slate), justifyContent: 'center' }}>SAVE</button>
                </div>
              </div>

              {aiSuggestions && (
                <div style={{ border: `1px solid ${slate(0.15)}`, padding: '6px', background: slate(0.02), marginBottom: 8 }}>
                  <div style={{ fontSize: '0.4rem', color: slate(0.55), marginBottom: 3 }}>TALKING POINTS</div>
                  <div style={{ fontSize: '0.45rem', color: slate(0.7), whiteSpace: 'pre-line' }}>{aiSuggestions}</div>
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
                <button onClick={askAICoach} disabled={aiLoading || !aiCoachQuestion.trim()} style={{ width: '100%', ...btnStyle(accent), justifyContent: 'center', padding: '6px' }}>
                  {aiLoading ? <Loader2 size={9} className="animate-spin" /> : <Bot size={9} />}ASK COACH
                </button>
                {aiCoachResponse && (
                  <div style={{ marginTop: 6, border: `1px solid ${accent(0.2)}`, padding: '6px', background: accent(0.03) }}>
                    <div style={{ fontSize: '0.4rem', color: accent(0.55), marginBottom: 2 }}>COACH RESPONSE</div>
                    <div style={{ fontSize: '0.45rem', color: accent(0.8) }}>{aiCoachResponse}</div>
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
                <button onClick={saveDictation} disabled={!dictationText.trim()} style={{ width: '100%', ...btnStyle(primary), justifyContent: 'center', padding: '5px' }}>
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
                <span style={{ fontSize: '0.5rem', color: slate(0.6), flex: 1 }}>SECRETARY AI ENABLED</span>
                <button
                  onClick={() => setSecretaryForm(f => ({ ...f, isEnabled: !f.isEnabled }))}
                  style={{ padding: '4px 12px', background: secretaryForm.isEnabled ? slate(0.15) : destructive(0.08), border: `1px solid ${secretaryForm.isEnabled ? slate(0.4) : destructive(0.3)}`, color: secretaryForm.isEnabled ? slate(0.9) : destructive(0.7), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
                  {secretaryForm.isEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>PERSONALITY</div>
                <select value={secretaryForm.personality ?? 'professional'} onChange={e => setSecretaryForm(f => ({ ...f, personality: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  <option value="professional" style={{ background: '#030803' }}>Professional</option>
                  <option value="friendly" style={{ background: '#030803' }}>Friendly</option>
                  <option value="formal" style={{ background: '#030803' }}>Formal</option>
                  <option value="casual" style={{ background: '#030803' }}>Casual</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>GREETING SCRIPT</div>
                <textarea value={secretaryForm.greetingScript ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, greetingScript: e.target.value }))}
                  placeholder="Thank you for calling. How can I help you?"
                  style={{ ...inputStyle, width: '100%', height: 55, resize: 'none', display: 'block' }} />
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>SCREENING RULES</div>
                <textarea value={secretaryForm.screeningRules ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, screeningRules: e.target.value }))}
                  placeholder="Ask for caller's name and reason for call..."
                  style={{ ...inputStyle, width: '100%', height: 45, resize: 'none', display: 'block' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 4 }}>
                <div>
                  <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>OPEN</div>
                  <input type="time" value={secretaryForm.businessHoursStart ?? '09:00'} onChange={e => setSecretaryForm(f => ({ ...f, businessHoursStart: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>CLOSE</div>
                  <input type="time" value={secretaryForm.businessHoursEnd ?? '17:00'} onChange={e => setSecretaryForm(f => ({ ...f, businessHoursEnd: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>FORWARD TO NUMBER (for transfers)</div>
                <input value={secretaryForm.forwardToNumber ?? ''} onChange={e => setSecretaryForm(f => ({ ...f, forwardToNumber: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), marginBottom: 3 }}>AFTER-HOURS ACTION</div>
                <select value={secretaryForm.afterHoursAction ?? 'voicemail'} onChange={e => setSecretaryForm(f => ({ ...f, afterHoursAction: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  <option value="voicemail" style={{ background: '#030803' }}>Voicemail</option>
                  <option value="forward" style={{ background: '#030803' }}>Forward</option>
                  <option value="hangup" style={{ background: '#030803' }}>Hang Up</option>
                </select>
              </div>

              <button onClick={saveSecretaryConfig} disabled={secretarySaving} style={{ padding: '8px', background: slate(0.1), border: `1px solid ${slate(0.35)}`, color: slate(0.9), cursor: 'pointer', fontSize: '0.55rem', letterSpacing: '0.1em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                {secretarySaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}SAVE CONFIGURATION
              </button>

              {secretaryConfig && (
                <div style={{ fontSize: '0.4rem', color: slate(0.55), textAlign: 'center' }}>
                  STATUS: {secretaryConfig.isEnabled ? <span style={{ color: slate(0.7) }}>ACTIVE</span> : <span style={{ color: destructive(0.6) }}>INACTIVE</span>}
                </div>
              )}

              <div style={{ fontSize: '0.4rem', color: slate(0.55), borderTop: `1px solid ${slate(0.08)}`, paddingTop: 6 }}>
                Inbound webhook: /api/twilio/inbound/webhook?userId={userId}
              </div>
            </div>
          </div>
        )}

        {tab === 'numbers' && (
          <div>
            {sectionHeader('PHONE NUMBERS')}
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8, border: `1px solid ${slate(0.16)}`, padding: '6px', background: slate(0.03) }}>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Search size={9} />BUY A NUMBER
                </div>
                {regionDefaults && (
                  <div style={{ fontSize: '0.4rem', color: slate(0.55) }}>
                    Home realm: {regionDefaults.countryInfo.flag} {regionDefaults.countryInfo.region}
                    {regionDefaults.cityId ? ` · ${regionDefaults.cityId.replace(/_/g, ' ').toUpperCase()}` : ''}
                  </div>
                )}
                <select value={buyCountry} onChange={e => { setBuyCountry(e.target.value); setAvailableNumbers([]); setSearchError(''); }} style={{ ...inputStyle, width: '100%' }}>
                  {(regionDefaults?.countries ?? []).map(c => (
                    <option key={c.iso} value={c.iso} style={{ background: '#030803' }}>{c.flag} {c.name} (+{c.dialCode})</option>
                  ))}
                </select>
                {regulatory?.required && (
                  <div style={{ fontSize: '0.4rem', color: warning(0.85), border: `1px solid ${warning(0.3)}`, background: warning(0.06), padding: '4px 5px', display: 'flex', gap: 4 }}>
                    <AlertCircle size={9} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{regulatory.message}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input value={numberSearch} onChange={e => setNumberSearch(e.target.value)} placeholder="Area code / digits (optional)..." style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={searchAvailableNumbers} disabled={!buyCountry || searchingNumbers} style={{ padding: '5px 8px', background: slate(0.1), border: `1px solid ${slate(0.3)}`, color: slate(0.8), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', gap: 4 }}>
                    {searchingNumbers ? <Loader2 size={9} className="animate-spin" /> : <Search size={9} />}SEARCH
                  </button>
                </div>
                {searchError && <div style={{ fontSize: '0.4rem', color: destructive(0.7) }}>{searchError}</div>}
                {availableNumbers.map(n => (
                  <div key={n.phoneNumber} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px', border: `1px solid ${slate(0.1)}`, background: slate(0.02) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.5rem', color: slate(0.8) }}>{formatPhone(n.phoneNumber)}</div>
                      {(n.locality || n.region) && <div style={{ fontSize: '0.38rem', color: slate(0.55) }}>{[n.locality, n.region].filter(Boolean).join(', ')}</div>}
                    </div>
                    <button onClick={() => purchaseNumber(n.phoneNumber)} disabled={!!purchasingNumber} style={{ padding: '3px 6px', background: slate(0.1), border: `1px solid ${slate(0.3)}`, color: slate(0.8), cursor: 'pointer', fontSize: '0.45rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', gap: 3 }}>
                      {purchasingNumber === n.phoneNumber ? <Loader2 size={8} className="animate-spin" /> : <Plus size={8} />}BUY
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, border: `1px solid ${slate(0.12)}`, padding: '6px', background: slate(0.02) }}>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.1em' }}>ADD EXISTING NUMBER</div>
                <input value={newNumberForm.number} onChange={e => setNewNumberForm(f => ({ ...f, number: e.target.value }))} placeholder="Phone number..." style={{ ...inputStyle, width: '100%' }} />
                <input value={newNumberForm.label} onChange={e => setNewNumberForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. main, support)..." style={{ ...inputStyle, width: '100%' }} />
                <input value={newNumberForm.greeting} onChange={e => setNewNumberForm(f => ({ ...f, greeting: e.target.value }))} placeholder="Greeting script (optional)..." style={{ ...inputStyle, width: '100%' }} />
                <select value={newNumberForm.routingMode} onChange={e => setNewNumberForm(f => ({ ...f, routingMode: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  <option value="voicemail" style={{ background: '#030803' }}>Route to Voicemail</option>
                  <option value="secretary" style={{ background: '#030803' }}>Route to Secretary AI</option>
                  <option value="forward" style={{ background: '#030803' }}>Forward to Number</option>
                </select>
                <button onClick={addPhoneNumber} disabled={!newNumberForm.number || addingNumber} style={{ padding: '5px', background: slate(0.1), border: `1px solid ${slate(0.3)}`, color: slate(0.8), cursor: 'pointer', fontSize: '0.5rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {addingNumber ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}ADD NUMBER
                </button>
              </div>

              {phoneNumbers.length === 0 ? (
                <div style={{ fontSize: '0.45rem', color: slate(0.55), textAlign: 'center', padding: '12px 0' }}>NO NUMBERS CONFIGURED</div>
              ) : (
                phoneNumbers.map(n => (
                  <div key={n.id} style={{ padding: '5px 6px', border: `1px solid ${slate(0.12)}`, marginBottom: 4, background: n.isActive ? slate(0.02) : 'transparent', opacity: n.isActive ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Hash size={9} style={{ color: slate(0.5), flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.5rem', color: slate(0.8) }}>
                          {n.countryCode ? `${(regionDefaults?.countries.find(c => c.iso === n.countryCode)?.flag) ?? ''} ` : ''}{formatPhone(n.number)}
                        </div>
                        <div style={{ fontSize: '0.4rem', color: slate(0.55) }}>{n.label} · {n.routingMode}{n.region ? ` · ${n.region}` : ''}</div>
                      </div>
                      {!n.isActive && (
                        <button onClick={() => setActiveNumber(n.id)} title="Set as active number" style={{ background: warning(0.06), border: `1px solid ${warning(0.3)}`, color: warning(0.8), cursor: 'pointer', padding: '2px 5px', fontSize: '0.4rem', letterSpacing: '0.08em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), display: 'flex', alignItems: 'center', gap: 3 }}><Check size={8} />SET ACTIVE</button>
                      )}
                      <button onClick={() => callSingle(n.number)} style={{ ...btnStyle(slate), padding: '2px 4px' }}><Phone size={9} /></button>
                      <button onClick={() => deletePhoneNumber(n.id)} style={{ background: destructive(0.06), border: `1px solid ${destructive(0.2)}`, color: destructive(0.5), cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}><Trash2 size={9} /></button>
                    </div>
                    {n.greeting && <div style={{ marginTop: 3, fontSize: '0.4rem', color: slate(0.55), fontStyle: 'italic' }}>"{n.greeting.slice(0, 60)}{n.greeting.length > 60 ? '...' : ''}"</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '3px 8px', borderTop: `1px solid ${slate(0.1)}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.06em' }}>
        <span>TTC ALPHA {__BUILD_VERSION__}</span>
        <span>TWILIO PSTN · AI POWERED</span>
      </div>
    </div>
  );
}
