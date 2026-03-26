import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Trash2, Power, PowerOff, MessageSquare, Brain,
  Send, Settings, Clock, Shield, ChevronRight, Store, Zap,
  Terminal, Target, PenTool, Calendar, Briefcase, X, Check,
  Eye, MemoryStick, Plug, AlertCircle,
} from 'lucide-react';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';

type BotStatus = 'active' | 'paused' | 'error';
type Tab = 'my-bots' | 'marketplace';

interface BotConnection {
  id: number;
  platform: string;
  status: string;
  lastActiveAt: string | null;
}

interface BotData {
  id: number;
  name: string;
  personality: string;
  systemPrompt: string;
  status: BotStatus;
  permissions: string[];
  maxTokensPerResponse: number;
  rateLimitPerMinute: number;
  marketplaceItemId: number | null;
  connections: BotConnection[];
  createdAt: string;
}

interface MarketplaceItem {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  priceMonthly: number;
  capabilities: string[];
  featured: boolean;
}

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

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  terminal: Terminal, target: Target, shield: Shield, 'pen-tool': PenTool,
  calendar: Calendar, briefcase: Briefcase, bot: Bot,
};

function getIcon(name: string) {
  return ICON_MAP[name] || Bot;
}

function StatusBadge({ status, boomer }: { status: BotStatus; boomer: boolean }) {
  const config = {
    active: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400', label: boomer ? 'Online' : 'ACTIVE' },
    paused: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25', dot: 'bg-amber-400', label: boomer ? 'Paused' : 'STANDBY' },
    error: { color: 'bg-red-500/15 text-red-400 border-red-500/25', dot: 'bg-red-400', label: boomer ? 'Error' : 'ERROR' },
  };
  const c = config[status] || config.paused;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${c.color}`}
      style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

function PriceBadge({ price }: { price: number }) {
  if (price === 0) return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
      style={{ fontFamily: "'Share Tech Mono', monospace" }}>FREE</span>
  );
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25"
      style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      ${(price / 100).toFixed(0)}/mo
    </span>
  );
}

function CreateBotModal({ onClose, onCreated, boomer }: { onClose: () => void; onCreated: () => void; boomer: boolean }) {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('You are a helpful assistant.');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, personality }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      }
    } catch (err) {
      console.error('Failed to create bot:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "'VT323', monospace", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? 'Create a Bot' : 'DEPLOY NEW AGENT'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'Bot Name' : 'DESIGNATION'}
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={boomer ? "My Sales Bot" : "AGENT-X"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'Personality / Instructions' : 'PERSONALITY MATRIX'}
            </label>
            <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={4}
              placeholder={boomer ? "Describe how the bot should behave..." : "Define operational parameters..."}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none resize-none" />
          </div>
          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {boomer ? 'Create Bot' : 'DEPLOY AGENT'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConnectPlatformModal({ bot, onClose, onConnected, boomer }: { bot: BotData; onClose: () => void; onConnected: () => void; boomer: boolean }) {
  const [platform, setPlatform] = useState<'telegram' | 'whatsapp'>('telegram');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const credentials = platform === 'whatsapp'
        ? JSON.stringify({ fromNumber: token, accountSid: '', authToken: '' })
        : token;

      const res = await apiFetch(`/api/bots/${bot.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, credentials }),
      });
      if (res.ok) {
        onConnected();
        onClose();
      }
    } catch (err) {
      console.error('Failed to connect:', err);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "'VT323', monospace", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? 'Connect Platform' : 'LINK COMMS CHANNEL'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setPlatform('telegram')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${platform === 'telegram' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-background text-muted-foreground border-border hover:border-sky-500/20'}`}>
              Telegram
            </button>
            <button onClick={() => setPlatform('whatsapp')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${platform === 'whatsapp' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-background text-muted-foreground border-border hover:border-emerald-500/20'}`}>
              WhatsApp
            </button>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {platform === 'telegram'
                ? (boomer ? 'Telegram Bot Token (from @BotFather)' : 'BOTFATHER TOKEN')
                : (boomer ? 'WhatsApp Number (with country code)' : 'WHATSAPP ENDPOINT')
              }
            </label>
            <input value={token} onChange={e => setToken(e.target.value)}
              placeholder={platform === 'telegram' ? '123456:ABC-DEF...' : '+1234567890'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none font-mono" />
          </div>
          {platform === 'telegram' && (
            <p className="text-[11px] text-muted-foreground/60">
              {boomer
                ? 'Get a token from @BotFather on Telegram. Just message /newbot to create one.'
                : 'ACQUIRE TOKEN VIA @BOTFATHER · /newbot COMMAND · PASTE TOKEN ABOVE'}
            </p>
          )}
          <button onClick={handleConnect} disabled={connecting || !token.trim()}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {connecting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plug className="w-4 h-4" />}
            {boomer ? 'Connect' : 'ESTABLISH LINK'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BotDetailModal({ bot, onClose, onRefresh, boomer }: { bot: BotData; onClose: () => void; onRefresh: () => void; boomer: boolean }) {
  const [tab, setTab] = useState<'logs' | 'memory' | 'tasks' | 'settings'>('logs');
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [memories, setMemories] = useState<BotMemory[]>([]);
  const [tasks, setTasks] = useState<BotTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskCron, setNewTaskCron] = useState('60');
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (tab === 'logs') {
          const res = await apiFetch(`/api/bots/${bot.id}/logs?limit=100`);
          if (res.ok) { const data = await res.json(); setLogs(data.logs ?? []); }
        } else if (tab === 'memory') {
          const res = await apiFetch(`/api/bots/${bot.id}/memory`);
          if (res.ok) { const data = await res.json(); setMemories(data.memories ?? []); }
        } else if (tab === 'tasks') {
          const res = await apiFetch(`/api/bots/${bot.id}/tasks`);
          if (res.ok) { const data = await res.json(); setTasks(data.tasks ?? []); }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [tab, bot.id]);

  const toggleBotStatus = async () => {
    const newStatus = bot.status === 'active' ? 'paused' : 'active';
    await apiFetch(`/api/bots/${bot.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  };

  const deleteMemory = async (memoryId: number) => {
    await apiFetch(`/api/bots/${bot.id}/memory/${memoryId}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== memoryId));
  };

  const createTask = async () => {
    if (!newTaskDesc.trim()) return;
    setCreatingTask(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronExpression: newTaskCron, taskDescription: newTaskDesc }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [...prev, data.task]);
        setNewTaskDesc('');
        setNewTaskCron('60');
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreatingTask(false);
    }
  };

  const toggleTask = async (taskId: number, enabled: boolean) => {
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, enabled } : t));
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await apiFetch(`/api/bots/${bot.id}/tasks/${taskId}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const deleteBot = async () => {
    if (!confirm(boomer ? 'Delete this bot permanently?' : 'CONFIRM AGENT TERMINATION?')) return;
    await apiFetch(`/api/bots/${bot.id}`, { method: 'DELETE' });
    onRefresh();
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "'VT323', monospace", fontSize: '1.2rem', letterSpacing: '0.08em' }}>
                {bot.name}
              </h3>
              <StatusBadge status={bot.status} boomer={boomer} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleBotStatus} className={`p-2 rounded-lg border transition-colors ${bot.status === 'active' ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}`}>
              {bot.status === 'active' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            </button>
            <button onClick={deleteBot} className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex border-b border-border">
          {(['logs', 'memory', 'tasks', 'settings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab === t ? 'text-sky-400 border-b-2 border-sky-400' : 'text-muted-foreground hover:text-foreground'}`}
              style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {t === 'logs' ? (boomer ? 'CONVERSATIONS' : 'COMMS LOG') :
               t === 'memory' ? (boomer ? 'MEMORY' : 'NEURAL CACHE') :
               t === 'tasks' ? (boomer ? 'TASKS' : 'SCHEDULER') :
               (boomer ? 'SETTINGS' : 'CONFIG')}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mr-3" />
              <span className="text-sm" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {boomer ? 'Loading...' : 'LOADING...'}
              </span>
            </div>
          ) : tab === 'logs' ? (
            logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{boomer ? 'No conversations yet' : 'NO INTERCEPTS RECORDED'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(log => (
                  <div key={log.id} className={`rounded-lg p-3 text-sm ${log.role === 'user' ? 'bg-sky-500/5 border border-sky-500/10' : 'bg-muted/30 border border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-muted-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                        {log.role === 'user' ? (boomer ? 'USER' : 'INCOMING') : (boomer ? 'BOT' : 'OUTGOING')}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{log.platform}</span>
                      <span className="text-[10px] text-muted-foreground/40">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-foreground/80 whitespace-pre-wrap">{log.content}</p>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'memory' ? (
            memories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{boomer ? 'No memories stored yet' : 'NEURAL CACHE EMPTY'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {memories.map(mem => (
                  <div key={mem.id} className="flex items-start gap-3 rounded-lg p-3 bg-muted/20 border border-border group">
                    <MemoryStick className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-purple-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{mem.key}</span>
                      <p className="text-sm text-foreground/80 mt-0.5">{mem.value}</p>
                      {mem.context && <span className="text-[10px] text-muted-foreground/50">{mem.context}</span>}
                    </div>
                    <button onClick={() => deleteMemory(mem.id)} className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'tasks' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
                <label className="text-xs text-muted-foreground block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? 'NEW SCHEDULED TASK' : 'DEPLOY CRON JOB'}
                </label>
                <input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder={boomer ? 'Describe what the bot should do...' : 'TASK DIRECTIVE...'}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                      {boomer ? 'Interval (minutes)' : 'CYCLE (MIN)'}
                    </label>
                    <select value={newTaskCron} onChange={e => setNewTaskCron(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none">
                      <option value="5">5 min</option>
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="60">1 hour</option>
                      <option value="360">6 hours</option>
                      <option value="720">12 hours</option>
                      <option value="1440">24 hours</option>
                    </select>
                  </div>
                  <button onClick={createTask} disabled={creatingTask || !newTaskDesc.trim()}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
                    {creatingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {boomer ? 'Add' : 'DEPLOY'}
                  </button>
                </div>
              </div>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{boomer ? 'No scheduled tasks yet' : 'NO CRON JOBS ACTIVE'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-start gap-3 rounded-lg p-3 border group ${task.enabled ? 'bg-muted/20 border-border' : 'bg-muted/5 border-border/50 opacity-60'}`}>
                      <button onClick={() => toggleTask(task.id, !task.enabled)}
                        className={`mt-0.5 shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${task.enabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-muted/20 border-border text-muted-foreground'}`}>
                        {task.enabled && <Check className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/80">{task.taskDescription}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                            {boomer ? `Every ${task.cronExpression} min` : `CYCLE: ${task.cronExpression}m`}
                          </span>
                          {task.lastRunAt && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {boomer ? 'Last: ' : 'LAST: '}{new Date(task.lastRunAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-opacity shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? 'PERSONALITY' : 'PERSONALITY MATRIX'}
                </label>
                <p className="text-sm text-foreground/70 bg-muted/20 rounded-lg p-3 border border-border">{bot.personality}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? 'CONNECTIONS' : 'COMM LINKS'}
                </label>
                {bot.connections.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50">{boomer ? 'No platforms connected' : 'NO LINKS ESTABLISHED'}</p>
                ) : (
                  <div className="space-y-2">
                    {bot.connections.map(conn => (
                      <div key={conn.id} className="flex items-center gap-3 rounded-lg p-3 bg-muted/20 border border-border">
                        <span className="text-xs font-bold text-sky-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{conn.platform.toUpperCase()}</span>
                        <StatusBadge status={conn.status === 'connected' ? 'active' : 'paused'} boomer={boomer} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? 'PERMISSIONS' : 'ACCESS LEVEL'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bot.permissions.map((p: string) => (
                    <span key={p} className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      style={{ fontFamily: "'Share Tech Mono', monospace" }}>{p}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomer ? 'MAX TOKENS' : 'TOKEN LIMIT'}
                  </span>
                  <span className="text-sm font-bold text-foreground">{bot.maxTokensPerResponse.toLocaleString()}</span>
                </div>
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomer ? 'RATE LIMIT' : 'RATE CAP'}
                  </span>
                  <span className="text-sm font-bold text-foreground">{bot.rateLimitPerMinute}/min</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BotFactory() {
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [tab, setTab] = useState<Tab>('marketplace');
  const [bots, setBots] = useState<BotData[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null);
  const [connectBot, setConnectBot] = useState<BotData | null>(null);
  const [activating, setActivating] = useState<number | null>(null);

  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadBots = useCallback(async () => {
    try {
      const res = await apiFetch('/api/bots');
      if (res.ok) { const data = await res.json(); setBots(data.bots ?? []); }
    } catch {}
  }, []);

  const loadMarketplace = useCallback(async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        apiFetch('/api/bots/marketplace/list'),
        apiFetch('/api/bots/marketplace/subscriptions'),
      ]);
      if (mRes.ok) { const data = await mRes.json(); setMarketplace(data.items ?? []); }
      if (sRes.ok) { const data = await sRes.json(); setSubscriptions((data.subscriptions ?? []).map((s: { marketplaceItemId: number }) => s.marketplaceItemId)); }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([loadBots(), loadMarketplace()]).finally(() => setLoading(false));
  }, [isAuthenticated, loadBots, loadMarketplace]);

  const activateMarketplaceBot = async (itemId: number) => {
    setActivating(itemId);
    try {
      const res = await apiFetch('/api/bots/marketplace/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceItemId: itemId }),
      });
      if (res.ok) {
        await Promise.all([loadBots(), loadMarketplace()]);
        setTab('my-bots');
      }
    } catch (err) {
      console.error('Failed to activate bot:', err);
    } finally {
      setActivating(null);
    }
  };

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access the Bot Factory.' : 'Operative clearance required. Bot deployment systems locked.'} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-4 md:p-6 relative z-10">
        <div className="max-w-4xl mx-auto">

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.1em', fontSize: '1.4rem' }}>
                  {boomerMode ? 'Bot Factory' : 'OPENCLAW BOT FACTORY'}
                </h1>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomerMode ? 'Create and manage AI bots for Telegram, WhatsApp & more' : 'AUTONOMOUS AGENT DEPLOYMENT · MULTI-PLATFORM MESH'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <button onClick={() => setTab('marketplace')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'marketplace' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-card text-muted-foreground border-border hover:border-sky-500/20'}`}>
              <Store className="w-4 h-4" />
              {boomerMode ? 'Bot Store' : 'MARKETPLACE'}
            </button>
            <button onClick={() => setTab('my-bots')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'my-bots' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-card text-muted-foreground border-border hover:border-sky-500/20'}`}>
              <Bot className="w-4 h-4" />
              {boomerMode ? 'My Bots' : 'MY AGENTS'}
              {bots.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400">{bots.length}</span>
              )}
            </button>
            {tab === 'my-bots' && (
              <button onClick={() => setShowCreate(true)}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors">
                <Plus className="w-4 h-4" />
                {boomerMode ? 'New Bot' : 'DEPLOY'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Bot className="w-6 h-6 animate-pulse mr-3" />
              <span className="text-sm" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {boomerMode ? 'Loading bots...' : 'SCANNING AGENT REGISTRY...'}
              </span>
            </div>
          ) : tab === 'marketplace' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card/50 p-4 mb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {boomerMode
                    ? 'Pre-built AI bots ready to deploy. Activate any bot and connect it to your Telegram or WhatsApp. Our prices beat the competition — same power, lower cost.'
                    : 'PRODUCTION-GRADE AUTONOMOUS AGENTS · ACTIVATE & DEPLOY INSTANTLY · COMPETITIVE PRICING GUARANTEED'}
                </p>
              </div>

              {marketplace.filter(i => i.featured).length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] font-bold text-amber-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomerMode ? '⭐ FEATURED' : '★ FEATURED AGENTS'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {marketplace.map((item, i) => {
                    const Icon = getIcon(item.icon);
                    const isActive = subscriptions.includes(item.id);
                    return (
                      <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-2xl border bg-card p-5 ${item.featured ? 'border-amber-500/20' : 'border-border'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${item.featured ? 'bg-amber-500/10 border-amber-500/25' : 'bg-sky-500/10 border-sky-500/25'}`}>
                            <Icon className={`w-5 h-5 ${item.featured ? 'text-amber-400' : 'text-sky-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-bold text-foreground text-sm" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
                                {item.name}
                              </h3>
                              <PriceBadge price={item.priceMonthly} />
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{item.tagline}</p>
                            <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">{item.description}</p>
                            <div className="flex flex-wrap gap-1 mb-3">
                              {item.capabilities.map(cap => (
                                <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 border border-border/50"
                                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>{cap}</span>
                              ))}
                            </div>
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                <Check className="w-3.5 h-3.5" /> {boomerMode ? 'Activated' : 'DEPLOYED'}
                              </span>
                            ) : (
                              <button onClick={() => activateMarketplaceBot(item.id)} disabled={activating === item.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors disabled:opacity-50">
                                {activating === item.id ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                {boomerMode ? 'Activate' : 'DEPLOY'}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bots.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
                  <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {boomerMode ? 'No bots yet. Create one or activate from the store.' : 'NO AGENTS DEPLOYED · INITIALIZE FROM MARKETPLACE OR DEPLOY CUSTOM'}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors">
                      <Plus className="w-4 h-4" /> {boomerMode ? 'Create Bot' : 'DEPLOY AGENT'}
                    </button>
                    <button onClick={() => setTab('marketplace')}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-border text-muted-foreground hover:text-foreground hover:border-sky-500/20 transition-colors">
                      <Store className="w-4 h-4" /> {boomerMode ? 'Browse Store' : 'MARKETPLACE'}
                    </button>
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {bots.map((bot, i) => (
                    <motion.div key={bot.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:border-sky-500/20 transition-colors"
                      onClick={() => setSelectedBot(bot)}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-6 h-6 text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
                              {bot.name}
                            </h3>
                            <StatusBadge status={bot.status} boomer={boomerMode} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Plug className="w-3 h-3" />
                              {bot.connections.length} {boomerMode ? 'connections' : 'links'}
                            </span>
                            {bot.connections.map(c => (
                              <span key={c.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border"
                                style={{ fontFamily: "'Share Tech Mono', monospace" }}>{c.platform.toUpperCase()}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={e => { e.stopPropagation(); setConnectBot(bot); }}
                            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-sky-400 hover:border-sky-500/20 transition-colors"
                            title={boomerMode ? 'Connect platform' : 'LINK CHANNEL'}>
                            <Plug className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showCreate && <CreateBotModal onClose={() => setShowCreate(false)} onCreated={loadBots} boomer={boomerMode} />}
        {selectedBot && <BotDetailModal bot={selectedBot} onClose={() => setSelectedBot(null)} onRefresh={() => { loadBots(); setSelectedBot(null); }} boomer={boomerMode} />}
        {connectBot && <ConnectPlatformModal bot={connectBot} onClose={() => setConnectBot(null)} onConnected={loadBots} boomer={boomerMode} />}
      </AnimatePresence>
    </div>
  );
}
