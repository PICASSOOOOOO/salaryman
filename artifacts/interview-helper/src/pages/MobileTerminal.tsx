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
  Orbit,
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
import HummingBirdAttachStrip from '@/components/HummingBirdAttachStrip';
import './MobileTerminal.css';

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
];

const ACCOUNT_ITEMS: MenuItem[] = [
  { label: 'Profile', detail: 'Account details', path: '/profile', icon: UserRound },
  { label: 'Settings', detail: 'Preferences and access', path: '/settings', icon: Settings },
  { label: 'Home', detail: 'Return to the workspace', path: '/', icon: Home },
];

const PABLO_ITEMS: MenuItem[] = [
  { label: 'Pablo nebula', detail: 'Open the assistant surface', path: '/pablo', icon: Orbit },
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
        className="mobile-terminal-menu-item"
      >
        <span className="mobile-terminal-menu-icon">
          <Icon aria-hidden />
        </span>
        <span className="mobile-terminal-menu-label">{item.label}</span>
        <ArrowRight className="mobile-terminal-menu-arrow" aria-hidden />
      </button>
    );
  };

  return (
    <div
      role="menu"
      aria-label="Workspace menu"
      className="mobile-terminal-menu"
    >
      {WORKSPACE_ITEMS.map(renderItem)}
      <div className="mobile-terminal-menu-divider" />
      {ACCOUNT_ITEMS.map(renderItem)}
      <div className="mobile-terminal-menu-divider" />
      {PABLO_ITEMS.map(renderItem)}
      <div className="mobile-terminal-menu-tool">
        <div className="mobile-terminal-menu-tool-title">
          <Orbit aria-hidden />
          <span>Hummingbird</span>
        </div>
        <HummingBirdAttachStrip
          toolKey="mobile-terminal"
          buttonStyle="ghost"
          buttonLabel="CHOOSE TRACK"
          pickerTitle="CHOOSE HUMMINGBIRD TRACK"
          compact
        />
      </div>
    </div>
  );
}

function AccessMessage({ onBack }: { onBack: () => void }) {
  return (
    <main className="mobile-terminal-page grid min-h-[100dvh] place-items-center px-5 text-center">
      <section className="mobile-terminal-access">
        <p className="mobile-terminal-eyebrow">Workspace access</p>
        <h1>Mobile access is not enabled</h1>
        <button
          type="button"
          onClick={onBack}
          className="mobile-terminal-primary mt-5"
        >
          Open workspace
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
      <main className="mobile-terminal-page grid min-h-[100dvh] place-items-center text-xs uppercase tracking-[0.18em] text-slate-500">
        Restoring session…
      </main>
    );
  }

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access your business workspace." />;
  }

  if (alpha.loading) {
    return (
      <main className="mobile-terminal-page grid min-h-[100dvh] place-items-center text-xs uppercase tracking-[0.18em] text-slate-500">
        Checking workspace access…
      </main>
    );
  }

  if (!canUseMobileTerminal) {
    return <AccessMessage onBack={() => navigate('/tower/mezzanine?focus=phone')} />;
  }

  return (
    <main className="mobile-terminal-page">
      <div className="mobile-terminal-container">
        <header className="mobile-terminal-header">
          <div className="relative ml-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(value => !value)}
              className="mobile-terminal-menu-button"
            >
              {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
              <span>Menu</span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {menuOpen && <MobileMenu onNavigate={go} />}
          </div>
        </header>

        <section className="mobile-terminal-content">
          <div className="max-w-md">
            <p className="mobile-terminal-eyebrow">Workspace</p>
            <h2>Stay connected to work.</h2>
          </div>

          <div className="mobile-terminal-feature-grid">
            <button
              type="button"
              onClick={() => go('/comms')}
              className="mobile-terminal-feature mobile-terminal-feature-comms"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="mobile-terminal-feature-icon">
                  <MessageSquare className="h-5 w-5" aria-hidden />
                </span>
                {commsCount > 0 && (
                  <span className="mobile-terminal-count">
                    {commsCount > 99 ? '99+' : commsCount} new
                  </span>
                )}
              </div>
              <div className="mobile-terminal-feature-label">
                <h3>COMMS</h3>
                <ArrowRight aria-hidden />
              </div>
            </button>

            <button
              type="button"
              onClick={() => go('/phone?tab=cmd&from=mobile-workspace')}
              className="mobile-terminal-feature mobile-terminal-feature-phone"
            >
              <span className="mobile-terminal-feature-icon">
                <Phone className="h-5 w-5" aria-hidden />
              </span>
              <div className="mobile-terminal-feature-label">
                <h3>PHONE SYSTEM</h3>
                <ArrowRight aria-hidden />
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => go('/business')}
            className="mobile-terminal-business-link"
          >
            <span className="mobile-terminal-business-icon">
              <BriefcaseBusiness className="h-4 w-4" aria-hidden />
            </span>
            <span>Business hub</span>
            <ArrowRight aria-hidden />
          </button>
        </section>

        <footer className="mobile-terminal-footer">
          <div>
            <button
              type="button"
              onClick={() => go('/')}
              className="mobile-terminal-home-link"
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