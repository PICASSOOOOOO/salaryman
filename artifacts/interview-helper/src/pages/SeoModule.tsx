import { apiFetch } from '@/lib/api-client';
import { useState, useRef } from 'react';
import { Loader2, Search, Globe, FileText, BarChart2, Copy, Check, ChevronRight } from 'lucide-react';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import ReactMarkdown from 'react-markdown';

const CRT_GREEN = '#38bdf8';
const CRT_DIM = 'rgba(56,189,248,0.5)';

const CRT_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(228,228,231,0.9)',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  padding: '8px 12px',
  outline: 'none',
  width: '100%',
  borderRadius: '6px',
};

const CRT_TEXTAREA_STYLE: React.CSSProperties = {
  ...CRT_INPUT_STYLE,
  resize: 'vertical' as const,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'monospace',
      fontSize: '0.65rem',
      letterSpacing: '0.1em',
      color: 'rgba(161,161,170,0.6)',
      marginBottom: '6px',
      textTransform: 'uppercase' as const,
    }}>
      {children}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      border: '1px solid rgba(56,189,248,0.2)',
      background: 'rgba(0,10,0,0.6)',
      padding: '16px',
      borderRadius: '4px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function CrtButton({ onClick, children, disabled, style, small }: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'inherit',
        fontSize: small ? '0.75rem' : '0.85rem',
        letterSpacing: '0.05em',
        color: disabled ? 'rgba(161,161,170,0.3)' : 'rgba(56,189,248,0.9)',
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(56,189,248,0.3)'}`,
        background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(56,189,248,0.08)',
        padding: small ? '4px 10px' : '7px 16px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StreamOutput({ output, loading, statusMsg, placeholder }: {
  output: string;
  loading: boolean;
  statusMsg?: string;
  placeholder: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyText() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Panel style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <SectionLabel>ANALYSIS OUTPUT</SectionLabel>
        {output && (
          <CrtButton onClick={copyText} small>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'COPIED' : 'COPY'}
          </CrtButton>
        )}
      </div>

      {loading && statusMsg && !output && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: CRT_DIM, flexShrink: 0 }} />
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: CRT_DIM, letterSpacing: '0.1em' }}>
            {statusMsg.toUpperCase()}
          </span>
        </div>
      )}

      <div style={{
        flex: 1,
        overflowY: 'auto' as const,
        fontFamily: "var(--font-sans)",
        fontSize: '0.8rem',
        lineHeight: 1.7,
        color: output ? 'rgba(228,228,231,0.85)' : 'rgba(56,189,248,0.2)',
      }}>
        {output ? (
          <div className="seo-markdown-output" style={{ color: 'rgba(228,228,231,0.85)' }}>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 style={{ color: CRT_GREEN, fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px', borderBottom: '1px solid rgba(56,189,248,0.2)', paddingBottom: '4px' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ color: CRT_GREEN, fontFamily: 'monospace', fontSize: '0.9rem', letterSpacing: '0.08em', marginBottom: '6px', marginTop: '14px' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ color: 'rgba(56,189,248,0.75)', fontFamily: 'monospace', fontSize: '0.82rem', letterSpacing: '0.06em', marginBottom: '4px', marginTop: '10px' }}>{children}</h3>,
                p: ({ children }) => <p style={{ marginBottom: '8px', lineHeight: 1.65 }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: '18px', marginBottom: '8px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: '18px', marginBottom: '8px' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: '3px' }}>{children}</li>,
                code: ({ children, className }) => {
                  const isBlock = className?.startsWith('language-');
                  return isBlock ? (
                    <pre style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(56,189,248,0.15)', padding: '10px 12px', overflowX: 'auto', marginBottom: '8px', borderRadius: '4px' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(56,189,248,0.8)' }}>{children}</code>
                    </pre>
                  ) : (
                    <code style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'rgba(56,189,248,0.9)' }}>{children}</code>
                  );
                },
                strong: ({ children }) => <strong style={{ color: CRT_GREEN, fontWeight: 600 }}>{children}</strong>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: `2px solid rgba(56,189,248,0.4)`, paddingLeft: '12px', color: 'rgba(228,228,231,0.6)', marginBottom: '8px' }}>{children}</blockquote>,
                table: ({ children }) => <div style={{ overflowX: 'auto', marginBottom: '8px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>{children}</table></div>,
                th: ({ children }) => <th style={{ border: '1px solid rgba(56,189,248,0.2)', padding: '4px 8px', color: CRT_GREEN, textAlign: 'left', background: 'rgba(56,189,248,0.06)' }}>{children}</th>,
                td: ({ children }) => <td style={{ border: '1px solid rgba(255,255,255,0.06)', padding: '4px 8px', color: 'rgba(228,228,231,0.8)' }}>{children}</td>,
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(56,189,248,0.15)', margin: '12px 0' }} />,
              }}
            >
              {output}
            </ReactMarkdown>
            {loading && <span style={{ color: CRT_DIM, animation: 'smfade 0.8s steps(1) infinite alternate' }}>▋</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '8px', opacity: 0.6 }}>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: CRT_DIM }} />
            ) : (
              <>
                <Search className="w-8 h-8" style={{ color: 'rgba(56,189,248,0.2)' }} />
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'rgba(56,189,248,0.3)' }}>
                  {placeholder}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

async function streamRequest(
  endpoint: string,
  body: object,
  onStatus: (s: string) => void,
  onChunk: (c: string) => void,
  onDone: () => void,
  onError: (e: string) => void,
  signal: AbortSignal
) {
  const res = await apiFetch(`/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    onError(err.error ?? 'Request failed');
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if (d.status) onStatus(d.status);
        if (d.content) onChunk(d.content);
        if (d.done) onDone();
        if (d.error) onError(d.error);
      } catch {}
    }
  }
}

function SiteAudit() {
  const [url, setUrl] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!url.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setOutput('');
    setError('');
    setStatusMsg('');

    try {
      await streamRequest(
        '/seo/audit',
        { url: url.trim() },
        setStatusMsg,
        (c) => setOutput(p => p + c),
        () => setLoading(false),
        (e) => { setError(e); setLoading(false); },
        abortRef.current.signal
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Request failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Panel>
        <SectionLabel>TARGET URL</SectionLabel>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com or example.com"
            style={CRT_INPUT_STYLE}
            onKeyDown={e => { if (e.key === 'Enter') run(); }}
          />
          <CrtButton onClick={run} disabled={loading || !url.trim()} style={{ flexShrink: 0 }}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {loading ? 'AUDITING...' : 'RUN AUDIT'}
          </CrtButton>
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(161,161,170,0.4)', marginTop: '6px', letterSpacing: '0.05em' }}>
          SPIDER-X will fetch the page server-side and analyze it for SEO issues, scoring each category.
        </p>
      </Panel>

      {error && (
        <Panel style={{ borderColor: 'rgba(255,50,50,0.4)', background: 'rgba(255,0,0,0.05)' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,80,80,0.9)' }}>ERROR: {error}</span>
        </Panel>
      )}

      <StreamOutput
        output={output}
        loading={loading}
        statusMsg={statusMsg}
        placeholder="ENTER URL AND RUN AUDIT"
      />
    </div>
  );
}

function KeywordResearch() {
  const [topic, setTopic] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!topic.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setOutput('');
    setError('');

    try {
      await streamRequest(
        '/seo/keywords',
        { topic: topic.trim() },
        () => {},
        (c) => setOutput(p => p + c),
        () => setLoading(false),
        (e) => { setError(e); setLoading(false); },
        abortRef.current.signal
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Request failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Panel>
        <SectionLabel>SEED KEYWORD OR TOPIC</SectionLabel>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. project management software, cold brew coffee, remote work tools..."
            style={CRT_INPUT_STYLE}
            onKeyDown={e => { if (e.key === 'Enter') run(); }}
          />
          <CrtButton onClick={run} disabled={loading || !topic.trim()} style={{ flexShrink: 0 }}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
            {loading ? 'RESEARCHING...' : 'RESEARCH'}
          </CrtButton>
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(161,161,170,0.4)', marginTop: '6px', letterSpacing: '0.05em' }}>
          AI generates primary, secondary, and long-tail keywords with intent classification and content angle suggestions.
        </p>
      </Panel>

      {error && (
        <Panel style={{ borderColor: 'rgba(255,50,50,0.4)', background: 'rgba(255,0,0,0.05)' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,80,80,0.9)' }}>ERROR: {error}</span>
        </Panel>
      )}

      <StreamOutput
        output={output}
        loading={loading}
        placeholder="ENTER A TOPIC TO RESEARCH KEYWORDS"
      />
    </div>
  );
}

function ContentOptimizer() {
  const [content, setContent] = useState('');
  const [keyword, setKeyword] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!content.trim() || !keyword.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setOutput('');
    setError('');

    try {
      await streamRequest(
        '/seo/optimize',
        { content: content.trim(), keyword: keyword.trim() },
        () => {},
        (c) => setOutput(p => p + c),
        () => setLoading(false),
        (e) => { setError(e); setLoading(false); },
        abortRef.current.signal
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Request failed. Please try again.');
      setLoading(false);
    }
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Panel>
          <SectionLabel>TARGET KEYWORD</SectionLabel>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="e.g. best CRM software for startups"
            style={CRT_INPUT_STYLE}
          />
        </Panel>

        <Panel style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <SectionLabel>CONTENT TO OPTIMIZE</SectionLabel>
            {wordCount > 0 && (
              <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(56,189,248,0.4)', letterSpacing: '0.08em' }}>
                {wordCount} WORDS
              </span>
            )}
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste your blog post, landing page copy, or any content you want to optimize..."
            rows={12}
            style={CRT_TEXTAREA_STYLE}
          />
        </Panel>

        {error && (
          <Panel style={{ borderColor: 'rgba(255,50,50,0.4)', background: 'rgba(255,0,0,0.05)' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,80,80,0.9)' }}>ERROR: {error}</span>
          </Panel>
        )}

        <CrtButton onClick={run} disabled={loading || !content.trim() || !keyword.trim()}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          {loading ? 'OPTIMIZING...' : 'OPTIMIZE CONTENT'}
        </CrtButton>
      </div>

      <StreamOutput
        output={output}
        loading={loading}
        placeholder="PASTE CONTENT + SET KEYWORD, THEN OPTIMIZE"
      />
    </div>
  );
}

function CompetitorAnalysis() {
  const [yourUrl, setYourUrl] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState(['', '', '']);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    const validComps = competitorUrls.filter(u => u.trim());
    if (!yourUrl.trim() || validComps.length === 0 || loading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setOutput('');
    setError('');
    setStatusMsg('');

    try {
      await streamRequest(
        '/seo/competitor',
        { yourUrl: yourUrl.trim(), competitorUrls: validComps },
        setStatusMsg,
        (c) => setOutput(p => p + c),
        () => setLoading(false),
        (e) => { setError(e); setLoading(false); },
        abortRef.current.signal
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Request failed. Please try again.');
      setLoading(false);
    }
  }

  function updateComp(i: number, val: string) {
    setCompetitorUrls(prev => prev.map((u, idx) => idx === i ? val : u));
  }

  const canRun = yourUrl.trim() && competitorUrls.some(u => u.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Panel>
          <SectionLabel>YOUR WEBSITE</SectionLabel>
          <input
            value={yourUrl}
            onChange={e => setYourUrl(e.target.value)}
            placeholder="https://yoursite.com"
            style={CRT_INPUT_STYLE}
          />
        </Panel>

        <Panel>
          <SectionLabel>COMPETITOR URLS (UP TO 3)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {competitorUrls.map((u, i) => (
              <input
                key={i}
                value={u}
                onChange={e => updateComp(i, e.target.value)}
                placeholder={`Competitor ${i + 1} URL`}
                style={{ ...CRT_INPUT_STYLE, fontSize: '0.78rem' }}
              />
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <CrtButton onClick={run} disabled={loading || !canRun}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart2 className="w-3 h-3" />}
          {loading ? 'ANALYZING...' : 'RUN COMPARISON'}
        </CrtButton>
        <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(161,161,170,0.4)', letterSpacing: '0.05em' }}>
          SPIDER-X fetches all pages and performs a full gap analysis
        </p>
      </div>

      {error && (
        <Panel style={{ borderColor: 'rgba(255,50,50,0.4)', background: 'rgba(255,0,0,0.05)' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,80,80,0.9)' }}>ERROR: {error}</span>
        </Panel>
      )}

      <StreamOutput
        output={output}
        loading={loading}
        statusMsg={statusMsg}
        placeholder="ENTER YOUR URL + COMPETITORS, THEN RUN"
      />
    </div>
  );
}

type Tab = 'audit' | 'keywords' | 'optimize' | 'competitor';

const TABS: { id: Tab; label: string; boomerLabel: string; icon: React.ElementType; desc: string }[] = [
  { id: 'audit', label: 'SITE AUDIT', boomerLabel: 'SITE AUDIT', icon: Globe, desc: 'Score your page and find SEO issues' },
  { id: 'keywords', label: 'KEYWORDS', boomerLabel: 'KEYWORDS', icon: Search, desc: 'Research keywords and content angles' },
  { id: 'optimize', label: 'OPTIMIZER', boomerLabel: 'OPTIMIZER', icon: FileText, desc: 'Optimize content for a target keyword' },
  { id: 'competitor', label: 'COMPETITOR', boomerLabel: 'COMPETITOR', icon: BarChart2, desc: 'Gap analysis vs. competitor sites' },
];

export default function SeoModule() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>('audit');
  const boomerMode = getDefaultBoomerMode();

  const product = PABLO_PRODUCTS.SEO;
  const title = boomerMode ? 'SEO TOOLS' : product.name;
  const subtitle = boomerMode ? 'Search Engine Optimization Suite' : 'SEARCH INTELLIGENCE MODULE — SPIDER-X UNIT';

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access SEO tools.' : 'Salaryman credentials required. SPIDER-X UNIT access locked.'} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090b',
      padding: '24px',
      fontFamily: "var(--font-sans)",
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <Search className="w-5 h-5" style={{ color: CRT_GREEN }} />
          <h1 style={{
            fontFamily: "var(--font-sans)",
            fontSize: '1.1rem',
            fontWeight: 'normal',
            letterSpacing: '0.15em',
            color: CRT_GREEN,
            margin: 0,
          }}>
            {title}
          </h1>
        </div>
        <p style={{
          fontFamily: 'monospace',
          fontSize: '0.62rem',
          color: 'rgba(161,161,170,0.45)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          margin: 0,
        }}>
          {subtitle}
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid rgba(56,189,248,0.15)',
        marginBottom: '20px',
        flexWrap: 'wrap' as const,
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const TabIcon = t.icon as React.ComponentType<{ className?: string }>;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                color: active ? CRT_GREEN : 'rgba(161,161,170,0.5)',
                background: active ? 'rgba(56,189,248,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(56,189,248,0.3)' : 'transparent'}`,
                borderBottom: active ? '1px solid #09090b' : '1px solid transparent',
                padding: '6px 14px',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'all 0.15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <TabIcon className="w-3 h-3" />
              {boomerMode ? t.boomerLabel : t.label}
            </button>
          );
        })}
      </div>

      {/* Tab subtitle */}
      <p style={{
        fontFamily: 'monospace',
        fontSize: '0.65rem',
        color: 'rgba(161,161,170,0.4)',
        letterSpacing: '0.05em',
        marginBottom: '16px',
        marginTop: '-8px',
      }}>
        {TABS.find(t => t.id === tab)?.desc}
      </p>

      {/* Tab Content */}
      {tab === 'audit' && <SiteAudit />}
      {tab === 'keywords' && <KeywordResearch />}
      {tab === 'optimize' && <ContentOptimizer />}
      {tab === 'competitor' && <CompetitorAnalysis />}
    </div>
  );
}
