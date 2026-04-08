import {
  Terminal, Code2, Briefcase, Layers, BarChart2,
  Users, CalendarDays, Archive, FileText, TrendingUp,
  Megaphone, Music2, Palette, LayoutDashboard, Bot, Target,
  PhoneCall, Mic, Monitor, Search, Phone, Radio, Settings,
  Voicemail, Hash, Zap, Clock, MessageSquare, DollarSign, Receipt, CreditCard, Scale,
  Store, Plug, FolderOpen, PenTool, Video,
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
    path: '/',
    label: 'Pablo AI',
    codename: 'PABLO AI',
    icon: Terminal,
    defaultPath: '/',
    subs: [],
  },
  {
    id: 'console',
    path: '/console',
    label: 'CONSOLE',
    codename: 'CIPHER-X',
    icon: Code2,
    defaultPath: '/console',
    subs: [
      { id: 'listen', path: '/console', label: 'LIVE LISTEN', boomerLabel: 'LIVE LISTEN', codename: 'ECHO-7', icon: Mic },
      { id: 'scan', path: '/console', label: 'SCREEN SCAN', boomerLabel: 'SCREEN SCAN', codename: 'OPTIC-9', icon: Monitor },
    ],
  },
  {
    id: 'business',
    path: '/business',
    label: 'BUSINESS',
    codename: 'OPS-CORE',
    icon: Briefcase,
    defaultPath: '/business/contacts',
    subs: [
      { id: 'leads', path: '/business/leads', label: 'LEADS', boomerLabel: 'LEAD DATABASE', codename: 'PROSPECT-9', icon: Target },
      { id: 'contacts', path: '/business/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'RECALL-6', icon: Users },
      { id: 'hiring', path: '/business/hiring', label: 'HIRING', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
      { id: 'interview', path: '/business/interview', label: 'INTERVIEW OFFICE', boomerLabel: 'INTERVIEW OFFICE', codename: 'CIPHER-X', icon: Code2 },
      { id: 'calendar', path: '/business/calendar', label: 'CALENDAR', boomerLabel: 'CALENDAR', codename: 'CHRONO-4', icon: CalendarDays },
      { id: 'documents', path: '/business/documents', label: 'DOCUMENTS', boomerLabel: 'DOCUMENTS', codename: 'INK-6', icon: Archive },
      { id: 'invoices', path: '/business/invoices', label: 'INVOICES', boomerLabel: 'INVOICES', codename: 'LEDGER-3', icon: FileText },
      { id: 'deals', path: '/business/deals', label: 'DEALS', boomerLabel: 'DEALS', codename: 'PIPELINE-X', icon: TrendingUp },
      { id: 'payroll', path: '/business/payroll', label: 'PAYROLL', boomerLabel: 'PAYROLL', codename: 'PAYMASTER-7', icon: DollarSign },
      { id: 'bills', path: '/business/bills', label: 'BILLS', boomerLabel: 'BILLS', codename: 'PAYABLE-X', icon: Receipt },
      { id: 'expenses', path: '/business/expenses', label: 'EXPENSES', boomerLabel: 'EXPENSES', codename: 'SPEND-TRACK', icon: CreditCard },
    ],
  },
  {
    id: 'creative',
    path: '/creative',
    label: 'CREATIVE',
    codename: 'FORGE MATRIX',
    icon: Layers,
    defaultPath: '/creative/studio',
    subs: [
      { id: 'studio', path: '/creative/studio', label: 'STUDIO', boomerLabel: 'STUDIO', codename: 'FORGE-7', icon: Layers },
      { id: 'lab', path: '/creative/lab', label: '1999', boomerLabel: 'THE LAB', codename: '1999', icon: Music2 },
      { id: 'campaigns', path: '/creative/campaigns', label: 'CAMPAIGNS', boomerLabel: 'CAMPAIGNS', codename: 'SIGNAL-5', icon: Megaphone },
      { id: 'brand', path: '/creative/brand', label: 'BRAND KIT', boomerLabel: 'BRAND KIT', codename: 'BRAND-CORE', icon: Palette },
      { id: 'writer', path: '/creative/writer', label: 'WRITER', boomerLabel: 'LONG-FORM WRITER', codename: 'QUILL-X', icon: PenTool },
      { id: 'media', path: '/creative/media', label: 'MEDIA', boomerLabel: 'MEDIA LIBRARY', codename: 'VAULT-X', icon: FolderOpen },
    ],
  },
  {
    id: 'intel',
    path: '/intel',
    label: 'INTEL',
    codename: 'COMMAND NET',
    icon: BarChart2,
    defaultPath: '/intel/reports',
    subs: [
      { id: 'reports', path: '/intel/reports', label: 'REPORTS', boomerLabel: 'REPORTS', codename: 'INTEL-9', icon: BarChart2 },
      { id: 'dashboard', path: '/intel/dashboard', label: 'DASHBOARD', boomerLabel: 'DASHBOARD', codename: 'CMD DECK', icon: LayoutDashboard },
      { id: 'agents', path: '/intel/agents', label: 'AGENT TEAM', boomerLabel: 'AI AGENTS', codename: 'AI NETWORK', icon: Bot },
      { id: 'goals', path: '/intel/goals', label: 'GOALS', boomerLabel: 'GOALS', codename: 'OBJECTIVE-7', icon: Target },
      { id: 'seo', path: '/intel/seo', label: 'SEO', boomerLabel: 'SEO', codename: 'CRAWL-X', icon: Search },
      { id: 'video', path: '/intel/video', label: 'VIDEO INTEL', boomerLabel: 'VIDEO ANALYZER', codename: 'VID-SCAN', icon: Video },
      { id: 'balance-sheet', path: '/intel/balance-sheet', label: 'BALANCE SHEET', boomerLabel: 'BALANCE SHEET', codename: 'NETWORTH-X', icon: Scale },
    ],
  },
  {
    id: 'phone',
    path: '/phone',
    label: 'PHONE',
    codename: 'TTC',
    icon: Phone,
    defaultPath: '/phone/dialer',
    subs: [
      { id: 'dialer', path: '/phone/dialer', label: 'DIALER', boomerLabel: 'DIALER', codename: 'DIAL-PAD', icon: PhoneCall },
      { id: 'contacts', path: '/phone/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'COMM-BOOK', icon: Users },
      { id: 'active', path: '/phone/active', label: 'ACTIVE CALLS', boomerLabel: 'ACTIVE CALLS', codename: 'LIVE-OPS', icon: Zap },
      { id: 'history', path: '/phone/history', label: 'CALL LOG', boomerLabel: 'CALL LOG', codename: 'CHRONO-LOG', icon: Clock },
      { id: 'voicemail', path: '/phone/voicemail', label: 'VOICEMAIL', boomerLabel: 'VOICEMAIL', codename: 'V-MAIL', icon: Voicemail },
      { id: 'conference', path: '/phone/conference', label: 'CONFERENCE', boomerLabel: 'CONFERENCE', codename: 'CONF-ROOM', icon: Users },
      { id: 'sessions', path: '/phone/sessions', label: 'DIALING SESSIONS', boomerLabel: 'DIALING SESSIONS', codename: 'AUTO-DIAL', icon: Radio },
      { id: 'coach', path: '/phone/coach', label: 'AI COACH', boomerLabel: 'AI COACH', codename: 'AI-COACH', icon: Bot },
      { id: 'secretary', path: '/phone/secretary', label: 'AI SECRETARY', boomerLabel: 'AI SECRETARY', codename: 'AI-SEC', icon: Settings },
      { id: 'numbers', path: '/phone/numbers', label: 'PHONE NUMBERS', boomerLabel: 'PHONE NUMBERS', codename: 'NUM-VAULT', icon: Hash },
    ],
  },
  {
    id: 'bots',
    path: '/bots',
    label: 'BOTS',
    codename: 'JEAN CLAW FACTORY',
    icon: Bot,
    defaultPath: '/bots',
    subs: [
      { id: 'marketplace', path: '/bots', label: 'MARKETPLACE', boomerLabel: 'BOT STORE', codename: 'MARKET', icon: Store },
      { id: 'my-bots', path: '/bots/my', label: 'MANAGE', boomerLabel: 'MANAGE', codename: 'ROBO DOC', icon: Bot },
      { id: 'connectors', path: '/bots/connectors', label: 'CONNECTORS', boomerLabel: 'CONNECTORS', codename: 'COMM-LINKS', icon: Plug },
    ],
  },
];

export function getModuleForPath(pathname: string): Module | null {
  if (pathname === '/') return MODULES[0];
  if (pathname === '/console' || pathname.startsWith('/console/')) return MODULES[1];
  if (pathname.startsWith('/business')) return MODULES[2];
  if (pathname.startsWith('/creative')) return MODULES[3];
  if (pathname.startsWith('/intel')) return MODULES[4];
  if (pathname.startsWith('/phone')) return MODULES[5];
  if (pathname.startsWith('/bots')) return MODULES[6];
  return null;
}
