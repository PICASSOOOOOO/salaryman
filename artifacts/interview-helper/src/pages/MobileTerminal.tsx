import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  FileText,
  Home,
  Menu,
  MessageSquare,
  Phone,
  Settings,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { SignInPage } from '@/components/SignInPrompt';
import { useAuth } from '@/hooks/use-auth';
import { useAlpha } from '@/hooks/use-alpha';
import { useCommsSummary } from '@/hooks/use-comms-summary';

type MobileTerminalProps = {
  physicalTerminal?: boolean;
};

type MenuItem = {
  label: string;
  detail: string;
  path: string;
  icon: typeof BriefcaseBusiness;
};

const WORKSPACE_ITEMS: MenuItem[] = [
  { label: 'Business', detail: 'Company workspace', path: '/business', icon: BriefcaseBusiness },
  { label: 'Contacts', detail: 'CRM and relationships', path: '/business/contacts', icon: UsersRound },
  { label: 'Calendar', detail: 'Schedule and follow-ups', path: '/business/calendar', icon: CalendarDays },
  { label: 'Documents', detail: 'Files and agreements', path: '/business/documents', icon: FileText },
  { label: 'Team', detail: 'People and permissions', path: '/business/team', icon: UsersRound },
];

const ACCOUNT_ITEMS: MenuItem[] = [
  { label: 'Pablo', detail: 'Ask the assistant', path: '/pablo', icon: MessageSquare },
  { label: 'Profile', detail: 'Account details', path: '/profile', icon: UserRound },
  { label: 'Settings', detail: 'Preferences and access', path: '/settings', icon: Settings },
  { label: 'Home', detail: 'Return to the workspace', path: '/', icon: Home },
];

function MobileMenu({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => onNavigate(item.path)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-white/[0.08]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-100">{item.label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.detail}</span>
        </span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-600" aria-hidden />
      </button>
    );
  };

  return (
    <div
      role="menu"
      aria-label="Workspace menu"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111722]/[.98] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <div className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Workspace
      </div>
      {WORKSPACE_ITEMS.map(renderItem)}
      <div className="my-2 border-t border-white/[0.08]" />
      <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Account
      </div>
      {ACCOUNT_ITEMS.map(renderItem)}
    </div>
  );
}

function AccessMessage({ onBack }: { onBack: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#070b12] px-5 text-center text-slate-200">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Workspace access</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Mobile access is not enabled</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This workspace is available to approved staff accounts. You can continue from the public terminal.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 text-sm font-medium text-sky-200 transition-colors active:bg-sky-400/20"
        >
          Open public terminal
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </section>
    </main>
  );
}

export default function MobileTerminal({ physicalTerminal = false }: MobileTerminalProps) {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const alpha = useAlpha();
  const { total: commsCount } = useCommsSummary();
  const [menuOpen, setMenuOpen] = useState(false);

  const canUseMobileTerminal =
    physicalTerminal || alpha.isAdmin || alpha.isApprovedDev || alpha.isApprovedTester;

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  if (authLoading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#070b12] text-xs uppercase tracking-[0.18em] text-slate-500">
        Restoring session…
      </main>
    );
  }

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access your business workspace." />;
  }

  if (alpha.loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#070b12] text-xs uppercase tracking-[0.18em] text-slate-500">
        Checking workspace access…
      </main>
    );
  }

  if (!canUseMobileTerminal) {
    return <AccessMessage onBack={() => navigate('/tower/mezzanine?focus=phone')} />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#070b12] text-slate-200">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[30rem] flex-col px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="relative flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">SALARYMAN</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">Business workspace</h1>
          </div>
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(value => !value)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-medium text-slate-200 transition-colors active:bg-white/[0.1]"
            >
              {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
              <span>Menu</span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {menuOpen && <MobileMenu onNavigate={go} />}
          </div>
        </header>

        <section className="flex-1 py-8">
          <div className="max-w-md">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Start here</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Stay connected to work.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Open conversations or manage calls without the extra game screens.
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => go('/phone?tab=chat&from=mobile-workspace')}
              className="group rounded-2xl border border-sky-300/25 bg-sky-300/[0.08] p-4 text-left shadow-lg shadow-sky-950/20 transition-colors active:bg-sky-300/[0.14]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-300/15 text-sky-200">
                  <MessageSquare className="h-5 w-5" aria-hidden />
                </span>
                {commsCount > 0 && (
                  <span className="rounded-full bg-sky-200 px-2 py-1 text-[10px] font-bold text-slate-950">
                    {commsCount > 99 ? '99+' : commsCount} new
                  </span>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">COMMS</h3>
                  <p className="mt-1 text-xs leading-5 text-sky-100/65">Messages, channels, and team updates.</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-sky-200 transition-transform group-active:translate-x-0.5" aria-hidden />
              </div>
            </button>

            <button
              type="button"
              onClick={() => go('/phone?tab=cmd&from=mobile-workspace')}
              className="group rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.08] p-4 text-left shadow-lg shadow-emerald-950/20 transition-colors active:bg-emerald-300/[0.14]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200">
                <Phone className="h-5 w-5" aria-hidden />
              </span>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">PHONE SYSTEM</h3>
                  <p className="mt-1 text-xs leading-5 text-emerald-100/65">Calls, numbers, and phone operations.</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-emerald-200 transition-transform group-active:translate-x-0.5" aria-hidden />
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => go('/business')}
            className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-left transition-colors active:bg-white/[0.07]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400">
              <BriefcaseBusiness className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-100">Business hub</span>
              <span className="mt-0.5 block text-xs text-slate-500">Open the full workspace from the menu.</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 text-slate-600" aria-hidden />
          </button>
        </section>

        <footer className="border-t border-white/[0.08] pt-4 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-3">
            <span>Business tools, in one place.</span>
            <button
              type="button"
              onClick={() => go('/')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-slate-400 transition-colors active:bg-white/[0.06] active:text-white"
            >
              Home
              <Home className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}