import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  ChevronRight, ArrowLeft, X, Mail, Loader2, Check, Clock, Lock,
  Target, MessageSquare, PenTool, Users, Search, Eye, TrendingUp,
  Zap, Bot, Shield, Globe, Sparkles,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useState } from 'react';
import { usePlan, invalidatePlanCache, type FeatureKey } from '@/hooks/use-plan';
import { useBoomerMode } from '@/hooks/use-mobile';

type ModuleAccess = 'free' | 'paid';

interface ModuleFeature {
  name: string;
  detail: string;
  status?: 'live' | 'beta' | 'coming_soon';
  channels?: string[];
}

interface ModuleDef {
  id: string;
  label: string;
  boomerLabel?: string;
  codename: string;
  boomerCodename?: string;
  tagline: string;
  description: string;
  access: ModuleAccess;
  featureKey?: FeatureKey;
  route?: string;
  flagship?: boolean;
  features: ModuleFeature[];
}

const MODULES: ModuleDef[] = [
  {
    id: 'pablo',
    label: 'PABLO',
    boomerLabel: 'PABLO',
    codename: 'Neural Core v5.0',
    boomerCodename: 'AI Assistant',
    tagline: 'Your personal business intelligence operator — always on, always sharp.',
    access: 'free',
    route: '/',
    description:
      'Pablo is the AI brain at the center of SALARYMAN. Think of him as the seasoned colleague you always wanted — the one who\'s read every business book, remembers every conversation, and never goes home. Ask Pablo anything: strategy questions, market research, how to handle a difficult client, what to say in that awkward email. He adapts to your communication style over time and gets sharper the more you use the platform.',
    features: [
      { name: 'AI Advisor Chat', detail: 'A persistent, context-aware conversation thread. Pablo remembers what you\'ve discussed and builds on it session after session.' },
      { name: 'Voice Mode', detail: 'Go hands-free. Talk to Pablo the way you\'d talk to a trusted advisor — while commuting, between meetings, or when you just need to think out loud.' },
      { name: 'Translator', detail: 'Communicate across language barriers without friction. Instant translation for emails, documents, and live conversations.' },
      { name: 'Website Analyzer', detail: 'Drop any URL and Pablo breaks it down — competitive intelligence, UX critique, SEO signals, brand positioning. Know your competition before they know you.' },
    ],
  },
  {
    id: 'console',
    label: 'CONSOLE',
    boomerLabel: 'CONSOLE',
    codename: 'Cipher-X Suite',
    boomerCodename: 'Professional Tools',
    tagline: 'The unfair advantage in every technical interview and live problem-solving session.',
    access: 'free',
    route: '/',
    description:
      'Console is the professional\'s secret weapon for navigating the modern technical landscape. Whether you\'re preparing for a high-stakes interview or working through a live coding challenge, Console gives you real-time assistance without pulling you out of your flow. It listens, watches, and thinks — so you can focus on performing.',
    features: [
      { name: 'Interview Solver', detail: 'Submit any coding problem and get layered support: a subtle hint to unblock yourself, a full working solution when you need it, a plain-English explanation of the approach, and a complexity analysis so you understand the trade-offs.' },
      { name: 'Live Listen', detail: 'Console monitors your audio environment and surfaces relevant information in real time. Walk into any technical conversation prepared.' },
      { name: 'Screen Scan', detail: 'Point Console at any screen — a shared problem, a slide deck, a diagram — and get an instant breakdown of what it means and how to respond.' },
      { name: 'Ghost Hands', detail: 'Subtle, unobtrusive assistance that helps you navigate live environments without leaving a trace. For professionals who need to stay sharp under pressure.' },
    ],
  },
  {
    id: 'contacts',
    label: 'CONTACTS',
    boomerLabel: 'CRM',
    codename: 'Recall-6 Registry',
    boomerCodename: 'Customer Relationship Management',
    tagline: 'Your professional network, organized the way your brain actually works.',
    access: 'free',
    route: '/business/contacts',
    description:
      'The old Rolodex is gone. Your LinkedIn is a crowded mess. Contacts is the relationship intelligence layer that serious professionals have always needed. It\'s not just a list of names — it\'s a living record of every connection you\'ve made, every meeting you\'ve had, and every follow-up you\'ve promised.',
    features: [
      { name: 'Contact Registry', detail: 'Store and organize professional contacts with rich context: where you met, what industry they\'re in, what you talked about, and what you need to follow up on.' },
      { name: 'Meeting Logs', detail: 'Every meeting, documented. Add notes, tag attendees, link to action items. When you need to remember the details of a conversation from six months ago, it\'s right there.' },
    ],
  },
  {
    id: 'hiring',
    label: 'HIRING',
    boomerLabel: 'HIRING',
    codename: 'Recruit-8 Field Ops',
    boomerCodename: 'Talent Management',
    tagline: 'Run your entire talent operation from a single terminal.',
    access: 'free',
    route: '/business/hiring',
    description:
      'Whether you\'re a founder hiring your first ten people or an operator managing a growing team, Hiring gives you the full stack. Post roles, evaluate candidates, conduct structured interviews, manage your staff, and present your company like you mean it — all in one place.',
    features: [
      { name: 'Job Board', detail: 'Post and manage open positions. Control visibility, application requirements, and pipeline stages from a unified dashboard.' },
      { name: 'Applicant Pipeline', detail: 'Track every candidate through every stage. Move them forward, flag them, leave notes, share feedback with your team.' },
      { name: 'Staff Management', detail: 'Manage your existing team alongside your hiring pipeline. Headcount planning, role tracking, and org visibility in one view.' },
      { name: 'Interview Conductor', detail: 'Run structured, repeatable interviews with built-in question sets, scoring rubrics, and note-taking.' },
      { name: 'Presentations', detail: 'Build and deliver polished pitch decks and company presentations directly inside the platform.' },
    ],
  },
  {
    id: 'documents',
    label: 'DOCUMENTS',
    boomerLabel: 'DOCUMENTS',
    codename: 'Ink-6 Phantom Printer',
    boomerCodename: 'Document Management',
    tagline: 'Contracts, invoices, and files — professional-grade paperwork without the paperwork.',
    access: 'free',
    route: '/business/documents',
    description:
      'The back-office work that nobody talks about — invoicing clients, drafting contracts, storing critical files — has always been a friction point for serious professionals. Documents eliminates that friction. Everything is templated, versioned, and stored securely.',
    features: [
      { name: 'Invoices', detail: 'Generate clean, professional invoices in seconds. Customize for your brand, send directly from the platform, and track payment status.' },
      { name: 'Contracts', detail: 'Draft and manage agreements using proven templates. Capture signatures, store signed copies, and maintain a full audit trail.' },
      { name: 'File Storage', detail: 'A secure, organized home for every critical business document. Version history, access control, and instant retrieval.' },
    ],
  },
  {
    id: 'calendar',
    label: 'CALENDAR',
    boomerLabel: 'CALENDAR',
    codename: 'Chrono-4 Array',
    boomerCodename: 'Scheduling',
    tagline: 'Time is your only non-renewable resource. Manage it like one.',
    access: 'free',
    route: '/business/calendar',
    description:
      'Calendar is built for professionals who treat time with respect. It\'s not a scheduling widget bolted onto the side — it\'s a central part of how SALARYMAN thinks about your workday. See everything, schedule with precision, and never miss a commitment.',
    features: [
      { name: 'Month / Week / Day Views', detail: 'Switch between macro and micro perspectives instantly. Plan the quarter or optimize tomorrow — the view adapts to how you\'re thinking.' },
      { name: 'Appointments', detail: 'Create, edit, and manage appointments with full context: location, attendees, agenda, linked contacts, and follow-up notes.' },
      { name: 'Email Reminders', detail: 'Automated reminders sent directly to your inbox. You\'ll always show up prepared — and you\'ll never ghost a meeting again.' },
    ],
  },
  {
    id: 'dashboard',
    label: 'DASHBOARD',
    boomerLabel: 'DASHBOARD',
    codename: 'Command Deck v4.0',
    boomerCodename: 'Business Dashboard',
    tagline: 'Your command center. Everything you\'re building, in one view.',
    access: 'free',
    route: '/intel/dashboard',
    description:
      'Dashboard is where you orient yourself at the start of every day. It pulls together your projects, your knowledge, and your brand into a single, coherent view of what you\'re working on and why it matters.',
    features: [
      { name: 'Projects', detail: 'Track every active initiative with status, milestones, and linked resources. See what\'s moving and what\'s stalled at a glance.' },
      { name: 'Knowledge Vault', detail: 'A private, searchable repository for everything you\'ve learned. Notes, frameworks, lessons from experience — externalize your thinking so you can build on it.' },
      { name: 'Brand Kit', detail: 'Store and manage your brand assets — logos, color palettes, fonts, voice guidelines — so everything you produce stays consistent and recognizable.' },
    ],
  },
  {
    id: 'studio',
    label: 'STUDIO',
    boomerLabel: 'STUDIO',
    codename: 'Forge-7 Content Matrix',
    boomerCodename: 'DARK ROOM',
    tagline: 'Create like a creative director. Ship like a machine.',
    access: 'free',
    route: '/creative/darkroom',
    description:
      'Studio is the content production arm of SALARYMAN. Design graphics, generate images, write compelling copy — all without leaving your workflow.',
    features: [
      { name: 'Graphics Studio', detail: 'A professional design environment for creating visual assets — social posts, presentations, marketing materials, pitch decks.' },
      { name: 'AI Image Generation', detail: 'Describe what you need and Studio renders it. Product mockups, concept illustrations, branded imagery — on demand, on brand.' },
      { name: 'Copywriting Studio', detail: 'Write better, faster. Generate first drafts, refine messaging, adapt tone for different audiences.' },
    ],
  },
  {
    id: 'reports',
    label: 'REPORTS',
    boomerLabel: 'REPORTS',
    codename: 'Intel-9 Command Brief',
    boomerCodename: 'Business Intelligence',
    tagline: 'Turn your business data into decisions.',
    access: 'free',
    route: '/intel/reports',
    description:
      'Reports is the intelligence layer — the part of SALARYMAN that helps you understand what\'s actually happening in your business. Connect your data sources, build views that matter, and integrate with the tools you already use.',
    features: [
      { name: 'Business Intelligence', detail: 'Dashboards, charts, and reports built around your actual business metrics. Revenue, pipeline, activity, performance — visualized clearly so you can act on what you see.' },
      { name: 'Zapier Integration', detail: 'Connect SALARYMAN to hundreds of external tools through Zapier. Automate workflows, sync data, and build the integrations your business actually needs.' },
    ],
  },
  {
    id: 'salaryman',
    label: 'SALARYMAN',
    boomerLabel: 'SALARYMAN',
    codename: 'Social Environment',
    boomerCodename: 'Professional Network',
    tagline: 'The corner office was always about who you knew. This is where you know them.',
    access: 'free',
    route: '/world',
    description:
      'SALARYMAN is an immersive social environment for business professionals — a place that feels like the old days, when deals were made over drinks, mentors were found in the next office, and your network was something you actually built in person.',
    features: [
      { name: 'Professional Social Hub', detail: 'Meet other SALARYMAN users in a shared environment. Find peers in your industry, connect with mentors, and build relationships that extend beyond the platform.' },
      { name: 'Factions', detail: 'Align with communities that share your professional values and interests. Find your tribe, build your standing, and operate within a network that actually means something.' },
    ],
  },
  {
    id: 'live_listen',
    label: 'LIVE LISTEN',
    boomerLabel: 'LIVE LISTEN',
    codename: 'Echo-7 Nerve Tap',
    boomerCodename: 'Audio Monitor',
    tagline: 'Real-time audio intercept. AI listens to your meetings and feeds you responses.',
    access: 'paid',
    featureKey: 'live_listen',
    route: '/',
    description:
      'Live Listen monitors your audio environment and surfaces relevant information in real time. During interviews, sales calls, or meetings — it hears what\'s being said and gives you the right thing to say next.',
    features: [
      { name: 'Real-time Transcription', detail: 'Live audio capture and transcription, running continuously during your sessions.' },
      { name: 'AI Response Coaching', detail: 'Instant suggested responses based on what\'s being said — so you never get caught off guard.' },
    ],
  },
  {
    id: 'screen_scan',
    label: 'SCREEN SCAN',
    boomerLabel: 'SCREEN SCAN',
    codename: 'Optic-9 Retinal Scanner',
    boomerCodename: 'Screen Analysis',
    tagline: 'AI sees your screen and identifies code, content, and context instantly.',
    access: 'paid',
    featureKey: 'screen_scan',
    route: '/',
    description:
      'Screen Scan captures what\'s on your screen and breaks it down — code, diagrams, problems, slides. Point it at anything and get an instant, intelligent analysis.',
    features: [
      { name: 'Screen Capture Analysis', detail: 'Automatic screen recognition — identifies code, text, diagrams, and visual content.' },
      { name: 'Context-Aware Responses', detail: 'AI processes what it sees and provides relevant solutions, explanations, or talking points.' },
    ],
  },
  {
    id: 'say_this',
    label: 'SAY THIS',
    boomerLabel: 'SAY THIS',
    codename: 'Vox-4 Larynx Module',
    boomerCodename: 'Speech Coach',
    tagline: 'Real-time speech coaching. AI tells you exactly what to say.',
    access: 'paid',
    featureKey: 'say_this',
    route: '/',
    description:
      'Say This gives you real-time speech coaching during live conversations. Three bullet points on screen, updated continuously — read them aloud and sound like the smartest person in the room.',
    features: [
      { name: 'Live Speech Prompts', detail: '3 bullet points updated in real time — read them naturally during calls, interviews, and meetings.' },
      { name: 'Adaptive Tone', detail: 'Adjusts coaching style based on the conversation context — formal, casual, technical, persuasive.' },
    ],
  },
  {
    id: 'phone_system',
    label: 'PHONE SYSTEM',
    boomerLabel: 'PHONE SYSTEM',
    codename: 'Calll Home',
    boomerCodename: 'Business Phone',
    tagline: 'Unlimited predictive dialing & text messaging for business partners.',
    access: 'paid',
    featureKey: 'phone_system',
    route: '/phone/dialer',
    description:
      'A complete phone system built for outbound sales and marketing. Predictive dialing, SMS campaigns, AI call coaching, voicemail, and conference calling — everything you need to run a professional phone operation.',
    features: [
      { name: 'Predictive Dialer', detail: 'Automated dialing with smart pacing. Maximize connect rates and minimize idle time.' },
      { name: 'SMS Campaigns', detail: 'Send and manage text message campaigns at scale. Templates, scheduling, and opt-out management built in.' },
      { name: 'AI Call Coaching', detail: 'Real-time coaching during live calls. Get prompts, objection handling, and closing techniques on screen.' },
      { name: 'Conference Calling', detail: 'Multi-party calls with recording, transcription, and follow-up automation.' },
    ],
  },
  {
    id: 'claw_bot',
    label: 'JEAN CLAW',
    boomerLabel: 'JEAN CLAW',
    codename: 'OpenClaw Multi-Agent Suite',
    boomerCodename: 'AI Multi-Agent Platform',
    tagline: '77 specialized bots. One subscription. Jean Claw manages the team. Deploy across every channel.',
    access: 'paid',
    featureKey: 'claw_bot',
    route: '/bots',
    flagship: true,
    description:
      'Jean Claw ($145/mo) is the manager of the Bot Factory — 77 specialized bots under one subscription. Sales, support, creative, finance, legal, music, publishing, ecommerce, trades, and more. Jean Claw assigns the right bot to every job. Also includes the Pablo Call Agent and AI Secretary. Deploy across Telegram, WhatsApp, Discord, Facebook, email, LinkedIn, and more.',
    features: [
      { name: 'AI Sales Closer', detail: 'Your 24/7 sales machine. Qualifies inbound leads with custom scoring criteria, handles objections using proven frameworks (SPIN, Challenger, MEDDIC), books meetings directly into your calendar, sends personalized follow-up sequences, and moves prospects through your entire pipeline — from first touch to closed deal. Integrates with HubSpot, Salesforce, Pipedrive, and custom CRMs.', status: 'live', channels: ['Telegram', 'WhatsApp', 'Email', 'Web Chat'] },
      { name: 'Customer Support Agent', detail: 'Enterprise-grade AI support that actually resolves issues. Handles tier-1 and tier-2 tickets autonomously, answers FAQs from your knowledge base, processes refunds and exchanges, creates and tracks support tickets, and escalates complex cases to human agents with full context. Supports 95+ languages. Average resolution time under 30 seconds. Learns from every interaction.', status: 'live', channels: ['Telegram', 'WhatsApp', 'Discord', 'Email', 'Web Chat'] },
      { name: 'Content Writer', detail: 'A complete content engine that writes in your brand voice. Produces blog posts (800-3000 words), social media captions optimized per platform, ad copy for Google/Meta/LinkedIn, email campaigns with A/B variants, product descriptions, press releases, and newsletter content. Supports content calendars, SEO optimization, tone matching, and multi-language output. Publishes directly to WordPress, Ghost, and social schedulers.', status: 'live', channels: ['Email', 'Web Chat'] },
      { name: 'AI Recruiter', detail: 'Your autonomous hiring pipeline. Screens inbound applications against role requirements, conducts structured first-round interviews via chat, evaluates candidate fit using customizable rubrics, generates detailed candidate scorecards, and schedules follow-up interviews with your team. Reduces time-to-hire by 70%. Integrates with Greenhouse, Lever, Workday, and ATS platforms.', status: 'live', channels: ['Telegram', 'WhatsApp', 'Email', 'Web Chat'] },
      { name: 'LinkedIn Prospector', detail: 'Surgical B2B lead generation. Finds decision-makers by job title, seniority, industry, company size, geography, tech stack, and funding stage. Builds verified contact lists with email and phone data. Enriches profiles with company intel, recent activity, and mutual connections. Auto-populates your CRM with tagged, scored, and sequenced leads. Respects daily connection limits and platform guidelines.', status: 'live', channels: ['LinkedIn', 'Email'] },
      { name: 'Facebook & Instagram Scout', detail: 'Social intelligence at scale. Monitors Facebook Groups, Pages, and Instagram business profiles for buying signals, competitor mentions, and industry trends. Identifies business leads from post engagement, comments, and DMs. Surfaces opportunities tagged by intent level (hot/warm/cold) and queues them in your CRM with full context. Tracks competitor ad spend and creative strategies.', status: 'live', channels: ['Facebook', 'Instagram'] },
      { name: 'Automated Trading Bot', detail: 'Algorithmic trading connected to Charles Schwab thinkorswim. Executes stock and options strategies including covered calls, iron condors, momentum plays, and mean reversion. Paper Trading mode enabled by default with full risk controls — position sizing, stop losses, daily loss limits, and max drawdown protection. Real-time P&L tracking, trade journaling, and performance analytics. Upgrade to live trading when ready.', status: 'live', channels: ['thinkorswim'] },
    ],
  },
];

const FREE_MODULES = MODULES.filter((m) => m.access === 'free');
const PAID_MODULES = MODULES.filter((m) => m.access === 'paid');

function AccessBadge({ access, featureKey, trials }: { access: ModuleAccess; featureKey?: FeatureKey; trials: { featureKey: string; daysLeft: number }[] }) {
  if (access === 'free') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase bg-sky-500/15 border border-sky-500/30 text-sky-400">
        <Check className="w-2.5 h-2.5" />
        FREE
      </span>
    );
  }

  const trial = featureKey ? trials.find((t) => t.featureKey === featureKey) : undefined;
  if (trial) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
        <Clock className="w-2.5 h-2.5" />
        {trial.daysLeft}D TRIAL
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-400">
      <Lock className="w-2.5 h-2.5" />
      PREMIUM
    </span>
  );
}

function ModuleCard({
  module,
  index,
  onStartTrial,
  trials,
  hasFeatureAccess,
  boomer,
}: {
  module: ModuleDef;
  index: number;
  onStartTrial: (featureKey: FeatureKey) => void;
  trials: { featureKey: string; daysLeft: number }[];
  hasFeatureAccess: (featureKey: FeatureKey) => boolean;
  boomer: boolean;
}) {
  const [, navigate] = useLocation();

  const trial = module.featureKey ? trials.find((t) => t.featureKey === module.featureKey) : undefined;
  const hasPaidAccess = module.featureKey ? hasFeatureAccess(module.featureKey) : false;
  const canAccess = module.access === 'free' || !!trial || hasPaidAccess;

  const displayLabel = boomer && module.boomerLabel ? module.boomerLabel : module.label;
  const displayCodename = boomer && module.boomerCodename ? module.boomerCodename : module.codename;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 + index * 0.03 }}
      className="rounded-xl border border-white/8 bg-white/[0.025] p-6 flex flex-col"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
          {displayCodename}
        </div>
        <AccessBadge access={module.access} featureKey={module.featureKey} trials={trials} />
      </div>
      <div className="font-['Share_Tech_Mono',monospace] text-sm text-zinc-100 tracking-widest uppercase mb-1.5">
        {displayLabel}
      </div>
      <p className="text-xs text-zinc-500 italic mb-4 leading-relaxed">
        {module.tagline}
      </p>

      <div className="w-full h-px bg-white/6 mb-4" />

      <p className="text-xs text-zinc-600 leading-relaxed mb-5">
        {module.description}
      </p>

      <div className="w-full h-px bg-white/4 mb-4" />

      <ul className="flex flex-col gap-3 mb-5">
        {module.features.map((f) => (
          <li key={f.name}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sky-500/50 text-[10px]">▸</span>
              <span className="text-[11px] font-mono text-zinc-300 uppercase tracking-wider">
                {f.name}
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed ml-4">
              {f.detail}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {module.access === 'free' && module.route && (
          <button
            onClick={() => navigate(module.route!)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-mono uppercase tracking-wider hover:bg-sky-500/20 hover:border-sky-500/40 transition-all"
          >
            Use Now <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {module.access === 'paid' && canAccess && module.route && (
          <button
            onClick={() => navigate(module.route!)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-xs font-mono uppercase tracking-wider hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all"
          >
            Open {trial ? `(${trial.daysLeft}d trial)` : ''} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {module.access === 'paid' && !canAccess && module.featureKey && (
          <button
            onClick={() => onStartTrial(module.featureKey!)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono uppercase tracking-wider hover:bg-amber-500/20 hover:border-amber-500/40 transition-all"
          >
            Start Free Trial <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

const JEAN_CLAW_SKILL_ICONS: Record<string, typeof Target> = {
  'AI Sales Closer': Target,
  'Customer Support Agent': MessageSquare,
  'Content Writer': PenTool,
  'AI Recruiter': Users,
  'LinkedIn Prospector': Search,
  'Facebook & Instagram Scout': Eye,
  'Automated Trading Bot': TrendingUp,
};

const DEPLOYMENT_CHANNELS = [
  { name: 'Telegram', emoji: '✈️' },
  { name: 'WhatsApp', emoji: '💬' },
  { name: 'Discord', emoji: '🎮' },
  { name: 'Facebook', emoji: '📘' },
  { name: 'Instagram', emoji: '📸' },
  { name: 'Email', emoji: '📧' },
  { name: 'LinkedIn', emoji: '💼' },
  { name: 'Web Chat', emoji: '🌐' },
  { name: 'thinkorswim', emoji: '📈' },
];

function JeanClawHero({
  module,
  onStartTrial,
  trials,
  hasFeatureAccess,
  boomer,
}: {
  module: ModuleDef;
  onStartTrial: (featureKey: FeatureKey) => void;
  trials: { featureKey: string; daysLeft: number }[];
  hasFeatureAccess: (featureKey: FeatureKey) => boolean;
  boomer: boolean;
}) {
  const [, navigate] = useLocation();
  const trial = module.featureKey ? trials.find((t) => t.featureKey === module.featureKey) : undefined;
  const hasPaidAccess = module.featureKey ? hasFeatureAccess(module.featureKey) : false;
  const canAccess = !!trial || hasPaidAccess;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-emerald-500/[0.02] overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-60 h-60 bg-emerald-500/3 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-wide"
                    style={boomer ? {} : { fontFamily: "'VT323', monospace", letterSpacing: '0.08em', fontSize: '1.8rem' }}>
                    {boomer ? 'Jean Claw' : 'JEAN CLAW'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    {canAccess ? '// ACTIVE' : 'FLAGSHIP'}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-emerald-500/60 tracking-widest uppercase mt-0.5">
                  {boomer ? 'AI Multi-Agent Platform' : 'OpenClaw Multi-Agent Suite'}
                </p>
              </div>
            </div>

            <p className="text-sm text-zinc-400 italic mb-3 max-w-2xl">
              {module.tagline}
            </p>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-3xl">
              {module.description}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <span className="text-3xl font-bold text-emerald-400">$145</span>
              <span className="text-xs text-zinc-500 ml-1">/ month</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-600 tracking-wider">
              <Shield className="w-3 h-3" /> 77 BOTS INCLUDED
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-emerald-500/10 mb-6" />

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest"
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'Agent Skills — Tested & Operational' : 'AGENT SKILLS // ALL TESTED & OPERATIONAL'}
            </span>
            <div className="flex-1 h-px bg-emerald-500/10" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {module.features.map((feature, i) => {
              const SkillIcon = JEAN_CLAW_SKILL_ICONS[feature.name] || Bot;
              return (
                <motion.div
                  key={feature.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-4 hover:border-emerald-500/20 transition-colors"
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center shrink-0">
                      <SkillIcon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider"
                          style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {feature.name}
                        </h4>
                        {feature.status === 'live' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mb-2.5">
                    {feature.detail}
                  </p>
                  {feature.channels && feature.channels.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <Globe className="w-3 h-3 text-zinc-700 shrink-0" />
                      {feature.channels.map(ch => (
                        <span key={ch} className="px-1.5 py-0.5 rounded text-[8px] text-zinc-600 border border-zinc-800/50 bg-zinc-900/50"
                          style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="w-full h-px bg-emerald-500/10 mb-5" />

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest"
              style={boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }}>
              {boomer ? 'Deployment Channels' : 'DEPLOYMENT CHANNELS // MULTI-PLATFORM MESH'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEPLOYMENT_CHANNELS.map(ch => (
              <div key={ch.name}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] hover:border-emerald-500/20 transition-colors">
                <span className="text-sm">{ch.emoji}</span>
                <span className="text-[10px] font-mono text-zinc-400 tracking-wider">{ch.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-600 tracking-wider">
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/50" /> Pablo Call Agent</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/50" /> AI Secretary</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/50" /> All Premium Bots</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/50" /> Future Agents</span>
          </div>
        </div>

        <div className="mt-5">
          {canAccess && module.route ? (
            <button
              onClick={() => navigate(module.route!)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-mono uppercase tracking-wider hover:bg-emerald-500/25 hover:border-emerald-500/40 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {boomer ? 'Open Bot Factory' : 'ENTER BOT FACTORY'} {trial ? `(${trial.daysLeft}d trial)` : ''} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : module.featureKey ? (
            <button
              onClick={() => onStartTrial(module.featureKey!)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Zap className="w-4 h-4" />
              {boomer ? 'Start Free Trial' : 'ACTIVATE 7-DAY TRIAL'} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function TrialModal({
  featureKey,
  onClose,
  onSuccess,
}: {
  featureKey: FeatureKey;
  onClose: () => void;
  onSuccess: (featureKey: FeatureKey) => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const featureNames: Record<FeatureKey, string> = {
    live_listen: 'Live Listen',
    screen_scan: 'Screen Scan',
    say_this: 'Say This',
    phone_system: 'Phone System',
    claw_bot: 'Pixel Agents',
  };

  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/trials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), featureKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.upgrade) {
          onClose();
          navigate('/pricing');
          return;
        }
        throw new Error(data.error ?? 'Failed to start trial');
      }
      setSuccess(true);
      invalidatePlanCache();
      setTimeout(() => onSuccess(featureKey), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111113] p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-['Share_Tech_Mono',monospace] text-sm text-zinc-100 tracking-widest uppercase">
            Start Free Trial
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-6"
          >
            <div className="w-12 h-12 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-sky-400" />
            </div>
            <p className="text-sm text-zinc-200 font-medium mb-1">Trial Activated</p>
            <p className="text-xs text-zinc-500">
              You have 7 days of free access to {featureNames[featureKey]}. Redirecting...
            </p>
          </motion.div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Enter your email to start a <span className="text-zinc-300">7-day free trial</span> of{' '}
              <span className="text-zinc-300">{featureNames[featureKey]}</span>. No credit card required.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 px-1">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-[#09090b] font-semibold text-sm hover:bg-sky-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Start 7-Day Trial <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-[10px] text-zinc-700 mt-3 text-center">
              After the trial, you can subscribe to continue access.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Features() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { features, isOwner, trials } = usePlan();
  const [trialModal, setTrialModal] = useState<FeatureKey | null>(null);
  const [boomer] = useBoomerMode();

  const trialList = trials.map((t) => ({ featureKey: t.featureKey, daysLeft: t.daysLeft }));

  const hasFeatureAccess = (fk: FeatureKey) => isOwner || features.has(fk);

  const handleTrialSuccess = (featureKey: FeatureKey) => {
    setTrialModal(null);
    const mod = MODULES.find((m) => m.featureKey === featureKey);
    if (mod?.route) navigate(mod.route);
  };

  return (
    <div className="min-h-screen bg-[#09090b] relative overflow-x-hidden">
      <style>{`
        .features-grid { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 1100px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 680px) { .features-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-sky-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-12 pb-20">

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="flex items-center justify-between mb-10"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="w-px h-5 bg-white/8" />
            <div>
              <h1 className="font-['Share_Tech_Mono',monospace] text-lg text-zinc-100 tracking-widest uppercase">Platform Overview</h1>
              <p className="text-[11px] font-mono text-zinc-600 tracking-widest mt-0.5">{MODULES.length} modules · {FREE_MODULES.length} free · {PAID_MODULES.length} premium</p>
            </div>
          </div>

          <motion.button
            onClick={login}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 text-[#09090b] font-semibold text-sm hover:bg-sky-400 transition-colors"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-sky-500/60" />
            <h2 className="font-['Share_Tech_Mono',monospace] text-sm text-zinc-300 tracking-widest uppercase">Free Modules</h2>
            <span className="text-[10px] font-mono text-zinc-700 tracking-wider">— included with every account</span>
          </div>
          <div className="grid features-grid gap-4">
            {FREE_MODULES.map((module, index) => (
              <ModuleCard
                key={module.id}
                module={module}
                index={index}
                onStartTrial={() => {}}
                trials={trialList}
                hasFeatureAccess={hasFeatureAccess}
                boomer={boomer}
              />
            ))}
          </div>
        </div>

        <div className="w-full h-px bg-white/6 my-10" />

        {(() => {
          const jeanClawModule = PAID_MODULES.find(m => m.flagship);
          const otherPaidModules = PAID_MODULES.filter(m => !m.flagship);
          return (
            <>
              {jeanClawModule && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-pulse" />
                    <h2 className="font-['Share_Tech_Mono',monospace] text-sm text-emerald-300 tracking-widest uppercase">
                      {boomer ? 'Jean Claw — Pixel Agents Bot Factory Manager' : 'PIXEL AGENTS // 77 BOTS · ONE SUBSCRIPTION'}
                    </h2>
                    <div className="flex-1 h-px bg-emerald-500/15" />
                    <span className="text-[10px] font-mono text-emerald-500/40 tracking-wider">$145/mo</span>
                  </div>
                  <JeanClawHero
                    module={jeanClawModule}
                    onStartTrial={(fk) => setTrialModal(fk)}
                    trials={trialList}
                    hasFeatureAccess={hasFeatureAccess}
                    boomer={boomer}
                  />
                </div>
              )}

              {otherPaidModules.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                    <h2 className="font-['Share_Tech_Mono',monospace] text-sm text-zinc-300 tracking-widest uppercase">Premium Modules</h2>
                    <span className="text-[10px] font-mono text-zinc-700 tracking-wider">— 7-day free trial available</span>
                  </div>
                  <div className="grid features-grid gap-4">
                    {otherPaidModules.map((module, index) => (
                      <ModuleCard
                        key={module.id}
                        module={module}
                        index={index}
                        onStartTrial={(fk) => setTrialModal(fk)}
                        trials={trialList}
                        hasFeatureAccess={hasFeatureAccess}
                        boomer={boomer}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-4 text-center"
        >
          <button
            onClick={login}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-sky-500 text-[#09090b] font-semibold text-sm hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/15"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Back to home
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {trialModal && (
          <TrialModal
            featureKey={trialModal}
            onClose={() => setTrialModal(null)}
            onSuccess={handleTrialSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
