import {
  Terminal, Code2, Briefcase, Layers, BarChart2,
  Users, CalendarDays, Archive, FileText, TrendingUp,
  Megaphone, Music2, Palette, LayoutDashboard, Bot, Target,
  PhoneCall, Search, Phone, Radio, Settings,
  Voicemail, Hash, Zap, Clock, DollarSign, Receipt, CreditCard, Scale,
  Store, FolderOpen, PenTool, Video, Crosshair, BookOpen, Clapperboard,
  Shield, Link2, ClipboardList, Timer,
  Key, Webhook, Globe, Network, ShieldCheck, Building2, UserCog,
  User, Eye, Map, AlertTriangle, Activity, Brain, Share2,
  GraduationCap, Landmark, Ruler, Banknote, Coins, ShoppingBag,
} from 'lucide-react';

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
      { id: 'pablo-deck', path: '/pablo/deck', label: 'PABLO DECK', boomerLabel: 'PABLO DECK', codename: 'DECK-X', icon: Layers },
    ],
  },
  {
    id: 'office',
    path: '/office',
    label: 'OFFICE',
    codename: 'HQ-CORE',
    icon: Building2,
    defaultPath: '/office',
    subs: [
      { id: 'office-floor', path: '/office', label: 'THE OFFICE', boomerLabel: 'THE OFFICE', codename: 'HQ-VIEW', icon: Building2 },
      { id: 'office-my', path: '/my-office', label: 'MY OFFICE', boomerLabel: 'MY OFFICE', codename: 'MY-HQ', icon: Building2 },
      { id: 'office-map', path: '/tower', label: 'TOWER', boomerLabel: 'TOWER', codename: 'FLOOR-DIR', icon: Map },
      { id: 'office-economy', path: '/game/economy', label: 'ECONOMY', boomerLabel: 'ECONOMY', codename: 'MARKETS', icon: Coins },
      { id: 'office-bank', path: '/game/bank', label: 'BANCO OMBRA', boomerLabel: 'BANCO OMBRA', codename: 'VAULT-X', icon: Landmark },
      { id: 'office-vending', path: '/vending?from=office', label: 'SUPPLIES', boomerLabel: 'SUPPLIES', codename: 'SUPPLIES', icon: ShoppingBag },
      { id: 'office-property', path: '/store/realty?from=office', label: 'PROPERTY', boomerLabel: 'PROPERTY', codename: 'PROPERTY', icon: Landmark },
      { id: 'office-agents', path: '/bots', label: 'AGENTS', boomerLabel: 'AGENTS', codename: 'AGENTS', icon: Bot },
      { id: 'office-business', path: '/business', label: 'BUSINESS OPS', boomerLabel: 'BUSINESS OPS', codename: 'BUSINESS OPS', icon: Briefcase },
      { id: 'office-settings', path: '/game/settings', label: 'SETTINGS', boomerLabel: 'SETTINGS', codename: 'OPTIONS', icon: Settings },
    ],
  },
  {
    id: 'phone',
    path: '/phone',
    label: 'CALLL HOME',
    codename: 'CALLL HOME',
    icon: Phone,
    defaultPath: '/phone',
    subs: [
      { id: 'dialer', path: '/phone/dialer', label: 'DIALER', boomerLabel: 'DIALER', codename: 'DIAL-PAD', icon: PhoneCall },
      { id: 'contacts', path: '/phone/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'COMM-BOOK', icon: Users },
      { id: 'active', path: '/phone/active', label: 'ACTIVE CALLS', boomerLabel: 'ACTIVE CALLS', codename: 'LIVE-OPS', icon: Zap },
      { id: 'history', path: '/phone/history', label: 'CALL LOG', boomerLabel: 'CALL LOG', codename: 'CHRONO-LOG', icon: Clock },
      { id: 'voicemail', path: '/phone/voicemail', label: 'VOICEMAIL', boomerLabel: 'VOICEMAIL', codename: 'V-MAIL', icon: Voicemail },
      { id: 'conference', path: '/phone/conference', label: 'CONFERENCE', boomerLabel: 'CONFERENCE', codename: 'CONF-ROOM', icon: Users },
      { id: 'sessions', path: '/phone/sessions', label: 'DIALING SESSIONS', boomerLabel: 'DIALING SESSIONS', codename: 'AUTO-DIAL', icon: Radio },
      { id: 'coach', path: '/phone/coach', label: 'VOICE COACH', boomerLabel: 'CALL COACH', codename: 'COACH', icon: Bot },
      { id: 'secretary', path: '/phone/secretary', label: 'SECRETARY', boomerLabel: 'SECRETARY', codename: 'SEC', icon: Settings },
      { id: 'numbers', path: '/phone/numbers', label: 'PHONE NUMBERS', boomerLabel: 'PHONE NUMBERS', codename: 'NUM-VAULT', icon: Hash },
    ],
  },
  {
    id: 'bots',
    path: '/bots',
    label: 'AGENTS',
    codename: 'PIXEL AGENTS',
    icon: Bot,
    defaultPath: '/bots',
    subs: [
      { id: 'my-bots', path: '/bots', label: 'AGENT COMMAND CENTER', boomerLabel: 'MY AGENTS', codename: 'AGENT OPS', icon: Bot },
      { id: 'templates', path: '/bots/templates', label: 'TEMPLATES', boomerLabel: 'CLAUDE TEMPLATES', codename: 'CCT', icon: BookOpen },
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
      { id: 'vault', path: '/console/vault', label: 'VAULT', boomerLabel: 'KNOWLEDGE VAULT', codename: 'NEXUS-V', icon: Brain },
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
      { id: 'autopilot', path: '/business/autopilot', label: 'AUTOPILOT', boomerLabel: 'AGENT AUTOPILOT', codename: 'AUTO-PILOT', icon: Activity },
      { id: 'contacts', path: '/business/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'RECALL-6', icon: Users },
      { id: 'hiring', path: '/business/hiring', label: 'HIRING', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
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
      // INTEL folded into BUSINESS — these keep their /intel/* routes/pages but
      // now live as sub-tabs of BUSINESS instead of a standalone top-level nav.
      { id: 'reports', path: '/intel/reports', label: 'REPORTS', boomerLabel: 'REPORTS', codename: 'INTEL-9', icon: BarChart2 },
      { id: 'dashboard', path: '/intel/dashboard', label: 'DASHBOARD', boomerLabel: 'DASHBOARD', codename: 'CMD DECK', icon: LayoutDashboard },
      { id: 'goals', path: '/intel/goals', label: 'GOALS', boomerLabel: 'GOALS', codename: 'OBJECTIVE-7', icon: Target },
    ],
  },
  {
    id: 'creative',
    path: '/creative',
    label: 'CREATIVE',
    codename: 'FORGE MATRIX',
    icon: Layers,
    defaultPath: '/creative/music',
    subs: [
      // AUDIO group (left)
      { id: 'lab', path: '/creative/lab', label: '1999', boomerLabel: '1999', codename: '1999', icon: Music2 },
      { id: 'humbird', path: '/creative/music', label: 'HUMMING BIRD', boomerLabel: 'HUMMING BIRD', codename: 'HUMMING BIRD', icon: Music2 },
      { id: 'stems', path: '/creative/stems', label: 'STEMS', boomerLabel: 'STEM PLAYER', codename: 'STEM-X', icon: Music2 },
      // WRITING (middle)
      { id: 'writer', path: '/creative/writer', label: 'HEMINGWAY', boomerLabel: 'HEMINGWAY', codename: 'HEMINGWAY', icon: PenTool },
      // PHOTOS / VISUAL group (right)
      { id: 'darkroom', path: '/creative/darkroom', label: 'DARK ROOM', boomerLabel: 'DARK ROOM', codename: 'DARK ROOM', icon: Clapperboard },
      { id: 'design', path: '/creative/design', label: 'DESIGN STUDIO', boomerLabel: 'DESIGN STUDIO', codename: 'DESIGN-FORGE', icon: Palette },
      { id: 'brand', path: '/creative/brand', label: 'BRAND KIT', boomerLabel: 'BRAND KIT', codename: 'BRAND-CORE', icon: Palette },
      { id: 'media', path: '/creative/media', label: 'MEDIA', boomerLabel: 'MEDIA LIBRARY', codename: 'VAULT-X', icon: FolderOpen },
      { id: 'schematic', path: '/creative/schematic', label: 'BLUEPRINT', boomerLabel: 'BLUEPRINT DECODER', codename: 'DRAFT-X', icon: Ruler },
      // EDUCATION
      { id: 'classroom', path: '/creative/classroom', label: 'CLASSROOM', boomerLabel: 'CLASSROOM', codename: 'ACADEMY', icon: GraduationCap },
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
      { id: 'ads', path: '/marketing/ads', label: 'AD BOTS', boomerLabel: 'AD BOTS', codename: 'SIGNAL-AD', icon: Bot },
      { id: 'social', path: '/marketing/social', label: 'SOCIAL', boomerLabel: 'SOCIAL MEDIA', codename: 'SIGNAL-7', icon: Share2 },
      { id: 'seo', path: '/marketing/seo', label: 'SEO', boomerLabel: 'SEO', codename: 'CRAWL-X', icon: Search },
      { id: 'leads', path: '/marketing/leads', label: 'LEADS', boomerLabel: 'LEAD DATABASE', codename: 'PROSPECT-9', icon: Target },
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
  // ORG — a dedicated management hub for running your organization. Its nav
  // label is rendered as the live org name (see NavBar / MobileModuleNav); this
  // module's static label is the fallback. Distinct from OFFICE (the office
  // floor). The hub at /org surfaces the EXISTING org-management surfaces
  // (team roster, hiring/firing, roles & permissions, finances) — the subs
  // below point at those existing routes rather than reimplementing them.
  {
    id: 'org',
    path: '/org',
    label: 'ORG',
    codename: 'ORG-CORE',
    icon: Network,
    defaultPath: '/org',
    subs: [
      { id: 'org-overview', path: '/org', label: 'OVERVIEW', boomerLabel: 'OVERVIEW', codename: 'ORG-CORE', icon: Building2 },
      { id: 'org-team', path: '/business/team', label: 'EMPLOYEES', boomerLabel: 'EMPLOYEES', codename: 'ROSTER-X', icon: Users },
      { id: 'org-hiring', path: '/business/hiring', label: 'HIRING', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
      { id: 'org-permissions', path: '/business', label: 'ROLES', boomerLabel: 'ROLES & PERMISSIONS', codename: 'ACCESS', icon: UserCog },
      { id: 'org-finances', path: '/business/accounting', label: 'FINANCES', boomerLabel: 'ACCOUNTING & LEDGERS', codename: 'GL-CORE', icon: BookOpen },
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
  { id: 'profile-platform', path: '/profile/platform', label: 'PLATFORM', boomerLabel: 'PLATFORM API', codename: 'NEXUS-API', icon: Network },
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
  { id: 'plat-overview', path: '/profile/platform', label: 'PLATFORM', boomerLabel: 'PLATFORM', codename: 'NEXUS-API', icon: Network },
  { id: 'plat-keys', path: '/profile/platform?tab=keys', label: 'API KEYS', boomerLabel: 'API KEYS', codename: 'KEYS', icon: Key },
  { id: 'plat-webhooks', path: '/profile/platform?tab=webhooks', label: 'WEBHOOKS', boomerLabel: 'WEBHOOKS', codename: 'HOOKS', icon: Webhook },
  { id: 'plat-endpoints', path: '/profile/platform?tab=endpoints', label: 'ENDPOINTS', boomerLabel: 'ENDPOINTS', codename: 'DOCS', icon: FileText },
  { id: 'plat-apps', path: '/profile/platform?tab=apps', label: 'APPS', boomerLabel: 'CONNECTED APPS', codename: 'APPS', icon: Globe },
];

export function getModuleForPath(pathname: string): Module | null {
  if (pathname === '/pablo') return MODULES[0];
  // Pablo module: deck lives under PABLO
  if (pathname === '/pablo/deck') return MODULES[0];
  // Office module: floor, my-office, game sub-pages
  if (pathname === '/office' || pathname === '/my-office' || pathname.startsWith('/office/')) return MODULES[1];
  if (pathname === '/game/economy' || pathname === '/game/bank' ||
      pathname === '/game/character' || pathname === '/game/settings') return MODULES[1];
  if (pathname.startsWith('/phone')) return MODULES[2];
  if (pathname.startsWith('/bots') || pathname === '/agents' || pathname === '/console/agents') return MODULES[3];
  if (pathname === '/console' || pathname.startsWith('/console/')) return MODULES[4];
  if (pathname.startsWith('/business')) return MODULES[5];
  if (pathname.startsWith('/insurance')) return MODULES[5];
  if (pathname.startsWith('/intel')) return MODULES[5];
  if (pathname.startsWith('/creative')) return MODULES[6];
  if (pathname.startsWith('/marketing')) return MODULES[7];
  if (pathname.startsWith('/armory')) return MODULES[8];
  if (pathname === '/org' || pathname.startsWith('/org/')) return MODULES[9];
  if (pathname === '/marketplace') return MODULES[10];
  if (pathname.startsWith('/profile')) return null;
  if (pathname.startsWith('/admin')) return null;
  if (pathname.startsWith('/platform')) return null;
  return null;
}
