import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { BookOpen, Send, Copy, Check, Sparkles, ChevronRight, ArrowLeft, Lightbulb, Zap, Terminal, Bot, Code2, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useBoomerMode } from '@/hooks/use-mobile';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const QUICK_LESSONS = [
  { id: 'basics', label: 'THE 5 FUNDAMENTALS', icon: BookOpen, color: '#22c55e', desc: 'Core prompting rules every user must know' },
  { id: 'pablo', label: 'DIRECTING PABLO', icon: MessageSquare, color: '#38bdf8', desc: 'Get 10x better answers from Pablo' },
  { id: 'claude', label: 'CLAUDE MASTERY', icon: Terminal, color: '#a855f7', desc: 'Advanced Claude Code techniques' },
  { id: 'cheatsheet', label: 'CCT CHEAT SHEET', icon: Code2, color: '#f59e0b', desc: 'Navigate 1,700+ templates like a pro' },
  { id: 'bots', label: 'BOT BUILDING', icon: Bot, color: '#ef4444', desc: 'Write system prompts that actually work' },
  { id: 'workflows', label: 'AGENTIC CHAINS', icon: Zap, color: '#06b6d4', desc: 'Multi-step AI automation patterns' },
];

const STARTER_PROMPTS: Record<string, string> = {
  basics: "Teach me the 5 fundamental rules of prompting that every user needs to know. Give me copy-paste examples I can use right now.",
  pablo: "How do I direct Pablo to get much better answers? Show me the key techniques with real examples.",
  claude: "Show me advanced Claude Code techniques — how to use CLAUDE.md, @file references, and agentic workflows.",
  cheatsheet: "Walk me through the CCT cheat sheet at /claude-templates. How do I find and use the 1,700+ components?",
  bots: "Teach me how to write a great system prompt for creating a Pixel Agents bot. I want it to be effective for my business.",
  workflows: "Show me how to chain multiple AI actions together into an agentic workflow. I want to automate complex tasks.",
};

const VT: React.CSSProperties = { fontFamily: "var(--font-sans)" };
const SM: React.CSSProperties = { fontFamily: "var(--font-sans)" };

export default function PromptSensei() {
  const [, navigate] = useLocation();
  const [boomerMode] = useBoomerMode();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');
  const [showLessons, setShowLessons] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowLessons(false);
    setLoading(true);

    try {
      const history = [...messages, userMsg].slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await apiFetch('/api/chat/prompt-sensei', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) throw new Error('Failed to get response');
      const data = await res.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'CONNECTION ERROR — PABLO CORP RELAY OFFLINE. TRY AGAIN.',
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleLessonClick = (lessonId: string) => {
    const prompt = STARTER_PROMPTS[lessonId];
    if (prompt) sendMessage(prompt);
  };

  const copyBlock = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 2000);
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const lang = lines[0].replace('```', '').trim();
        const code = lines.slice(1, -1).join('\n');
        return (
          <div key={i} style={{ margin: '.5rem 0', background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.25rem .5rem', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <span style={{ ...SM, fontSize: '.45rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.08em' }}>{lang || 'CODE'}</span>
              <button
                onClick={() => copyBlock(code)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', gap: '.2rem' }}
              >
                {copied === code
                  ? <Check size={10} color="#22c55e" />
                  : <Copy size={10} color="rgba(255,255,255,.3)" />
                }
              </button>
            </div>
            <pre style={{ ...SM, fontSize: '.55rem', color: '#38bdf8', padding: '.5rem', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{code}</pre>
          </div>
        );
      }
      return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050a12 0%, #0a0f1a 50%, #080510 100%)',
      display: 'flex',
      flexDirection: 'column',
      ...SM,
    }}>
      <div style={{
        padding: '.6rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
        background: 'rgba(0,0,0,.3)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
        >
          <ArrowLeft size={14} color="rgba(255,255,255,.3)" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <div style={{
            width: 28, height: 28,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4,
          }}>
            <Lightbulb size={15} color="#fff" />
          </div>
          <div>
            <div style={{ ...VT, fontSize: '1.1rem', color: '#f59e0b', letterSpacing: '.1em' }}>
              {boomerMode ? 'PROMPT COACH' : 'SENSEI PRIME'}
            </div>
            <div style={{ fontSize: '.4rem', color: 'rgba(255,255,255,.2)', letterSpacing: '.08em' }}>
              {boomerMode ? 'LEARN HOW TO USE AI BETTER' : 'MASTER CLAUDE & PABLO — GET 10X MORE FROM AI'}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
          <button
            onClick={() => navigate('/claude-templates')}
            style={{
              ...SM,
              padding: '.25rem .5rem',
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.3)',
              color: '#f59e0b',
              cursor: 'pointer',
              fontSize: '.4rem',
              letterSpacing: '.08em',
              display: 'flex',
              alignItems: 'center',
              gap: '.25rem',
            }}
          >
            <Code2 size={10} /> CCT CHEAT SHEET
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {showLessons && messages.length === 0 && (
          <div style={{ maxWidth: 700, margin: '0 auto', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem', marginTop: '1rem' }}>
              <div style={{
                ...VT,
                fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                background: 'linear-gradient(90deg, #f59e0b, #ef4444, #a855f7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '.12em',
                marginBottom: '.3rem',
              }}>
                PROMPT SENSEI
              </div>
              <div style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                {boomerMode
                  ? 'LEARN HOW TO TALK TO AI SO IT GIVES YOU BETTER ANSWERS'
                  : 'YOUR AI PROMPT ENGINEERING COACH — MASTER THE CCT CHEAT SHEET, DIRECT PABLO WITH PRECISION, AND EXTRACT MAXIMUM VALUE FROM CLAUDE'
                }
              </div>
            </div>

            <div style={{ fontSize: '.45rem', color: 'rgba(245,158,11,.5)', letterSpacing: '.12em', marginBottom: '.5rem' }}>
              QUICK LESSONS — PICK ONE TO START
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem' }}>
              {QUICK_LESSONS.map(lesson => (
                <button
                  key={lesson.id}
                  onClick={() => handleLessonClick(lesson.id)}
                  style={{
                    padding: '.65rem .75rem',
                    background: `${lesson.color}08`,
                    border: `1px solid ${lesson.color}30`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.25rem',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = `${lesson.color}15`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${lesson.color}60`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = `${lesson.color}08`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${lesson.color}30`;
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                    <lesson.icon size={13} color={lesson.color} />
                    <span style={{ ...VT, fontSize: '.85rem', color: lesson.color, letterSpacing: '.06em' }}>{lesson.label}</span>
                  </div>
                  <span style={{ fontSize: '.42rem', color: 'rgba(255,255,255,.25)', letterSpacing: '.04em', lineHeight: 1.6 }}>{lesson.desc}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.15rem', marginTop: '.1rem' }}>
                    <ChevronRight size={9} color={`${lesson.color}60`} />
                    <span style={{ fontSize: '.35rem', color: `${lesson.color}50`, letterSpacing: '.08em' }}>START LESSON</span>
                  </div>
                </button>
              ))}
            </div>

            <div style={{
              marginTop: '1rem',
              padding: '.6rem .75rem',
              background: 'rgba(255,255,255,.02)',
              border: '1px solid rgba(255,255,255,.06)',
              fontSize: '.45rem',
              color: 'rgba(255,255,255,.2)',
              letterSpacing: '.04em',
              lineHeight: 1.8,
              textAlign: 'center',
            }}>
              OR TYPE ANY QUESTION BELOW — ASK ABOUT PROMPTING TECHNIQUES, SYSTEM PROMPTS, AGENTIC WORKFLOWS, OR ANYTHING AI-RELATED
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              maxWidth: 700,
              margin: '0 auto',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '85%',
              padding: '.6rem .75rem',
              background: msg.role === 'user'
                ? 'rgba(56,189,248,.1)'
                : 'rgba(245,158,11,.05)',
              border: msg.role === 'user'
                ? '1px solid rgba(56,189,248,.2)'
                : '1px solid rgba(245,158,11,.15)',
              fontSize: '.55rem',
              color: msg.role === 'user' ? 'rgba(56,189,248,.85)' : 'rgba(255,255,255,.65)',
              lineHeight: 1.8,
              letterSpacing: '.02em',
            }}>
              {msg.role === 'assistant' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginBottom: '.3rem' }}>
                  <Lightbulb size={10} color="#f59e0b" />
                  <span style={{ ...VT, fontSize: '.7rem', color: '#f59e0b', letterSpacing: '.08em' }}>SENSEI</span>
                </div>
              )}
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ maxWidth: 700, margin: '0 auto', width: '100%' }}>
            <div style={{
              padding: '.6rem .75rem',
              background: 'rgba(245,158,11,.05)',
              border: '1px solid rgba(245,158,11,.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '.35rem',
            }}>
              <Sparkles size={12} color="#f59e0b" style={{ animation: 'spin 2s linear infinite' }} />
              <span style={{ ...VT, fontSize: '.7rem', color: '#f59e0b', letterSpacing: '.08em' }}>SENSEI IS THINKING...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={{
        padding: '.6rem 1rem',
        borderTop: '1px solid rgba(255,255,255,.06)',
        background: 'rgba(0,0,0,.3)',
      }}>
        <div style={{
          maxWidth: 700,
          margin: '0 auto',
          display: 'flex',
          gap: '.4rem',
          alignItems: 'flex-end',
        }}>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setShowLessons(true); }}
              style={{
                ...SM,
                padding: '.4rem .5rem',
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.08)',
                color: 'rgba(255,255,255,.2)',
                cursor: 'pointer',
                fontSize: '.4rem',
                letterSpacing: '.06em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              NEW LESSON
            </button>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={boomerMode ? "Ask me anything about using AI..." : "ASK SENSEI ANYTHING — PROMPTS, TECHNIQUES, TEMPLATES..."}
            rows={1}
            style={{
              ...SM,
              flex: 1,
              padding: '.45rem .6rem',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(245,158,11,.15)',
              color: 'rgba(255,255,255,.7)',
              fontSize: '.55rem',
              letterSpacing: '.03em',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              padding: '.4rem .6rem',
              background: input.trim() ? 'rgba(245,158,11,.15)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${input.trim() ? 'rgba(245,158,11,.4)' : 'rgba(255,255,255,.08)'}`,
              color: input.trim() ? '#f59e0b' : 'rgba(255,255,255,.15)',
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
