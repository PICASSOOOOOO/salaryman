import {
  Archive,
  BarChart2,
  Bot,
  Briefcase,
  CalendarDays,
  Code2,
  FileText,
  Hash,
  Layers,
  LayoutDashboard,
  Megaphone,
  Mic,
  Monitor,
  Music2,
  Palette,
  Phone,
  PhoneCall,
  Radio,
  Search,
  Settings,
  Target,
  Terminal,
  TrendingUp,
  Users,
  Voicemail,
  Zap,
  Clock,
  type LucideIcon,
} from 'lucide-react';

export type HistoricSubItem = {
  id: string;
  path: string;
  boomerLabel: string;
  codename: string;
  icon: LucideIcon;
};

export type HistoricModule = {
  id: string;
  path: string;
  label: string;
  codename: string;
  icon: LucideIcon;
  defaultPath: string;
  subs: HistoricSubItem[];
};

export const HISTORIC_MODULES: HistoricModule[] = [
  {
    id: 'pablo',
    path: '/pablo',
    label: 'PABLO',
    codename: 'PABLO',
    icon: Terminal,
    defaultPath: '/pablo',
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
      { id: 'listen', path: '/console', boomerLabel: 'LIVE LISTEN', codename: 'ECHO-7', icon: Mic },
      { id: 'scan', path: '/console', boomerLabel: 'SCREEN SCAN', codename: 'OPTIC-9', icon: Monitor },
      { id: 'interview', path: '/console', boomerLabel: 'INTERVIEW SOLVER', codename: 'CIPHER-X', icon: Code2 },
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
      { id: 'contacts', path: '/business/contacts', boomerLabel: 'CONTACTS', codename: 'RECALL-6', icon: Users },
      { id: 'hiring', path: '/business/hiring', boomerLabel: 'HIRING & HR', codename: 'RECRUIT-8', icon: Briefcase },
      { id: 'calendar', path: '/business/calendar', boomerLabel: 'CALENDAR', codename: 'CHRONO-4', icon: CalendarDays },
      { id: 'documents', path: '/business/documents', boomerLabel: 'DOCUMENTS', codename: 'INK-6', icon: Archive },
      { id: 'invoices', path: '/business/invoices', boomerLabel: 'INVOICES', codename: 'LEDGER-3', icon: FileText },
      { id: 'deals', path: '/business/deals', boomerLabel: 'DEALS', codename: 'PIPELINE-X', icon: TrendingUp },
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
      { id: 'studio', path: '/creative/studio', boomerLabel: 'STUDIO', codename: 'FORGE-7', icon: Layers },
      { id: 'lab', path: '/1999', boomerLabel: 'THE LAB', codename: '1999', icon: Music2 },
      { id: 'campaigns', path: '/creative/campaigns', boomerLabel: 'CAMPAIGNS', codename: 'SIGNAL-5', icon: Megaphone },
      { id: 'brand', path: '/creative/brand', boomerLabel: 'BRAND KIT', codename: 'BRAND-CORE', icon: Palette },
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
      { id: 'reports', path: '/intel/reports', boomerLabel: 'REPORTS', codename: 'INTEL-9', icon: BarChart2 },
      { id: 'dashboard', path: '/intel/dashboard', boomerLabel: 'DASHBOARD', codename: 'CMD DECK', icon: LayoutDashboard },
      { id: 'agents', path: '/pablo/deck', boomerLabel: 'AI AGENTS', codename: 'AI NETWORK', icon: Bot },
      { id: 'goals', path: '/intel/goals', boomerLabel: 'GOALS', codename: 'OBJECTIVE-7', icon: Target },
      { id: 'seo', path: '/marketing/seo', boomerLabel: 'SEO', codename: 'CRAWL-X', icon: Search },
    ],
  },
  {
    id: 'phone',
    path: '/phone',
    label: 'PHONE',
    codename: 'CALLL HOME',
    icon: Phone,
    defaultPath: '/phone/dialer',
    subs: [
      { id: 'dialer', path: '/phone/dialer', boomerLabel: 'DIALER', codename: 'DIAL-PAD', icon: PhoneCall },
      { id: 'contacts', path: '/phone/contacts', boomerLabel: 'CONTACTS', codename: 'COMM-BOOK', icon: Users },
      { id: 'active', path: '/phone/active', boomerLabel: 'ACTIVE CALLS', codename: 'LIVE-OPS', icon: Zap },
      { id: 'history', path: '/phone/history', boomerLabel: 'CALL LOG', codename: 'CHRONO-LOG', icon: Clock },
      { id: 'voicemail', path: '/phone/voicemail', boomerLabel: 'VOICEMAIL', codename: 'V-MAIL', icon: Voicemail },
      { id: 'conference', path: '/phone/conference', boomerLabel: 'CONFERENCE', codename: 'CONF-ROOM', icon: Users },
      { id: 'sessions', path: '/phone/sessions', boomerLabel: 'DIALING SESSIONS', codename: 'AUTO-DIAL', icon: Radio },
      { id: 'coach', path: '/phone/coach', boomerLabel: 'AI COACH', codename: 'AI-COACH', icon: Bot },
      { id: 'secretary', path: '/phone/secretary', boomerLabel: 'AI SECRETARY', codename: 'AI-SEC', icon: Settings },
      { id: 'numbers', path: '/phone/numbers', boomerLabel: 'PHONE NUMBERS', codename: 'NUM-VAULT', icon: Hash },
    ],
  },
];