import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Send, Loader2, GraduationCap } from 'lucide-react';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

interface Msg { role: 'user' | 'assistant'; content: string }

// A lightweight, classroom-scoped Pablo tutor. Reuses the existing
// /api/chat/pablo/message endpoint with a tutoring framing in the first prompt.
export default function TutorPanel({ classroomName }: { classroomName: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: `I'm your study tutor for ${classroomName}. Ask me to explain a concept, quiz you, or help with an assignment.` },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await apiFetch('/api/chat/pablo/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[Tutoring request for the class "${classroomName}". Act as a patient tutor — explain clearly, use examples, and check understanding.] ${text}`,
          context: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const reply = data?.pabloMessage?.content ?? "I couldn't reach the tutor right now.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The tutor is temporarily unavailable. Try again in a moment.' }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, classroomName]);

  return (
    <div style={{
      border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
      background: 'rgba(56,189,248,0.04)', display: 'flex', flexDirection: 'column',
      height: 420, fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: CRT, fontSize: '0.85rem', letterSpacing: '0.08em', padding: '12px 14px', borderBottom: '1px solid rgba(56,189,248,0.15)' }}>
        <GraduationCap size={16} /> PABLO TUTOR
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? CRT : 'rgba(255,255,255,0.05)',
              color: m.role === 'user' ? '#04121c' : 'rgba(228,228,231,0.92)',
              border: m.role === 'user' ? 'none' : '1px solid rgba(56,189,248,0.15)',
            }}>{m.content}</div>
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: 'flex-start', color: 'rgba(56,189,248,0.6)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} className="animate-spin" /> thinking…
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(56,189,248,0.15)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Ask the tutor…"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(228,228,231,0.9)', fontFamily: 'inherit', fontSize: '0.8rem',
            padding: '8px 12px', outline: 'none', borderRadius: 6,
          }}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40,
            background: CRT, color: '#04121c', border: 'none', borderRadius: 6,
            cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
