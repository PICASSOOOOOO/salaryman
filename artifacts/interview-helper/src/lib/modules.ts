import {
  Terminal, Code2, Briefcase, Layers, BarChart2,
  Users, CalendarDays, Archive, FileText, TrendingUp,
  Megaphone, Music2, Palette, LayoutDashboard, Bot, Target,
  PhoneCall, Mic, Monitor, Search,
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
    label: 'PABLO',
    codename: 'PABLO',
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
      { id: 'interview', path: '/console', label: 'INTERVIEW SOLVER', boomerLabel: 'INTERVIEW SOLVER', codename: 'CIPHER-X', icon: Code2 },
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
      { id: 'contacts', path: '/business/contacts', label: 'CONTACTS', boomerLabel: 'CONTACTS', codename: 'RECALL-6', icon: Users },
      { id: 'hiring', path: '/business/hiring', label: 'HIRING', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
      { id: 'calendar', path: '/business/calendar', label: 'CALENDAR', boomerLabel: 'CALENDAR', codename: 'CHRONO-4', icon: CalendarDays },
      { id: 'documents', path: '/business/documents', label: 'DOCUMENTS', boomerLabel: 'DOCUMENTS', codename: 'INK-6', icon: Archive },
      { id: 'invoices', path: '/business/invoices', label: 'INVOICES', boomerLabel: 'INVOICES', codename: 'LEDGER-3', icon: FileText },
      { id: 'deals', path: '/business/deals', label: 'DEALS', boomerLabel: 'DEALS', codename: 'PIPELINE-X', icon: TrendingUp },
      { id: 'phone', path: '/business/phone', label: 'PHONE', boomerLabel: 'PHONE SYSTEM', codename: 'COMM-1', icon: PhoneCall },
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
    ],
  },
];

export function getModuleForPath(pathname: string): Module | null {
  if (pathname === '/') return MODULES[0];
  if (pathname === '/console' || pathname.startsWith('/console/')) return MODULES[1];
  if (pathname.startsWith('/business')) return MODULES[2];
  if (pathname.startsWith('/creative')) return MODULES[3];
  if (pathname.startsWith('/intel')) return MODULES[4];
  return null;
}
