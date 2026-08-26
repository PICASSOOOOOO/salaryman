import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Plug, Activity, Clock, MessageSquare,
  ChevronDown, ChevronRight, Zap, Brain, RefreshCw,
  Send, MemoryStick, Play, Pause, Trash2, Eye, Terminal,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import type { BotData, BotConnection } from './BotFactory';

interface BotTask {
  id: number;
  cronExpression: string;
  taskDescription: string;
  enabled: boolean;
  lastRunAt: string | null;
}

interface BotMemory {
  id: number;
  key: string;
  value: string;
  context: string | null;
  updatedAt: string;
}

interface ConversationLog {
  id: number;
  platform: string;
  externalUserId: string | null;
  role: string;
  content: string;
  createdAt: string;
}

const platformIcons: Record<string, string> = {
  whatsapp: '💬', telegram: '✈️', discord: '🎮',
  facebook: '📘', email: '📧', linkedin: '💼',
};

const permissionLabels: Record<string, { label: string; icon: string; desc: string }> = {
  ai_chat: { label: 'AI CHAT', icon: '🤖', desc: 'Holds conversations and answers questions on its own.' },
  crm_read: { label: 'CRM READ', icon: '📊', desc: 'Looks up your customers, deals, and pipeline.' },
  crm_write: { label: 'CRM WRITE', icon: '📝', desc: 'Adds and updates records in your CRM.' },
  contacts_read: { label: 'CONTACTS READ', icon: '👥', desc: 'Reads your contact list to find people.' },
  contacts_write: { label: 'CONTACTS WRITE', icon: '✏️', desc: 'Creates and edits contacts for you.' },
  trading_read: { label: 'TRADING READ', icon: '📈', desc: 'Watches markets and reads your portfolio.' },
  trading_paper: { label: 'PAPER TRADING', icon: '📄', desc: 'Practices trades with fake money — no real risk.' },
  trading_execute: { label: 'LIVE TRADING', icon: '⚡', desc: 'Places real trades with real money.' },
  phone_read: { label: 'PHONE READ', icon: '📞', desc: 'Reads call logs and voicemail transcripts.' },
  phone_write: { label: 'PHONE WRITE', icon: '☎️', desc: 'Makes and answers calls on your behalf.' },
  calendar_read: { label: 'CALENDAR', icon: '📅', desc: 'Checks your schedule and upcoming events.' },
  email_send: { label: 'SEND EMAIL', icon: '✉️', desc: 'Drafts and sends email for you.' },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

type BotPanelTab = 'overview' | 'tasks' | 'logs' | 'memory' | 'chat';

export default function BotCommandCenter({
  bots,
  onRefresh,
  onSelectBot,
  onConnectBot,
}: {
  bots: BotData[];
  onRefresh: () => void;
  onSelectBot: (bot: BotData) => void;
  onConnectBot: (bot: BotData) => void;
}) {
  const [boomerMode] = useBoomerMode();
  const activeBots = bots.filter(b => b.status === 'active' || b.status === 'paused' || b.status === 'error');
  const [expandedBot, setExpandedBot] = useState<number | null>(null);
  const [botTab, setBotTab] = useState<BotPanelTab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  if (activeBots.length === 0) return null;

  const activeCount = activeBots.filter(b => b.status === 'active').length;
  const pausedCount = activeBots.filter(b => b.status === 'paused').length;
  const errorCount = activeBots.filter(b => b.status === 'error').length;
  const totalConnections = activeBots.reduce((sum, b) => sum + b.connections.length, 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  const toggleBot = async (bot: BotData) => {
    const newStatus = bot.status === 'active' ? 'paused' : 'active';
    try {
      const res = await apiFetch(`/api/bots/${bot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const mono = boomerMode ? {} : { fontFamily: "var(--font-sans)" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.04] to-transparent overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-sky-500/10 bg-sky-500/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground" style={mono}>
              {boomerMode ? 'My Bots — Command Center' : 'BOT COMMAND CENTER'}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1" style={mono}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {activeCount} ONLINE
              </span>
              {pausedCount > 0 && (
                <span className="text-[9px] text-amber-400 font-bold" style={mono}>
                  {pausedCount} PAUSED
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-[9px] text-red-400 font-bold" style={mono}>
                  {errorCount} ERROR
                </span>
              )}
              <span className="text-[9px] text-muted-foreground/40" style={mono}>
                {totalConnections} CONNECTIONS
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg hover:bg-sky-500/10 text-muted-foreground/40 hover:text-sky-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-px bg-border/10 border-b border-sky-500/10">
        <StatCard label="ACTIVE BOTS" value={String(activeCount)} color="emerald" />
        <StatCard label="TOTAL BOTS" value={String(activeBots.length)} color="sky" />
        <StatCard label="CONNECTIONS" value={String(totalConnections)} color="violet" />
        <StatCard
          label="PERMISSIONS"
          value={String(new Set(activeBots.flatMap(b => b.permissions)).size)}
          color="amber"
        />
      </div>

      <div className="divide-y divide-border/10">
        {activeBots.map(bot => {
          const isExpanded = expandedBot === bot.id;
          return (
            <div key={bot.id}>
              <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isExpanded ? 'bg-sky-500/[0.04]' : 'hover:bg-muted/30'}`}
                onClick={() => {
                  setExpandedBot(isExpanded ? null : bot.id);
                  setBotTab('overview');
                }}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  bot.status === 'active' ? 'bg-emerald-400 animate-pulse' :
                  bot.status === 'paused' ? 'bg-amber-400' : 'bg-red-400 animate-pulse'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-xs" style={mono}>
                      {bot.name.toUpperCase()}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                      bot.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                      bot.status === 'paused' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                      'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`} style={mono}>
                      {bot.status.toUpperCase()}
                    </span>
                    {bot.connections.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {bot.connections.map(c => (
                          <span key={c.id} className="text-[10px]" title={c.platform}>
                            {platformIcons[c.platform] || '🔌'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[9px] text-muted-foreground/40" style={mono}>
                      {bot.permissions.length} permissions
                    </span>
                    <span className="text-[9px] text-muted-foreground/30" style={mono}>
                      Created {timeAgo(bot.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleBot(bot); }}
                    className={`p-1.5 rounded-md transition-colors ${
                      bot.status === 'active'
                        ? 'hover:bg-amber-500/15 text-emerald-400 hover:text-amber-400'
                        : 'hover:bg-emerald-500/15 text-muted-foreground/40 hover:text-emerald-400'
                    }`}
                    title={bot.status === 'active' ? 'Pause' : 'Activate'}
                  >
                    {bot.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onConnectBot(bot); }}
                    className="p-1.5 rounded-md hover:bg-sky-500/15 text-muted-foreground/40 hover:text-sky-400 transition-colors"
                    title="Connect platform"
                  >
                    <Plug className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectBot(bot); }}
                    className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground/40 hover:text-foreground transition-colors"
                    title="Full settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <BotExpandedPanel bot={bot} tab={botTab} setTab={setBotTab} onRefresh={onRefresh} mono={mono} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
  };
  return (
    <div className="px-3 py-2.5 bg-card/30">
      <div className={`text-lg font-bold ${colorMap[color] || 'text-foreground'}`} style={{ fontFamily: "var(--font-sans)" }}>
        {value}
      </div>
      <div className="text-[8px] text-muted-foreground/40 font-bold tracking-widest" style={{ fontFamily: "var(--font-sans)" }}>
        {label}
      </div>
    </div>
  );
}

function BotExpandedPanel({ bot, tab, setTab, onRefresh, mono }: {
  bot: BotData;
  tab: BotPanelTab;
  setTab: (t: BotPanelTab) => void;
  onRefresh: () => void;
  mono: React.CSSProperties;
}) {
  const tabs: { key: BotPanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'OVERVIEW', icon: <Eye className="w-3 h-3" /> },
    { key: 'tasks', label: 'TASKS', icon: <Clock className="w-3 h-3" /> },
    { key: 'logs', label: 'ACTIVITY LOG', icon: <Activity className="w-3 h-3" /> },
    { key: 'memory', label: 'MEMORY', icon: <MemoryStick className="w-3 h-3" /> },
    { key: 'chat', label: 'TEST', icon: <MessageSquare className="w-3 h-3" /> },
  ];

  return (
    <div className="border-t border-sky-500/10 bg-muted/10">
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/10 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold tracking-wider transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-sky-500/15 text-sky-400' : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            }`}
            style={mono}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'overview' && <BotOverview bot={bot} mono={mono} />}
        {tab === 'tasks' && <BotTasksPanel botId={bot.id} mono={mono} />}
        {tab === 'logs' && <BotLogsPanel botId={bot.id} mono={mono} />}
        {tab === 'memory' && <BotMemoryPanel botId={bot.id} mono={mono} />}
        {tab === 'chat' && <BotChatPanel botId={bot.id} botName={bot.name} mono={mono} />}
      </div>
    </div>
  );
}

function whatItDoesSummary(bot: BotData): string {
  if (bot.personality && bot.personality.trim().length > 0) {
    const first = bot.personality.trim().split(/(?<=[.!?])\s+/)[0];
    return first.length > 220 ? first.slice(0, 220) + '…' : first;
  }
  const verbs = bot.permissions
    .map(p => permissionLabels[p]?.desc)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  return verbs || 'A general assistant. Give it permissions and tasks below to put it to work.';
}

function BotOverview({ bot, mono }: { bot: BotData; mono: React.CSSProperties }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const inAppCount = bot.permissions.length;
  const channelCount = bot.connections.length;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-sky-500/[0.05] border border-sky-500/15">
        <h4 className="text-[9px] font-bold text-sky-400/70 tracking-widest mb-1.5 flex items-center gap-1.5" style={mono}>
          <Zap className="w-3 h-3" /> WHAT THIS AGENT DOES
        </h4>
        <p className="text-xs text-foreground/80 leading-relaxed">{whatItDoesSummary(bot)}</p>
        <div className="flex items-center gap-3 mt-2.5">
          <span className="text-[9px] text-foreground/50 flex items-center gap-1" style={mono}>
            <Brain className="w-3 h-3 text-sky-400/60" /> {inAppCount} thing{inAppCount !== 1 ? 's' : ''} it can do in-app
          </span>
          <span className="text-[9px] text-foreground/50 flex items-center gap-1" style={mono}>
            <Plug className="w-3 h-3 text-violet-400/60" /> {channelCount} channel{channelCount !== 1 ? 's' : ''} connected
          </span>
        </div>
      </div>

      <div>
        <h4 className="text-[9px] font-bold text-muted-foreground/40 tracking-widest mb-2" style={mono}>WHAT IT CAN DO FOR YOU</h4>
        {bot.permissions.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed" style={mono}>
            No abilities turned on yet. Open full settings to grant this agent powers like sending email, managing contacts, or watching markets.
          </p>
        ) : (
          <div className="space-y-1.5">
            {bot.permissions.map(p => {
              const info = permissionLabels[p];
              return (
                <div key={p} className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg bg-background border border-border/20">
                  <span className="text-sm leading-none mt-0.5">{info?.icon || '🔐'}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-foreground/70" style={mono}>{info?.label || p.toUpperCase()}</div>
                    <div className="text-[10px] text-muted-foreground/55 leading-snug">{info?.desc || 'Custom ability.'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[9px] font-bold text-muted-foreground/40 tracking-widest mb-2" style={mono}>WHERE IT WORKS</h4>
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed mb-2">
          This agent runs right here in your office — give it scheduled tasks under the TASKS tab and it works automatically. Connect a channel below to also let it reply on outside apps.
        </p>
        {bot.connections.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/30" style={mono}>Works in-app only — no outside channels connected yet</span>
        ) : (
          <div className="space-y-1">
            {bot.connections.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border/20">
                <span className="text-sm">{platformIcons[c.platform] || '🔌'}</span>
                <span className="text-[10px] font-bold text-foreground/70" style={mono}>{c.platform.toUpperCase()}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                  c.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground/40'
                }`} style={mono}>{c.status.toUpperCase()}</span>
                <span className="text-[8px] text-muted-foreground/30 ml-auto" style={mono}>
                  {timeAgo(c.lastActiveAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-2.5 rounded-lg bg-background border border-border/20">
          <span className="text-[8px] text-muted-foreground/40 tracking-widest block mb-1" style={mono}>MAX TOKENS</span>
          <span className="text-sm font-bold text-foreground/70" style={mono}>{bot.maxTokensPerResponse}</span>
        </div>
        <div className="p-2.5 rounded-lg bg-background border border-border/20">
          <span className="text-[8px] text-muted-foreground/40 tracking-widest block mb-1" style={mono}>RATE LIMIT</span>
          <span className="text-sm font-bold text-foreground/70" style={mono}>{bot.rateLimitPerMinute}/min</span>
        </div>
      </div>

      <div className="border-t border-border/10 pt-3">
        <button
          onClick={() => setShowPrompt(v => !v)}
          className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/40 tracking-widest hover:text-muted-foreground/70 transition-colors"
          style={mono}
        >
          {showPrompt ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          ADVANCED — SYSTEM PROMPT
        </button>
        {showPrompt && (
          <div className="mt-2 p-2.5 rounded-lg bg-background border border-border/30 max-h-40 overflow-y-auto">
            <pre className="text-[10px] text-foreground/60 whitespace-pre-wrap font-mono leading-relaxed">
              {bot.systemPrompt || 'No system prompt configured.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function BotTasksPanel({ botId, mono }: { botId: number; mono: React.CSSProperties }) {
  const [tasks, setTasks] = useState<BotTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDesc, setNewDesc] = useState('');
  const [newCron, setNewCron] = useState('60');
  const [creating, setCreating] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/bots/${botId}/tasks`);
      if (res.ok) { const data = await res.json(); setTasks(data.tasks ?? []); }
    } catch {}
    setLoading(false);
  }, [botId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const createTask = async () => {
    if (!newDesc.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch(`/api/bots/${botId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronExpression: newCron, taskDescription: newDesc }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [...prev, data.task]);
        setNewDesc('');
      }
    } catch {}
    setCreating(false);
  };

  const toggleTask = async (taskId: number, enabled: boolean) => {
    try {
      const res = await apiFetch(`/api/bots/${botId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, enabled } : t));
      }
    } catch {}
  };

  const deleteTask = async (taskId: number) => {
    try {
      const res = await apiFetch(`/api/bots/${botId}/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch {}
  };

  if (loading) return <div className="text-[10px] text-muted-foreground/40 text-center py-4" style={mono}>Loading tasks...</div>;

  const cronLabels: Record<string, string> = {
    '5': 'Every 5 min', '15': 'Every 15 min', '30': 'Every 30 min',
    '60': 'Every hour', '360': 'Every 6 hours', '1440': 'Daily',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-3.5 h-3.5 text-sky-400/50" />
        <span className="text-[9px] font-bold text-muted-foreground/40 tracking-widest" style={mono}>SCHEDULED TASKS</span>
        <span className="text-[9px] text-muted-foreground/25 ml-auto" style={mono}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-6">
          <Clock className="w-6 h-6 text-muted-foreground/15 mx-auto mb-2" />
          <p className="text-[10px] text-muted-foreground/30" style={mono}>No scheduled tasks yet</p>
          <p className="text-[9px] text-muted-foreground/20 mt-1" style={mono}>Create a task below to automate this bot</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map(task => (
            <div key={task.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              task.enabled ? 'border-emerald-500/15 bg-emerald-500/[0.03]' : 'border-border/20 bg-muted/20 opacity-60'
            }`}>
              <button
                onClick={() => toggleTask(task.id, !task.enabled)}
                className={`mt-0.5 shrink-0 ${task.enabled ? 'text-emerald-400' : 'text-muted-foreground/30'}`}
              >
                {task.enabled ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-foreground/70 leading-relaxed">{task.taskDescription}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] text-muted-foreground/30" style={mono}>
                    {cronLabels[task.cronExpression] || `Every ${task.cronExpression} min`}
                  </span>
                  {task.lastRunAt && (
                    <span className="text-[8px] text-muted-foreground/25" style={mono}>
                      Last: {timeAgo(task.lastRunAt)}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => deleteTask(task.id)} className="text-muted-foreground/20 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border/10 pt-3">
        <span className="text-[9px] font-bold text-muted-foreground/30 tracking-widest block mb-2" style={mono}>CREATE NEW TASK</span>
        <div className="space-y-2">
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !creating) createTask(); }}
            placeholder="Describe what this bot should do on schedule..."
            className="w-full px-3 py-2 rounded-lg border border-border/30 bg-background text-xs text-foreground placeholder:text-muted-foreground/25 focus:border-sky-500/30 focus:outline-none transition-colors"
            style={mono}
          />
          <div className="flex items-center gap-2">
            <select
              value={newCron}
              onChange={e => setNewCron(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border/30 bg-background text-[10px] text-foreground focus:border-sky-500/30 focus:outline-none"
              style={mono}
            >
              <option value="5">Every 5 min</option>
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Daily</option>
            </select>
            <button
              onClick={createTask}
              disabled={creating || !newDesc.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors disabled:opacity-50"
            >
              {creating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
              CREATE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BotLogsPanel({ botId, mono }: { botId: number; mono: React.CSSProperties }) {
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/bots/${botId}/logs?limit=30`);
        if (res.ok) { const data = await res.json(); setLogs(data.logs ?? []); }
      } catch {}
      setLoading(false);
    })();
  }, [botId]);

  if (loading) return <div className="text-[10px] text-muted-foreground/40 text-center py-4" style={mono}>Loading activity...</div>;

  if (logs.length === 0) {
    return (
      <div className="text-center py-6">
        <Activity className="w-6 h-6 text-muted-foreground/15 mx-auto mb-2" />
        <p className="text-[10px] text-muted-foreground/30" style={mono}>No activity recorded yet</p>
        <p className="text-[9px] text-muted-foreground/20 mt-1" style={mono}>Interactions will appear here as they happen</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {logs.map(log => (
        <div key={log.id} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${
          log.role === 'assistant' ? 'bg-sky-500/[0.03]' : 'bg-muted/20'
        }`}>
          <span className={`text-[10px] font-bold shrink-0 w-12 ${
            log.role === 'assistant' ? 'text-sky-400' : 'text-muted-foreground/50'
          }`} style={mono}>
            {log.role === 'assistant' ? 'BOT' : 'USER'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-foreground/60 leading-relaxed break-words">
              {log.content.length > 200 ? log.content.slice(0, 200) + '...' : log.content}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[8px] text-muted-foreground/25" style={mono}>{log.platform}</span>
              <span className="text-[8px] text-muted-foreground/20" style={mono}>{timeAgo(log.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BotMemoryPanel({ botId, mono }: { botId: number; mono: React.CSSProperties }) {
  const [memories, setMemories] = useState<BotMemory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/bots/${botId}/memory`);
        if (res.ok) { const data = await res.json(); setMemories(data.memories ?? []); }
      } catch {}
      setLoading(false);
    })();
  }, [botId]);

  const deleteMemory = async (memId: number) => {
    try {
      const res = await apiFetch(`/api/bots/${botId}/memory/${memId}`, { method: 'DELETE' });
      if (res.ok) setMemories(prev => prev.filter(m => m.id !== memId));
    } catch {}
  };

  if (loading) return <div className="text-[10px] text-muted-foreground/40 text-center py-4" style={mono}>Loading memory...</div>;

  if (memories.length === 0) {
    return (
      <div className="text-center py-6">
        <Brain className="w-6 h-6 text-muted-foreground/15 mx-auto mb-2" />
        <p className="text-[10px] text-muted-foreground/30" style={mono}>No stored memory</p>
        <p className="text-[9px] text-muted-foreground/20 mt-1" style={mono}>Bot will store learned data here during interactions</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {memories.map(mem => (
        <div key={mem.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-background border border-border/15">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-violet-400" style={mono}>{mem.key}</span>
            <p className="text-[10px] text-foreground/50 mt-0.5 break-words">
              {mem.value.length > 150 ? mem.value.slice(0, 150) + '...' : mem.value}
            </p>
            <span className="text-[8px] text-muted-foreground/20" style={mono}>{timeAgo(mem.updatedAt)}</span>
          </div>
          <button onClick={() => deleteMemory(mem.id)} className="text-muted-foreground/20 hover:text-red-400 transition-colors shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function BotChatPanel({ botId, botName, mono }: { botId: number; botName: string; mono: React.CSSProperties }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);

    try {
      const res = await apiFetch(`/api/bots/${botId}/test-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'No response.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '[Error: Bot could not respond]' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '[Network error]' }]);
    }
    setSending(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/20 bg-background min-h-[120px] max-h-48 overflow-y-auto p-2.5">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-5 h-5 text-muted-foreground/15 mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground/30" style={mono}>Send a test message to {botName.toUpperCase()}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'assistant' ? '' : 'justify-end'}`}>
                <div className={`max-w-[80%] px-3 py-1.5 rounded-lg text-[11px] leading-relaxed ${
                  msg.role === 'assistant'
                    ? 'bg-sky-500/10 text-foreground/70 border border-sky-500/15'
                    : 'bg-muted text-foreground/60'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2">
                <div className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/15">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400/40 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400/40 animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400/40 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          placeholder={`Message ${botName.toUpperCase()}...`}
          className="flex-1 px-3 py-2 rounded-lg border border-border/30 bg-background text-xs text-foreground placeholder:text-muted-foreground/25 focus:border-sky-500/30 focus:outline-none"
          style={mono}
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
