import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Trash2, Power, PowerOff, MessageSquare, Brain,
  Send, Settings, Clock, Shield, ChevronRight, Store, Zap,
  Terminal, Target, PenTool, Calendar, Briefcase, X, Check,
  Eye, MemoryStick, Plug, AlertCircle, TrendingUp, TrendingDown,
  DollarSign, BarChart2, Activity, AlertTriangle, ToggleLeft, ToggleRight,
  Siren, FlipHorizontal, Search, Users, RefreshCw, ExternalLink, Lock, Sparkles,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '@/hooks/use-plan';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

type BotStatus = 'active' | 'paused' | 'error';
type Tab = 'my-bots' | 'marketplace';

const platformIcons: Record<string, string> = {
  whatsapp: '💬',
  telegram: '✈️',
  discord: '🎮',
  facebook: '📘',
  email: '📧',
  linkedin: '💼',
};

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

interface TradingAccount {
  id: number;
  botId: number;
  schwabAccountNumber: string | null;
  isPaperMode: boolean;
  cachedBalance: number | null;
  cachedEquity: number | null;
  dailyPnl: number;
  lastSyncAt: string | null;
  hasTokens: boolean;
}

interface TradingStrategy {
  id: number;
  botId: number;
  strategyType: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  maxDailyLoss: number;
  maxDailyLossPercent: number;
  maxPositionSize: number;
  maxConcurrentTrades: number;
  stopLossPercent: number;
  trailingStopPercent: number;
  killSwitch: boolean;
}

interface TradeLog {
  id: number;
  strategyType: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  isPaper: boolean;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

const STRATEGY_LABELS: Record<string, string> = {
  swing_trading: 'Swing Trading',
  day_trading: 'Day Trading',
  scalping: 'Scalping',
  volume_trading: 'Volume Trading',
  momentum_trading: 'Momentum Trading',
  covered_calls: 'Covered Calls',
  iron_condors: 'Iron Condors',
  vertical_spreads: 'Vertical Spreads',
  straddles: 'Straddles',
};

const ALL_STRATEGIES = Object.keys(STRATEGY_LABELS);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  terminal: Terminal, target: Target, shield: Shield, 'pen-tool': PenTool,
  calendar: Calendar, briefcase: Briefcase, bot: Bot,
};

function getIcon(name: string) {
  return ICON_MAP[name] || Bot;
}

function StatusBadge({ status, boomer, t }: { status: BotStatus; boomer: boolean; t: (key: string) => string }) {
  const config = {
    active: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400', label: boomer ? t('botFactory.statusActive') : t('botFactory.statusActiveCodename') },
    paused: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25', dot: 'bg-amber-400', label: boomer ? t('botFactory.statusPaused') : t('botFactory.statusPausedCodename') },
    error: { color: 'bg-red-500/15 text-red-400 border-red-500/25', dot: 'bg-red-400', label: boomer ? t('botFactory.statusError') : t('botFactory.statusErrorCodename') },
  };
  const c = config[status] || config.paused;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${c.color}`}
      style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

function PriceBadge({ price, boomer, t }: { price: number; boomer: boolean; t: (key: string, opts?: Record<string, unknown>) => string }) {
  if (price === 0) return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
      style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{t('botFactory.priceFree')}</span>
  );
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25"
      style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
      {t('botFactory.pricePerMonth', { amount: price })}
    </span>
  );
}

const PERSONALITY_PRESETS = [
  {
    label: 'General Assistant',
    boomerLabel: 'General Assistant',
    value: 'You are a helpful assistant. Answer questions clearly, be concise, and always be friendly.',
  },
  {
    label: 'Recruiter',
    boomerLabel: 'Recruitment Bot',
    value: 'You are an expert recruitment assistant specializing in sourcing and engaging candidates. Your goal is to identify top talent, craft personalized outreach messages, track candidate progress through the hiring pipeline, and manage professional correspondence. When a candidate shares their details, remember their name, role interest, experience level, and current stage in the process. Always be professional, warm, and persuasive without being pushy. Use [MEMORY:candidate_name=value], [MEMORY:role=value], [MEMORY:stage=value], and [MEMORY:notes=value] to track candidate information.',
  },
  {
    label: 'Sales Agent',
    boomerLabel: 'Sales Bot',
    value: 'You are a professional sales agent focused on building relationships and closing deals. Qualify leads, understand their needs, present solutions clearly, and follow up persistently but respectfully. Track prospect information and move them through the sales funnel.',
  },
  {
    label: 'Support Agent',
    boomerLabel: 'Customer Support',
    value: 'You are a helpful customer support agent. Resolve issues quickly and professionally, escalate when needed, and always leave the customer feeling heard and valued.',
  },
];

function CreateBotModal({ onClose, onCreated, boomer, t }: { onClose: () => void; onCreated: () => void; boomer: boolean; t: (key: string) => string }) {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('You are a helpful assistant. Answer questions clearly, be concise, and always be friendly.');
  const [creating, setCreating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);

  const applyPreset = (idx: number) => {
    setSelectedPreset(idx);
    setPersonality(PERSONALITY_PRESETS[idx].value);
  };

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
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "'VT323', monospace", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? t('botFactory.createModalTitle') : t('botFactory.createModalTitleCodename')}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? t('botFactory.createBotNameLabel') : t('botFactory.createBotNameLabelCodename')}
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={boomer ? t('botFactory.createBotNamePlaceholder') : t('botFactory.createBotNamePlaceholderCodename')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'Personality Preset' : 'PERSONALITY TEMPLATE'}
            </label>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {PERSONALITY_PRESETS.map((preset, idx) => (
                <button key={idx} onClick={() => applyPreset(idx)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border text-left transition-colors ${selectedPreset === idx ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-background text-muted-foreground border-border hover:border-sky-500/20'}`}
                  style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? preset.boomerLabel : preset.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? t('botFactory.createBotPersonalityLabel') : t('botFactory.createBotPersonalityLabelCodename')}
            </label>
            <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={5}
              placeholder={boomer ? t('botFactory.createBotPersonalityPlaceholder') : t('botFactory.createBotPersonalityPlaceholderCodename')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none resize-none" />
          </div>
          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {boomer ? t('botFactory.createBotButton') : t('botFactory.createBotButtonCodename')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type PlatformId = 'telegram' | 'whatsapp' | 'discord' | 'facebook' | 'email' | 'linkedin';

interface PlatformConfig {
  id: PlatformId;
  label: string;
  color: string;
  activeColor: string;
  fields: Array<{
    key: string;
    label: string;
    boomerLabel: string;
    placeholder: string;
    type?: string;
  }>;
  oauthEndpoint?: string;
  hint?: string;
  boomerHint?: string;
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    color: 'sky',
    activeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    fields: [{ key: 'botToken', label: 'BOT TOKEN (from @BotFather)', boomerLabel: 'Telegram Bot Token', placeholder: '123456:ABC-DEF...' }],
    hint: 'ACQUIRE TOKEN VIA @BOTFATHER · /newbot COMMAND',
    boomerHint: 'Get a token from @BotFather on Telegram. Message /newbot to create one.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: 'emerald',
    activeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    fields: [
      { key: 'fromNumber', label: 'WHATSAPP NUMBER', boomerLabel: 'WhatsApp Number (with country code)', placeholder: '+1234567890' },
      { key: 'accountSid', label: 'TWILIO ACCOUNT SID', boomerLabel: 'Twilio Account SID', placeholder: 'ACxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'TWILIO AUTH TOKEN', boomerLabel: 'Twilio Auth Token', placeholder: 'your_auth_token', type: 'password' },
    ],
    hint: 'REQUIRES TWILIO ACCOUNT WITH WHATSAPP ENABLED',
    boomerHint: 'Requires a Twilio account with WhatsApp enabled. Find your credentials at console.twilio.com.',
  },
  {
    id: 'discord',
    label: 'Discord',
    color: 'indigo',
    activeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    fields: [{ key: 'botToken', label: 'DISCORD BOT TOKEN', boomerLabel: 'Discord Bot Token', placeholder: 'MTE2xxx.xxx.xxx' }],
    hint: 'CREATE APP AT discord.com/developers · ENABLE MESSAGE CONTENT INTENT',
    boomerHint: 'Create a bot at discord.com/developers/applications. Enable the Message Content Intent under Bot settings.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: 'blue',
    activeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    fields: [
      { key: 'pageAccessToken', label: 'PAGE ACCESS TOKEN', boomerLabel: 'Facebook Page Access Token', placeholder: 'EAAxxxxxxxxxx...' },
      { key: 'appId', label: 'APP ID', boomerLabel: 'Facebook App ID', placeholder: '123456789012345' },
      { key: 'appSecret', label: 'APP SECRET', boomerLabel: 'Facebook App Secret', placeholder: 'Your app secret for webhook verification', type: 'password' },
    ],
    hint: 'GET TOKEN FROM developers.facebook.com · APP SECRET FOR WEBHOOK HMAC VERIFICATION',
    boomerHint: 'Create a Facebook App at developers.facebook.com. Add Messenger product, get a Page Access Token and App Secret.',
  },
  {
    id: 'email',
    label: 'Gmail',
    color: 'red',
    activeColor: 'bg-red-500/15 text-red-400 border-red-500/30',
    fields: [],
    oauthEndpoint: '/api/bots/oauth/gmail/url',
    hint: 'CONNECT VIA GOOGLE OAUTH · AUTOMATIC TOKEN MANAGEMENT',
    boomerHint: 'Click Connect to sign in with Google and authorize Gmail access.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: 'cyan',
    activeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    fields: [],
    oauthEndpoint: '/api/bots/oauth/linkedin/url',
    hint: 'CONNECT VIA LINKEDIN OAUTH · AUTOMATIC TOKEN MANAGEMENT',
    boomerHint: 'Click Connect to sign in with LinkedIn and authorize access.',
  },
];

function ConnectPlatformModal({ bot, onClose, onConnected, boomer, t }: { bot: BotData; onClose: () => void; onConnected: () => void; boomer: boolean; t: (key: string) => string }) {
  const hasTrading = bot.permissions.some(p => ['trading_read', 'trading_paper', 'trading_execute'].includes(p));
  const [platform, setPlatform] = useState<PlatformId | 'thinkorswim'>(hasTrading ? 'thinkorswim' : 'telegram');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [token, setToken] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [schwabStep, setSchwabStep] = useState<1 | 2 | 3>(1);
  const [connecting, setConnecting] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [error, setError] = useState('');

  const config = PLATFORM_CONFIGS.find(p => p.id === platform);
  const isOAuth = !!config?.oauthEndpoint;
  const isValid = platform === 'thinkorswim' ? (appKey.trim() && appSecret.trim()) : isOAuth || (config?.fields.every(f => (fieldValues[f.key] || '').trim()) ?? false);

  const handleOAuthConnect = async () => {
    if (!config?.oauthEndpoint) return;
    setConnecting(true);
    setError('');
    try {
      const res = await apiFetch(`${config.oauthEndpoint}?botId=${bot.id}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'OAuth not configured');
        return;
      }
      const { url } = await res.json();
      const popup = window.open(url, '_blank', 'width=600,height=700');
      const checkClosed = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(checkClosed);
          onConnected();
          onClose();
        }
      }, 500);
      setTimeout(() => clearInterval(checkClosed), 120_000);
    } catch (err) {
      console.error('OAuth connect failed:', err);
      setError('OAuth connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (isOAuth) {
      await handleOAuthConnect();
      return;
    }
    if (platform === 'thinkorswim') {
      if (!appKey.trim() || !appSecret.trim()) return;
      setConnecting(true);
      setError('');
      try {
        const credentials = JSON.stringify({ appKey: appKey.trim(), appSecret: appSecret.trim() });
        const res = await apiFetch(`/api/bots/${bot.id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'thinkorswim', credentials }),
        });
        if (res.ok) {
          await apiFetch(`/api/bots/${bot.id}/trading/account`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPaperMode: true }) });

          const urlRes = await apiFetch(`/api/bots/${bot.id}/trading/schwab/auth-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appKey: appKey.trim() }),
          });
          if (urlRes.ok) {
            const data = await urlRes.json();
            setAuthUrl(data.authUrl);
            setSchwabStep(3);
          } else {
            onConnected();
            onClose();
          }
        } else {
          const data = await res.json();
          setError(data.error || 'Failed to connect thinkorswim');
        }
      } catch (err) {
        console.error('Failed to connect Schwab:', err);
        setError('Connection failed. Check your credentials.');
      } finally {
        setConnecting(false);
      }
      return;
    }
    if (!isValid) return;
    setConnecting(true);
    setError('');
    try {
      let credentials: string;
      if (platform === 'telegram') {
        credentials = fieldValues['botToken'] || '';
      } else if (platform === 'discord') {
        credentials = JSON.stringify({ botToken: fieldValues['botToken'] });
      } else if (platform === 'facebook') {
        credentials = JSON.stringify({ pageAccessToken: fieldValues['pageAccessToken'], appId: fieldValues['appId'] || '', appSecret: fieldValues['appSecret'] || '' });
      } else {
        credentials = JSON.stringify(fieldValues);
      }

      const res = await apiFetch(`/api/bots/${bot.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, credentials }),
      });
      if (res.ok) {
        onConnected();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to connect');
      }
    } catch (err) {
      console.error('Failed to connect:', err);
      setError('Connection failed. Check your credentials.');
    } finally {
      setConnecting(false);
    }
  };

  const setField = (key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "'VT323', monospace", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? t('botFactory.connectModalTitle') : t('botFactory.connectModalTitleCodename')}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap mb-2">
            {PLATFORM_CONFIGS.map(p => (
              <button key={p.id} onClick={() => { setPlatform(p.id); setFieldValues({}); setError(''); }}
                className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs font-bold border transition-colors ${platform === p.id ? p.activeColor : 'bg-background text-muted-foreground border-border hover:border-sky-500/20'}`}
                style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                {p.label}
              </button>
            ))}
            <button onClick={() => { setPlatform('thinkorswim'); setSchwabStep(1); setError(''); }}
              className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs font-bold border transition-colors ${platform === 'thinkorswim' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-background text-muted-foreground border-border hover:border-green-500/20'}`}
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              thinkorswim
            </button>
          </div>

          {platform === 'thinkorswim' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                {[1, 2, 3].map(s => (
                  <div key={s} className="flex items-center gap-1">
                    <div className={`w-6 h-6 rounded-full border text-[10px] font-bold flex items-center justify-center ${schwabStep >= s ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'border-border text-muted-foreground'}`}>
                      {schwabStep > s ? <Check className="w-3 h-3" /> : s}
                    </div>
                    {s < 3 && <div className={`h-0.5 w-6 ${schwabStep > s ? 'bg-green-500/40' : 'bg-border'}`} />}
                  </div>
                ))}
                <span className="text-[10px] text-muted-foreground ml-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {schwabStep === 1 ? 'OVERVIEW' : schwabStep === 2 ? 'CREDENTIALS' : 'AUTHORIZE'}
                </span>
              </div>

              {schwabStep === 1 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                    <p className="text-sm font-bold text-green-400 mb-1">What is thinkorswim?</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      thinkorswim is Charles Schwab's professional trading platform. This bot uses Schwab's Market API to execute automated trading strategies for stocks and options.
                    </p>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="font-bold text-foreground text-sm">Requirements:</p>
                    <p>1. A Charles Schwab brokerage account (schwab.com)</p>
                    <p>2. Free developer credentials from <span className="text-green-400 font-bold">developer.schwab.com</span></p>
                    <p>3. Create an app in the Schwab developer portal and note your App Key and Secret</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs font-bold text-amber-400 mb-1">⚠️ Risk Disclaimer</p>
                    <p className="text-xs text-muted-foreground">Automated trading involves substantial risk of financial loss. This bot starts in paper trading mode (no real money). Only enable live trading when you fully understand the risks and have tested thoroughly in paper mode.</p>
                  </div>
                  <button onClick={() => setSchwabStep(2)}
                    className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                    <ChevronRight className="w-4 h-4" /> I understand — Continue
                  </button>
                </div>
              )}

              {schwabStep === 2 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Enter your Schwab developer credentials. Get these at <span className="text-green-400 font-bold">developer.schwab.com</span> → Apps → Create App.
                  </p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>APP KEY (Client ID)</label>
                    <input value={appKey} onChange={e => setAppKey(e.target.value)} placeholder="your-app-key-here"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-green-500/50 focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>APP SECRET (Client Secret)</label>
                    <input value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="your-app-secret-here" type="password"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-green-500/50 focus:outline-none font-mono" />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Your credentials are encrypted before storage. They are only used to authenticate with Schwab's API.
                  </p>
                  <button onClick={handleConnect} disabled={connecting || !appKey.trim() || !appSecret.trim()}
                    className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                    {connecting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    Save & Get Auth Link
                  </button>
                </div>
              )}

              {schwabStep === 3 && authUrl && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                    <p className="text-sm font-bold text-green-400 mb-1">✓ Credentials Saved</p>
                    <p className="text-xs text-muted-foreground">Click the button below to authorize this bot to access your Schwab account. You will be redirected to Schwab's login page.</p>
                  </div>
                  <a href={authUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Authorize with Schwab
                  </a>
                  <p className="text-[10px] text-muted-foreground/60 text-center">
                    After authorizing, you will be redirected back. The bot will start in paper trading mode.
                  </p>
                  <button onClick={() => { onConnected(); onClose(); }}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
                    Done (skip for now)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {config?.fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomer ? field.boomerLabel : field.label}
                  </label>
                  <input
                    type={field.type || 'text'}
                    value={fieldValues[field.key] || ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none font-mono"
                  />
                </div>
              ))}

              {(boomer ? config?.boomerHint : config?.hint) && (
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                  {boomer ? config?.boomerHint : config?.hint}
                </p>
              )}

              <button onClick={handleConnect} disabled={connecting || !isValid}
                className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {connecting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plug className="w-4 h-4" />}
                {isOAuth
                  ? (boomer ? `Connect with ${config?.label}` : `OAUTH LINK · ${config?.label.toUpperCase()}`)
                  : (boomer ? t('botFactory.connectButton') : t('botFactory.connectButtonCodename'))}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg p-2.5 bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TradingConsole({ bot, boomer }: { bot: BotData; boomer: boolean }) {
  const [tradingTab, setTradingTab] = useState<'dashboard' | 'strategies' | 'trades' | 'risk'>('dashboard');
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [tradeStats, setTradeStats] = useState<{ totalPnl: number; wins: number; losses: number; total: number }>({ totalPnl: 0, wins: 0, losses: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [togglingPaper, setTogglingPaper] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [showPaperConfirm, setShowPaperConfirm] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [savingStrategy, setSavingStrategy] = useState<string | null>(null);
  const [editingRisk, setEditingRisk] = useState<TradingStrategy | null>(null);
  const [tradeFilterStatus, setTradeFilterStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [tradeFilterSide, setTradeFilterSide] = useState<'all' | 'BUY' | 'SELL'>('all');
  const [portfolioPositions, setPortfolioPositions] = useState<Array<{ symbol: string; quantity: number; marketValue: number; averagePrice: number; unrealizedPnl: number; assetType: string }>>([]);
  const [portfolioSource, setPortfolioSource] = useState<'live' | 'paper'>('paper');

  const hasTrading = bot.permissions.includes('trading_read') || bot.permissions.includes('trading_paper') || bot.permissions.includes('trading_execute');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, strRes, trRes, posRes] = await Promise.all([
        apiFetch(`/api/bots/${bot.id}/trading/account`),
        apiFetch(`/api/bots/${bot.id}/trading/strategies`),
        apiFetch(`/api/bots/${bot.id}/trading/trades?limit=50`),
        apiFetch(`/api/bots/${bot.id}/trading/positions`),
      ]);
      if (accRes.ok) { const d = await accRes.json(); setAccount(d.account); }
      if (strRes.ok) { const d = await strRes.json(); setStrategies(d.strategies ?? []); }
      if (trRes.ok) { const d = await trRes.json(); setTrades(d.trades ?? []); setTradeStats(d.stats ?? { totalPnl: 0, wins: 0, losses: 0, total: 0 }); }
      if (posRes.ok) { const d = await posRes.json(); setPortfolioPositions(d.positions ?? []); setPortfolioSource(d.source ?? 'paper'); }

      const acc = account;
      const strats = strategies;
      const kill = strats.some(s => s.killSwitch);
      setKillSwitchActive(kill);
    } catch {}
    setLoading(false);
  }, [bot.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (strategies.length > 0) {
      setKillSwitchActive(strategies.some(s => s.killSwitch));
    }
  }, [strategies]);

  const togglePaperMode = async (newPaper: boolean) => {
    if (!newPaper && !account?.hasTokens) {
      alert(boomer ? 'Connect your Schwab account before enabling live trading.' : 'SCHWAB ACCOUNT REQUIRED FOR LIVE TRADING');
      return;
    }
    setShowPaperConfirm(false);
    setTogglingPaper(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/account/paper-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaperMode: newPaper }),
      });
      if (res.ok) {
        setAccount(prev => prev ? { ...prev, isPaperMode: newPaper } : prev);
      }
    } catch {}
    setTogglingPaper(false);
  };

  const toggleKillSwitch = async (activate: boolean) => {
    setShowKillConfirm(false);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate }),
      });
      if (res.ok) {
        setKillSwitchActive(activate);
        setStrategies(prev => prev.map(s => ({ ...s, killSwitch: activate })));
      }
    } catch {}
  };

  const toggleStrategy = async (strategyType: string, enabled: boolean) => {
    setSavingStrategy(strategyType);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyType, enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setStrategies(prev => {
          const exists = prev.find(s => s.strategyType === strategyType);
          if (exists) return prev.map(s => s.strategyType === strategyType ? data.strategy : s);
          return [...prev, data.strategy];
        });
      }
    } catch {}
    setSavingStrategy(null);
  };

  const saveRiskConfig = async (stratId: number, updates: Partial<TradingStrategy>) => {
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/strategies/${stratId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setStrategies(prev => prev.map(s => s.id === stratId ? data.strategy : s));
        setEditingRisk(null);
      }
    } catch {}
  };

  const isMarketOpen = () => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const h = et.getHours();
    const m = et.getMinutes();
    return (h > 9 || (h === 9 && m >= 30)) && h < 16;
  };

  const marketOpen = isMarketOpen();

  const fmt$ = (cents: number) => {
    const d = cents / 100;
    return (d >= 0 ? '+' : '') + '$' + Math.abs(d).toFixed(2);
  };

  if (!hasTrading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center gap-3">
        <BarChart2 className="w-10 h-10 opacity-30" />
        <p className="text-sm">{boomer ? 'This bot does not have trading permissions.' : 'NO TRADING PERMISSIONS — UPGRADE TO TRADE-BOT'}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin mr-3" />
        <span className="text-sm" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>LOADING TRADING DATA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['dashboard', 'strategies', 'trades', 'risk'] as const).map(t => (
            <button key={t} onClick={() => setTradingTab(t)}
              className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-colors ${tradingTab === t ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-muted/10 text-muted-foreground border-border hover:border-green-500/20'}`}
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {t === 'dashboard' ? (boomer ? 'DASHBOARD' : 'DASHBOARD') :
               t === 'strategies' ? (boomer ? 'STRATEGIES' : 'STRATEGIES') :
               t === 'trades' ? (boomer ? 'TRADE LOG' : 'TRADE LOG') :
               (boomer ? 'RISK CONTROLS' : 'RISK CTRL')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${marketOpen ? 'text-green-400 bg-green-500/10 border-green-500/25' : 'text-red-400 bg-red-500/10 border-red-500/25'}`}
            style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
            {marketOpen ? '● MARKET OPEN' : '○ MARKET CLOSED'}
          </span>
          {account && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${account.isPaperMode ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' : 'text-red-400 bg-red-500/10 border-red-500/25'}`}
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {account.isPaperMode ? '📄 PAPER' : '⚡ LIVE'}
            </span>
          )}
        </div>
      </div>

      {tradingTab === 'dashboard' && (
        <div className="space-y-4">
          {!account ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm text-amber-400 font-bold mb-1">Setup Required</p>
              <p className="text-xs text-muted-foreground mb-3">
                {boomer
                  ? 'Connect your Schwab account to start trading. A Charles Schwab brokerage account is required. Get free API credentials at developer.schwab.com.'
                  : 'SCHWAB CREDENTIALS REQUIRED · GET API ACCESS AT developer.schwab.com'}
              </p>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                ⚠️ Automated trading involves significant financial risk. Never invest money you cannot afford to lose. This bot is in paper trading mode by default.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>PORTFOLIO EQUITY</span>
                <span className="text-lg font-bold text-foreground">
                  {account.cachedEquity !== null ? `$${(account.cachedEquity / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '--'}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>CASH BALANCE</span>
                <span className="text-lg font-bold text-foreground">
                  {account.cachedBalance !== null ? `$${(account.cachedBalance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '--'}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>TODAY P&L</span>
                <span className={`text-lg font-bold ${account.dailyPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt$(account.dailyPnl)}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>ACTIVE STRATEGIES</span>
                <span className="text-lg font-bold text-foreground">{strategies.filter(s => s.enabled).length}</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>TRADING MODE</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{account?.isPaperMode !== false ? 'Paper Trading' : 'Live Trading'}</p>
                <p className="text-xs text-muted-foreground">
                  {account?.isPaperMode !== false
                    ? 'Simulated trades against real market data — no real money'
                    : '⚡ REAL MONEY — Orders placed through Schwab API'}
                </p>
              </div>
              <button
                onClick={() => setShowPaperConfirm(true)}
                disabled={togglingPaper}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${account?.isPaperMode !== false ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}`}>
                {account?.isPaperMode !== false ? 'Switch to Live' : 'Switch to Paper'}
              </button>
            </div>
            {account?.lastSyncAt && (
              <p className="text-[10px] text-muted-foreground/50" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                LAST SYNC: {new Date(account.lastSyncAt).toLocaleString()}
              </p>
            )}
          </div>

          {killSwitchActive && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-400">KILL SWITCH ACTIVE</p>
                  <p className="text-xs text-muted-foreground">All trading is halted. No new orders will be placed.</p>
                </div>
              </div>
              <button onClick={() => toggleKillSwitch(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors">
                Resume
              </button>
            </div>
          )}

          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-bold text-muted-foreground mb-2" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'PERFORMANCE SUMMARY' : 'PERF STATS'}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center">
                <p className={`text-base font-bold ${tradeStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(tradeStats.totalPnl)}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>TOTAL P&L</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-green-400">{tradeStats.wins}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>WINS</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-red-400">{tradeStats.losses}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>LOSSES</p>
              </div>
            </div>
            {(() => {
              const closed = trades.filter(t => t.status === 'closed' && t.pnl != null).slice(-20);
              if (closed.length < 2) return null;
              const maxAbs = Math.max(...closed.map(t => Math.abs(t.pnl!)), 1);
              return (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>RECENT P&L (last {closed.length} closed)</p>
                  <div className="flex items-end gap-0.5 h-10">
                    {closed.map((t, i) => {
                      const pct = (Math.abs(t.pnl!) / maxAbs) * 100;
                      const isPos = (t.pnl ?? 0) >= 0;
                      return (
                        <div key={t.id} className="flex-1 flex flex-col justify-end" title={`${fmt$(t.pnl!)} ${t.symbol}`}>
                          <div
                            className={`rounded-sm min-h-[2px] ${isPos ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ height: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {(() => {
            const openPositions = trades.filter(t => t.status === 'open');
            if (openPositions.length === 0) return null;
            return (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                <p className="text-xs font-bold text-sky-400 mb-2" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  OPEN POSITIONS ({openPositions.length})
                </p>
                <div className="space-y-2">
                  {openPositions.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold px-1 py-0.5 rounded text-[9px] border ${t.side === 'BUY' ? 'text-green-400 border-green-500/20' : 'text-red-400 border-red-500/20'}`}
                          style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{t.side}</span>
                        <span className="font-bold text-foreground truncate max-w-[90px]" title={t.symbol}>{t.symbol}</span>
                        <span className="text-muted-foreground">{t.quantity}x @ ${(t.entryPrice / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.isPaper && <span className="text-[9px] text-amber-400 border border-amber-500/20 px-1 rounded">PAPER</span>}
                        <span className="text-muted-foreground text-[10px]" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {STRATEGY_LABELS[t.strategyType]?.substring(0, 8) || t.strategyType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {portfolioSource === 'live' && portfolioPositions.length > 0 && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-violet-400" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  SCHWAB PORTFOLIO ({portfolioPositions.length} positions)
                </p>
                <span className="text-[9px] px-1 py-0.5 rounded border border-green-500/20 text-green-400" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>LIVE</span>
              </div>
              <div className="space-y-1.5">
                {portfolioPositions.map((pos, i) => {
                  const unrealizedPnlDollars = pos.unrealizedPnl / 100;
                  const marketValueDollars = pos.marketValue / 100;
                  const avgPriceDollars = pos.averagePrice / 100;
                  const isProfit = unrealizedPnlDollars >= 0;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1 py-0.5 rounded border border-violet-500/20 text-violet-400 shrink-0" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {pos.assetType === 'OPTION' ? 'OPT' : 'EQ'}
                        </span>
                        <span className="font-bold text-foreground truncate max-w-[80px]" title={pos.symbol}>{pos.symbol}</span>
                        <span className="text-muted-foreground">{pos.quantity > 0 ? '+' : ''}{pos.quantity} @ ${avgPriceDollars.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-muted-foreground text-[10px]">${marketValueDollars.toFixed(0)}</span>
                        <span className={`font-bold text-[10px] ${isProfit ? 'text-green-400' : 'text-red-400'}`} style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {isProfit ? '+' : ''}{fmt$(pos.unrealizedPnl)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-violet-500/10 flex justify-between text-[10px]">
                <span className="text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>TOTAL UNREALIZED P&L</span>
                <span className={`font-bold ${portfolioPositions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {fmt$(portfolioPositions.reduce((s, p) => s + p.unrealizedPnl, 0))}
                </span>
              </div>
            </div>
          )}

          {portfolioSource === 'live' && portfolioPositions.length === 0 && account?.hasTokens && (
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xs text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                NO SCHWAB POSITIONS · Account connected, no open positions
              </p>
            </div>
          )}
        </div>
      )}

      {tradingTab === 'strategies' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
            {boomer ? 'Toggle strategies on/off. The bot will run enabled strategies during market hours.' : 'ENABLE STRATEGIES · BOT RUNS DURING MARKET HOURS 9:30AM–4PM ET'}
          </p>
          {ALL_STRATEGIES.map(type => {
            const strat = strategies.find(s => s.strategyType === type);
            const enabled = strat?.enabled ?? false;
            const isOptions = ['covered_calls', 'iron_condors', 'vertical_spreads', 'straddles'].includes(type);
            return (
              <div key={type} className={`rounded-lg border p-3 flex items-center gap-3 transition-colors ${enabled ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-muted/10'}`}>
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${enabled ? 'bg-green-500/15 border-green-500/30' : 'bg-muted/20 border-border'}`}>
                  {isOptions ? <BarChart2 className={`w-4 h-4 ${enabled ? 'text-green-400' : 'text-muted-foreground'}`} /> : <Activity className={`w-4 h-4 ${enabled ? 'text-green-400' : 'text-muted-foreground'}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{STRATEGY_LABELS[type]}</p>
                  <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                    {isOptions ? 'OPTIONS STRATEGY' : 'EQUITY STRATEGY'} {enabled && '· ACTIVE'}
                  </p>
                </div>
                <button
                  onClick={() => toggleStrategy(type, !enabled)}
                  disabled={savingStrategy === type}
                  className={`p-1.5 rounded-lg border transition-colors ${enabled ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : 'border-border text-muted-foreground hover:border-green-500/20'}`}>
                  {savingStrategy === type
                    ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tradingTab === 'trades' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {(['all', 'open', 'closed'] as const).map(f => (
                <button key={f} onClick={() => setTradeFilterStatus(f)}
                  className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${tradeFilterStatus === f ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-muted/10 text-muted-foreground border-border hover:border-green-500/20'}`}
                  style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all', 'BUY', 'SELL'] as const).map(f => (
                <button key={f} onClick={() => setTradeFilterSide(f)}
                  className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${tradeFilterSide === f ? (f === 'BUY' ? 'bg-green-500/15 text-green-400 border-green-500/30' : f === 'SELL' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-sky-500/15 text-sky-400 border-sky-500/30') : 'bg-muted/10 text-muted-foreground border-border hover:border-sky-500/20'}`}
                  style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {f === 'all' ? 'ALL SIDES' : f}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {trades.filter(t => (tradeFilterStatus === 'all' || t.status === tradeFilterStatus) && (tradeFilterSide === 'all' || t.side === tradeFilterSide)).length} / {trades.length}
            </span>
          </div>
          {trades.filter(t =>
            (tradeFilterStatus === 'all' || t.status === tradeFilterStatus) &&
            (tradeFilterSide === 'all' || t.side === tradeFilterSide)
          ).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{boomer ? 'No trades match the current filters' : 'NO TRADES MATCH FILTERS'}</p>
            </div>
          ) : (
            trades.filter(t =>
              (tradeFilterStatus === 'all' || t.status === tradeFilterStatus) &&
              (tradeFilterSide === 'all' || t.side === tradeFilterSide)
            ).map(trade => {
              const pnl = trade.pnl ?? 0;
              return (
                <div key={trade.id} className="rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {trade.side === 'BUY'
                        ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
                        : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{trade.symbol}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${trade.side === 'BUY' ? 'text-green-400 border-green-500/20 bg-green-500/10' : 'text-red-400 border-red-500/20 bg-red-500/10'}`}
                            style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{trade.side}</span>
                          {trade.isPaper && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-amber-400 border-amber-500/20 bg-amber-500/10"
                            style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>PAPER</span>}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${trade.status === 'open' ? 'text-sky-400 border-sky-500/20 bg-sky-500/10' : 'text-muted-foreground border-border'}`}
                            style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{trade.status.toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {trade.quantity}x @ ${(trade.entryPrice / 100).toFixed(2)}
                          {trade.exitPrice ? ` → $${(trade.exitPrice / 100).toFixed(2)}` : ''}
                          {' · '}{STRATEGY_LABELS[trade.strategyType] || trade.strategyType}
                        </p>
                      </div>
                    </div>
                    {trade.pnl !== null && (
                      <span className={`text-sm font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt$(pnl)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 mt-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                    {new Date(trade.createdAt).toLocaleString()}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {tradingTab === 'risk' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-sm font-bold text-red-400">{boomer ? 'KILL SWITCH' : 'EMERGENCY KILL SWITCH'}</span>
              </div>
              <button
                onClick={() => killSwitchActive ? toggleKillSwitch(false) : setShowKillConfirm(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${killSwitchActive ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : 'border-red-500/30 text-red-400 hover:bg-red-500/10'}`}>
                {killSwitchActive ? 'RESUME TRADING' : 'HALT ALL TRADING'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {boomer
                ? 'Immediately cancels all open orders and halts all strategy execution.'
                : 'CANCELS ALL OPEN ORDERS · HALTS ALL STRATEGIES · INSTANT EFFECT'}
            </p>
          </div>

          {strategies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {boomer ? 'Enable strategies first to configure risk limits.' : 'NO STRATEGIES CONFIGURED'}
            </p>
          ) : (
            strategies.map(strat => (
              <div key={strat.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-foreground">{STRATEGY_LABELS[strat.strategyType] || strat.strategyType}</p>
                  <button onClick={() => setEditingRisk(editingRisk?.id === strat.id ? null : strat)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-sky-500/20 transition-colors">
                    {editingRisk?.id === strat.id ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editingRisk?.id === strat.id ? (
                  <RiskEditForm strat={editingRisk} onSave={saveRiskConfig} boomer={boomer} />
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Max Daily Loss', `$${strat.maxDailyLoss}`],
                      ['Max Daily Loss %', `${strat.maxDailyLossPercent}%`],
                      ['Max Position Size', `$${strat.maxPositionSize}`],
                      ['Max Concurrent', `${strat.maxConcurrentTrades} trades`],
                      ['Stop Loss', `${strat.stopLossPercent}%`],
                      ['Trailing Stop', strat.trailingStopPercent > 0 ? `${strat.trailingStopPercent}%` : 'Off'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded p-2 bg-muted/10 border border-border">
                        <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{label}</p>
                        <p className="font-bold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs font-bold text-amber-400 mb-1">⚠️ RISK DISCLAIMER</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated trading involves substantial risk of loss. Past performance does not guarantee future results. This bot executes trades algorithmically — always monitor your positions. Never invest money you cannot afford to lose. Consult a licensed financial advisor before trading.
            </p>
          </div>
        </div>
      )}

      {showPaperConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowPaperConfirm(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-foreground mb-2">
              {account?.isPaperMode !== false ? '⚡ Enable Live Trading?' : '📄 Switch to Paper Trading?'}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              {account?.isPaperMode !== false
                ? 'This will place REAL orders using your Schwab account. Real money is at risk. Are you sure?'
                : 'Switch to simulated paper trading. No real money will be used.'}
            </p>
            {account?.isPaperMode !== false && (
              <p className="text-xs text-red-400 mb-4 p-2 border border-red-500/20 rounded-lg bg-red-500/5">
                ⚠️ REAL MONEY WARNING: Automated trading can result in significant losses. Only proceed if you understand the risks.
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowPaperConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm font-bold">
                Cancel
              </button>
              <button
                onClick={() => togglePaperMode(account?.isPaperMode !== false ? false : true)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold text-white ${account?.isPaperMode !== false ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                {account?.isPaperMode !== false ? 'Enable Live' : 'Switch to Paper'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showKillConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowKillConfirm(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-red-400 mb-2">🚨 Activate Kill Switch?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              This will immediately cancel ALL open orders and halt ALL strategy execution. The bot will stop trading until you manually resume.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowKillConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm font-bold">
                Cancel
              </button>
              <button onClick={() => toggleKillSwitch(true)}
                className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-bold text-white">
                HALT TRADING
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskEditForm({ strat, onSave, boomer }: { strat: TradingStrategy; onSave: (id: number, updates: Partial<TradingStrategy>) => Promise<void>; boomer: boolean }) {
  const [maxDailyLoss, setMaxDailyLoss] = useState(strat.maxDailyLoss);
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState(strat.maxDailyLossPercent);
  const [maxPositionSize, setMaxPositionSize] = useState(strat.maxPositionSize);
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState(strat.maxConcurrentTrades);
  const [stopLossPercent, setStopLossPercent] = useState(strat.stopLossPercent);
  const [trailingStopPercent, setTrailingStopPercent] = useState(strat.trailingStopPercent);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(strat.id, { maxDailyLoss, maxDailyLossPercent, maxPositionSize, maxConcurrentTrades, stopLossPercent, trailingStopPercent });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Max Daily Loss ($)', value: maxDailyLoss, set: setMaxDailyLoss, min: 50, max: 10000 },
          { label: 'Max Daily Loss (%)', value: maxDailyLossPercent, set: setMaxDailyLossPercent, min: 1, max: 20 },
          { label: 'Max Position Size ($)', value: maxPositionSize, set: setMaxPositionSize, min: 100, max: 50000 },
          { label: 'Max Concurrent Trades', value: maxConcurrentTrades, set: setMaxConcurrentTrades, min: 1, max: 20 },
          { label: 'Stop Loss (%)', value: stopLossPercent, set: setStopLossPercent, min: 0, max: 20 },
          { label: 'Trailing Stop (%)', value: trailingStopPercent, set: setTrailingStopPercent, min: 0, max: 20 },
        ].map(({ label, value, set, min, max }) => (
          <div key={label}>
            <label className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{label}</label>
            <input
              type="number" value={value} min={min} max={max}
              onChange={e => set(Number(e.target.value))}
              className="w-full bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
        {boomer ? 'Save Risk Config' : 'SAVE CONFIG'}
      </button>
    </div>
  );
}

interface ProspectResult {
  id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  bio: string;
  profileUrl: string;
  source: 'linkedin' | 'facebook';
  qualificationScore: number;
  notes: string;
  status: 'pending' | 'approved' | 'dismissed';
  discoveredAt: string;
}

interface ProspectingConfig {
  criteria: {
    targetTitles: string[];
    industries: string[];
    locations: string[];
    companySizes: string[];
    keywords: string[];
    maxResults: number;
  };
  autoImport: boolean;
  scheduleMinutes: number;
  disclaimer: string;
}

function TagInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
  };
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
      <div className="flex gap-1.5 flex-wrap mb-1.5">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-sky-500/50 focus:outline-none"
        />
        <button onClick={add} className="px-2 py-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 text-xs font-bold">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function ProspectingConsole({ bot, boomer }: { bot: BotData; boomer: boolean }) {
  const isProspectingBot = !!bot.marketplaceItemId;
  const source = bot.name === 'RECON-LI' ? 'linkedin' : 'facebook';

  const [prospectTab, setProspectTab] = useState<'config' | 'results'>('config');
  const [config, setConfig] = useState<ProspectingConfig>({
    criteria: { targetTitles: [], industries: [], locations: [], companySizes: [], keywords: [], maxResults: 10 },
    autoImport: false,
    scheduleMinutes: 1440,
    disclaimer: '',
  });
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cfgRes, resRes] = await Promise.all([
          apiFetch(`/api/bots/${bot.id}/prospecting/config`),
          apiFetch(`/api/bots/${bot.id}/prospecting/results`),
        ]);
        if (cfgRes.ok) { const d = await cfgRes.json(); setConfig(d.config); }
        if (resRes.ok) { const d = await resRes.json(); setResults(d.results ?? []); setDisclaimer(d.disclaimer ?? ''); }
      } catch {}
      setLoading(false);
    };
    load();
  }, [bot.id]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/prospecting/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSavedMsg('Saved!');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch {}
    setSaving(false);
  };

  const runScan = async () => {
    setRunning(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/prospecting/run`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setResults(prev => [...(d.results ?? []), ...prev].slice(0, 100));
        setDisclaimer(d.disclaimer ?? '');
        setProspectTab('results');
      }
    } catch {}
    setRunning(false);
  };

  const approveResult = async (resultId: string) => {
    setApproving(resultId);
    try {
      await apiFetch(`/api/bots/${bot.id}/prospecting/results/${resultId}/approve`, { method: 'POST' });
      setResults(prev => prev.map(r => r.id === resultId ? { ...r, status: 'approved' } : r));
    } catch {}
    setApproving(null);
  };

  const dismissResult = async (resultId: string) => {
    try {
      await apiFetch(`/api/bots/${bot.id}/prospecting/results/${resultId}/dismiss`, { method: 'POST' });
      setResults(prev => prev.map(r => r.id === resultId ? { ...r, status: 'dismissed' } : r));
    } catch {}
  };

  if (!isProspectingBot) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center gap-3">
        <Search className="w-10 h-10 opacity-30" />
        <p className="text-sm">This bot does not have prospecting capabilities.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mr-3" />
        <span className="text-sm" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>LOADING PROSPECTING DATA...</span>
      </div>
    );
  }

  const pendingCount = results.filter(r => r.status === 'pending').length;
  const approvedCount = results.filter(r => r.status === 'approved').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(['config', 'results'] as const).map(t => (
            <button key={t} onClick={() => setProspectTab(t)}
              className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-colors ${prospectTab === t ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-muted/10 text-muted-foreground border-border hover:border-sky-500/20'}`}
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {t === 'config' ? (boomer ? 'CONFIGURATION' : 'CONFIG') : `RESULTS${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </button>
          ))}
        </div>
        <button onClick={runScan} disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors disabled:opacity-50">
          {running ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {boomer ? 'Run Scan Now' : 'SCAN NOW'}
        </button>
      </div>

      {prospectTab === 'config' && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${source === 'linkedin' ? 'border-sky-500/20 bg-sky-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
            <p className="text-xs font-bold mb-1" style={boomer ? { color: source === 'linkedin' ? '#38bdf8' : '#818cf8' } : { fontFamily: "'Share Tech Mono', monospace", color: source === 'linkedin' ? '#38bdf8' : '#818cf8' }}>
              {source === 'linkedin' ? '🔗 LINKEDIN PROSPECTOR · RECON-LI' : '📘 FACEBOOK SCOUT · SCOUT-FB'}
            </p>
            <p className="text-xs text-muted-foreground">
              {source === 'linkedin'
                ? 'Configure search criteria to find LinkedIn leads. Results are AI-generated for demonstration. Connect LinkedIn Sales Navigator API for live data.'
                : 'Configure search criteria to find Facebook/Instagram leads. Results are AI-generated for demonstration. Connect Facebook Lead Ads API for live data.'}
            </p>
          </div>

          <div className="space-y-3">
            <TagInput
              label="Target Job Titles"
              values={config.criteria.targetTitles}
              onChange={v => setConfig(c => ({ ...c, criteria: { ...c.criteria, targetTitles: v } }))}
              placeholder="CEO, Head of Marketing, VP Sales..."
            />
            <TagInput
              label="Industries"
              values={config.criteria.industries}
              onChange={v => setConfig(c => ({ ...c, criteria: { ...c.criteria, industries: v } }))}
              placeholder="SaaS, Fintech, Healthcare..."
            />
            <TagInput
              label="Locations"
              values={config.criteria.locations}
              onChange={v => setConfig(c => ({ ...c, criteria: { ...c.criteria, locations: v } }))}
              placeholder="New York, London, Remote..."
            />
            <TagInput
              label="Company Sizes"
              values={config.criteria.companySizes}
              onChange={v => setConfig(c => ({ ...c, criteria: { ...c.criteria, companySizes: v } }))}
              placeholder="10-50, 51-200, 201-500..."
            />
            <TagInput
              label="Keywords"
              values={config.criteria.keywords}
              onChange={v => setConfig(c => ({ ...c, criteria: { ...c.criteria, keywords: v } }))}
              placeholder="Series B, digital transformation..."
            />
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Results Per Scan</label>
              <select
                value={config.criteria.maxResults}
                onChange={e => setConfig(c => ({ ...c, criteria: { ...c.criteria, maxResults: Number(e.target.value) } }))}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-sky-500/50 focus:outline-none">
                <option value={5}>5 contacts</option>
                <option value={10}>10 contacts</option>
                <option value={15}>15 contacts</option>
                <option value={20}>20 contacts</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground">IMPORT SETTINGS</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-import to CRM</p>
                <p className="text-xs text-muted-foreground">Import contacts automatically without review</p>
              </div>
              <button onClick={() => setConfig(c => ({ ...c, autoImport: !c.autoImport }))}
                className={`p-1 rounded transition-colors ${config.autoImport ? 'text-sky-400' : 'text-muted-foreground'}`}>
                {config.autoImport ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Scan Schedule</label>
              <select
                value={config.scheduleMinutes}
                onChange={e => setConfig(c => ({ ...c, scheduleMinutes: Number(e.target.value) }))}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-sky-500/50 focus:outline-none w-full">
                <option value={60}>Every hour</option>
                <option value={360}>Every 6 hours</option>
                <option value={720}>Every 12 hours</option>
                <option value={1440}>Every 24 hours</option>
                <option value={4320}>Every 3 days</option>
                <option value={10080}>Every week</option>
              </select>
            </div>
          </div>

          <button onClick={saveConfig} disabled={saving}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : savedMsg ? <Check className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {savedMsg || (boomer ? 'Save Configuration' : 'SAVE CONFIG')}
          </button>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] font-bold text-amber-400 mb-1">⚠️ TERMS OF SERVICE DISCLAIMER</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Automated data collection from {source === 'linkedin' ? 'LinkedIn' : 'Facebook'} may violate their Terms of Service. Results shown are AI-generated simulations for demonstration. For production use, integrate with {source === 'linkedin' ? 'LinkedIn Sales Navigator API or an authorized data provider' : 'Facebook Lead Ads API or Meta Business API with proper authorization'}. Always ensure compliance with GDPR, CCPA, and applicable privacy laws.
            </p>
          </div>
        </div>
      )}

      {prospectTab === 'results' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
            <span className="text-sky-400">{results.length} TOTAL</span>
            <span className="text-amber-400">{pendingCount} PENDING</span>
            <span className="text-emerald-400">{approvedCount} IMPORTED</span>
          </div>

          {disclaimer && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              <p className="text-[10px] text-amber-300/80 leading-relaxed">{disclaimer.split('\n')[0]}</p>
            </div>
          )}

          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-3">{boomer ? 'No prospects discovered yet. Run a scan to find leads.' : 'NO PROSPECTS FOUND — RUN SCAN TO DISCOVER LEADS'}</p>
              <button onClick={runScan} disabled={running}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold mx-auto transition-colors disabled:opacity-50">
                {running ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                {boomer ? 'Run First Scan' : 'INITIATE SCAN'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map(result => (
                <div key={result.id} className={`rounded-lg border p-3 transition-colors ${
                  result.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/5 opacity-75' :
                  result.status === 'dismissed' ? 'border-border bg-muted/5 opacity-40' :
                  'border-border bg-muted/10'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{result.name}</p>
                          <p className="text-xs text-muted-foreground">{result.title}{result.company ? ` · ${result.company}` : ''}</p>
                          {result.location && <p className="text-[10px] text-muted-foreground/60">{result.location}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                            result.qualificationScore >= 80 ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                            result.qualificationScore >= 60 ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                            'text-muted-foreground border-border'
                          }`} style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {result.qualificationScore}%
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                            result.source === 'linkedin' ? 'text-sky-400 border-sky-500/20' : 'text-blue-400 border-blue-500/20'
                          }`} style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {result.source === 'linkedin' ? 'LI' : 'FB'}
                          </span>
                        </div>
                      </div>
                      {result.notes && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1 italic">{result.notes}</p>
                      )}
                      {result.profileUrl && (
                        <a href={result.profileUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-sky-400/60 hover:text-sky-400 flex items-center gap-0.5 mt-0.5">
                          <ExternalLink className="w-2.5 h-2.5" /> {result.profileUrl.slice(0, 40)}...
                        </a>
                      )}
                    </div>
                  </div>

                  {result.status === 'pending' && (
                    <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-border/50">
                      <button onClick={() => approveResult(result.id)} disabled={approving === result.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                        {approving === result.id ? <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                        {boomer ? 'Import to CRM' : 'IMPORT'}
                      </button>
                      <button onClick={() => dismissResult(result.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-muted/10 text-muted-foreground border border-border hover:border-red-500/20 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                        {boomer ? 'Dismiss' : 'DISMISS'}
                      </button>
                    </div>
                  )}
                  {result.status === 'approved' && (
                    <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Imported to CRM
                    </div>
                  )}
                  {result.status === 'dismissed' && (
                    <div className="mt-2 text-[10px] text-muted-foreground/50 flex items-center gap-1">
                      <X className="w-3 h-3" /> Dismissed
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestChatPanel({ bot, boomer }: { bot: BotData; boomer: boolean }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/test-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error || 'Failed to get response'}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to the bot.' }]);
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full gap-3" style={{ minHeight: 300 }}>
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
        <p className="text-xs text-sky-400" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
          {boomer
            ? 'Test your bot by chatting with it directly. This bypasses platform connections and uses the bot\'s personality and permissions.'
            : 'TEST CHANNEL · DIRECT AI INTERFACE · BYPASSES PLATFORM CONNECTORS'}
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto max-h-80 min-h-[120px]">
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{boomer ? 'Send a message to test your bot' : 'SEND MESSAGE TO INITIALIZE TEST SEQUENCE'}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-sky-500/5 border border-sky-500/10 ml-4' : 'bg-muted/30 border border-border mr-4'}`}>
            <span className="text-[10px] font-bold text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {msg.role === 'user' ? (boomer ? 'YOU' : 'OPERATOR') : (boomer ? 'BOT' : 'AGENT')}
            </span>
            <p className="text-foreground/80 whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {sending && (
          <div className="rounded-lg p-3 text-sm bg-muted/30 border border-border mr-4">
            <span className="text-[10px] font-bold text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'BOT' : 'AGENT'}
            </span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-3 h-3 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-xs">{boomer ? 'Thinking...' : 'PROCESSING...'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={boomer ? 'Type a message...' : 'ENTER MESSAGE...'}
          disabled={sending}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function BotDetailModal({ bot, onClose, onRefresh, boomer, t }: { bot: BotData; onClose: () => void; onRefresh: () => void; boomer: boolean; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const hasTrading = bot.permissions.some(p => ['trading_read', 'trading_paper', 'trading_execute'].includes(p));
  const hasProspecting = bot.permissions.includes('crm_write') && bot.permissions.includes('contacts_write') && !!bot.marketplaceItemId;
  const [tab, setTab] = useState<'test' | 'logs' | 'memory' | 'tasks' | 'settings' | 'trading' | 'prospecting'>('test');
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
        } else {
          setLoading(false);
          return;
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
    if (!confirm(boomer ? t('botFactory.confirmDelete') : t('botFactory.confirmDeleteCodename'))) return;
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
              <StatusBadge status={bot.status} boomer={boomer} t={t} />
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

        <div className="flex border-b border-border overflow-x-auto">
          {(['test', 'logs', 'memory', 'tasks', ...(hasTrading ? ['trading'] : []), ...(hasProspecting ? ['prospecting'] : []), 'settings'] as const).map((tabKey: string) => (
            <button key={tabKey} onClick={() => setTab(tabKey as typeof tab)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-colors ${tab === tabKey ? 'text-sky-400 border-b-2 border-sky-400' : 'text-muted-foreground hover:text-foreground'}`}
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {tabKey === 'test' && <MessageSquare className="w-3 h-3" />}
              {tabKey === 'trading' && <TrendingUp className="w-3 h-3" />}
              {tabKey === 'prospecting' && <Search className="w-3 h-3" />}
              {tabKey === 'test' ? (boomer ? 'Test Chat' : 'TEST CHAT') :
               tabKey === 'logs' ? (boomer ? t('botFactory.detailTabLogs') : t('botFactory.detailTabLogsCodename')) :
               tabKey === 'memory' ? (boomer ? t('botFactory.detailTabMemory') : t('botFactory.detailTabMemoryCodename')) :
               tabKey === 'tasks' ? (boomer ? t('botFactory.detailTabTasks') : t('botFactory.detailTabTasksCodename')) :
               tabKey === 'trading' ? (boomer ? 'Trading' : 'TRADING') :
               tabKey === 'prospecting' ? (boomer ? 'Prospecting' : 'PROSPECTING') :
               (boomer ? t('botFactory.detailTabSettings') : t('botFactory.detailTabSettingsCodename'))}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'test' ? (
            <TestChatPanel bot={bot} boomer={boomer} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mr-3" />
              <span className="text-sm" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                {boomer ? t('botFactory.loadingContent') : t('botFactory.loadingContentCodename')}
              </span>
            </div>
          ) : tab === 'logs' ? (
            logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{boomer ? t('botFactory.noConversations') : t('botFactory.noConversationsCodename')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(log => (
                  <div key={log.id} className={`rounded-lg p-3 text-sm ${log.role === 'user' ? 'bg-sky-500/5 border border-sky-500/10' : 'bg-muted/30 border border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                        {log.role === 'user' ? (boomer ? t('botFactory.logRoleUser') : t('botFactory.logRoleUserCodename')) : (boomer ? t('botFactory.logRoleBot') : t('botFactory.logRoleBotCodename'))}
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
                <p className="text-sm">{boomer ? t('botFactory.noMemories') : t('botFactory.noMemoriesCodename')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {memories.map(mem => (
                  <div key={mem.id} className="flex items-start gap-3 rounded-lg p-3 bg-muted/20 border border-border group">
                    <MemoryStick className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-purple-400" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{mem.key}</span>
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
                <label className="text-xs text-muted-foreground block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? t('botFactory.newScheduledTask') : t('botFactory.newScheduledTaskCodename')}
                </label>
                <input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder={boomer ? t('botFactory.taskDirectivePlaceholder') : t('botFactory.taskDirectivePlaceholderCodename')}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                      {boomer ? t('botFactory.intervalLabel') : t('botFactory.intervalLabelCodename')}
                    </label>
                    <select value={newTaskCron} onChange={e => setNewTaskCron(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none">
                      <option value="5">{t('botFactory.interval5min')}</option>
                      <option value="15">{t('botFactory.interval15min')}</option>
                      <option value="30">{t('botFactory.interval30min')}</option>
                      <option value="60">{t('botFactory.interval1hour')}</option>
                      <option value="360">{t('botFactory.interval6hours')}</option>
                      <option value="720">{t('botFactory.interval12hours')}</option>
                      <option value="1440">{t('botFactory.interval24hours')}</option>
                    </select>
                  </div>
                  <button onClick={createTask} disabled={creatingTask || !newTaskDesc.trim()}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
                    {creatingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {boomer ? t('botFactory.addTask') : t('botFactory.addTaskCodename')}
                  </button>
                </div>
              </div>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{boomer ? t('botFactory.noTasks') : t('botFactory.noTasksCodename')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-start gap-3 rounded-lg p-3 border group ${task.enabled ? 'bg-muted/20 border-border' : 'bg-muted/5 border-border/50 opacity-60'}`}>
                      <button onClick={() => toggleTask(task.id, !task.enabled)}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${task.enabled ? 'bg-sky-500 border-sky-500' : 'border-border'}`}>
                        {task.enabled && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/80">{task.taskDescription}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {boomer
                              ? t('botFactory.taskCycleLabel', { minutes: task.cronExpression })
                              : t('botFactory.taskCycleLabelCodename', { minutes: task.cronExpression })}
                          </span>
                          {task.lastRunAt && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {boomer ? t('botFactory.taskLastRun') : t('botFactory.taskLastRunCodename')}{new Date(task.lastRunAt).toLocaleString()}
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
          ) : tab === 'trading' ? (
            <TradingConsole bot={bot} boomer={boomer} />
          ) : tab === 'prospecting' ? (
            <ProspectingConsole bot={bot} boomer={boomer} />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? t('botFactory.settingsPersonality') : t('botFactory.settingsPersonalityCodename')}
                </label>
                <p className="text-sm text-foreground/70 bg-muted/20 rounded-lg p-3 border border-border">{bot.personality}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? t('botFactory.settingsConnections') : t('botFactory.settingsConnectionsCodename')}
                </label>
                {bot.connections.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50">{boomer ? t('botFactory.noLinksEstablished') : t('botFactory.noLinksEstablishedCodename')}</p>
                ) : (
                  <div className="space-y-2">
                    {bot.connections.map(conn => (
                      <div key={conn.id} className="flex items-center gap-3 rounded-lg p-3 bg-muted/20 border border-border">
                        <span className="text-base">{platformIcons[conn.platform] || '🔗'}</span>
                        <span className="text-xs font-bold text-sky-400" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{conn.platform.toUpperCase()}</span>
                        <StatusBadge status={conn.status === 'connected' ? 'active' : 'paused'} boomer={boomer} t={t} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomer ? t('botFactory.settingsPermissions') : t('botFactory.settingsPermissionsCodename')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bot.permissions.map((p: string) => (
                    <span key={p} className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{p}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomer ? t('botFactory.settingsMaxTokens') : t('botFactory.settingsMaxTokensCodename')}
                  </span>
                  <span className="text-sm font-bold text-foreground">{bot.maxTokensPerResponse.toLocaleString()}</span>
                </div>
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomer ? t('botFactory.settingsRateLimit') : t('botFactory.settingsRateLimitCodename')}
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
  const { t } = useTranslation();
  const [boomerMode] = useBoomerMode();
  const [tab, setTab] = useState<Tab>('marketplace');
  const [bots, setBots] = useState<BotData[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ marketplaceItemId: number; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null);
  const [connectBot, setConnectBot] = useState<BotData | null>(null);
  const [activating, setActivating] = useState<number | null>(null);

  const { isAuthenticated } = useAuth();
  const plan = usePlan();
  const [, navigate] = useLocation();
  const hasAccess = plan.isOwner || plan.features.has('claw_bot');

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
      if (sRes.ok) { const data = await sRes.json(); setSubscriptions((data.subscriptions ?? []).map((s: { marketplaceItemId: number; status: string }) => ({ marketplaceItemId: s.marketplaceItemId, status: s.status }))); }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([loadBots(), loadMarketplace()]).finally(() => setLoading(false));
  }, [isAuthenticated, loadBots, loadMarketplace]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setTab('my-bots');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkout === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const activateMarketplaceBot = async (item: MarketplaceItem) => {
    setActivating(item.id);
    try {
      if (item.priceMonthly > 0) {
        const res = await apiFetch('/api/stripe/create-bot-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketplaceItemId: item.id }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) { window.location.href = data.url; return; }
        }
      } else {
        const res = await apiFetch('/api/bots/marketplace/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketplaceItemId: item.id }),
        });
        if (res.ok) {
          await Promise.all([loadBots(), loadMarketplace()]);
          setTab('my-bots');
        }
      }
    } catch (err) {
      console.error('Failed to activate bot:', err);
    } finally {
      setActivating(null);
    }
  };

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? t('botFactory.signInContext') : t('botFactory.signInContextCodename')} />;
  }

  if (plan.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
      </div>
    );
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
                  {boomerMode ? t('botFactory.title') : t('botFactory.titleCodename')}
                </h1>
                <p className="text-xs text-muted-foreground" style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                  {boomerMode ? t('botFactory.subtitle') : t('botFactory.subtitleCodename')}
                </p>
              </div>
            </div>
          </div>

          {!hasAccess && (
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{boomerMode ? 'Unlock Claw Bot — $145/mo' : 'ACTIVATE CLAW BOT — $145/MO'}</p>
                  <p className="text-xs text-muted-foreground">{boomerMode ? 'Pablo AI Call Agent + AI Secretary + OpenClaw Multi-Agent Suite + all premium marketplace bots.' : 'PABLO AI CALL AGENT + AI SECRETARY + OPENCLAW SUITE + ALL PREMIUM BOTS'}</p>
                </div>
                <a href={`${import.meta.env.BASE_URL}features`}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black transition-colors">
                  <Zap className="w-3.5 h-3.5" />
                  {boomerMode ? 'Subscribe' : 'ACTIVATE'}
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-6">
            <button onClick={() => setTab('marketplace')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'marketplace' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-card text-muted-foreground border-border hover:border-sky-500/20'}`}>
              <Store className="w-4 h-4" />
              {boomerMode ? t('botFactory.tabStore') : t('botFactory.tabStoreCodename')}
            </button>
            <button onClick={() => setTab('my-bots')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'my-bots' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-card text-muted-foreground border-border hover:border-sky-500/20'}`}>
              <Bot className="w-4 h-4" />
              {boomerMode ? t('botFactory.tabMyBots') : t('botFactory.tabMyBotsCodename')}
              {bots.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400">{bots.length}</span>
              )}
            </button>
            {tab === 'my-bots' && (
              <button onClick={() => setShowCreate(true)}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors">
                <Plus className="w-4 h-4" />
                {boomerMode ? t('botFactory.newBot') : t('botFactory.newBotCodename')}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Bot className="w-6 h-6 animate-pulse mr-3" />
              <span className="text-sm" style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                {boomerMode ? t('botFactory.loadingBots') : t('botFactory.loadingBotsCodename')}
              </span>
            </div>
          ) : tab === 'marketplace' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card/50 p-4 mb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {boomerMode ? t('botFactory.marketplaceDesc') : t('botFactory.marketplaceDescCodename')}
                </p>
              </div>

              {(() => {
                const clawBotItem = marketplace.find(i => i.slug === 'claw-bot');
                const freeItems = marketplace.filter(i => i.priceMonthly === 0 && i.slug !== 'claw-bot');
                const paidItems = marketplace.filter(i => i.priceMonthly > 0);
                const categories: Record<string, MarketplaceItem[]> = {};
                for (const item of paidItems) {
                  if (!categories[item.category]) categories[item.category] = [];
                  categories[item.category].push(item);
                }

                return (
                  <>
                    {clawBotItem && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest" style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {boomerMode ? 'Claw Bot — Full AI Operations Bundle' : 'CLAW BOT // PABLO + SECRETARY + OPENCLAW + PREMIUM BOTS'}
                          </span>
                          <div className="flex-1 h-px bg-emerald-500/20" />
                        </div>
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                          className={`rounded-2xl border p-5 ${hasAccess ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${hasAccess ? 'bg-emerald-500/15 border-emerald-500/30' : 'bg-muted/30 border-border'}`}>
                              {hasAccess ? <Sparkles className="w-5 h-5 text-emerald-400" /> : <Lock className="w-5 h-5 text-muted-foreground/50" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-bold text-foreground text-sm" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
                                  {clawBotItem.name}
                                </h3>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                  style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                                  {hasAccess ? (boomerMode ? 'SUBSCRIBED' : '// ACTIVE') : (boomerMode ? '$145/mo' : '$145/MO')}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{clawBotItem.tagline}</p>
                              <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">{clawBotItem.description}</p>
                              <div className="flex flex-wrap gap-1 mb-3">
                                {clawBotItem.capabilities.map(cap => (
                                  <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 border border-border/50"
                                    style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{cap}</span>
                                ))}
                              </div>
                              {hasAccess ? (
                                <button onClick={() => activateMarketplaceBot(clawBotItem)} disabled={activating === clawBotItem.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">
                                  {activating === clawBotItem.id ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                  {boomerMode ? 'Deploy Claw Bot' : '// DEPLOY CLAW BOT'}
                                </button>
                              ) : (
                                <button onClick={() => navigate('/upgrade')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                                  <ChevronRight className="w-3.5 h-3.5" />
                                  {boomerMode ? 'Subscribe on Upgrade page — $145/mo' : '// ACTIVATE CLAW BOT — $145/MO'}
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )}

                    {freeItems.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest" style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {boomerMode ? 'Free Bots' : 'FREE // NO COST'}
                          </span>
                          <div className="flex-1 h-px bg-emerald-500/20" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <AnimatePresence>
                            {freeItems.map((item, i) => {
                              const Icon = getIcon(item.icon);
                              const sub = subscriptions.find(s => s.marketplaceItemId === item.id);
                              const isActive = sub?.status === 'active';
                              return (
                                <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className="rounded-2xl border border-emerald-500/15 bg-card p-5">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl border bg-emerald-500/10 border-emerald-500/25 flex items-center justify-center shrink-0">
                                      <Icon className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h3 className="font-bold text-foreground text-sm" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
                                          {item.name}
                                        </h3>
                                        <PriceBadge price={item.priceMonthly} boomer={boomerMode} t={t} />
                                      </div>
                                      <p className="text-xs text-muted-foreground mb-2">{item.tagline}</p>
                                      <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">{item.description}</p>
                                      <div className="flex flex-wrap gap-1 mb-3">
                                        {item.capabilities.map(cap => (
                                          <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 border border-border/50"
                                            style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{cap}</span>
                                        ))}
                                      </div>
                                      {isActive ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                          <Check className="w-3.5 h-3.5" /> {boomerMode ? t('botFactory.activated') : t('botFactory.activatedCodename')}
                                        </span>
                                      ) : (
                                        <button onClick={() => activateMarketplaceBot(item)} disabled={activating === item.id}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">
                                          {activating === item.id ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                          {boomerMode ? t('botFactory.activate') : t('botFactory.activateCodename')}
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
                    )}

                    {Object.entries(categories).map(([category, items]) => {
                      const isTrading = category === 'trading';
                      return (
                      <div key={category} className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${isTrading ? 'text-green-400' : 'text-sky-400'}`} style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                            {isTrading ? (boomerMode ? '📈 TRADING BOTS' : '▲ TRADING AGENTS') : category}
                          </span>
                          <div className={`flex-1 h-px ${isTrading ? 'bg-green-500/20' : 'bg-sky-500/20'}`} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <AnimatePresence>
                            {items.map((item, i) => {
                              const Icon = getIcon(item.icon);
                              const sub = subscriptions.find(s => s.marketplaceItemId === item.id);
                              const isActive = sub?.status === 'active';
                              const isCanceled = sub?.status === 'canceled';
                              return (
                                <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className={`rounded-2xl border bg-card p-5 ${isTrading ? 'border-green-500/20 bg-green-500/5' : item.featured ? 'border-amber-500/20' : 'border-border'}`}>
                                  <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${isTrading ? 'bg-green-500/10 border-green-500/25' : item.featured ? 'bg-amber-500/10 border-amber-500/25' : 'bg-sky-500/10 border-sky-500/25'}`}>
                                      <Icon className={`w-5 h-5 ${isTrading ? 'text-green-400' : item.featured ? 'text-amber-400' : 'text-sky-400'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h3 className="font-bold text-foreground text-sm" style={boomerMode ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
                                          {item.name}
                                        </h3>
                                        <PriceBadge price={item.priceMonthly} boomer={boomerMode} t={t} />
                                        {isActive && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                            style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                                            {boomerMode ? 'ACTIVE' : '// ACTIVE'}
                                          </span>
                                        )}
                                        {isCanceled && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25"
                                            style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                                            {boomerMode ? 'CANCELED' : '// CANCELED'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mb-2">{item.tagline}</p>
                                      <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">{item.description}</p>
                                      <div className="flex flex-wrap gap-1 mb-3">
                                        {item.capabilities.map(cap => (
                                          <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 border border-border/50"
                                            style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{cap}</span>
                                        ))}
                                      </div>
                                      {isActive ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                          <Check className="w-3.5 h-3.5" /> {boomerMode ? t('botFactory.activated') : t('botFactory.activatedCodename')}
                                        </span>
                                      ) : (
                                        <button onClick={() => activateMarketplaceBot(item)} disabled={activating === item.id}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors disabled:opacity-50">
                                          {activating === item.id ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                          {item.priceMonthly > 0
                                            ? (boomerMode ? 'Subscribe' : '// SUBSCRIBE')
                                            : (boomerMode ? t('botFactory.activate') : t('botFactory.activateCodename'))
                                          }
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
                    );
                    })}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              {bots.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
                  <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {boomerMode ? t('botFactory.noBotsYet') : t('botFactory.noBotsYetCodename')}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors">
                      <Plus className="w-4 h-4" /> {boomerMode ? t('botFactory.createBot') : t('botFactory.createBotCodename')}
                    </button>
                    <button onClick={() => setTab('marketplace')}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-border text-muted-foreground hover:text-foreground hover:border-sky-500/20 transition-colors">
                      <Store className="w-4 h-4" /> {boomerMode ? t('botFactory.browseStore') : t('botFactory.browseStoreCodename')}
                    </button>
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {bots.map((bot, i) => {
                    const sub = bot.marketplaceItemId
                      ? subscriptions.find(s => s.marketplaceItemId === bot.marketplaceItemId)
                      : null;
                    const marketplaceItem = bot.marketplaceItemId
                      ? marketplace.find(m => m.id === bot.marketplaceItemId)
                      : null;
                    return (
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
                              <StatusBadge status={bot.status} boomer={boomerMode} t={t} />
                              {marketplaceItem && marketplaceItem.priceMonthly > 0 && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sub?.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : sub?.status === 'canceled' ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-sky-500/15 text-sky-400 border-sky-500/25'}`}
                                  style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                                  {sub?.status === 'canceled'
                                    ? (boomerMode ? 'Subscription Canceled' : '// SUB CANCELED')
                                    : (boomerMode ? 'Subscribed' : '// SUBSCRIBED')
                                  }
                                </span>
                              )}
                              {(!marketplaceItem || marketplaceItem.priceMonthly === 0) && bot.marketplaceItemId && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                  style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                                  {boomerMode ? 'Free' : '// FREE'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Plug className="w-3 h-3" />
                                {bot.connections.length} {boomerMode ? t('botFactory.connections') : t('botFactory.connectionsCodename')}
                              </span>
                              {bot.connections.map(c => (
                                <span key={c.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border"
                                  style={boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>{c.platform.toUpperCase()}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={e => { e.stopPropagation(); setConnectBot(bot); }}
                              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-sky-400 hover:border-sky-500/20 transition-colors"
                              title={boomerMode ? t('botFactory.connectPlatformTitle') : t('botFactory.connectPlatformTitleCodename')}>
                              <Plug className="w-4 h-4" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showCreate && <CreateBotModal onClose={() => setShowCreate(false)} onCreated={loadBots} boomer={boomerMode} t={t} />}
        {selectedBot && <BotDetailModal bot={selectedBot} onClose={() => setSelectedBot(null)} onRefresh={() => { loadBots(); setSelectedBot(null); }} boomer={boomerMode} t={t} />}
        {connectBot && <ConnectPlatformModal bot={connectBot} onClose={() => setConnectBot(null)} onConnected={loadBots} boomer={boomerMode} t={t} />}
      </AnimatePresence>
    </div>
  );
}
