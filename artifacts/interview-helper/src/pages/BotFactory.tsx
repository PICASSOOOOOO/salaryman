import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Trash2, Power, PowerOff, MessageSquare, Brain, Building2,
  Send, Settings, Clock, Shield, ChevronRight, Store, Zap,
  Terminal, Target, PenTool, Calendar, Briefcase, X, Check,
  Eye, MemoryStick, Plug, AlertCircle, TrendingUp, TrendingDown,
  DollarSign, BarChart2, Activity, AlertTriangle, ToggleLeft, ToggleRight,
  Siren, FlipHorizontal, Search, Users, RefreshCw, ExternalLink, Lock, Sparkles, Phone, Table2, Clapperboard, Music,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '@/hooks/use-plan';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import BotCommandCenter from './BotCommandCenter';
import FinancialOverview from '@/components/FinancialOverview';
import AgentTeam from './AgentTeam';

function BotNameDisplay({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const upper = name.toUpperCase();
  if (upper.endsWith(' PRIME')) {
    const base = upper.slice(0, -6);
    return (
      <span className={className} style={style}>
        {base} <span style={{ color: '#f59e0b', textShadow: '0 0 8px rgba(245,158,11,0.3)' }}>PRIME</span>
      </span>
    );
  }
  return <span className={className} style={style}>{upper}</span>;
}

type BotStatus = 'active' | 'paused' | 'error';

const platformIcons: Record<string, string> = {
  whatsapp: '💬',
  telegram: '✈️',
  discord: '🎮',
  facebook: '📘',
  email: '📧',
  linkedin: '💼',
};

export interface BotConnection {
  id: number;
  platform: string;
  status: string;
  lastActiveAt: string | null;
}

export interface BotData {
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
  workstation?: {
    floorId: number;
    city: string;
    floorNumber: number;
    workstationKey: string;
  } | null;
  collaborationEnabled?: boolean;
  parentBotId?: number | null;
  collaborationRole?: string | null;
  createdAt: string;
}

interface TeamMember {
  id: number;
  name: string;
  status: string;
  role: string;
  isChild: boolean;
  permissions: string[];
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

interface WorkstationCapacity {
  hasProperty: boolean;
  totalDesks: number;
  requiredHumanDesks: number;
  activeBotDesks: number;
  availableBotDesks: number;
  floorCount: number;
  rule: string;
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
  calendar: Calendar, briefcase: Briefcase, bot: Bot, table: Table2,
  clapperboard: Clapperboard, music: Music,
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
      style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

function PriceBadge({ price, boomer, t }: { price: number; boomer: boolean; t: (key: string, opts?: Record<string, unknown>) => string }) {
  if (price === 0) return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
      style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{t('botFactory.priceFree')}</span>
  );
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25"
      style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
      {t('botFactory.pricePerMonth', { amount: price })}
    </span>
  );
}

interface BotTemplate {
  label: string;
  boomerLabel: string;
  value: string;
  category: string;
  icon: string;
  desc: string;
}

const BOT_TEMPLATE_CATEGORIES = [
  { id: 'sales', label: 'SALES & OUTREACH', icon: '💰' },
  { id: 'support', label: 'CUSTOMER SERVICE', icon: '🎧' },
  { id: 'marketing', label: 'MARKETING & CONTENT', icon: '📣' },
  { id: 'hr', label: 'HR & RECRUITING', icon: '👥' },
  { id: 'ops', label: 'OPERATIONS & ADMIN', icon: '⚙️' },
  { id: 'finance', label: 'FINANCE & BILLING', icon: '📊' },
  { id: 'data', label: 'DATA & ANALYTICS', icon: '📈' },
  { id: 'dev', label: 'DEVELOPMENT & IT', icon: '💻' },
  { id: 'social', label: 'SOCIAL MEDIA', icon: '📱' },
  { id: 'ecommerce', label: 'E-COMMERCE', icon: '🛒' },
  { id: 'legal', label: 'LEGAL & COMPLIANCE', icon: '⚖️' },
  { id: 'personal', label: 'PERSONAL & UTILITY', icon: '🧰' },
];

const PERSONALITY_PRESETS: BotTemplate[] = [
  {
    label: 'General Assistant',
    boomerLabel: 'GENERAL ASSISTANT',
    value: 'You are a helpful assistant. Answer questions clearly, be concise, and always be friendly.',
    category: 'personal',
    icon: '🤖',
    desc: 'ALL-PURPOSE HELPER FOR ANY TASK',
  },
  {
    label: 'Cold Outreach',
    boomerLabel: 'COLD OUTREACH BOT',
    value: 'You are an expert cold outreach specialist. Craft personalized cold emails and LinkedIn messages based on prospect research. A/B test subject lines, track open rates, and follow up automatically on a cadence (Day 1, Day 3, Day 7, Day 14). Personalize every message using company news, job postings, and mutual connections. Never sound generic.',
    category: 'sales',
    icon: '📧',
    desc: 'AUTOMATED COLD EMAIL & LINKEDIN SEQUENCES',
  },
  {
    label: 'Lead Qualifier',
    boomerLabel: 'LEAD QUALIFIER BOT',
    value: 'You are a lead qualification specialist. Ask BANT questions (Budget, Authority, Need, Timeline) conversationally. Score leads 1-100 based on fit. Route hot leads (80+) immediately, warm leads (50-79) to nurture sequences, and cold leads (<50) to long-term drip. Track all qualification data.',
    category: 'sales',
    icon: '🎯',
    desc: 'SCORE & ROUTE LEADS AUTOMATICALLY WITH BANT',
  },
  {
    label: 'Sales Closer',
    boomerLabel: 'SALES CLOSER BOT',
    value: 'You are a professional sales closer. Build rapport, handle objections, present pricing confidently, create urgency without pressure, and guide prospects to a decision. Track deal stages, follow up on proposals, and send contracts. Use consultative selling — understand their pain before pitching solutions.',
    category: 'sales',
    icon: '🤝',
    desc: 'HANDLE OBJECTIONS, CLOSE DEALS, SEND CONTRACTS',
  },
  {
    label: 'Pipeline Manager',
    boomerLabel: 'PIPELINE MANAGER BOT',
    value: 'You are a sales pipeline manager. Track every deal through stages (Prospect, Qualified, Proposal, Negotiation, Closed). Send daily pipeline reports, flag stale deals (no activity 7+ days), forecast revenue, and remind reps of follow-ups. Maintain CRM hygiene by flagging missing fields.',
    category: 'sales',
    icon: '📋',
    desc: 'TRACK DEALS, FORECAST REVENUE, FLAG STALE LEADS',
  },
  {
    label: 'Upsell Agent',
    boomerLabel: 'UPSELL AGENT BOT',
    value: 'You are an upsell and cross-sell specialist. Analyze customer purchase history and usage patterns to recommend relevant upgrades, add-ons, and complementary products. Time recommendations based on renewal dates, usage milestones, and satisfaction scores. Be helpful, not pushy.',
    category: 'sales',
    icon: '⬆️',
    desc: 'RECOMMEND UPGRADES BASED ON USAGE & HISTORY',
  },
  {
    label: 'Helpdesk Tier-1',
    boomerLabel: 'HELPDESK TIER-1 BOT',
    value: 'You are a Tier-1 support agent. Handle common issues: password resets, account access, billing questions, basic troubleshooting. Follow decision trees for known issues. Escalate to Tier-2 when the issue requires technical investigation. Always collect: customer name, email, account ID, and issue description before proceeding.',
    category: 'support',
    icon: '🎫',
    desc: 'HANDLE TICKETS, RESET PASSWORDS, BASIC TROUBLESHOOT',
  },
  {
    label: 'Live Chat Agent',
    boomerLabel: 'LIVE CHAT AGENT BOT',
    value: 'You are a live chat support agent on the company website. Respond within seconds, be concise and friendly. Handle multiple conversations. Ask clarifying questions, provide links to help articles, and resolve issues in real-time. If you cannot resolve, create a ticket and provide the ticket number.',
    category: 'support',
    icon: '💬',
    desc: 'REAL-TIME CHAT SUPPORT ON WEBSITE',
  },
  {
    label: 'FAQ Auto-Responder',
    boomerLabel: 'FAQ AUTO-RESPONDER BOT',
    value: 'You are an FAQ auto-responder. Match incoming questions to your knowledge base and provide instant answers. If no match is found, acknowledge the question and route to a human. Track frequently asked questions and suggest new FAQ entries for gaps. Provide answers with links to relevant documentation.',
    category: 'support',
    icon: '❓',
    desc: 'INSTANT ANSWERS FROM KNOWLEDGE BASE',
  },
  {
    label: 'Feedback Collector',
    boomerLabel: 'FEEDBACK COLLECTOR BOT',
    value: 'You are a feedback collection specialist. After support interactions or purchases, send NPS/CSAT surveys. Analyze sentiment, categorize feedback (product, service, pricing, UX), flag critical negative feedback for immediate attention, and generate weekly feedback digests with trends and actionable insights.',
    category: 'support',
    icon: '📝',
    desc: 'COLLECT NPS/CSAT, ANALYZE SENTIMENT, REPORT TRENDS',
  },
  {
    label: 'Escalation Router',
    boomerLabel: 'ESCALATION ROUTER BOT',
    value: 'You are an escalation routing specialist. Analyze incoming support requests for severity, sentiment, and VIP status. Route critical issues to senior agents, billing disputes to finance, technical issues to engineering. Apply SLA timers and alert managers when SLAs are at risk. Maintain escalation logs.',
    category: 'support',
    icon: '🚨',
    desc: 'ROUTE TICKETS BY SEVERITY, ENFORCE SLA TIMERS',
  },
  {
    label: 'Blog Writer',
    boomerLabel: 'BLOG WRITER BOT',
    value: 'You are a professional blog content writer. Write SEO-optimized blog posts with proper heading structure (H1, H2, H3), meta descriptions, internal linking suggestions, and keyword placement. Research topics, create outlines, write drafts, and suggest featured images. Target 1,500-2,500 words per post. Include CTAs.',
    category: 'marketing',
    icon: '✍️',
    desc: 'SEO-OPTIMIZED BLOG POSTS WITH KEYWORDS & CTAs',
  },
  {
    label: 'Email Campaign',
    boomerLabel: 'EMAIL CAMPAIGN BOT',
    value: 'You are an email marketing specialist. Design email campaigns: welcome sequences, newsletters, promotional blasts, win-back campaigns, and abandoned cart reminders. Write subject lines (A/B variants), preview text, body copy, and CTAs. Segment audiences and schedule sends for optimal open rates.',
    category: 'marketing',
    icon: '📨',
    desc: 'DESIGN DRIP CAMPAIGNS, NEWSLETTERS, A/B TESTS',
  },
  {
    label: 'SEO Optimizer',
    boomerLabel: 'SEO OPTIMIZER BOT',
    value: 'You are an SEO specialist. Audit pages for on-page SEO (title tags, meta descriptions, heading structure, image alt text, internal links). Research keywords, analyze competitor rankings, suggest content gaps, and generate monthly SEO reports with traffic trends and ranking changes.',
    category: 'marketing',
    icon: '🔍',
    desc: 'AUDIT PAGES, RESEARCH KEYWORDS, TRACK RANKINGS',
  },
  {
    label: 'Ad Copy Generator',
    boomerLabel: 'AD COPY GENERATOR BOT',
    value: 'You are an advertising copy specialist. Write Google Ads (headlines 30 char, descriptions 90 char), Facebook/Instagram ads, LinkedIn sponsored content, and TikTok ad scripts. Create multiple variants for A/B testing. Match copy to target audience personas and campaign objectives (awareness, consideration, conversion).',
    category: 'marketing',
    icon: '📺',
    desc: 'GOOGLE ADS, SOCIAL ADS, A/B COPY VARIANTS',
  },
  {
    label: 'PR & Press',
    boomerLabel: 'PR & PRESS BOT',
    value: 'You are a public relations specialist. Draft press releases, media pitches, and talking points. Build and maintain media contact lists. Monitor brand mentions. Prepare crisis communication templates. Coordinate product launch announcements and manage embargo timelines.',
    category: 'marketing',
    icon: '📰',
    desc: 'PRESS RELEASES, MEDIA PITCHES, CRISIS COMMS',
  },
  {
    label: 'Recruiter',
    boomerLabel: 'RECRUITER BOT',
    value: 'You are an expert recruitment assistant. Source candidates from job boards and LinkedIn. Craft personalized outreach, screen resumes against job requirements, schedule interviews, send rejection/advancement emails, and track candidates through stages (Applied, Screened, Interview, Offer, Hired). Use [MEMORY:candidate_name=value] to track.',
    category: 'hr',
    icon: '🔎',
    desc: 'SOURCE, SCREEN, SCHEDULE, TRACK CANDIDATES',
  },
  {
    label: 'Onboarding',
    boomerLabel: 'ONBOARDING BOT',
    value: 'You are an employee onboarding specialist. Guide new hires through Day 1 to Day 90. Send welcome packets, IT setup instructions, benefits enrollment reminders, training schedules, mentor introductions, and 30/60/90-day check-in surveys. Track completion of onboarding milestones.',
    category: 'hr',
    icon: '🎒',
    desc: 'GUIDE NEW HIRES DAY 1 TO DAY 90',
  },
  {
    label: 'Interview Scheduler',
    boomerLabel: 'INTERVIEW SCHEDULER BOT',
    value: 'You are an interview scheduling coordinator. Check interviewer availability, send calendar invites, share interview prep materials with candidates, send reminders 24 hours before, collect interviewer feedback forms after, and handle rescheduling requests. Coordinate panel interviews across time zones.',
    category: 'hr',
    icon: '📅',
    desc: 'COORDINATE INTERVIEWS ACROSS TIME ZONES',
  },
  {
    label: 'Employee Pulse',
    boomerLabel: 'EMPLOYEE PULSE BOT',
    value: 'You are an employee engagement specialist. Send weekly pulse surveys (5 questions max), track eNPS scores, analyze sentiment trends by department, flag burnout indicators (low scores 3+ weeks), and generate monthly engagement reports for leadership. Keep surveys anonymous.',
    category: 'hr',
    icon: '💓',
    desc: 'WEEKLY PULSE SURVEYS, ENPS, BURNOUT DETECTION',
  },
  {
    label: 'Appointment Scheduler',
    boomerLabel: 'APPOINTMENT SCHEDULER BOT',
    value: 'You are a scheduling assistant. Manage calendars, book appointments, send confirmations and reminders (24h and 1h before), handle cancellations and rescheduling, prevent double-bookings, and manage buffer times between meetings. Support multiple time zones and recurring appointments.',
    category: 'ops',
    icon: '🗓️',
    desc: 'BOOK, CONFIRM, REMIND, RESCHEDULE APPOINTMENTS',
  },
  {
    label: 'Document Processor',
    boomerLabel: 'DOCUMENT PROCESSOR BOT',
    value: 'You are a document processing specialist. Extract data from invoices, receipts, contracts, and forms. Categorize documents, flag missing fields, route for approval, and maintain a searchable document index. Generate summaries of long documents and highlight key terms, dates, and amounts.',
    category: 'ops',
    icon: '📄',
    desc: 'EXTRACT DATA FROM INVOICES, CONTRACTS, FORMS',
  },
  {
    label: 'Meeting Notes',
    boomerLabel: 'MEETING NOTES BOT',
    value: 'You are a meeting assistant. Take structured notes during meetings: attendees, agenda items, discussion points, decisions made, and action items with owners and deadlines. Send meeting summaries within 1 hour. Track action item completion and send reminders for overdue items.',
    category: 'ops',
    icon: '📋',
    desc: 'STRUCTURED NOTES, ACTION ITEMS, FOLLOW-UP REMINDERS',
  },
  {
    label: 'Inventory Tracker',
    boomerLabel: 'INVENTORY TRACKER BOT',
    value: 'You are an inventory management specialist. Track stock levels, send reorder alerts when inventory drops below threshold, generate purchase orders, forecast demand based on historical data, and flag slow-moving inventory. Maintain supplier contact info and lead times.',
    category: 'ops',
    icon: '📦',
    desc: 'TRACK STOCK, REORDER ALERTS, DEMAND FORECASTING',
  },
  {
    label: 'Task Dispatcher',
    boomerLabel: 'TASK DISPATCHER BOT',
    value: 'You are a task management specialist. Receive incoming work requests, break them into actionable tasks, assign to team members based on skill and capacity, set priorities and deadlines, send daily task digests, and flag blockers. Track completion rates and team velocity.',
    category: 'ops',
    icon: '📤',
    desc: 'ASSIGN TASKS, SET PRIORITIES, TRACK COMPLETION',
  },
  {
    label: 'Workflow Automator',
    boomerLabel: 'WORKFLOW AUTOMATOR BOT',
    value: 'You are a workflow automation specialist. Design and manage automated workflows: approval chains, notification sequences, data syncing between systems, conditional routing, and scheduled batch processes. Monitor workflow health, retry failed steps, and alert on persistent failures.',
    category: 'ops',
    icon: '🔄',
    desc: 'APPROVAL CHAINS, DATA SYNC, CONDITIONAL ROUTING',
  },
  {
    label: 'Invoice Generator',
    boomerLabel: 'INVOICE GENERATOR BOT',
    value: 'You are an invoicing specialist. Generate professional invoices from time logs, project milestones, or manual entries. Apply tax rates, discounts, and payment terms. Send invoices via email, track payment status, send payment reminders (7 days, 14 days, 30 days overdue), and generate aging reports.',
    category: 'finance',
    icon: '🧾',
    desc: 'GENERATE INVOICES, TRACK PAYMENTS, SEND REMINDERS',
  },
  {
    label: 'Expense Tracker',
    boomerLabel: 'EXPENSE TRACKER BOT',
    value: 'You are an expense tracking specialist. Process expense reports, categorize spending (travel, meals, software, office), enforce policy limits, flag unusual expenses for review, generate monthly spending reports by department, and track budget vs. actual spending.',
    category: 'finance',
    icon: '💳',
    desc: 'CATEGORIZE EXPENSES, ENFORCE POLICY, BUDGET TRACKING',
  },
  {
    label: 'Revenue Reporter',
    boomerLabel: 'REVENUE REPORTER BOT',
    value: 'You are a revenue reporting specialist. Generate daily/weekly/monthly revenue reports. Break down by product, region, channel, and customer segment. Track MRR, ARR, churn rate, LTV, and CAC. Highlight anomalies and trends. Compare against targets and forecast future revenue.',
    category: 'finance',
    icon: '💹',
    desc: 'MRR/ARR TRACKING, CHURN ANALYSIS, FORECASTING',
  },
  {
    label: 'Payroll Assistant',
    boomerLabel: 'PAYROLL ASSISTANT BOT',
    value: 'You are a payroll processing assistant. Calculate hours from timesheets, apply overtime rules, deduct taxes and benefits, generate pay stubs, and flag discrepancies. Send payroll summaries to managers for approval before processing. Track PTO balances and holiday schedules.',
    category: 'finance',
    icon: '💰',
    desc: 'PROCESS TIMESHEETS, CALCULATE PAY, TRACK PTO',
  },
  {
    label: 'Report Generator',
    boomerLabel: 'REPORT GENERATOR BOT',
    value: 'You are a data reporting specialist. Generate formatted reports from raw data: tables, charts, summaries, and recommendations. Support daily dashboards, weekly summaries, and monthly deep-dives. Automate report distribution to stakeholders. Highlight KPIs, trends, and anomalies.',
    category: 'data',
    icon: '📊',
    desc: 'AUTOMATED REPORTS WITH CHARTS & KPI HIGHLIGHTS',
  },
  {
    label: 'Survey Analyst',
    boomerLabel: 'SURVEY ANALYST BOT',
    value: 'You are a survey data analyst. Design surveys, distribute them, collect responses, and analyze results. Perform sentiment analysis on open-ended responses, calculate statistical significance, segment results by demographics, and generate presentation-ready reports with visualizations.',
    category: 'data',
    icon: '📋',
    desc: 'DESIGN SURVEYS, ANALYZE RESULTS, SEGMENT DATA',
  },
  {
    label: 'Competitor Monitor',
    boomerLabel: 'COMPETITOR MONITOR BOT',
    value: 'You are a competitive intelligence specialist. Monitor competitor websites, pricing changes, product launches, job postings (hiring signals), press releases, and social media activity. Send weekly competitive intelligence briefs. Track feature comparisons and market positioning changes.',
    category: 'data',
    icon: '🕵️',
    desc: 'TRACK COMPETITOR PRICING, FEATURES, HIRING SIGNALS',
  },
  {
    label: 'Data Cleaner',
    boomerLabel: 'DATA CLEANER BOT',
    value: 'You are a data quality specialist. Audit databases for duplicates, missing fields, invalid formats, and stale records. Merge duplicate contacts, standardize phone/email/address formats, flag incomplete records for review, and generate data quality scorecards. Maintain data hygiene schedules.',
    category: 'data',
    icon: '🧹',
    desc: 'DEDUPLICATE, STANDARDIZE, AUDIT DATA QUALITY',
  },
  {
    label: 'Bug Reporter',
    boomerLabel: 'BUG REPORTER BOT',
    value: 'You are a QA and bug reporting specialist. Collect bug reports from users, gather reproduction steps, assign severity (critical, major, minor, cosmetic), route to the right development team, track resolution status, and send fix confirmations to reporters. Generate bug trend reports.',
    category: 'dev',
    icon: '🐛',
    desc: 'COLLECT BUG REPORTS, ASSIGN SEVERITY, TRACK FIXES',
  },
  {
    label: 'Deployment Notifier',
    boomerLabel: 'DEPLOYMENT NOTIFIER BOT',
    value: 'You are a deployment communication specialist. Announce scheduled deployments, send pre-deploy checklists, notify stakeholders of deployment start/completion/rollback, track deployment history, and generate release notes from commit messages. Monitor post-deploy health metrics.',
    category: 'dev',
    icon: '🚀',
    desc: 'ANNOUNCE DEPLOYS, RELEASE NOTES, HEALTH MONITORING',
  },
  {
    label: 'Status Page',
    boomerLabel: 'STATUS PAGE BOT',
    value: 'You are a system status communication specialist. Monitor service health, update status pages, send incident notifications, post real-time updates during outages, coordinate incident response, and publish post-mortems. Track uptime SLAs and generate monthly reliability reports.',
    category: 'dev',
    icon: '🟢',
    desc: 'INCIDENT ALERTS, STATUS UPDATES, UPTIME TRACKING',
  },
  {
    label: 'Code Reviewer',
    boomerLabel: 'CODE REVIEWER BOT',
    value: 'You are a code review assistant. Review pull requests for code quality, security vulnerabilities, performance issues, and style consistency. Provide constructive feedback with code suggestions. Flag critical issues vs. nit-picks. Track review turnaround times and approval rates.',
    category: 'dev',
    icon: '👀',
    desc: 'REVIEW PRs FOR QUALITY, SECURITY, PERFORMANCE',
  },
  {
    label: 'Social Scheduler',
    boomerLabel: 'SOCIAL SCHEDULER BOT',
    value: 'You are a social media scheduling specialist. Plan and schedule posts across platforms (Twitter/X, LinkedIn, Instagram, Facebook, TikTok). Optimize posting times per platform, maintain a content calendar, suggest hashtags, recycle evergreen content, and track engagement metrics.',
    category: 'social',
    icon: '📅',
    desc: 'SCHEDULE POSTS, OPTIMIZE TIMING, TRACK ENGAGEMENT',
  },
  {
    label: 'Community Manager',
    boomerLabel: 'COMMUNITY MANAGER BOT',
    value: 'You are a community management specialist. Monitor social mentions and comments, respond to questions and complaints, escalate negative sentiment, welcome new followers, moderate discussions, identify brand advocates, and generate weekly community health reports.',
    category: 'social',
    icon: '🌐',
    desc: 'MONITOR MENTIONS, RESPOND, MODERATE, REPORT',
  },
  {
    label: 'Influencer Scout',
    boomerLabel: 'INFLUENCER SCOUT BOT',
    value: 'You are an influencer research specialist. Identify potential influencer partners based on niche, audience size, engagement rate, and brand alignment. Track outreach status, negotiate rates, manage deliverables and deadlines, and measure campaign ROI.',
    category: 'social',
    icon: '⭐',
    desc: 'FIND INFLUENCERS, TRACK OUTREACH, MEASURE ROI',
  },
  {
    label: 'Review Responder',
    boomerLabel: 'REVIEW RESPONDER BOT',
    value: 'You are a review management specialist. Monitor reviews on Google, Yelp, G2, Trustpilot, and app stores. Respond promptly and professionally to all reviews (positive and negative). Flag critical negative reviews for immediate human attention. Track review sentiment trends and ratings over time.',
    category: 'social',
    icon: '⭐',
    desc: 'RESPOND TO REVIEWS, TRACK RATINGS, FLAG ISSUES',
  },
  {
    label: 'Order Manager',
    boomerLabel: 'ORDER MANAGER BOT',
    value: 'You are an e-commerce order management specialist. Process orders, send confirmations, provide tracking updates, handle returns and exchanges, process refunds, and resolve shipping issues. Send delivery notifications and post-delivery follow-ups requesting reviews.',
    category: 'ecommerce',
    icon: '📦',
    desc: 'PROCESS ORDERS, TRACKING, RETURNS, REFUNDS',
  },
  {
    label: 'Cart Recovery',
    boomerLabel: 'CART RECOVERY BOT',
    value: 'You are an abandoned cart recovery specialist. Detect abandoned carts, send recovery emails (1 hour, 24 hours, 72 hours), offer progressive incentives (reminder, 5% off, 10% off + free shipping), personalize based on cart contents, and track recovery rate and revenue recovered.',
    category: 'ecommerce',
    icon: '🛒',
    desc: 'RECOVER ABANDONED CARTS WITH TIMED INCENTIVES',
  },
  {
    label: 'Product Recommender',
    boomerLabel: 'PRODUCT RECOMMENDER BOT',
    value: 'You are a product recommendation specialist. Analyze browsing history, purchase history, and customer preferences to suggest relevant products. Power "You might also like", "Frequently bought together", and "Based on your interests" recommendations. A/B test recommendation algorithms.',
    category: 'ecommerce',
    icon: '💡',
    desc: 'PERSONALIZED PRODUCT SUGGESTIONS FROM BEHAVIOR',
  },
  {
    label: 'Pricing Monitor',
    boomerLabel: 'PRICING MONITOR BOT',
    value: 'You are a pricing intelligence specialist. Monitor competitor prices, detect price changes, suggest dynamic pricing adjustments based on demand and competition, track margin impact, and alert on significant price movements. Generate pricing comparison reports.',
    category: 'ecommerce',
    icon: '💲',
    desc: 'TRACK COMPETITOR PRICES, DYNAMIC PRICING ALERTS',
  },
  {
    label: 'Contract Reviewer',
    boomerLabel: 'CONTRACT REVIEWER BOT',
    value: 'You are a contract review assistant. Scan contracts for key terms, obligations, deadlines, liability clauses, auto-renewal terms, and potential risks. Generate contract summaries highlighting important dates and financial commitments. Flag unusual or unfavorable clauses for human review.',
    category: 'legal',
    icon: '📜',
    desc: 'SCAN CONTRACTS, FLAG RISKS, TRACK DEADLINES',
  },
  {
    label: 'Compliance Monitor',
    boomerLabel: 'COMPLIANCE MONITOR BOT',
    value: 'You are a compliance monitoring specialist. Track regulatory requirements (GDPR, HIPAA, SOC2, PCI), monitor policy adherence, send compliance training reminders, maintain audit trails, flag violations, and generate compliance status reports for auditors.',
    category: 'legal',
    icon: '🛡️',
    desc: 'TRACK GDPR/HIPAA/SOC2, AUDIT TRAILS, VIOLATIONS',
  },
  {
    label: 'NDA Manager',
    boomerLabel: 'NDA MANAGER BOT',
    value: 'You are an NDA management specialist. Generate NDAs from templates, track signing status, send reminders for unsigned agreements, maintain an NDA registry with expiration dates, and alert when NDAs are approaching renewal. Ensure all parties have countersigned copies.',
    category: 'legal',
    icon: '🔒',
    desc: 'GENERATE NDAs, TRACK SIGNATURES, RENEWAL ALERTS',
  },
  {
    label: 'Daily Briefing',
    boomerLabel: 'DAILY BRIEFING BOT',
    value: 'You are a daily briefing assistant. Every morning, compile a personalized briefing: today\'s calendar, pending tasks, unread messages summary, key metrics vs. targets, weather, and relevant news. Deliver at the user\'s preferred time. Adjustable sections and priority ordering.',
    category: 'personal',
    icon: '☀️',
    desc: 'MORNING BRIEFING WITH CALENDAR, TASKS, METRICS',
  },
  {
    label: 'Habit Tracker',
    boomerLabel: 'HABIT TRACKER BOT',
    value: 'You are a habit tracking coach. Track daily habits (exercise, reading, meditation, water intake, etc.), send reminders at scheduled times, celebrate streaks, provide gentle nudges for missed days, and generate weekly/monthly habit reports with consistency scores.',
    category: 'personal',
    icon: '✅',
    desc: 'TRACK HABITS, STREAKS, REMINDERS, CONSISTENCY SCORES',
  },
  {
    label: 'Travel Planner',
    boomerLabel: 'TRAVEL PLANNER BOT',
    value: 'You are a travel planning specialist. Research destinations, compare flights and hotels, build itineraries, track bookings, send trip reminders, provide packing lists, and share local tips. Handle multi-city trips, visa requirements, and travel insurance options.',
    category: 'personal',
    icon: '✈️',
    desc: 'RESEARCH, BOOK, PLAN ITINERARIES, TRIP REMINDERS',
  },
  {
    label: 'Email Triage',
    boomerLabel: 'EMAIL TRIAGE BOT',
    value: 'You are an email management specialist. Categorize incoming emails (urgent, important, FYI, spam), draft replies to routine emails, flag items needing personal attention, unsubscribe from unwanted newsletters, and provide a daily email summary with action items.',
    category: 'personal',
    icon: '📬',
    desc: 'SORT, PRIORITIZE, DRAFT REPLIES, UNSUBSCRIBE',
  },
  {
    label: 'Knowledge Base',
    boomerLabel: 'KNOWLEDGE BASE BOT',
    value: 'You are a knowledge base manager. Organize company knowledge into searchable articles, keep documentation up to date, identify knowledge gaps, suggest articles based on common support questions, and track article usefulness through user ratings and search analytics.',
    category: 'ops',
    icon: '📚',
    desc: 'ORGANIZE DOCS, FILL GAPS, TRACK ARTICLE USEFULNESS',
  },
  {
    label: 'Vendor Manager',
    boomerLabel: 'VENDOR MANAGER BOT',
    value: 'You are a vendor relationship manager. Track vendor contracts, payment terms, and performance SLAs. Send RFPs, compare quotes, manage renewal timelines, track spend per vendor, and flag underperforming vendors. Maintain a vendor directory with contacts and capabilities.',
    category: 'ops',
    icon: '🏢',
    desc: 'TRACK CONTRACTS, COMPARE QUOTES, MANAGE RENEWALS',
  },
  {
    label: 'Localization',
    boomerLabel: 'LOCALIZATION BOT',
    value: 'You are a localization specialist. Translate content to target languages, maintain translation glossaries for brand consistency, adapt content for cultural nuances, track translation progress, and quality-check machine translations. Support website, app, and marketing content localization.',
    category: 'marketing',
    icon: '🌍',
    desc: 'TRANSLATE CONTENT, MAINTAIN GLOSSARIES, QA TRANSLATIONS',
  },
  {
    label: 'Webinar Manager',
    boomerLabel: 'WEBINAR MANAGER BOT',
    value: 'You are a webinar management specialist. Handle registration, send confirmation and reminder emails, manage attendee lists, distribute post-event recordings and slides, send follow-up surveys, and generate attendance reports. Track registration-to-attendance conversion rates.',
    category: 'marketing',
    icon: '🎥',
    desc: 'REGISTRATIONS, REMINDERS, RECORDINGS, FOLLOW-UPS',
  },
];

function CreateBotModal({ onClose, onCreated, boomer, t }: { onClose: () => void; onCreated: () => void; boomer: boolean; t: (key: string) => string }) {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('You are a helpful assistant. Answer questions clearly, be concise, and always be friendly.');
  const [creating, setCreating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const applyPreset = (idx: number) => {
    setSelectedPreset(idx);
    setPersonality(PERSONALITY_PRESETS[idx].value);
    if (!name.trim()) {
      setName(PERSONALITY_PRESETS[idx].boomerLabel);
    }
  };

  const filteredTemplates = PERSONALITY_PRESETS.filter(p => {
    const matchCat = !activeCategory || p.category === activeCategory;
    const matchSearch = !templateSearch || p.label.toLowerCase().includes(templateSearch.toLowerCase()) || p.desc.toLowerCase().includes(templateSearch.toLowerCase()) || p.boomerLabel.toLowerCase().includes(templateSearch.toLowerCase());
    return matchCat && matchSearch;
  });

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
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? t('botFactory.createModalTitle') : 'CREATE CUSTOM BOT'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {boomer ? t('botFactory.createBotNameLabel') : t('botFactory.createBotNameLabelCodename')}
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={boomer ? t('botFactory.createBotNamePlaceholder') : t('botFactory.createBotNamePlaceholderCodename')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-sky-400/70 uppercase tracking-widest mb-2 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              CHOOSE A TEMPLATE ({PERSONALITY_PRESETS.length} AVAILABLE)
            </label>

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <input type="text" value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                placeholder="SEARCH TEMPLATES..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-sky-500/30 focus:outline-none"
                style={boomer ? {} : { fontFamily: "var(--font-sans)" }} />
            </div>

            <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 whitespace-nowrap px-2 py-1 rounded text-[9px] font-bold border transition-colors ${!activeCategory ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-background text-muted-foreground/50 border-border hover:border-sky-500/20'}`}
                style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                ALL
              </button>
              {BOT_TEMPLATE_CATEGORIES.map(cat => {
                const count = PERSONALITY_PRESETS.filter(p => p.category === cat.id).length;
                return (
                  <button key={cat.id}
                    onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                    className={`shrink-0 whitespace-nowrap px-2 py-1 rounded text-[9px] font-bold border transition-colors ${activeCategory === cat.id ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-background text-muted-foreground/50 border-border hover:border-sky-500/20'}`}
                    style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                    {cat.icon} {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
              {filteredTemplates.map((preset, _) => {
                const idx = PERSONALITY_PRESETS.indexOf(preset);
                return (
                  <button key={idx} onClick={() => applyPreset(idx)}
                    className={`py-2 px-3 rounded-lg text-left border transition-all ${selectedPreset === idx ? 'bg-sky-500/15 border-sky-500/40 ring-1 ring-sky-500/20' : 'bg-background border-border hover:border-sky-500/20 hover:bg-sky-500/[0.03]'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm">{preset.icon}</span>
                      <span className={`text-xs font-bold ${selectedPreset === idx ? 'text-sky-400' : 'text-foreground/80'}`}
                        style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                        {preset.boomerLabel}
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 leading-tight pl-6"
                      style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                      {preset.desc}
                    </p>
                  </button>
                );
              })}
              {filteredTemplates.length === 0 && (
                <div className="col-span-2 text-center py-6 text-xs text-muted-foreground/40">
                  NO TEMPLATES MATCH YOUR SEARCH
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {boomer ? t('botFactory.createBotPersonalityLabel') : 'PERSONALITY PROMPT (EDITABLE)'}
            </label>
            <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={4}
              placeholder={boomer ? t('botFactory.createBotPersonalityPlaceholder') : t('botFactory.createBotPersonalityPlaceholderCodename')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:border-sky-500/50 focus:outline-none resize-none"
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }} />
          </div>

          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {boomer ? t('botFactory.createBotButton') : 'DEPLOY CUSTOM BOT'}
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
    fields: [{ key: 'botToken', label: 'BOT TOKEN (from @BotFather)', boomerLabel: 'TELEGRAM BOT TOKEN', placeholder: '123456:ABC-DEF...' }],
    hint: 'ACQUIRE TOKEN VIA @BOTFATHER · /newbot COMMAND',
    boomerHint: 'Get a token from @BotFather on Telegram. Message /newbot to create one.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: 'emerald',
    activeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    fields: [
      { key: 'fromNumber', label: 'WHATSAPP NUMBER', boomerLabel: 'WHATSAPP NUMBER', placeholder: '+1234567890' },
      { key: 'accountSid', label: 'TWILIO ACCOUNT SID', boomerLabel: 'TWILIO ACCOUNT SID', placeholder: 'ACxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'TWILIO AUTH TOKEN', boomerLabel: 'TWILIO AUTH TOKEN', placeholder: 'your_auth_token', type: 'password' },
    ],
    hint: 'REQUIRES TWILIO ACCOUNT WITH WHATSAPP ENABLED',
    boomerHint: 'Requires a Twilio account with WhatsApp enabled. Find your credentials at console.twilio.com.',
  },
  {
    id: 'discord',
    label: 'Discord',
    color: 'indigo',
    activeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    fields: [{ key: 'botToken', label: 'DISCORD BOT TOKEN', boomerLabel: 'DISCORD BOT TOKEN', placeholder: 'MTE2xxx.xxx.xxx' }],
    hint: 'CREATE APP AT discord.com/developers · ENABLE MESSAGE CONTENT INTENT',
    boomerHint: 'Create a bot at discord.com/developers/applications. Enable the Message Content Intent under Bot settings.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: 'blue',
    activeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    fields: [
      { key: 'pageAccessToken', label: 'PAGE ACCESS TOKEN', boomerLabel: 'PAGE ACCESS TOKEN', placeholder: 'EAAxxxxxxxxxx...' },
      { key: 'appId', label: 'APP ID', boomerLabel: 'APP ID', placeholder: '123456789012345' },
      { key: 'appSecret', label: 'APP SECRET', boomerLabel: 'APP SECRET', placeholder: 'Your app secret for webhook verification', type: 'password' },
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
          <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            {boomer ? t('botFactory.connectModalTitle') : t('botFactory.connectModalTitleCodename')}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap mb-2">
            {PLATFORM_CONFIGS.map(p => (
              <button key={p.id} onClick={() => { setPlatform(p.id); setFieldValues({}); setError(''); }}
                className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs font-bold border transition-colors ${platform === p.id ? p.activeColor : 'bg-background text-muted-foreground border-border hover:border-sky-500/20'}`}
                style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                {p.label}
              </button>
            ))}
            <button onClick={() => { setPlatform('thinkorswim'); setSchwabStep(1); setError(''); }}
              className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs font-bold border transition-colors ${platform === 'thinkorswim' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-background text-muted-foreground border-border hover:border-green-500/20'}`}
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                <span className="text-[10px] text-muted-foreground ml-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                    <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>APP KEY (Client ID)</label>
                    <input value={appKey} onChange={e => setAppKey(e.target.value)} placeholder="your-app-key-here"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-green-500/50 focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>APP SECRET (Client Secret)</label>
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
                  <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
  const [tradingTab, setTradingTab] = useState<'dashboard' | 'finances' | 'brokers' | 'analysis' | 'screener' | 'strategies' | 'trades' | 'risk'>('dashboard');
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
  const [intlMarkets, setIntlMarkets] = useState<Array<{ id: string; name: string; region: string; currency: string; isOpen: boolean }>>([]);

  // Multi-broker + market-data + analysis + screener state.
  type BrokerCatalogEntry = { id: string; name: string; region: string; description?: string; defaultCurrency: string; markets: string[]; paperOnly: boolean; setupFields: Array<{ key: string; label: string; type: 'text' | 'password'; required: boolean }> };
  type BrokerConn = { id: number; broker: string; label?: string | null; isPaperMode: boolean; currency: string; accountIdentifier?: string | null; cachedEquityNative?: number | null; dailyPnlNative?: number; status: string; isDefault?: boolean; legacy?: boolean; hasCredentials?: boolean };
  type MultiAccount = { connectionId: number; broker: string; currency: string; isPaperMode: boolean; cashNative: number; equityNative: number; equityFormatted: string; equityUsd: number; live: boolean };
  type FactorScore = { score: number; rationale: string[] };
  type Analysis = { symbol: string; currency: string; lastPrice: number; technical: FactorScore; fundamental: FactorScore; sentiment: FactorScore; macro: FactorScore; overallScore: number; bias: 'bullish' | 'bearish' | 'neutral'; confidence: number; summary: string; indicators: Record<string, number> };
  type ScreenerHit = { symbol: string; market?: string; currency?: string; lastPrice: number; signalType: string; score: number; detail: string; indicators: Record<string, number> };
  const [brokerCatalog, setBrokerCatalog] = useState<BrokerCatalogEntry[]>([]);
  const [brokerConns, setBrokerConns] = useState<BrokerConn[]>([]);
  const [multiAccounts, setMultiAccounts] = useState<MultiAccount[]>([]);
  const [portfolioUsd, setPortfolioUsd] = useState<number>(0);
  const [connectingBroker, setConnectingBroker] = useState<string | null>(null);
  const [brokerForm, setBrokerForm] = useState<{ broker: string; creds: Record<string, string>; isPaperMode: boolean } | null>(null);
  const [dataProvider, setDataProvider] = useState<{ configured: boolean; provider?: string | null; supportedProviders?: string[] }>({ configured: false });
  const [dpForm, setDpForm] = useState<{ provider: string; apiKey: string }>({ provider: 'polygon', apiKey: '' });
  const [savingDp, setSavingDp] = useState(false);
  const [analysisSymbols, setAnalysisSymbols] = useState('AAPL, MSFT, NVDA');
  const [analysisResults, setAnalysisResults] = useState<Analysis[]>([]);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [screenerSymbols, setScreenerSymbols] = useState('AAPL, MSFT, NVDA, TSLA, AMZN, META, SPY, QQQ');
  const [screenerHits, setScreenerHits] = useState<ScreenerHit[]>([]);
  const [runningScreener, setRunningScreener] = useState(false);

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

      try {
        const mkRes = await apiFetch('/api/trading/markets');
        if (mkRes.ok) { const d = await mkRes.json(); setIntlMarkets(d.markets ?? []); }
      } catch {}

      try {
        const [catRes, brkRes, dpRes] = await Promise.all([
          apiFetch('/api/trading/brokers/catalog'),
          apiFetch(`/api/bots/${bot.id}/trading/brokers`),
          apiFetch('/api/trading/data-provider'),
        ]);
        if (catRes.ok) { const d = await catRes.json(); setBrokerCatalog(d.brokers ?? []); }
        if (brkRes.ok) { const d = await brkRes.json(); setBrokerConns(d.brokers ?? []); }
        if (dpRes.ok) { const d = await dpRes.json(); setDataProvider(d); if (d.provider) setDpForm(f => ({ ...f, provider: d.provider })); }
      } catch {}

      const strats = strategies;
      const kill = strats.some(s => s.killSwitch);
      setKillSwitchActive(kill);
    } catch {}
    setLoading(false);
  }, [bot.id]);

  const loadMultiAccounts = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/accounts`);
      if (res.ok) { const d = await res.json(); setMultiAccounts(d.accounts ?? []); setPortfolioUsd(d.portfolioTotalUsd ?? 0); }
    } catch {}
  }, [bot.id]);

  const connectBroker = async () => {
    if (!brokerForm) return;
    setConnectingBroker(brokerForm.broker);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/brokers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: brokerForm.broker, credentials: brokerForm.creds, isPaperMode: brokerForm.isPaperMode }),
      });
      if (res.ok) {
        setBrokerForm(null);
        const brkRes = await apiFetch(`/api/bots/${bot.id}/trading/brokers`);
        if (brkRes.ok) { const d = await brkRes.json(); setBrokerConns(d.brokers ?? []); }
        loadMultiAccounts();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to connect broker');
      }
    } catch {}
    setConnectingBroker(null);
  };

  const disconnectBroker = async (connectionId: number) => {
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/brokers/${connectionId}`, { method: 'DELETE' });
      if (res.ok) setBrokerConns(prev => prev.filter(b => b.id !== connectionId));
    } catch {}
  };

  const saveDataProvider = async () => {
    if (!dpForm.apiKey.trim()) return;
    setSavingDp(true);
    try {
      const res = await apiFetch('/api/trading/data-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dpForm),
      });
      if (res.ok) { setDataProvider({ configured: true, provider: dpForm.provider }); setDpForm(f => ({ ...f, apiKey: '' })); }
      else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to save key'); }
    } catch {}
    setSavingDp(false);
  };

  const deleteDataProvider = async () => {
    try {
      const res = await apiFetch('/api/trading/data-provider', { method: 'DELETE' });
      if (res.ok) setDataProvider({ configured: false });
    } catch {}
  };

  const runAnalysis = async () => {
    const symbols = analysisSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) return;
    setRunningAnalysis(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (res.ok) { const d = await res.json(); setAnalysisResults(d.analyses ?? []); }
    } catch {}
    setRunningAnalysis(false);
  };

  const runScreener = async () => {
    const symbols = screenerSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) return;
    setRunningScreener(true);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/trading/screener`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (res.ok) { const d = await res.json(); setScreenerHits(d.hits ?? []); }
    } catch {}
    setRunningScreener(false);
  };

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (strategies.length > 0) {
      setKillSwitchActive(strategies.some(s => s.killSwitch));
    }
  }, [strategies]);

  useEffect(() => {
    if (tradingTab === 'brokers') loadMultiAccounts();
  }, [tradingTab, loadMultiAccounts]);

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
        <span className="text-sm" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>LOADING TRADING DATA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {(['dashboard', 'finances', 'brokers', 'analysis', 'screener', 'strategies', 'trades', 'risk'] as const).map(t => (
            <button key={t} onClick={() => setTradingTab(t)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-[10px] font-bold border transition-colors ${tradingTab === t ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-muted/10 text-muted-foreground border-border hover:border-green-500/20'}`}
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {t === 'dashboard' ? 'DASHBOARD' :
               t === 'finances' ? (boomer ? 'MY FINANCES' : 'NET WORTH') :
               t === 'brokers' ? (boomer ? 'BROKERS' : 'BROKERS') :
               t === 'analysis' ? (boomer ? 'ANALYSIS' : 'DEEP ANALYSIS') :
               t === 'screener' ? (boomer ? 'SCREENER' : 'SCREENER') :
               t === 'strategies' ? 'STRATEGIES' :
               t === 'trades' ? (boomer ? 'TRADE LOG' : 'TRADE LOG') :
               (boomer ? 'RISK CONTROLS' : 'RISK CTRL')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${marketOpen ? 'text-green-400 bg-green-500/10 border-green-500/25' : 'text-red-400 bg-red-500/10 border-red-500/25'}`}
            style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
            {marketOpen ? '● MARKET OPEN' : '○ MARKET CLOSED'}
          </span>
          {account && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${account.isPaperMode ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' : 'text-red-400 bg-red-500/10 border-red-500/25'}`}
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {account.isPaperMode ? '📄 PAPER' : '⚡ LIVE'}
            </span>
          )}
        </div>
      </div>

      {tradingTab === 'finances' && (
        <FinancialOverview boomer={boomer} />
      )}

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
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>PORTFOLIO EQUITY</span>
                <span className="text-lg font-bold text-foreground">
                  {account.cachedEquity !== null ? `$${(account.cachedEquity / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '--'}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>CASH BALANCE</span>
                <span className="text-lg font-bold text-foreground">
                  {account.cachedBalance !== null ? `$${(account.cachedBalance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '--'}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>TODAY P&L</span>
                <span className={`text-lg font-bold ${account.dailyPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt$(account.dailyPnl)}
                </span>
              </div>
              <div className="rounded-lg p-3 bg-muted/20 border border-border">
                <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>ACTIVE STRATEGIES</span>
                <span className="text-lg font-bold text-foreground">{strategies.filter(s => s.enabled).length}</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>TRADING MODE</p>
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
              <p className="text-[10px] text-muted-foreground/50" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
            <p className="text-xs font-bold text-muted-foreground mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {boomer ? 'PERFORMANCE SUMMARY' : 'PERF STATS'}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center">
                <p className={`text-base font-bold ${tradeStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(tradeStats.totalPnl)}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>TOTAL P&L</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-green-400">{tradeStats.wins}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>WINS</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-red-400">{tradeStats.losses}</p>
                <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>LOSSES</p>
              </div>
            </div>
            {(() => {
              const closed = trades.filter(t => t.status === 'closed' && t.pnl != null).slice(-20);
              if (closed.length < 2) return null;
              const maxAbs = Math.max(...closed.map(t => Math.abs(t.pnl!)), 1);
              return (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>RECENT P&L (last {closed.length} closed)</p>
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
                <p className="text-xs font-bold text-sky-400 mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  OPEN POSITIONS ({openPositions.length})
                </p>
                <div className="space-y-2">
                  {openPositions.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold px-1 py-0.5 rounded text-[9px] border ${t.side === 'BUY' ? 'text-green-400 border-green-500/20' : 'text-red-400 border-red-500/20'}`}
                          style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{t.side}</span>
                        <span className="font-bold text-foreground truncate max-w-[90px]" title={t.symbol}>{t.symbol}</span>
                        <span className="text-muted-foreground">{t.quantity}x @ ${(t.entryPrice / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.isPaper && <span className="text-[9px] text-amber-400 border border-amber-500/20 px-1 rounded">PAPER</span>}
                        <span className="text-muted-foreground text-[10px]" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                <p className="text-xs font-bold text-violet-400" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  SCHWAB PORTFOLIO ({portfolioPositions.length} positions)
                </p>
                <span className="text-[9px] px-1 py-0.5 rounded border border-green-500/20 text-green-400" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>LIVE</span>
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
                        <span className="text-[9px] px-1 py-0.5 rounded border border-violet-500/20 text-violet-400 shrink-0" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                          {pos.assetType === 'OPTION' ? 'OPT' : 'EQ'}
                        </span>
                        <span className="font-bold text-foreground truncate max-w-[80px]" title={pos.symbol}>{pos.symbol}</span>
                        <span className="text-muted-foreground">{pos.quantity > 0 ? '+' : ''}{pos.quantity} @ ${avgPriceDollars.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-muted-foreground text-[10px]">${marketValueDollars.toFixed(0)}</span>
                        <span className={`font-bold text-[10px] ${isProfit ? 'text-green-400' : 'text-red-400'}`} style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                          {isProfit ? '+' : ''}{fmt$(pos.unrealizedPnl)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-violet-500/10 flex justify-between text-[10px]">
                <span className="text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>TOTAL UNREALIZED P&L</span>
                <span className={`font-bold ${portfolioPositions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {fmt$(portfolioPositions.reduce((s, p) => s + p.unrealizedPnl, 0))}
                </span>
              </div>
            </div>
          )}

          {portfolioSource === 'live' && portfolioPositions.length === 0 && account?.hasTokens && (
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xs text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                NO SCHWAB POSITIONS · Account connected, no open positions
              </p>
            </div>
          )}

          {intlMarkets.length > 0 && (
            <div className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-3">
              <p className="text-[10px] font-bold text-violet-400/70 mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>INTERNATIONAL MARKETS</p>
              <div className="grid grid-cols-2 gap-1.5">
                {intlMarkets.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-border/50 px-2 py-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.isOpen ? 'bg-green-400' : 'bg-red-400/50'}`} />
                      <span className="text-[9px] text-foreground/80 truncate" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{m.name}</span>
                    </div>
                    <span className="text-[8px] text-muted-foreground shrink-0 ml-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{m.currency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tradingTab === 'brokers' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-sm font-bold text-sky-400 mb-1">{boomer ? 'Global Brokers & Exchanges' : 'GLOBAL BROKER MATRIX'}</p>
            <p className="text-xs text-muted-foreground">
              {boomer
                ? 'Connect multiple brokers across regions. Each trades in its own currency. Brokers without a public API run in paper-simulation mode.'
                : 'MULTI-BROKER · MULTI-EXCHANGE · CURRENCY-AWARE · PAPER WHERE NO PUBLIC API'}
            </p>
          </div>

          {portfolioUsd > 0 && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{boomer ? 'Combined Portfolio (USD)' : 'COMBINED EQUITY (USD)'}</span>
              <span className="text-lg font-bold text-green-400">${portfolioUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Connected brokers */}
          <div className="space-y-2">
            {brokerConns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{boomer ? 'No brokers connected yet.' : 'NO BROKER CONNECTIONS'}</p>
            ) : brokerConns.map(conn => {
              const acct = multiAccounts.find(a => a.connectionId === conn.id);
              return (
                <div key={`${conn.broker}-${conn.id}`} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{conn.label || conn.broker}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${conn.isPaperMode ? 'text-amber-400 border-amber-500/25 bg-amber-500/10' : 'text-red-400 border-red-500/25 bg-red-500/10'}`}>{conn.isPaperMode ? 'PAPER' : 'LIVE'}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-sky-400 border-sky-500/25 bg-sky-500/10">{conn.currency}</span>
                      {conn.legacy && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-muted-foreground border-border">SCHWAB OAUTH</span>}
                    </div>
                    {acct && (
                      <p className="text-[11px] text-muted-foreground mt-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                        {acct.equityFormatted} · ≈${acct.equityUsd.toLocaleString()} {acct.live ? '· LIVE' : '· CACHED'}
                      </p>
                    )}
                  </div>
                  {!conn.legacy && (
                    <button onClick={() => disconnectBroker(conn.id)}
                      className="text-[10px] font-bold px-2 py-1 rounded border border-red-500/25 text-red-400 hover:bg-red-500/10 shrink-0">
                      DISCONNECT
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add a broker */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold text-foreground">{boomer ? 'Add a Broker' : 'CONNECT NEW BROKER'}</p>
            <div className="grid grid-cols-2 gap-2">
              {brokerCatalog.filter(c => c.id !== 'schwab').map(c => (
                <button key={c.id}
                  onClick={() => setBrokerForm({ broker: c.id, creds: {}, isPaperMode: true })}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${brokerForm?.broker === c.id ? 'border-sky-500/40 bg-sky-500/10' : 'border-border hover:border-sky-500/20'}`}>
                  <p className="text-xs font-bold text-foreground">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.region} · {c.defaultCurrency} · {c.markets.join(', ')}</p>
                  {c.paperOnly && <p className="text-[9px] text-amber-400 mt-0.5">PAPER ONLY</p>}
                </button>
              ))}
            </div>

            {brokerForm && (() => {
              const entry = brokerCatalog.find(c => c.id === brokerForm.broker);
              if (!entry) return null;
              return (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-bold text-sky-400">{entry.name}</p>
                  {entry.description && <p className="text-[10px] text-amber-400">{entry.description}</p>}
                  {entry.setupFields.map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] text-muted-foreground">{f.label}{f.required ? ' *' : ''}</label>
                      <input
                        type={f.type === 'password' ? 'password' : 'text'}
                        value={brokerForm.creds[f.key] ?? ''}
                        onChange={e => setBrokerForm(prev => prev ? { ...prev, creds: { ...prev.creds, [f.key]: e.target.value } } : prev)}
                        className="w-full mt-0.5 px-2 py-1.5 rounded bg-muted/10 border border-border text-xs text-foreground focus:border-sky-500/40 outline-none"
                      />
                    </div>
                  ))}
                  {!entry.paperOnly && (
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={brokerForm.isPaperMode}
                        onChange={e => setBrokerForm(prev => prev ? { ...prev, isPaperMode: e.target.checked } : prev)} />
                      {boomer ? 'Paper mode (simulated, no real money)' : 'PAPER MODE'}
                    </label>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setBrokerForm(null)} className="flex-1 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button onClick={connectBroker} disabled={connectingBroker === brokerForm.broker}
                      className="flex-1 py-1.5 rounded bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold disabled:opacity-50">
                      {connectingBroker === brokerForm.broker ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* International markets */}
          {intlMarkets.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold text-foreground mb-2">{boomer ? 'Market Hours (by region)' : 'EXCHANGE STATUS'}</p>
              <div className="grid grid-cols-2 gap-2">
                {intlMarkets.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded p-2 bg-muted/10 border border-border">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{m.name}</p>
                      <p className="text-[9px] text-muted-foreground">{m.region} · {m.currency}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${m.isOpen ? 'text-green-400 border-green-500/25 bg-green-500/10' : 'text-red-400 border-red-500/25 bg-red-500/10'}`}>
                      {m.isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market-data provider key */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground">{boomer ? 'Market Data Provider (optional)' : 'MARKET-DATA FEED (OPTIONAL)'}</p>
              {dataProvider.configured && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-green-400 border-green-500/25 bg-green-500/10">{(dataProvider.provider || '').toUpperCase()} ACTIVE</span>}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {boomer
                ? 'Bring your own market-data key (Polygon, Twelve Data, or Finnhub) for richer, real-time, international data. You sign up and pay the provider directly. Without a key, the bot degrades gracefully to broker-native and simulated data.'
                : 'BYO DATA KEY · POLYGON / TWELVE DATA / FINNHUB · DEGRADES GRACEFULLY · YOU PAY THE PROVIDER'}
            </p>
            {dataProvider.configured ? (
              <button onClick={deleteDataProvider} className="text-[10px] font-bold px-2 py-1 rounded border border-red-500/25 text-red-400 hover:bg-red-500/10">REMOVE KEY</button>
            ) : (
              <div className="flex gap-2">
                <select value={dpForm.provider} onChange={e => setDpForm(f => ({ ...f, provider: e.target.value }))}
                  className="px-2 py-1.5 rounded bg-muted/10 border border-border text-xs text-foreground outline-none">
                  {(dataProvider.supportedProviders ?? ['polygon', 'twelvedata', 'finnhub']).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="password" placeholder="API key" value={dpForm.apiKey}
                  onChange={e => setDpForm(f => ({ ...f, apiKey: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded bg-muted/10 border border-border text-xs text-foreground focus:border-sky-500/40 outline-none" />
                <button onClick={saveDataProvider} disabled={savingDp || !dpForm.apiKey.trim()}
                  className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold disabled:opacity-50">
                  {savingDp ? '…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tradingTab === 'analysis' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <p className="text-sm font-bold text-violet-400 mb-1">{boomer ? 'Deep Market Analysis' : 'DEEP ANALYSIS ENGINE'}</p>
            <p className="text-xs text-muted-foreground">
              {boomer ? 'Technicals, fundamentals, news sentiment and macro — combined into a per-symbol read with a clear rationale.' : 'TECHNICALS + FUNDAMENTALS + SENTIMENT + MACRO → RATED SIGNAL'}
            </p>
          </div>
          <div className="flex gap-2">
            <input value={analysisSymbols} onChange={e => setAnalysisSymbols(e.target.value)}
              placeholder="AAPL, MSFT, NVDA"
              className="flex-1 px-3 py-2 rounded-lg bg-muted/10 border border-border text-sm text-foreground focus:border-violet-500/40 outline-none" />
            <button onClick={runAnalysis} disabled={runningAnalysis}
              className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold disabled:opacity-50">
              {runningAnalysis ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          {analysisResults.map(a => {
            const allRationale = [...(a.technical?.rationale ?? []), ...(a.fundamental?.rationale ?? []), ...(a.sentiment?.rationale ?? []), ...(a.macro?.rationale ?? [])];
            return (
            <div key={a.symbol} className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{a.symbol}</span>
                  <span className="text-[11px] text-muted-foreground">{a.lastPrice?.toFixed(2)} {a.currency}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${a.bias === 'bullish' ? 'text-green-400 border-green-500/25 bg-green-500/10' : a.bias === 'bearish' ? 'text-red-400 border-red-500/25 bg-red-500/10' : 'text-amber-400 border-amber-500/25 bg-amber-500/10'}`}>
                  {a.bias?.toUpperCase()} · {a.overallScore > 0 ? '+' : ''}{a.overallScore} · {a.confidence}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{a.summary}</p>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                {([['TECH', a.technical], ['FUND', a.fundamental], ['SENTIMENT', a.sentiment], ['MACRO', a.macro]] as const).map(([lbl, f]) => (
                  <div key={lbl} className="rounded p-2 bg-muted/10 border border-border">
                    <p className="text-muted-foreground">{lbl}</p>
                    <p className={`font-bold ${(f?.score ?? 0) > 0 ? 'text-green-400' : (f?.score ?? 0) < 0 ? 'text-red-400' : 'text-foreground'}`}>{(f?.score ?? 0) > 0 ? '+' : ''}{f?.score ?? 0}</p>
                  </div>
                ))}
              </div>
              {allRationale.length > 0 && (
                <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                  {allRationale.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
            );
          })}
        </div>
      )}

      {tradingTab === 'screener' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-sm font-bold text-cyan-400 mb-1">{boomer ? 'Multi-Exchange Screener' : 'MULTI-EXCHANGE SCREENER'}</p>
            <p className="text-xs text-muted-foreground">
              {boomer ? 'Scan symbols for volume surges, momentum, breakouts and oversold/overbought setups — ranked by opportunity.' : 'VOLUME SURGE · MOMENTUM · BREAKOUT · OVERSOLD/OVERBOUGHT → RANKED'}
            </p>
          </div>
          <div className="flex gap-2">
            <input value={screenerSymbols} onChange={e => setScreenerSymbols(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-muted/10 border border-border text-sm text-foreground focus:border-cyan-500/40 outline-none" />
            <button onClick={runScreener} disabled={runningScreener}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold disabled:opacity-50">
              {runningScreener ? 'Scanning…' : 'Scan'}
            </button>
          </div>
          {screenerHits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{boomer ? 'No opportunities found yet — run a scan.' : 'NO HITS'}</p>
          ) : screenerHits.map((h, i) => (
            <div key={`${h.symbol}-${h.signalType}-${i}`} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">{h.symbol}</span>
                  {h.market && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-sky-400 border-sky-500/25 bg-sky-500/10">{h.market}</span>}
                  <span className="text-[11px] text-muted-foreground">{h.lastPrice?.toFixed(2)} {h.currency ?? ''}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-cyan-400 border-cyan-500/25 bg-cyan-500/10">{h.signalType?.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{h.detail}</p>
              </div>
              <span className="text-sm font-bold text-cyan-400 shrink-0">{h.score}</span>
            </div>
          ))}
        </div>
      )}

      {tradingTab === 'strategies' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-[10px] font-bold text-green-400/70 mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>RISK PROFILE PRESETS</p>
            <p className="text-[10px] text-muted-foreground mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {boomer ? 'Select a risk level to auto-configure all strategies and risk parameters.' : 'SELECT RISK LEVEL · AUTO-CONFIGURES STRATEGIES + RISK PARAMS'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'conservative', label: 'CONSERVATIVE', desc: 'Low risk, 2 strategies, tight stops', color: 'green' },
                { key: 'moderate', label: 'MODERATE', desc: 'Balanced, 6 strategies, standard risk', color: 'amber' },
                { key: 'aggressive', label: 'AGGRESSIVE', desc: 'High risk, all strategies, wide stops', color: 'red' },
              ] as const).map(p => (
                <button key={p.key}
                  onClick={async () => {
                    try {
                      const res = await apiFetch(`/api/bots/${bot.id}/trading/risk-profile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profile: p.key }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setStrategies(data.strategies ?? []);
                      }
                    } catch {}
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors hover:border-${p.color}-500/40`}
                  style={{ borderColor: `rgba(${p.color === 'green' ? '34,197,94' : p.color === 'amber' ? '245,158,11' : '239,68,68'},0.2)`, background: `rgba(${p.color === 'green' ? '34,197,94' : p.color === 'amber' ? '245,158,11' : '239,68,68'},0.05)` }}>
                  <span className="text-[10px] font-bold" style={{ fontFamily: "var(--font-sans)", color: `rgba(${p.color === 'green' ? '34,197,94' : p.color === 'amber' ? '245,158,11' : '239,68,68'},0.8)` }}>{p.label}</span>
                  <span className="text-[8px] text-muted-foreground text-center leading-tight" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
            {boomer ? 'Toggle strategies on/off. The bot will run enabled strategies during market hours.' : 'ENABLE STRATEGIES · BOT RUNS ON ALL SUPPORTED MARKETS WORLDWIDE'}</p>
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
                  <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                  style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all', 'BUY', 'SELL'] as const).map(f => (
                <button key={f} onClick={() => setTradeFilterSide(f)}
                  className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${tradeFilterSide === f ? (f === 'BUY' ? 'bg-green-500/15 text-green-400 border-green-500/30' : f === 'SELL' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-sky-500/15 text-sky-400 border-sky-500/30') : 'bg-muted/10 text-muted-foreground border-border hover:border-sky-500/20'}`}
                  style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {f === 'all' ? 'ALL SIDES' : f}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                            style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{trade.side}</span>
                          {trade.isPaper && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-amber-400 border-amber-500/20 bg-amber-500/10"
                            style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>PAPER</span>}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${trade.status === 'open' ? 'text-sky-400 border-sky-500/20 bg-sky-500/10' : 'text-muted-foreground border-border'}`}
                            style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{trade.status.toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                  <p className="text-[10px] text-muted-foreground/40 mt-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                        <p className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{label}</p>
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
            <label className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{label}</label>
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
        <span className="text-sm" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>LOADING PROSPECTING DATA...</span>
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
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
            <p className="text-xs font-bold mb-1" style={boomer ? { color: source === 'linkedin' ? '#38bdf8' : '#818cf8' } : { fontFamily: "var(--font-sans)", color: source === 'linkedin' ? '#38bdf8' : '#818cf8' }}>
              {source === 'linkedin' ? '🔗 LINKEDIN PROSPECTOR · RECON-LI' : '📘 FACEBOOK SCOUT · SCOUT-FB'}
            </p>
            <p className="text-xs text-muted-foreground">
              {source === 'linkedin'
                ? 'Configure search criteria to find LinkedIn leads. Results are simulated for demonstration. Connect LinkedIn Sales Navigator API for live data.'
                : 'Configure search criteria to find Facebook/Instagram leads. Results are simulated for demonstration. Connect Facebook Lead Ads API for live data.'}
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
              Automated data collection from {source === 'linkedin' ? 'LinkedIn' : 'Facebook'} may violate their Terms of Service. Results shown are simulations for demonstration. For production use, integrate with {source === 'linkedin' ? 'LinkedIn Sales Navigator API or an authorized data provider' : 'Facebook Lead Ads API or Meta Business API with proper authorization'}. Always ensure compliance with GDPR, CCPA, and applicable privacy laws.
            </p>
          </div>
        </div>
      )}

      {prospectTab === 'results' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                          }`} style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                            {result.qualificationScore}%
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                            result.source === 'linkedin' ? 'text-sky-400 border-sky-500/20' : 'text-blue-400 border-blue-500/20'
                          }`} style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
        <p className="text-xs text-sky-400" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
          {boomer
            ? 'Test your bot by chatting with it directly. This bypasses platform connections and uses the bot\'s personality and permissions.'
            : 'TEST CHANNEL · DIRECT NEURAL INTERFACE · BYPASSES PLATFORM CONNECTORS'}
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
            <span className="text-[10px] font-bold text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {msg.role === 'user' ? (boomer ? 'YOU' : 'OPERATOR') : (boomer ? 'BOT' : 'AGENT')}
            </span>
            <p className="text-foreground/80 whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {sending && (
          <div className="rounded-lg p-3 text-sm bg-muted/30 border border-border mr-4">
            <span className="text-[10px] font-bold text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
  const [tab, setTab] = useState<'test' | 'logs' | 'memory' | 'tasks' | 'settings' | 'trading' | 'prospecting' | 'team'>('test');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [spawning, setSpawning] = useState(false);
  const [spawnName, setSpawnName] = useState('');
  const [spawnRole, setSpawnRole] = useState('specialist');
  const [togglingCollab, setTogglingCollab] = useState(false);
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
        } else if (tab === 'team') {
          const res = await apiFetch(`/api/bots/${bot.id}/team`);
          if (res.ok) { const data = await res.json(); setTeamMembers([...(data.team ?? []), ...(data.children ?? []).map((c: TeamMember) => ({ ...c, isChild: true }))]); }
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
              <h3 className="font-bold text-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.2rem', letterSpacing: '0.08em' }}>
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
          {(['test', 'logs', 'memory', 'tasks', ...(hasTrading ? ['trading'] : []), ...(hasProspecting ? ['prospecting'] : []), 'team', 'settings'] as const).map((tabKey: string) => (
            <button key={tabKey} onClick={() => setTab(tabKey as typeof tab)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-colors ${tab === tabKey ? 'text-sky-400 border-b-2 border-sky-400' : 'text-muted-foreground hover:text-foreground'}`}
              style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
              {tabKey === 'test' && <MessageSquare className="w-3 h-3" />}
              {tabKey === 'trading' && <TrendingUp className="w-3 h-3" />}
              {tabKey === 'prospecting' && <Search className="w-3 h-3" />}
              {tabKey === 'team' && <Users className="w-3 h-3" />}
              {tabKey === 'test' ? (boomer ? 'Test Chat' : 'TEST CHAT') :
               tabKey === 'logs' ? (boomer ? t('botFactory.detailTabLogs') : t('botFactory.detailTabLogsCodename')) :
               tabKey === 'memory' ? (boomer ? t('botFactory.detailTabMemory') : t('botFactory.detailTabMemoryCodename')) :
               tabKey === 'tasks' ? (boomer ? t('botFactory.detailTabTasks') : t('botFactory.detailTabTasksCodename')) :
               tabKey === 'trading' ? (boomer ? 'Trading' : 'TRADING') :
               tabKey === 'prospecting' ? (boomer ? 'Prospecting' : 'PROSPECTING') :
               tabKey === 'team' ? 'TEAM' :
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
              <span className="text-sm" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                      <span className="text-[10px] font-bold text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                      <span className="text-xs font-bold text-purple-400" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{mem.key}</span>
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
                <label className="text-xs text-muted-foreground block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomer ? t('botFactory.newScheduledTask') : t('botFactory.newScheduledTaskCodename')}
                </label>
                <input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder={boomer ? t('botFactory.taskDirectivePlaceholder') : t('botFactory.taskDirectivePlaceholderCodename')}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
                          <span className="text-[10px] text-muted-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
          ) : tab === 'team' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                    COLLABORATION MODE
                  </span>
                </div>
                <button
                  disabled={togglingCollab}
                  onClick={async () => {
                    setTogglingCollab(true);
                    try {
                      await apiFetch(`/api/bots/${bot.id}/collaboration`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: !bot.collaborationEnabled }),
                      });
                      onRefresh();
                    } catch {} finally { setTogglingCollab(false); }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    bot.collaborationEnabled
                      ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                      : 'border-border text-muted-foreground hover:border-violet-500/20'
                  }`}
                  style={boomer ? {} : { fontFamily: "var(--font-sans)" }}
                >
                  {togglingCollab ? <div className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" /> :
                    bot.collaborationEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {bot.collaborationEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-4">
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                  WHEN ENABLED, THIS BOT CAN WORK WITH OTHER TEAMED BOTS — SHARING CONTEXT, DELEGATING SUB-TASKS, AND USING EACH OTHER'S PERMISSIONS AND AUTOMATIONS. ANY TEAMED BOT CAN ALSO SPAWN CUSTOM SUB-BOTS.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {teamMembers.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-2" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                        AVAILABLE TEAM
                      </div>
                      <div className="space-y-2">
                        {teamMembers.map(m => (
                          <div key={m.id} className="flex items-center justify-between rounded-lg border border-violet-500/10 bg-violet-500/[0.02] p-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.isChild ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-violet-500/10 border border-violet-500/20'}`}>
                                <Bot className={`w-4 h-4 ${m.isChild ? 'text-amber-400' : 'text-violet-400'}`} />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-foreground" style={boomer ? {} : { fontFamily: "var(--font-sans)", fontSize: '0.95rem' }}>{m.name}</div>
                                <div className="text-[10px] text-muted-foreground/50" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                                  {m.role.toUpperCase()} · {m.permissions.length} PERMISSIONS
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {m.isChild && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">CUSTOM</span>
                              )}
                              <StatusBadge status={m.status as BotStatus} boomer={boomer} t={t} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {teamMembers.length === 0 && bot.collaborationEnabled && (
                    <div className="rounded-xl border border-border p-6 text-center">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground/50">NO OTHER BOTS WITH COLLABORATION ENABLED YET. ENABLE COLLABORATION ON MORE BOTS TO BUILD A TEAM.</p>
                    </div>
                  )}

                  <div className="h-px bg-border" />

                  <div>
                    <div className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest mb-3" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                      SPAWN CUSTOM BOT
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed mb-3">
                      CREATE A SPECIALIZED SUB-BOT THAT INHERITS THIS BOT'S CAPABILITIES BUT CAN BE CUSTOMIZED FOR A SPECIFIC ROLE. UP TO 5 CUSTOM BOTS PER PARENT.
                    </p>
                    <div className="space-y-2">
                      <input
                        value={spawnName}
                        onChange={e => setSpawnName(e.target.value)}
                        placeholder={`${bot.name} (Custom)`}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-amber-500/50 focus:outline-none"
                        style={boomer ? {} : { fontFamily: "var(--font-sans)" }}
                      />
                      <select
                        value={spawnRole}
                        onChange={e => setSpawnRole(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-amber-500/50 focus:outline-none"
                        style={boomer ? {} : { fontFamily: "var(--font-sans)" }}
                      >
                        <optgroup label="CORE ROLES">
                          <option value="specialist">SPECIALIST</option>
                          <option value="researcher">RESEARCHER</option>
                          <option value="closer">CLOSER</option>
                          <option value="analyst">ANALYST</option>
                          <option value="coordinator">COORDINATOR</option>
                          <option value="scout">SCOUT</option>
                        </optgroup>
                        <optgroup label="SALES & OUTREACH">
                          <option value="cold-outreach">COLD OUTREACH</option>
                          <option value="lead-qualifier">LEAD QUALIFIER</option>
                          <option value="pipeline-manager">PIPELINE MANAGER</option>
                          <option value="upsell-agent">UPSELL AGENT</option>
                        </optgroup>
                        <optgroup label="CUSTOMER SERVICE">
                          <option value="helpdesk-t1">HELPDESK TIER-1</option>
                          <option value="live-chat">LIVE CHAT AGENT</option>
                          <option value="faq-responder">FAQ AUTO-RESPONDER</option>
                          <option value="feedback-collector">FEEDBACK COLLECTOR</option>
                          <option value="escalation-router">ESCALATION ROUTER</option>
                        </optgroup>
                        <optgroup label="MARKETING">
                          <option value="blog-writer">BLOG WRITER</option>
                          <option value="email-campaign">EMAIL CAMPAIGN</option>
                          <option value="seo-optimizer">SEO OPTIMIZER</option>
                          <option value="ad-copy">AD COPY GENERATOR</option>
                          <option value="pr-press">PR & PRESS</option>
                          <option value="localization">LOCALIZATION</option>
                          <option value="webinar-manager">WEBINAR MANAGER</option>
                        </optgroup>
                        <optgroup label="HR & RECRUITING">
                          <option value="recruiter">RECRUITER</option>
                          <option value="onboarding">ONBOARDING</option>
                          <option value="interview-scheduler">INTERVIEW SCHEDULER</option>
                          <option value="employee-pulse">EMPLOYEE PULSE</option>
                        </optgroup>
                        <optgroup label="OPERATIONS">
                          <option value="appointment-scheduler">APPOINTMENT SCHEDULER</option>
                          <option value="document-processor">DOCUMENT PROCESSOR</option>
                          <option value="meeting-notes">MEETING NOTES</option>
                          <option value="inventory-tracker">INVENTORY TRACKER</option>
                          <option value="task-dispatcher">TASK DISPATCHER</option>
                          <option value="workflow-automator">WORKFLOW AUTOMATOR</option>
                          <option value="knowledge-base">KNOWLEDGE BASE</option>
                          <option value="vendor-manager">VENDOR MANAGER</option>
                        </optgroup>
                        <optgroup label="FINANCE">
                          <option value="invoice-generator">INVOICE GENERATOR</option>
                          <option value="expense-tracker">EXPENSE TRACKER</option>
                          <option value="revenue-reporter">REVENUE REPORTER</option>
                          <option value="payroll-assistant">PAYROLL ASSISTANT</option>
                        </optgroup>
                        <optgroup label="DATA & ANALYTICS">
                          <option value="report-generator">REPORT GENERATOR</option>
                          <option value="survey-analyst">SURVEY ANALYST</option>
                          <option value="competitor-monitor">COMPETITOR MONITOR</option>
                          <option value="data-cleaner">DATA CLEANER</option>
                        </optgroup>
                        <optgroup label="DEVELOPMENT & IT">
                          <option value="bug-reporter">BUG REPORTER</option>
                          <option value="deployment-notifier">DEPLOYMENT NOTIFIER</option>
                          <option value="status-page">STATUS PAGE</option>
                          <option value="code-reviewer">CODE REVIEWER</option>
                        </optgroup>
                        <optgroup label="SOCIAL MEDIA">
                          <option value="social-scheduler">SOCIAL SCHEDULER</option>
                          <option value="community-manager">COMMUNITY MANAGER</option>
                          <option value="influencer-scout">INFLUENCER SCOUT</option>
                          <option value="review-responder">REVIEW RESPONDER</option>
                        </optgroup>
                        <optgroup label="E-COMMERCE">
                          <option value="order-manager">ORDER MANAGER</option>
                          <option value="cart-recovery">CART RECOVERY</option>
                          <option value="product-recommender">PRODUCT RECOMMENDER</option>
                          <option value="pricing-monitor">PRICING MONITOR</option>
                        </optgroup>
                        <optgroup label="LEGAL & COMPLIANCE">
                          <option value="contract-reviewer">CONTRACT REVIEWER</option>
                          <option value="compliance-monitor">COMPLIANCE MONITOR</option>
                          <option value="nda-manager">NDA MANAGER</option>
                        </optgroup>
                        <optgroup label="PERSONAL & UTILITY">
                          <option value="daily-briefing">DAILY BRIEFING</option>
                          <option value="habit-tracker">HABIT TRACKER</option>
                          <option value="travel-planner">TRAVEL PLANNER</option>
                          <option value="email-triage">EMAIL TRIAGE</option>
                        </optgroup>
                      </select>
                      <button
                        disabled={spawning}
                        onClick={async () => {
                          setSpawning(true);
                          try {
                            const res = await apiFetch(`/api/bots/${bot.id}/spawn-custom`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: spawnName || undefined, collaborationRole: spawnRole }),
                            });
                            if (res.ok) {
                              setSpawnName('');
                              onRefresh();
                              const teamRes = await apiFetch(`/api/bots/${bot.id}/team`);
                              if (teamRes.ok) { const data = await teamRes.json(); setTeamMembers([...(data.team ?? []), ...(data.children ?? []).map((c: TeamMember) => ({ ...c, isChild: true }))]); }
                            } else {
                              const data = await res.json().catch(() => ({}));
                              alert(data.error || 'Failed to spawn bot');
                            }
                          } catch {} finally { setSpawning(false); }
                        }}
                        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {spawning ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                        SPAWN PIXEL AGENT (CUSTOM)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomer ? t('botFactory.settingsPersonality') : t('botFactory.settingsPersonalityCodename')}
                </label>
                <p className="text-sm text-foreground/70 bg-muted/20 rounded-lg p-3 border border-border">{bot.personality}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomer ? t('botFactory.settingsConnections') : t('botFactory.settingsConnectionsCodename')}
                </label>
                {bot.connections.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50">{boomer ? t('botFactory.noLinksEstablished') : t('botFactory.noLinksEstablishedCodename')}</p>
                ) : (
                  <div className="space-y-2">
                    {bot.connections.map(conn => (
                      <div key={conn.id} className="flex items-center gap-3 rounded-lg p-3 bg-muted/20 border border-border">
                        <span className="text-base">{platformIcons[conn.platform] || '🔗'}</span>
                        <span className="text-xs font-bold text-sky-400" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{conn.platform.toUpperCase()}</span>
                        <StatusBadge status={conn.status === 'connected' ? 'active' : 'paused'} boomer={boomer} t={t} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomer ? t('botFactory.settingsPermissions') : t('botFactory.settingsPermissionsCodename')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bot.permissions.map((p: string) => (
                    <span key={p} className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>{p}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
                    {boomer ? t('botFactory.settingsMaxTokens') : t('botFactory.settingsMaxTokensCodename')}
                  </span>
                  <span className="text-sm font-bold text-foreground">{bot.maxTokensPerResponse.toLocaleString()}</span>
                </div>
                <div className="rounded-lg p-3 bg-muted/20 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1" style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
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
  const [bots, setBots] = useState<BotData[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ marketplaceItemId: number; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null);
  const [connectBot, setConnectBot] = useState<BotData | null>(null);
  const [activating, setActivating] = useState<number | null>(null);
  const [activationError, setActivationError] = useState('');
  const [workstationCapacity, setWorkstationCapacity] = useState<WorkstationCapacity | null>(null);
  const [search, setSearch] = useState('');
  const [finderQuery, setFinderQuery] = useState('');
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderResults, setFinderResults] = useState<{ recommendations: Array<{ type: string; name: string; slug: string | null; reason: string; category: string }>; summary: string; tip?: string } | null>(null);
  const [finderError, setFinderError] = useState('');

  const { isAuthenticated } = useAuth();
  const plan = usePlan();
  const [, navigate] = useLocation();
  const hasAccess = plan.isOwner;

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

  const loadWorkstationCapacity = useCallback(async () => {
    try {
      const response = await apiFetch('/api/bots/workstation-capacity');
      if (response.ok) setWorkstationCapacity(await response.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([loadBots(), loadMarketplace(), loadWorkstationCapacity()]).finally(() => setLoading(false));
  }, [isAuthenticated, loadBots, loadMarketplace, loadWorkstationCapacity]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkout === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleBotFinder = async () => {
    if (!finderQuery.trim()) return;
    setFinderLoading(true);
    setFinderError('');
    setFinderResults(null);
    try {
      const res = await apiFetch('/api/bots/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: finderQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
        setFinderResults({ recommendations: recs, summary: data?.summary || 'Here are my recommendations.', tip: data?.tip || '' });
      } else {
        setFinderError('RECOMMENDATION ENGINE UNAVAILABLE. TRY AGAIN.');
      }
    } catch {
      setFinderError('NETWORK ERROR. TRY AGAIN.');
    } finally {
      setFinderLoading(false);
    }
  };

  const activateMarketplaceBot = async (item: MarketplaceItem) => {
    setActivating(item.id);
    setActivationError('');
    try {
      const res = await apiFetch('/api/bots/marketplace/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceItemId: item.id }),
      });
      if (res.ok) {
        await Promise.all([loadBots(), loadMarketplace(), loadWorkstationCapacity()]);
      } else {
        const data = await res.json().catch(() => ({}));
        const message = typeof data.error === 'string' ? data.error : 'Unable to activate this Pixel Agent. Please try again.';
        setActivationError(message);
        if (res.status === 403 && data.upgrade) navigate(data.upgrade);
      }
    } catch (err) {
      console.error('Failed to activate bot:', err);
      setActivationError('Network error while activating this Pixel Agent. Please try again.');
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
                <h1 className="text-lg font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.1em', fontSize: '1.4rem' }}>
                   {boomerMode ? 'Agent Command Center' : 'AGENT COMMAND CENTER'}
                </h1>
                <p className="text-xs text-muted-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomerMode ? t('botFactory.subtitle') : t('botFactory.subtitleCodename')}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Bot className="w-6 h-6 animate-pulse mr-3" />
              <span className="text-sm" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                {boomerMode ? t('botFactory.loadingBots') : t('botFactory.loadingBotsCodename')}
              </span>
            </div>
          ) : (
            <div className="space-y-5">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-60 h-60 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Bot className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h2 className="font-bold text-foreground text-lg" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.06em', fontSize: '1.4rem' }}>
                        PIXEL AGENTS
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {hasAccess ? 'ACTIVE' : 'RESTRICTED'}
                      </span>
                       <span className="text-[10px] text-muted-foreground/40 font-mono">{marketplace.length} CURATED BOTS</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60">
                       {boomerMode ? 'Curated agents for configured channels. A paid USD entitlement is required.' : 'CURATED AGENTS // CONFIGURED CHANNELS ONLY // PAID USD ENTITLEMENT REQUIRED'}
                    </p>
                  </div>
                   <div className="shrink-0 flex items-center gap-2">
                     {!hasAccess && (
                      <button onClick={() => navigate('/pricing')}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-colors shadow-lg shadow-emerald-500/20">
                        <Zap className="w-3.5 h-3.5" /> ACTIVATE
                      </button>
                     )}
                  </div>
                </div>
              </motion.div>
              {activationError && (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {activationError}
                </div>
              )}

              <div className={`rounded-xl border p-4 ${workstationCapacity?.availableBotDesks ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-amber-500/30 bg-amber-500/[0.05]'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-foreground">
                      <Building2 className="h-4 w-4 text-sky-400" /> AUTOMATION WORKSTATION CAPACITY
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      Every active human and Pixel Agent needs one physical desk. Subscription access does not create office capacity.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-border px-3 py-2"><b className="block text-sm text-foreground">{workstationCapacity?.totalDesks ?? 0}</b><span className="text-[8px] text-muted-foreground">TOTAL</span></div>
                    <div className="rounded border border-border px-3 py-2"><b className="block text-sm text-foreground">{(workstationCapacity?.requiredHumanDesks ?? 0) + (workstationCapacity?.activeBotDesks ?? 0)}</b><span className="text-[8px] text-muted-foreground">IN USE</span></div>
                    <div className="rounded border border-border px-3 py-2"><b className={`block text-sm ${workstationCapacity?.availableBotDesks ? 'text-emerald-400' : 'text-amber-400'}`}>{workstationCapacity?.availableBotDesks ?? 0}</b><span className="text-[8px] text-muted-foreground">BOT SLOTS</span></div>
                  </div>
                </div>
                {!workstationCapacity?.hasProperty && <button onClick={() => navigate('/store/realty')} className="mt-3 flex items-center gap-2 rounded border border-amber-500/35 px-3 py-2 text-[10px] font-bold text-amber-300 hover:bg-amber-500/10"><Building2 className="h-3.5 w-3.5" /> FIND AN OFFICE BEFORE ACTIVATING A BOT</button>}
              </div>

              <AgentTeam embedded />

              {bots.length > 0 && (
                <BotCommandCenter
                  bots={bots}
                  onRefresh={loadBots}
                  onSelectBot={setSelectedBot}
                  onConnectBot={setConnectBot}
                />
              )}

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/[0.04] via-transparent to-sky-500/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                    BOT FINDER — DESCRIBE WHAT YOU NEED
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mb-3" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                  TELL PABLO WHAT YOU WANT TO AUTOMATE AND HE'LL RECOMMEND THE RIGHT BOTS FROM THE PIXEL AGENTS ARSENAL.
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Brain className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-violet-400/40 pointer-events-none" />
                    <input
                      type="text"
                      value={finderQuery}
                      onChange={e => setFinderQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !finderLoading) handleBotFinder(); }}
                      placeholder={boomerMode ? 'e.g. "I need to automate my cold email outreach"' : 'E.G. "I NEED TO AUTOMATE INVOICE COLLECTION AND FOLLOW-UPS"'}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-violet-500/20 bg-background text-xs text-foreground placeholder:text-muted-foreground/25 focus:border-violet-500/40 focus:outline-none transition-colors"
                      style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    />
                  </div>
                  <button
                    onClick={handleBotFinder}
                    disabled={finderLoading || !finderQuery.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors shrink-0 disabled:opacity-50"
                  >
                    {finderLoading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    ASK PABLO
                  </button>
                </div>

                <AnimatePresence>
                  {finderError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-3 p-2 rounded-lg border border-red-500/20 bg-red-500/[0.05]">
                      <p className="text-[10px] text-red-400" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>{finderError}</p>
                    </motion.div>
                  )}

                  {finderLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="mt-3 flex items-center gap-2 text-violet-400/60">
                      <div className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      <span className="text-[10px]" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>PABLO IS ANALYZING YOUR NEEDS...</span>
                    </motion.div>
                  )}

                  {finderResults && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2">
                      <div className="p-2 rounded-lg bg-violet-500/[0.06] border border-violet-500/15">
                        <p className="text-[11px] text-violet-300/80" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                          {finderResults.summary}
                        </p>
                      </div>

                      {finderResults.recommendations.map((rec, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50 hover:border-violet-500/20 transition-colors cursor-pointer"
                          onClick={() => {
                            if (rec.slug) {
                              setSearch(rec.name);
                            } else {
                              setShowCreate(true);
                            }
                          }}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${rec.type === 'marketplace' ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400' : 'bg-amber-500/15 border border-amber-500/25 text-amber-400'}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", fontSize: '0.95rem', letterSpacing: '0.04em' }}>
                                {rec.name.toUpperCase()}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${rec.type === 'marketplace' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}`}
                                style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                                {rec.type === 'marketplace' ? 'PIXEL AGENT' : 'CUSTOM TEMPLATE'}
                              </span>
                              <span className="text-[8px] text-muted-foreground/40" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                                {rec.category.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground/60 leading-relaxed" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                              {rec.reason}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 shrink-0 mt-1" />
                        </motion.div>
                      ))}

                      {finderResults.tip && (
                        <div className="p-2 rounded-lg bg-sky-500/[0.05] border border-sky-500/15 flex items-start gap-2">
                          <Zap className="w-3 h-3 text-sky-400 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-sky-300/70" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                            {finderResults.tip}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={boomerMode ? 'Search bots...' : 'SEARCH BOTS...'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-emerald-500/30 focus:outline-none transition-colors"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }} />
                </div>
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  {boomerMode ? 'CUSTOM' : '+ CUSTOM'}
                </button>
              </div>

              {bots.some(b => b.collaborationEnabled) && (
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">TEAM</span>
                    <div className="flex-1 h-px bg-violet-500/10" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bots.filter(b => b.collaborationEnabled).map(b => (
                      <span key={b.id} className="px-2 py-0.5 rounded text-[9px] font-bold border border-violet-500/20 bg-violet-500/[0.06] text-violet-300 flex items-center gap-1"
                        style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                        <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
                        {b.name.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const q = search.toLowerCase().trim();
                const allItems = marketplace.filter(i => i.slug !== 'claw-bot');
                const filtered = q ? allItems.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.tagline.toLowerCase().includes(q)) : allItems;
                const categories: Record<string, MarketplaceItem[]> = {};
                for (const item of filtered) {
                  const cat = item.priceMonthly === 0 ? 'free' : item.category;
                  if (!categories[cat]) categories[cat] = [];
                  categories[cat].push(item);
                }
                const catOrder = ['free', ...Object.keys(categories).filter(c => c !== 'free').sort()];

                const activeBotIds = new Set(bots.map(b => b.marketplaceItemId).filter(Boolean));

                return catOrder.filter(c => categories[c]).map(category => {
                  const items = categories[category];
                  const isTrading = category === 'trading';
                  const isFree = category === 'free';
                  const catTextClass = isFree ? 'text-emerald-400' : isTrading ? 'text-green-400' : 'text-sky-400';
                  const catLineClass = isFree ? 'bg-emerald-500/20' : isTrading ? 'bg-green-500/20' : 'bg-sky-500/20';
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${catTextClass}`}
                          style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                          {isFree ? (boomerMode ? 'FREE' : 'FREE // NO COST') : isTrading ? (boomerMode ? 'TRADING' : 'TRADING AGENTS') : category.toUpperCase()}
                        </span>
                        <div className={`flex-1 h-px ${catLineClass}`} />
                        <span className="text-[9px] text-muted-foreground/30 font-mono">{items.length}</span>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {items.map(item => {
                          const Icon = getIcon(item.icon);
                          const sub = subscriptions.find(s => s.marketplaceItemId === item.id);
                          const isActive = sub?.status === 'active' || activeBotIds.has(item.id);
                          const isCanceled = sub?.status === 'canceled';
                          const activatedBot = bots.find(b => b.marketplaceItemId === item.id);
                          return (
                            <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                                isActive ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : isCanceled ? 'border-red-500/15 bg-red-500/[0.02]' : 'border-border/50 bg-card/50 hover:border-emerald-500/15'
                              }`}>
                              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                                isTrading ? 'bg-green-500/10 border-green-500/20' : isFree ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-sky-500/10 border-sky-500/20'
                              }`}>
                                <Icon className={`w-4 h-4 ${isTrading ? 'text-green-400' : isFree ? 'text-emerald-400' : 'text-sky-400'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <BotNameDisplay name={item.name} className="font-bold text-foreground text-xs" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.06em', fontSize: '0.95rem' }} />
                                  {item.priceMonthly > 0 && (
                                    <span className="text-[9px] text-muted-foreground/40 font-mono">${item.priceMonthly}/mo</span>
                                  )}
                                  {isCanceled && <span className="text-[8px] font-bold text-red-400">CANCELED</span>}
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 truncate">{item.tagline}</p>
                                {activatedBot?.workstation && (
                                  <p className="mt-0.5 text-[9px] font-mono text-sky-400/70">
                                    {activatedBot.workstation.city.replace(/_/g, ' ').toUpperCase()} · FLOOR {activatedBot.workstation.floorNumber} · {activatedBot.workstation.workstationKey.replace(/-/g, ' ').toUpperCase()}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {activatedBot && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); setConnectBot(activatedBot); }}
                                      className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground/40 hover:text-sky-400 transition-colors" title="Connect platform">
                                      <Plug className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedBot(activatedBot); }}
                                      className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground/40 hover:text-foreground transition-colors" title="Settings">
                                      <Settings className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                {isActive ? (
                                  <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                                    <Check className="w-3 h-3" /> ACTIVE
                                  </span>
                                ) : (
                                  <button onClick={() => activateMarketplaceBot(item)} disabled={activating === item.id || !workstationCapacity?.availableBotDesks}
                                    title={!workstationCapacity?.availableBotDesks ? "No free physical workstation. Acquire office capacity first." : "Uses one available workstation"}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50">
                                    {activating === item.id ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
                                    {workstationCapacity?.availableBotDesks ? 'ACTIVATE · 1 DESK' : 'DESK REQUIRED'}
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}

              {bots.filter(b => !b.marketplaceItemId).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                      CUSTOM BOTS
                    </span>
                    <div className="flex-1 h-px bg-amber-500/20" />
                  </div>
                  <div className="space-y-1.5">
                    {bots.filter(b => !b.marketplaceItemId).map(bot => (
                      <div key={bot.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.02] cursor-pointer hover:border-amber-500/30 transition-colors"
                        onClick={() => setSelectedBot(bot)}>
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-xs" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.06em', fontSize: '0.95rem' }}>
                              {bot.name.toUpperCase()}
                            </span>
                            <StatusBadge status={bot.status} boomer={boomerMode} t={t} />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                            <span>{bot.connections.length} connections</span>
                            {bot.connections.map(c => (
                              <span key={c.id} className="px-1 py-0.5 rounded text-[8px] font-mono border border-border/30">{c.platform.toUpperCase()}</span>
                            ))}
                          </div>
                        </div>
                        <Settings className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
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
