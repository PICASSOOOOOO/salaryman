import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PortalDropdown } from '../components/PortalDropdown';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Search, Copy, Check, X, ChevronRight, Loader2,
  Code2, Settings, Zap, Shield, Package, Layers,
  Terminal, BookOpen, Puzzle, Store, ExternalLink,
  Filter, ChevronDown,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { apiFetch } from '@/lib/api-client';
import { usePlan } from '@/hooks/use-plan';

type ComponentType = 'agents' | 'commands' | 'mcps' | 'settings' | 'hooks' | 'skills' | 'templates' | 'sandbox' | 'plugins';

interface TemplateComponent {
  name: string;
  path?: string;
  category: string;
  type: string;
  content?: string;
  description?: string;
  author?: string;
  version?: string;
  keywords?: string[];
  downloads?: number;
  security?: unknown;
  files?: Record<string, unknown>;
  installCommand?: string;
}

const TYPE_CONFIG: Record<ComponentType, { label: string; codename: string; icon: typeof Bot; color: string; accent: string }> = {
  agents: { label: 'AGENTS', codename: 'AI AGENTS', icon: Bot, color: 'text-emerald-400', accent: 'emerald' },
  skills: { label: 'SKILLS', codename: 'SKILL SETS', icon: BookOpen, color: 'text-violet-400', accent: 'violet' },
  commands: { label: 'COMMANDS', codename: 'CMD OPS', icon: Terminal, color: 'text-sky-400', accent: 'sky' },
  mcps: { label: 'MCPs', codename: 'MCP SERVERS', icon: Puzzle, color: 'text-amber-400', accent: 'amber' },
  hooks: { label: 'HOOKS', codename: 'EVENT HOOKS', icon: Zap, color: 'text-rose-400', accent: 'rose' },
  settings: { label: 'SETTINGS', codename: 'CONFIG', icon: Settings, color: 'text-cyan-400', accent: 'cyan' },
  templates: { label: 'TEMPLATES', codename: 'BLUEPRINTS', icon: Layers, color: 'text-indigo-400', accent: 'indigo' },
  sandbox: { label: 'SANDBOX', codename: 'SANDBOX', icon: Shield, color: 'text-orange-400', accent: 'orange' },
  plugins: { label: 'PLUGINS', codename: 'PLUGINS', icon: Package, color: 'text-teal-400', accent: 'teal' },
};

const VISIBLE_TYPES: ComponentType[] = ['agents', 'skills', 'commands', 'mcps', 'hooks', 'settings', 'templates', 'sandbox', 'plugins'];

export default function ClaudeTemplates() {
  const [boomerMode] = useBoomerMode();
  const plan = usePlan();
  const [catalog, setCatalog] = useState<Record<string, TemplateComponent[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState<ComponentType>('agents');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const catBtnRef = useRef<HTMLButtonElement>(null);
  const [loadedContent, setLoadedContent] = useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch('/api/tools/claude-templates')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(d => { setCatalog(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const items: TemplateComponent[] = useMemo(() => {
    if (!catalog) return [];
    return (catalog[activeType] ?? []) as TemplateComponent[];
  }, [catalog, activeType]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(i => { if (i.category) cats.add(i.category); });
    return ['all', ...Array.from(cats).sort()];
  }, [items]);

  useEffect(() => {
    setSelectedCategory('all');
    setSearchQuery('');
    setExpandedItem(null);
  }, [activeType]);

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'all') result = result.filter(i => i.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q) ||
        (i.keywords ?? []).some(k => k.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, selectedCategory, searchQuery]);

  const expandAndLoad = useCallback((itemKey: string, item: TemplateComponent) => {
    if (expandedItem === itemKey) {
      setExpandedItem(null);
      return;
    }
    setExpandedItem(itemKey);
    const contentKey = `${activeType}-${item.name}`;
    if (!loadedContent[contentKey] && (item as unknown as Record<string, unknown>).hasContent) {
      setLoadingContent(contentKey);
      apiFetch(`/api/tools/claude-templates/${activeType}/${encodeURIComponent(item.name)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.content) setLoadedContent(prev => ({ ...prev, [contentKey]: d.content }));
          setLoadingContent(null);
        })
        .catch(() => setLoadingContent(null));
    }
  }, [expandedItem, activeType, loadedContent]);

  const copyContent = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }, []);

  const copyInstallCmd = useCallback((item: TemplateComponent) => {
    const cmd = item.installCommand || `npx claude-code-templates@latest --${item.type} ${item.category ? item.category + '/' : ''}${item.name}`;
    copyContent(cmd, `install-${item.name}`);
  }, [copyContent]);

  const typeCounts = useMemo(() => {
    if (!catalog) return {};
    const counts: Record<string, number> = {};
    for (const t of VISIBLE_TYPES) {
      counts[t] = Array.isArray(catalog[t]) ? catalog[t].length : 0;
    }
    return counts;
  }, [catalog]);

  const totalCount = useMemo(() => Object.values(typeCounts).reduce((a, b) => a + b, 0), [typeCounts]);

  const tc = TYPE_CONFIG[activeType];

  if (!plan.isOwner) {
    return (
      <div className="min-h-screen flex flex-col bg-background items-center justify-center p-8">
        <Shield className="w-10 h-10 text-zinc-600 mb-4" />
        <p className="text-sm font-mono tracking-widest text-zinc-400 mb-1">ACCESS RESTRICTED</p>
        <p className="text-xs text-zinc-600">PICASSO ADMIN CREDENTIALS REQUIRED</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background items-center justify-center p-8">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mb-4" />
        <p className="text-sm text-muted-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
          {boomerMode ? 'LOADING TEMPLATE CATALOG...' : 'SYNCING TEMPLATE DATABASE...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background items-center justify-center p-8">
        <X className="w-10 h-10 text-red-400 mb-4" />
        <p className="text-sm text-red-400 mb-2">FAILED TO LOAD CATALOG</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/5 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-4 md:p-6 relative z-10">
        <div className="max-w-5xl mx-auto">

          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Code2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.1em', fontSize: '1.4rem' }}>
                    {boomerMode ? 'CLAUDE CODE TEMPLATES' : 'CLAUDE CODE TEMPLATES // CCT'}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25">{totalCount.toLocaleString()} COMPONENTS</span>
                </div>
                <p className="text-xs text-muted-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomerMode ? 'BROWSE AI AGENTS, COMMANDS, SKILLS, MCPs, HOOKS & MORE' : 'AGENTS · SKILLS · COMMANDS · MCPs · HOOKS · CONFIGS'}
                </p>
              </div>
              <a href="https://github.com/davila7/claude-code-templates" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border hover:border-emerald-500/20 transition-colors">
                <ExternalLink className="w-3 h-3" /> GITHUB
              </a>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-thin">
            {VISIBLE_TYPES.filter(t => (typeCounts[t] ?? 0) > 0).map(t => {
              const cfg = TYPE_CONFIG[t];
              const Icon = cfg.icon;
              return (
                <button key={t} onClick={() => setActiveType(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold border whitespace-nowrap transition-colors ${activeType === t
                    ? `bg-${cfg.accent}-500/15 ${cfg.color} border-${cfg.accent}-500/30`
                    : 'bg-card text-muted-foreground border-border hover:border-zinc-600'
                  }`}
                  style={activeType === t ? { background: `color-mix(in srgb, currentColor 10%, transparent)`, borderColor: `color-mix(in srgb, currentColor 25%, transparent)` } : {}}>
                  <Icon className="w-3.5 h-3.5" />
                  {boomerMode ? cfg.label : cfg.codename}
                  <span className={`px-1 py-0 rounded text-[9px] ${activeType === t ? 'opacity-70' : 'opacity-40'}`}>{typeCounts[t]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={boomerMode ? `Search ${tc.label.toLowerCase()}...` : `SEARCH ${tc.codename}...`}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 transition-colors"
                style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <div className="relative">
              <button ref={catBtnRef} onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                <Filter className="w-3.5 h-3.5" />
                {selectedCategory === 'all' ? 'ALL' : selectedCategory.toUpperCase().replace(/-/g, ' ')}
                <ChevronDown className="w-3 h-3" />
              </button>
              <PortalDropdown
                open={showCategoryDropdown}
                anchorRef={catBtnRef}
                onClose={() => setShowCategoryDropdown(false)}
                align="right"
                className="w-56 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
              >
                {categories.map(c => (
                  <button key={c} onClick={() => { setSelectedCategory(c); setShowCategoryDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${selectedCategory === c ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
                    {c === 'all' ? 'ALL CATEGORIES' : c.toUpperCase().replace(/-/g, ' ')}
                    {c !== 'all' && <span className="float-right opacity-40">{items.filter(i => i.category === c).length}</span>}
                  </button>
                ))}
              </PortalDropdown>
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground/40 mb-3 px-1">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            {selectedCategory !== 'all' && ` in ${selectedCategory}`}
            {searchQuery && ` matching "${searchQuery}"`}
          </div>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  {boomerMode ? 'No matching templates found' : 'NO MATCHES FOUND'}
                </p>
              </div>
            ) : (
              filtered.slice(0, 100).map((item, idx) => {
                const itemKey = `${activeType}-${item.name}-${idx}`;
                const isExpanded = expandedItem === itemKey;
                const Icon = tc.icon;
                return (
                  <motion.div key={itemKey} layout
                    className={`rounded-xl border bg-card/50 overflow-hidden transition-colors ${isExpanded ? 'border-emerald-500/20' : 'border-border hover:border-zinc-600'}`}>
                    <button onClick={() => expandAndLoad(itemKey, item)}
                      className="w-full flex items-center gap-3 p-3 text-left">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tc.color}`}
                        style={{ background: `color-mix(in srgb, currentColor 10%, transparent)` }}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-foreground text-sm truncate" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                            {item.name}
                          </span>
                          {item.category && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-muted-foreground/50 border border-border/50">
                              {item.category.toUpperCase().replace(/-/g, ' ')}
                            </span>
                          )}
                          {item.version && (
                            <span className="text-[9px] text-muted-foreground/30">v{item.version}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground/60 truncate leading-snug">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {typeof item.downloads === 'number' && item.downloads > 0 && (
                          <span className="text-[9px] text-muted-foreground/30">{item.downloads.toLocaleString()} DL</span>
                        )}
                        <ChevronRight className={`w-4 h-4 text-muted-foreground/30 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 border-t border-border/30 pt-3">
                            {item.description && (
                              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{item.description}</p>
                            )}

                            {item.keywords && item.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {item.keywords.map((kw, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 border border-border/40 bg-muted/30">{kw}</span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <button onClick={(e) => { e.stopPropagation(); copyInstallCmd(item); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                                {copied === `install-${item.name}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied === `install-${item.name}` ? 'COPIED' : 'COPY INSTALL CMD'}
                              </button>
                              {(loadedContent[`${activeType}-${item.name}`] || item.content) && (
                                <button onClick={(e) => { e.stopPropagation(); copyContent(loadedContent[`${activeType}-${item.name}`] || item.content!, `content-${item.name}`); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/20 transition-colors">
                                  {copied === `content-${item.name}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  {copied === `content-${item.name}` ? 'COPIED' : boomerMode ? 'COPY CONTENT' : 'COPY SOURCE'}
                                </button>
                              )}
                              {item.author && (
                                <span className="text-[9px] text-muted-foreground/30 ml-auto">by {item.author}</span>
                              )}
                            </div>

                            {(() => {
                              const contentText = loadedContent[`${activeType}-${item.name}`] || item.content;
                              const isLoadingThis = loadingContent === `${activeType}-${item.name}`;
                              if (isLoadingThis) return (
                                <div className="flex items-center gap-2 py-3 text-muted-foreground/40">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span className="text-[10px]">Loading source...</span>
                                </div>
                              );
                              if (!contentText) return null;
                              return (
                                <div className="rounded-lg border border-border/40 bg-zinc-950/50 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-zinc-900/50">
                                    <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">SOURCE</span>
                                    <span className="text-[9px] text-muted-foreground/20">{item.path || item.name}</span>
                                  </div>
                                  <pre className="p-3 text-[11px] text-muted-foreground/70 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap break-words"
                                     style={{ fontFamily: "'Fira Code', monospace" }}>
                                    {contentText.slice(0, 4000)}
                                    {contentText.length > 4000 && '\n\n... [truncated]'}
                                  </pre>
                                </div>
                              );
                            })()}

                            {item.files && (
                              <div className="mt-3">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-1">FILES</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.keys(item.files).map(f => (
                                    <span key={f} className="px-1.5 py-0.5 rounded text-[9px] text-emerald-400/60 border border-emerald-500/15 bg-emerald-500/5">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
            {filtered.length > 100 && (
              <div className="text-center py-4 text-xs text-muted-foreground/40">
                Showing 100 of {filtered.length} — refine your search to see more
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
