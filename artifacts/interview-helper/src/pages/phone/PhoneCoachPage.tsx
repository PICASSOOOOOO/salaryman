import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Send, Loader2, Lightbulb, MessageCircle, BookOpen, Brain, Target, TrendingUp, AlertTriangle, X } from 'lucide-react';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  crt, amber, blue, purple, red,
} from '@/lib/phone-utils';

interface CoachMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export default function PhoneCoachPage() {
  const BASE = import.meta.env.BASE_URL;
  const navigate = useCalllHomeNavigate();

  const [aiTranscript, setAiTranscript] = useState('');
  const [aiCoachQuestion, setAiCoachQuestion] = useState('');
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [dictationText, setDictationText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [contactContext, setContactContext] = useState('');
  const [sugLoading, setSugLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'coach' | 'suggestions' | 'notes'>('coach');
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [coachMessages]);

  const handleApiError = useCallback(async (r: Response, fallback: string) => {
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Access denied — phone system subscription required.');
      navigate('/upgrade');
      return true;
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || fallback);
      return true;
    }
    return false;
  }, [navigate]);

  const askAICoach = async () => {
    if (!aiCoachQuestion.trim()) return;
    const question = aiCoachQuestion;
    setCoachMessages(prev => [...prev, { role: 'user', text: question, timestamp: Date.now() }]);
    setAiCoachQuestion('');
    setAiLoading(true);
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/ai/coach'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, transcript: aiTranscript, context: contactContext }),
      });
      if (await handleApiError(r, 'AI coach request failed')) { setAiLoading(false); return; }
      const d = await r.json();
      setCoachMessages(prev => [...prev, { role: 'ai', text: d.response, timestamp: Date.now() }]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
    setAiLoading(false);
  };

  const getAISuggestions = async () => {
    setSugLoading(true);
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/ai/suggest'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: aiTranscript, contactName: contactContext }),
      });
      if (await handleApiError(r, 'Failed to get suggestions')) { setSugLoading(false); return; }
      const d = await r.json();
      setAiSuggestions(d.suggestions);
      setActiveTab('suggestions');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
    setSugLoading(false);
  };

  const saveTranscript = async () => {
    if (!aiTranscript.trim()) return;
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/ai/transcribe'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: aiTranscript }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const errorMsg = (d as { error?: string }).error || 'Failed to save transcript';
        setError(errorMsg);
        setSaveMsg({ text: errorMsg, ok: false });
        setTimeout(() => setSaveMsg(null), 4000);
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'Network error';
      setError(errorMsg);
      setSaveMsg({ text: errorMsg, ok: false });
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const saveDictation = async () => {
    if (!dictationText.trim()) return;
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/ai/dictation'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dictationText }),
      });
      if (r.ok) {
        setDictationText('');
        setError('');
        setSaveMsg({ text: 'Note saved', ok: true });
        setTimeout(() => setSaveMsg(null), 2500);
      } else {
        const d = await r.json().catch(() => ({}));
        const errorMsg = (d as { error?: string }).error || 'Failed to save note';
        setError(errorMsg);
        setSaveMsg({ text: errorMsg, ok: false });
        setTimeout(() => setSaveMsg(null), 4000);
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'Network error — note not saved';
      setError(errorMsg);
      setSaveMsg({ text: errorMsg, ok: false });
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const STARTER_QUESTIONS = [
    { text: 'How should I handle objections about price?', icon: <Target size={12} />, color: amber },
    { text: 'What closing technique should I use here?', icon: <TrendingUp size={12} />, color: crt },
    { text: 'How can I build more rapport?', icon: <MessageCircle size={12} />, color: blue },
    { text: 'What should I say next?', icon: <Brain size={12} />, color: purple },
    { text: 'How do I schedule a follow-up?', icon: <BookOpen size={12} />, color: amber },
    { text: 'How do I overcome the gatekeeper?', icon: <Target size={12} />, color: red },
    { text: 'Suggest an elevator pitch for this contact', icon: <Lightbulb size={12} />, color: blue },
    { text: 'Rate my performance so far', icon: <TrendingUp size={12} />, color: purple },
  ];

  const TABS = [
    { key: 'coach' as const, label: 'COACH', icon: <Bot size={11} />, color: blue },
    { key: 'suggestions' as const, label: 'SUGGESTIONS', icon: <Lightbulb size={11} />, color: purple },
    { key: 'notes' as const, label: 'NOTES', icon: <BookOpen size={11} />, color: amber },
  ];

  return (
    <PhonePageLayout
      title="AI COACH"
      subtitle="Real-time call coaching, AI-powered suggestions, and conversation analysis"
      icon={<Bot size={24} style={{ color: blue(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniWaveform active={aiLoading || sugLoading} bars={4} color={blue} />
          <span style={{ color: aiLoading || sugLoading ? blue(0.5) : crt(0.2) }}>
            {aiLoading || sugLoading ? 'AI PROCESSING...' : 'COACH READY'}
          </span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="MESSAGES" value={coachMessages.length} color={blue} sub="in session" />
        <StatBlock label="TRANSCRIPT" value={aiTranscript ? `${aiTranscript.split(/\s+/).length}w` : '0w'} color={crt} sub="word count" />
        <StatBlock label="AI STATUS" value={aiLoading ? 'BUSY' : 'READY'} color={aiLoading ? amber : crt} />
        <StatBlock label="SUGGESTIONS" value={aiSuggestions ? '✓' : '—'} color={aiSuggestions ? purple : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={crt(0.4)}>LIVE TRANSCRIPT / NOTES</PhoneCardHeader>
            <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CONTACT / CALL CONTEXT</label>
                <input
                  value={contactContext}
                  onChange={e => setContactContext(e.target.value)}
                  placeholder="e.g. John from Acme Corp, cold call about product demo..."
                  style={INPUT_STYLE}
                />
              </div>
              <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>TRANSCRIPT</label>
              <textarea
                value={aiTranscript}
                onChange={e => setAiTranscript(e.target.value)}
                placeholder="Paste transcript or type notes from the live call here. The AI coach will use this to provide context-aware advice..."
                style={{
                  ...INPUT_STYLE,
                  height: 200, resize: 'vertical', display: 'block',
                  lineHeight: 1.7,
                }}
              />
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <PhoneBtn onClick={saveTranscript} disabled={!aiTranscript.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                  SAVE TRANSCRIPT
                </PhoneBtn>
                <PhoneBtn onClick={getAISuggestions} disabled={!aiTranscript.trim() || sugLoading} color={purple} glow={!!aiTranscript.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                  {sugLoading ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                  ANALYZE & SUGGEST
                </PhoneBtn>
              </div>
            </div>
          </PhoneCard>

          <PhoneCard>
            <div style={{ display: 'flex', borderBottom: `1px solid ${crt(0.06)}` }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: activeTab === t.key ? t.color(0.06) : 'transparent',
                    borderBottom: `2px solid ${activeTab === t.key ? t.color(0.5) : 'transparent'}`,
                    color: activeTab === t.key ? t.color(0.8) : crt(0.3),
                    fontSize: '0.48rem', letterSpacing: '0.15em',
                    cursor: 'pointer', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    fontFamily: "'Share Tech Mono', monospace", transition: 'all 0.15s',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'coach' && (
              <div>
                <div style={{ maxHeight: 320, overflowY: 'auto', padding: '12px 16px' }}>
                  {coachMessages.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center' }}>
                      <Bot size={28} style={{ color: blue(0.15), marginBottom: 8 }} />
                      <div style={{ fontSize: '0.52rem', color: crt(0.2), lineHeight: 1.6 }}>
                        Ask the AI coach a question about your call.<br />
                        Provide transcript context above for better answers.
                      </div>
                    </div>
                  ) : (
                    coachMessages.map((msg, i) => (
                      <div key={i} style={{
                        marginBottom: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{
                          maxWidth: '85%', padding: '10px 14px', borderRadius: 10,
                          background: msg.role === 'user'
                            ? `linear-gradient(135deg, ${crt(0.08)}, ${crt(0.03)})`
                            : `linear-gradient(135deg, ${blue(0.08)}, ${blue(0.02)})`,
                          border: `1px solid ${msg.role === 'user' ? crt(0.15) : blue(0.15)}`,
                        }}>
                          <div style={{ fontSize: '0.38rem', color: msg.role === 'user' ? crt(0.3) : blue(0.4), letterSpacing: '0.15em', marginBottom: 4 }}>
                            {msg.role === 'user' ? 'YOU' : 'AI COACH'}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: crt(0.7), lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {aiLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                      <Loader2 size={12} className="animate-spin" style={{ color: blue(0.5) }} />
                      <span style={{ fontSize: '0.5rem', color: blue(0.4) }}>Coach is thinking...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${crt(0.06)}` }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={aiCoachQuestion}
                      onChange={e => setAiCoachQuestion(e.target.value)}
                      placeholder="Ask the coach a question..."
                      style={{ ...INPUT_STYLE, flex: 1 }}
                      onKeyDown={e => e.key === 'Enter' && askAICoach()}
                    />
                    <PhoneBtn onClick={askAICoach} disabled={!aiCoachQuestion.trim() || aiLoading} color={blue} glow={!!aiCoachQuestion.trim()} style={{ padding: '8px 16px' }}>
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    </PhoneBtn>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'suggestions' && (
              <div style={{ padding: 16 }}>
                {aiSuggestions ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: '0.42rem', color: purple(0.5), letterSpacing: '0.2em' }}>AI ANALYSIS RESULTS</span>
                      <button onClick={() => setAiSuggestions('')} style={{ background: 'none', border: 'none', color: crt(0.2), cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.1em' }}>CLEAR</button>
                    </div>
                    <div style={{
                      fontSize: '0.6rem', color: crt(0.65), lineHeight: 1.8, whiteSpace: 'pre-wrap',
                      padding: '14px 16px', background: purple(0.02), borderRadius: 8, border: `1px solid ${purple(0.1)}`,
                    }}>
                      {aiSuggestions}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <Lightbulb size={28} style={{ color: purple(0.15), marginBottom: 8 }} />
                    <div style={{ fontSize: '0.52rem', color: crt(0.2), lineHeight: 1.6 }}>
                      Add transcript content and click "Analyze & Suggest"<br />to get AI-powered coaching suggestions.
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div style={{ padding: 16 }}>
                {saveMsg && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: saveMsg.ok ? 'rgba(0,220,60,0.06)' : 'rgba(255,40,40,0.08)', border: `1px solid ${saveMsg.ok ? 'rgba(0,220,60,0.2)' : 'rgba(255,40,40,0.2)'}`, borderRadius: 6, fontSize: '0.55rem', color: saveMsg.ok ? 'rgba(0,220,60,0.9)' : 'rgba(255,80,80,0.9)' }}>
                    {saveMsg.text}
                  </div>
                )}
                <label style={{ fontSize: '0.42rem', color: amber(0.4), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>QUICK CALL NOTES</label>
                <textarea
                  value={dictationText}
                  onChange={e => setDictationText(e.target.value)}
                  placeholder="Type quick notes to save to the call log. These will be attached to the most recent call record..."
                  style={{ ...INPUT_STYLE, height: 140, resize: 'vertical', display: 'block', marginBottom: 8, lineHeight: 1.7 }}
                />
                <PhoneBtn onClick={saveDictation} disabled={!dictationText.trim()} color={amber} style={{ width: '100%', justifyContent: 'center' }}>
                  SAVE NOTES TO CALL LOG
                </PhoneBtn>
              </div>
            )}
          </PhoneCard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={blue(0.4)}>QUICK PROMPTS</PhoneCardHeader>
            <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              {STARTER_QUESTIONS.map(q => (
                <button
                  key={q.text}
                  onClick={() => { setAiCoachQuestion(q.text); setActiveTab('coach'); }}
                  style={{
                    padding: '9px 12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(0,12,0,0.5)', border: `1px solid ${crt(0.07)}`,
                    borderRadius: 6, cursor: 'pointer', fontSize: '0.52rem', color: crt(0.5), letterSpacing: '0.03em',
                    transition: 'all 0.15s', fontFamily: "'Share Tech Mono', monospace",
                  }}
                >
                  <div style={{ color: q.color(0.5), flexShrink: 0 }}>{q.icon}</div>
                  {q.text}
                </button>
              ))}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={amber(0.4)}>COACHING PLAYBOOK</PhoneCardHeader>
            <div style={{ padding: 14 }}>
              {[
                { step: '1. PREPARE', desc: 'Set the contact context before the call', color: crt },
                { step: '2. TRANSCRIBE', desc: 'Paste or type key moments during the call', color: blue },
                { step: '3. ASK', desc: 'Get real-time coaching advice from the AI', color: purple },
                { step: '4. ANALYZE', desc: 'Run full analysis for improvement tips', color: amber },
                { step: '5. DOCUMENT', desc: 'Save notes for the call history record', color: crt },
              ].map(({ step, desc, color }) => (
                <div key={step} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.45rem', color: color(0.6), letterSpacing: '0.15em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: color(0.5) }} />
                    {step}
                  </div>
                  <div style={{ fontSize: '0.48rem', color: crt(0.3), paddingLeft: 7 }}>{desc}</div>
                </div>
              ))}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader>SESSION STATS</PhoneCardHeader>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['QUESTIONS ASKED', coachMessages.filter(m => m.role === 'user').length],
                ['AI RESPONSES', coachMessages.filter(m => m.role === 'ai').length],
                ['TRANSCRIPT WORDS', aiTranscript ? aiTranscript.split(/\s+/).length : 0],
                ['NOTES LENGTH', dictationText.length],
              ].map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.45rem', color: crt(0.25), letterSpacing: '0.1em' }}>{label as string}</span>
                  <span style={{ fontSize: '0.75rem', color: crt(0.5), fontVariantNumeric: 'tabular-nums' }}>{val as number}</span>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
