import {
  Terminal, Code2, Briefcase, Layers, BarChart2,
  Users, CalendarDays, Archive, FileText, TrendingUp,
  Megaphone, Music2, Palette, LayoutDashboard, Bot, Target,
  PhoneCall, Search, Phone, Radio, Settings,
  Voicemail, Hash, Zap, Clock, DollarSign, Receipt, CreditCard, Scale,
  Store, FolderOpen, PenTool, Video, Crosshair, BookOpen, Clapperboard,
  Shield, Link2, ClipboardList, Timer,
  Key, Webhook, Globe, Network, ShieldCheck, Building2, UserCog,
  User, Eye, AlertTriangle, Brain, Share2,
  GraduationCap, Landmark, Ruler, Banknote,
} from 'lucide-react';
import { isGameOnlyBrowserPath } from './game-release';

export type Module = {
  id: string;
  path: string;
  label: string;
  codename: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultPath: string;
  subs: SubItem[];
};

export type SubItem = {
  id: string;
  path: string;
  label: string;
  boomerLabel: string;
  codename: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const MODULES: Module[] = [
  {
    id: 'pablo',
    path: '/pablo',
    label: 'Pablo',
    codename: 'PABLO',
    icon: Terminal,
    defaultPath: '/pablo',
    subs: [
      { id: 'pablo-deck', path: '/pablo/deck', label: 'PABLO DECK', boomerLabel: 'PABLO DECK', codename: 'PABLO-DECK', icon: Layers },
    ],
  },
  {
    id: 'office',
    path: '/office',
    label: 'OFFICE',
    codename: 'HQ-CORE',
    icon: Building2,
    defaultPath: '/office',
    subs: [],
  },
  {
    id: 'phone',
    path: '/phone',
    label: 'CALLL HOME',
    codename: 'CALLL HOME',
    icon: Phone,
    defaultPath: '/phone',
    subs: [
      { id: 'voice-coach', path: '/phone/coach', label: 'VOICE COACH', boomerLabel: 'VOICE COACH', codename: 'COACH', icon: Bot },
      { id: 'dialer', path: '/phone/dialer', label: 'DIALER', boomerLabel: 'DIALER', codename: 'DIAL-PAD', icon: PhoneCall },
      { id: 'contacts', path: '/phone/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'COMM-BOOK', icon: Users },
      { id: 'active', path: '/phone/active', label: 'ACTIVE CALLS', boomerLabel: 'ACTIVE CALLS', codename: 'LIVE-OPS', icon: Zap },
      { id: 'history', path: '/phone/history', label: 'CALL LOG', boomerLabel: 'CALL LOG', codename: 'CHRONO-LOG', icon: Clock },
      { id: 'voicemail', path: '/phone/voicemail', label: 'VOICEMAIL', boomerLabel: 'VOICEMAIL', codename: 'V-MAIL', icon: Voicemail },
      { id: 'conference', path: '/phone/conference', label: 'CONFERENCE', boomerLabel: 'CONFERENCE', codename: 'CONF-ROOM', icon: Users },
      { id: 'sessions', path: '/phone/sessions', label: 'DIALING SESSIONS', boomerLabel: 'DIALING SESSIONS', codename: 'AUTO-DIAL', icon: Radio },
      { id: 'numbers', path: '/phone/numbers', label: 'PHONE NUMBERS', boomerLabel: 'PHONE NUMBERS', codename: 'NUM-VAULT', icon: Hash },
    ],
  },
  {
    id: 'bots',
    path: '/business/autopilot',
    label: 'PABLO PRIME',
    codename: 'PABLO PRIME',
    icon: Bot,
    defaultPath: '/business/autopilot',
    subs: [],
  },
  {
    id: 'crm',
    path: '/business/crm',
    label: 'CRM',
    codename: 'CRM',
    icon: Users,
    defaultPath: '/business/crm',
    subs: [
      { id: 'crm-leads', path: '/marketing/leads', label: 'LEADS', boomerLabel: 'LEADS', codename: 'LEAD-DATABASE', icon: Target },
      { id: 'crm-lead-capture', path: '/business/contacts', label: 'LEAD CAPTURE', boomerLabel: 'LEAD CAPTURE', codename: 'CONTACT-IMPORT', icon: Users },
      { id: 'crm-deals', path: '/business/deals', label: 'DEALS', boomerLabel: 'DEALS', codename: 'PIPELINE-X', icon: TrendingUp },
    ],
  },
  {
    id: 'console',
    path: '/console',
    label: 'TERMINAL',
    codename: 'CIPHER-X',
    icon: Code2,
    defaultPath: '/console',
    subs: [
      { id: 'terminal', path: '/console', label: 'SOLVER', boomerLabel: 'SOLVER', codename: 'CIPHER-X', icon: Code2 },
      { id: 'video', path: '/console/video', label: 'VIDEO INTEL', boomerLabel: 'VIDEO ANALYZER', codename: 'VID-SCAN', icon: Video },
      { id: 'vault', path: '/creative/media?tab=knowledge', label: 'DATA VAULT', boomerLabel: 'DATA VAULT', codename: 'NEXUS-V', icon: Brain },
      { id: 'scraper', path: '/console/scraper', label: 'SCRAPER', boomerLabel: 'WEB SCRAPER', codename: 'SIGNAL-INT', icon: Globe },
    ],
  },
  {
    id: 'business',
    path: '/business',
    label: 'BUSINESS',
    codename: 'OPS-CORE',
    icon: Briefcase,
    defaultPath: '/business',
    subs: [
      { id: 'office', path: '/office', label: 'OFFICE', boomerLabel: 'THE OFFICE', codename: 'HQ-VIEW', icon: Building2 },
      { id: 'marketplace', path: '/business/marketplace', label: 'MARKETPLACE', boomerLabel: 'BUSINESS MARKETPLACE', codename: 'BIZ-MART', icon: Store },
      { id: 'team', path: '/business/team', label: 'TEAM', boomerLabel: 'TEAM DIRECTORY', codename: 'ROSTER-X', icon: Users },
      { id: 'hiring', path: '/business/hiring', label: 'HIRING', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
      { id: 'org', path: '/organizations', label: 'ORGANIZATION', boomerLabel: 'ORGANIZATION', codename: 'ORG-CORE', icon: Network },
      { id: 'resume', path: '/business/resume', label: 'RESUME', boomerLabel: 'RESUME BUILDER', codename: 'CV-FORGE', icon: FileText },
      { id: 'job-command', path: '/business/job-command', label: 'JOB CENTER', boomerLabel: 'JOB COMMAND CENTER', codename: 'JCC', icon: Crosshair },
      { id: 'tasks', path: '/business/tasks', label: 'TASKS', boomerLabel: 'TASK BOARD', codename: 'TASK-OPS', icon: ClipboardList },
      { id: 'time-tracking', path: '/business/time-tracking', label: 'TIME', boomerLabel: 'TIME TRACKING', codename: 'CHRONO-7', icon: Timer },
      { id: 'announcements', path: '/business/announcements', label: 'ANNOUNCE', boomerLabel: 'ANNOUNCEMENTS', codename: 'BROADCAST', icon: Megaphone },
      { id: 'calendar', path: '/business/calendar', label: 'CALENDAR', boomerLabel: 'CALENDAR', codename: 'CHRONO-4', icon: CalendarDays },
      { id: 'documents', path: '/business/documents', label: 'DOCUMENTS', boomerLabel: 'DOCUMENTS', codename: 'INK-6', icon: Archive },
      { id: 'deals', path: '/business/deals', label: 'DEALS', boomerLabel: 'DEALS', codename: 'PIPELINE-X', icon: TrendingUp },
      { id: 'invoices', path: '/business/invoices', label: 'INVOICES', boomerLabel: 'INVOICES', codename: 'LEDGER-3', icon: FileText },
      { id: 'estimates', path: '/business/estimates', label: 'ESTIMATES', boomerLabel: 'ESTIMATES & QUOTES', codename: 'QUOTE-X', icon: FileText },
      { id: 'payroll', path: '/business/payroll', label: 'PAYROLL', boomerLabel: 'PAYROLL', codename: 'PAYMASTER-7', icon: DollarSign },
      { id: 'bills', path: '/business/bills', label: 'BILLS', boomerLabel: 'BILLS', codename: 'PAYABLE-X', icon: Receipt },
      { id: 'expenses', path: '/business/expenses', label: 'EXPENSES', boomerLabel: 'EXPENSES', codename: 'SPEND-TRACK', icon: CreditCard },
      { id: 'vendors', path: '/business/vendors', label: 'VENDORS', boomerLabel: 'VENDOR DIRECTORY', codename: 'SUPPLY-9', icon: Store },
      { id: 'profit-loss', path: '/business/profit-loss', label: 'P&L', boomerLabel: 'PROFIT & LOSS', codename: 'MARGIN-X', icon: TrendingUp },
      { id: 'accounts', path: '/business/accounts', label: 'ACCOUNTS', boomerLabel: 'ORG ACCOUNTS', codename: 'TREASURY-X', icon: Banknote },
      { id: 'balance-sheet', path: '/business/balance-sheet', label: 'BALANCE SHEET', boomerLabel: 'BALANCE SHEET', codename: 'NETWORTH-X', icon: Scale },
      { id: 'accounting', path: '/business/accounting', label: 'ACCOUNTING', boomerLabel: 'ACCOUNTING & LEDGERS', codename: 'GL-CORE', icon: BookOpen },
      { id: 'taxes', path: '/business/taxes', label: 'TAXES', boomerLabel: 'TAX ESTIMATOR', codename: 'TAX-1040', icon: Landmark },
    ],
  },
  {
    id: 'creative',
    path: '/creative',
    label: 'CREATIVE',
    codename: 'FORGE MATRIX',
    icon: Layers,
    defaultPath: '/creative/design',
    subs: [
      // AUDIO group (left)
      { id: 'lab', path: '/1999', label: '1999', boomerLabel: '1999', codename: '1999', icon: Music2 },
      { id: 'stems', path: '/1999/stems', label: 'STEM PLAYER', boomerLabel: 'STEM PLAYER', codename: 'STEM-X', icon: Music2 },
      // WRITING (middle)
      { id: 'writer', path: '/creative/writer', label: 'HEMINGWAY', boomerLabel: 'HEMINGWAY', codename: 'HEMINGWAY', icon: PenTool },
      // PHOTOS / VISUAL group (right)
      { id: 'darkroom', path: '/creative/darkroom', label: 'DARK ROOM', boomerLabel: 'DARK ROOM', codename: 'DARK ROOM', icon: Clapperboard },
      { id: 'design', path: '/creative/design', label: 'DESIGN STUDIO', boomerLabel: 'DESIGN STUDIO', codename: 'DESIGN-FORGE', icon: Palette },
      { id: 'brand', path: '/creative/brand', label: 'BRAND KIT', boomerLabel: 'BRAND KIT', codename: 'BRAND-CORE', icon: Palette },
      { id: 'media', path: '/creative/media', label: 'DATA VAULT', boomerLabel: 'DATA VAULT', codename: 'VAULT-X', icon: FolderOpen },
      { id: 'schematic', path: '/creative/schematic', label: 'CAD & BLUEPRINT READER', boomerLabel: 'CAD & BLUEPRINT READER', codename: 'DRAFT-X', icon: Ruler },
      // EDUCATION
      { id: 'classroom', path: '/creative/classroom', label: 'MEETING ROOM', boomerLabel: 'MEETING ROOM', codename: 'ACADEMY', icon: GraduationCap },
    ],
  },
  {
    id: 'marketing',
    path: '/marketing',
    label: 'MARKETING',
    codename: 'SIGNAL CORPS',
    icon: Megaphone,
    defaultPath: '/marketing/campaigns',
    subs: [
      { id: 'campaigns', path: '/marketing/campaigns', label: 'CAMPAIGNS', boomerLabel: 'CAMPAIGNS', codename: 'SIGNAL-5', icon: Megaphone },
      { id: 'social', path: '/marketing/social', label: 'SOCIAL', boomerLabel: 'SOCIAL MEDIA', codename: 'SIGNAL-7', icon: Share2 },
      { id: 'seo', path: '/marketing/seo', label: 'SEO', boomerLabel: 'SEO', codename: 'CRAWL-X', icon: Search },
      { id: 'brand', path: '/creative/brand', label: 'BRAND KIT', boomerLabel: 'BRAND KIT', codename: 'BRAND-CORE', icon: Palette },
      { id: 'reports', path: '/intel/reports', label: 'REPORTS', boomerLabel: 'REPORTS', codename: 'INTEL-9', icon: BarChart2 },
      { id: 'goals', path: '/intel/goals', label: 'GOALS', boomerLabel: 'GOALS', codename: 'OBJECTIVE-7', icon: Target },
    ],
  },
  {
    id: 'armory',
    path: '/armory',
    label: 'ARMORY',
    codename: 'QUARTERMASTER',
    icon: Shield,
    defaultPath: '/armory',
    subs: [
      { id: 'armory-store', path: '/armory', label: 'STORE', boomerLabel: 'GEAR STORE', codename: 'QM-STORE', icon: Store },
      { id: 'armory-inventory', path: '/armory/inventory', label: 'INVENTORY', boomerLabel: 'MY INVENTORY', codename: 'QM-VAULT', icon: Archive },
    ],
  },
  {
    id: 'marketplace',
    path: '/marketplace',
    label: 'MARKET',
    codename: 'CROSS-CITY EXCHANGE',
    icon: Store,
    defaultPath: '/marketplace',
    subs: [
      { id: 'marketplace-home', path: '/marketplace', label: 'MARKETPLACE', boomerLabel: 'MARKETPLACE', codename: 'X-CITY-MART', icon: Store },
    ],
  },
];

export const PROFILE_MODULES: SubItem[] = [
  { id: 'profile-account', path: '/profile', label: 'PROFILE', boomerLabel: 'MY PROFILE', codename: 'IDENTITY', icon: User },
  { id: 'profile-settings', path: '/settings', label: 'SETTINGS', boomerLabel: 'SETTINGS', codename: 'CONTROL', icon: Settings },
  { id: 'profile-admin', path: '/profile/admin', label: 'ADMIN', boomerLabel: 'ADMIN PANEL', codename: 'COMMAND', icon: ShieldCheck },
  { id: 'profile-platform', path: '/platform', label: 'PLATFORM', boomerLabel: 'PLATFORM API', codename: 'NEXUS-API', icon: Network },
  { id: 'profile-moderator', path: '/profile/moderator', label: 'MODERATOR', boomerLabel: 'MODERATOR', codename: 'WATCHTOWER', icon: Eye },
];

export const ADMIN_SUBS: SubItem[] = [
  { id: 'admin-users', path: '/profile/admin', label: 'USERS', boomerLabel: 'USERS', codename: 'ROSTER', icon: Users },
  { id: 'admin-orgs', path: '/profile/admin?tab=orgs', label: 'BUSINESSES', boomerLabel: 'BUSINESSES', codename: 'ORGS', icon: Building2 },
  { id: 'admin-roles', path: '/profile/admin?tab=roles', label: 'ROLES & PERMISSIONS', boomerLabel: 'ROLES & PERMISSIONS', codename: 'ACCESS', icon: UserCog },
  { id: 'admin-moderators', path: '/profile/admin?tab=moderators', label: 'MODERATORS', boomerLabel: 'MODERATORS', codename: 'WATCHTOWER', icon: Eye },
  { id: 'admin-bans', path: '/profile/admin?tab=bans', label: 'BANS', boomerLabel: 'BANS & SUSPENSIONS', codename: 'EXILE', icon: AlertTriangle },
  { id: 'admin-tickets', path: '/profile/admin/tickets', label: 'TICKETS', boomerLabel: 'SUPPORT TICKETS', codename: 'TICKETS', icon: FileText },
  { id: 'admin-billboards', path: '/profile/admin/billboards', label: 'BILLBOARDS', boomerLabel: 'BILLBOARDS', codename: 'ADS', icon: LayoutDashboard },
  { id: 'admin-tasks', path: '/profile/admin/dev-tasks', label: 'DEV TASKS', boomerLabel: 'DEV TASKS', codename: 'TASKS', icon: Crosshair },
];

export const SETTINGS_MODULES: SubItem[] = [
  { id: 'plat-overview', path: '/platform', label: 'PLATFORM', boomerLabel: 'PLATFORM', codename: 'NEXUS-API', icon: Network },
  { id: 'plat-keys', path: '/platform?tab=keys', label: 'API KEYS', boomerLabel: 'API KEYS', codename: 'KEYS', icon: Key },
  { id: 'plat-webhooks', path: '/platform?tab=webhooks', label: 'WEBHOOKS', boomerLabel: 'WEBHOOKS', codename: 'HOOKS', icon: Webhook },
  { id: 'plat-endpoints', path: '/platform?tab=endpoints', label: 'ENDPOINTS', boomerLabel: 'ENDPOINTS', codename: 'DOCS', icon: FileText },
  { id: 'plat-apps', path: '/platform?tab=apps', label: 'APPS', boomerLabel: 'APPS', codename: 'APPS', icon: Globe },
];

export function getModuleForPath(pathname: string): Module | null {
  if (isGameOnlyBrowserPath(pathname)) return null;

  const module = (id: string) => MODULES.find((candidate) => candidate.id === id) ?? null;

  if (pathname === '/hummingbird' || pathname.startsWith('/workspace')) return null;
  if (pathname === '/pablo/deck') return module('pablo');
  if (pathname === '/pablo') return module('pablo');
  if (pathname === '/1999' || pathname.startsWith('/1999/')) return module('creative');
  if (pathname === '/phone/secretary' ||
      pathname === '/bots/ad-studio' || pathname === '/marketing/ads') return module('bots');

  if (pathname.startsWith('/phone')) return module('phone');

  if (pathname === '/business/autopilot' || pathname.startsWith('/bots') ||
      pathname === '/agents' || pathname === '/console/agents') return module('bots');

  // Lead and deal routes are part of CRM even where legacy URLs remain.
  if (pathname === '/business/crm' || pathname.startsWith('/business/crm/') ||
      pathname === '/business/contacts' || pathname === '/business/deals' ||
      pathname === '/contacts' || pathname === '/leads' ||
      pathname === '/marketing/leads' || pathname.startsWith('/marketing/leads/')) return module('crm');

  if (pathname === '/console' || pathname.startsWith('/console/')) return module('console');
  if (pathname.startsWith('/business') || pathname.startsWith('/insurance')) return module('business');
  if (pathname === '/intel/reports' || pathname === '/intel/goals' || pathname.startsWith('/intel/seo')) return module('marketing');
  if (pathname === '/intel/dashboard') return null;
  if (pathname.startsWith('/creative/brand')) return module('marketing');
  if (pathname.startsWith('/creative')) return module('creative');
  if (pathname.startsWith('/marketing')) return module('marketing');
  if (pathname === '/org' || pathname.startsWith('/org/') ||
      pathname === '/organizations' || pathname.startsWith('/organizations/')) return module('business');
  if (pathname === '/marketplace') return module('marketplace');
  return null;
}
