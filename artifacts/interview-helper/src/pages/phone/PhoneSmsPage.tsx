import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Plus, X, Loader2 } from 'lucide-react';
import { slate, warning, formatPhone } from '@/lib/phone-utils';
import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { invalidateCommsSummary } from '@/hooks/use-comms-summary';

interface SmsConversation {
  id: number;
  contactPhone: string;
  contactName: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface SmsMessage {
  id: number;
  direction: string;
  body: string;
  fromPhone: string;
  toPhone: string;
  status: string;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function PhoneSmsPage() {
  const isMobile = useIsMobile();

  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [activeConv, setActiveConv] = useState<SmsConversation | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await apiFetch('/api/sms/conversations');
      if (r.ok) { const d = await r.json(); setConversations(d.conversations || []); }
    } catch {}
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await apiFetch(`/api/sms/conversations/${convId}/messages`);
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages || []);
        invalidateCommsSummary();
      }
    } catch {}
    setLoadingMsgs(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Poll for new inbound texts (and Mila auto-replies) so threads stay live.
  useEffect(() => {
    const id = setInterval(loadConversations, 15000);
    return () => clearInterval(id);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConv) return;
    loadMessages(activeConv.id);
    const id = setInterval(() => loadMessages(activeConv.id), 10000);
    return () => clearInterval(id);
  }, [activeConv, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!newMsg.trim() || !activeConv) return;
    setSending(true);
    const body = newMsg.trim();
    setNewMsg('');
    try {
      const r = await apiFetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeConv.contactPhone, body, contactName: activeConv.contactName }) });
      const d = await r.json();
      if (r.ok && d.message) {
        setMessages(prev => [...prev, d.message]);
        setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, lastMessageAt: new Date().toISOString() } : c));
      }
    } catch {}
    setSending(false);
  }

  async function startNewConversation() {
    if (!newPhone.trim() || !newMsg.trim()) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newPhone, body: newMsg, contactName: newName || newPhone }) });
      const d = await r.json();
      if (r.ok) {
        setShowNewConv(false);
        setNewPhone('');
        setNewName('');
        setNewMsg('');
        await loadConversations();
        if (d.conversation) setActiveConv(d.conversation);
      }
    } catch {}
    setSending(false);
  }

  const mono = { fontFamily: "var(--font-sans)" } as const;
  const inputStyle: React.CSSProperties = {
    width: '100%', background: slate(0.03), border: `1px solid ${slate(0.15)}`,
    borderRadius: 4, padding: '8px 10px', fontSize: '0.55rem', color: slate(0.9),
    outline: 'none', ...mono };

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: isMobile ? 720 : 600,
      border: `1px solid ${slate(0.1)}`,
      borderRadius: 8,
      overflow: 'hidden',
      background: slate(0.01),
      ...mono,
    }}>
      {/* Conversation list */}
      <div style={{
        width: isMobile ? '100%' : 260,
        height: isMobile ? 220 : 'auto',
        borderRight: isMobile ? 'none' : `1px solid ${slate(0.1)}`,
        borderBottom: isMobile ? `1px solid ${slate(0.1)}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${slate(0.1)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: slate(0.8), display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={12} style={{ color: slate(0.6) }} /> SMS THREADS
          </span>
          <button
            onClick={() => { setShowNewConv(true); setActiveConv(null); }}
            data-testid="button-new-sms"
            title="New conversation"
            style={{
              padding: 5, borderRadius: 4, cursor: 'pointer',
              background: warning(0.08), border: `1px solid ${warning(0.25)}`, color: warning(0.85),
              display: 'flex', alignItems: 'center' }}
          >
            <Plus size={12} />
          </button>
        </div>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={16} style={{ color: slate(0.55), animation: 'spin 1s linear infinite' }} />
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }}>
            <MessageSquare size={28} style={{ color: slate(0.55) }} />
            <p style={{ fontSize: '0.48rem', color: slate(0.55), lineHeight: 1.6 }}>No threads yet. Inbound texts and Mila's replies appear here.</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {conversations.map(conv => {
              const isActive = activeConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => { setActiveConv(conv); setShowNewConv(false); }}
                  data-testid={`sms-conv-${conv.id}`}
                  style={{
                    width: '100%', padding: 12, textAlign: 'left', cursor: 'pointer',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: `1px solid ${slate(0.06)}`,
                    background: isActive ? slate(0.06) : 'transparent',
                    ...mono }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.55rem', color: slate(0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {conv.contactName || formatPhone(conv.contactPhone)}
                      </div>
                      <div style={{ fontSize: '0.45rem', color: slate(0.55), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatPhone(conv.contactPhone)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.42rem', color: slate(0.55) }}>{formatTime(conv.lastMessageAt)}</span>
                      {conv.unreadCount > 0 && (
                        <span style={{
                          minWidth: 14, height: 14, padding: '0 4px', borderRadius: 7,
                          background: warning(0.85), color: '#020802', fontSize: '0.42rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Thread / composer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showNewConv ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.6rem', color: slate(0.85), letterSpacing: '0.12em' }}>NEW CONVERSATION</span>
              <button onClick={() => setShowNewConv(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: slate(0.55) }}>
                <X size={14} />
              </button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.42rem', color: slate(0.5), letterSpacing: '0.15em', marginBottom: 4 }}>PHONE NUMBER *</label>
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 555 000 1234" data-testid="input-sms-phone" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.42rem', color: slate(0.5), letterSpacing: '0.15em', marginBottom: 4 }}>CONTACT NAME</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)" data-testid="input-sms-name" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.42rem', color: slate(0.5), letterSpacing: '0.15em', marginBottom: 4 }}>FIRST MESSAGE *</label>
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={3} placeholder="Write your first message..." data-testid="input-sms-first" style={{ ...inputStyle, resize: 'none' }} />
            </div>
            <button
              onClick={startNewConversation}
              disabled={sending || !newPhone.trim() || !newMsg.trim()}
              data-testid="button-sms-start"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 6, cursor: 'pointer',
                background: warning(0.1), border: `1px solid ${warning(0.3)}`, color: warning(0.9),
                fontSize: '0.5rem', letterSpacing: '0.12em', opacity: sending || !newPhone.trim() || !newMsg.trim() ? 0.4 : 1,
                ...mono }}
            >
              {sending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
              SEND & START
            </button>
          </div>
        ) : activeConv ? (
          <>
            <div style={{ padding: 12, borderBottom: `1px solid ${slate(0.1)}` }}>
              <div style={{ fontSize: '0.6rem', color: slate(0.9) }}>{activeConv.contactName || formatPhone(activeConv.contactPhone)}</div>
              <div style={{ fontSize: '0.45rem', color: slate(0.55) }}>{formatPhone(activeConv.contactPhone)}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loadingMsgs ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={16} style={{ color: slate(0.55), animation: 'spin 1s linear infinite' }} />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.48rem', color: slate(0.55) }}>No messages yet.</div>
              ) : (
                messages.map(msg => {
                  const outbound = msg.direction === 'outbound';
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: outbound ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '75%', padding: '8px 11px', borderRadius: 10,
                        fontSize: '0.55rem', lineHeight: 1.5, color: slate(0.9),
                        background: outbound ? warning(0.08) : slate(0.05),
                        border: `1px solid ${outbound ? warning(0.22) : slate(0.12)}`,
                        borderBottomRightRadius: outbound ? 2 : 10,
                        borderBottomLeftRadius: outbound ? 10 : 2 }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</div>
                        <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 4, textAlign: 'right' }}>
                          {outbound ? 'MILA · ' : ''}{formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${slate(0.1)}`, display: 'flex', gap: 8 }}>
              <textarea
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                rows={2}
                placeholder="Type a message..."
                data-testid="input-sms-reply"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                style={{ ...inputStyle, flex: 1, resize: 'none' }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMsg.trim()}
                data-testid="button-sms-send"
                style={{
                  alignSelf: 'flex-end', padding: 10, borderRadius: 6, cursor: 'pointer',
                  background: warning(0.1), border: `1px solid ${warning(0.3)}`, color: warning(0.9),
                  display: 'flex', alignItems: 'center', opacity: sending || !newMsg.trim() ? 0.4 : 1 }}
              >
                {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
            <MessageSquare size={40} style={{ color: slate(0.55) }} />
            <p style={{ fontSize: '0.55rem', color: slate(0.55) }}>Select a thread or start a new conversation</p>
            <button
              onClick={() => setShowNewConv(true)}
              data-testid="button-sms-empty-new"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                background: warning(0.1), border: `1px solid ${warning(0.3)}`, color: warning(0.9),
                fontSize: '0.5rem', letterSpacing: '0.12em', ...mono }}
            >
              <Plus size={12} /> NEW CONVERSATION
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
