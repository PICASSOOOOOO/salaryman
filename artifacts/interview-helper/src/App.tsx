import { Suspense, lazy, memo, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import { MobileSubNav, MobileModuleNav } from "@/components/MobileBottomBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useUndoShortcut } from "@/hooks/use-undo";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";
import { FeatureStateProvider } from "@/hooks/use-feature-state";
import { useAuth } from "@workspace/replit-auth-web";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { ActiveCallBar } from "@/components/FloatingCallBar";
import { ChatPanel } from "@/components/ChatPanel";

const Home = lazy(() => import("@/pages/Home"));
const Cover = lazy(() => import("@/pages/Cover"));
const Console = lazy(() => import("@/pages/Console"));
const Profile = lazy(() => import("@/pages/Profile"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const Upgrade = lazy(() => import("@/pages/Upgrade"));
const WorldMenu = lazy(() => import("@/pages/WorldMenu"));
const WorldPlay = lazy(() => import("@/pages/WorldPlay"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const Features = lazy(() => import("@/pages/Features"));
const SeoModule = lazy(() => import("@/pages/SeoModule"));
const NotFound = lazy(() => import("@/pages/not-found"));

const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const Hiring = lazy(() => import("@/pages/Hiring"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Documents = lazy(() => import("@/pages/Documents"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Deals = lazy(() => import("@/pages/Deals"));
const LeadsPage = lazy(() => import("@/pages/LeadsPage"));

const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const SoundLab = lazy(() => import("@/pages/SoundLab"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const BrandKit = lazy(() => import("@/pages/BrandKit"));
const MediaLibrary = lazy(() => import("@/pages/MediaLibrary"));

const Reporting = lazy(() => import("@/pages/Reporting"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AgentTeam = lazy(() => import("@/pages/AgentTeam"));
const Goals = lazy(() => import("@/pages/Goals"));

const LegalHub = lazy(() => import("@/pages/legal/LegalHub"));
const LegalTerms = lazy(() => import("@/pages/legal/TermsOfService"));
const LegalPrivacy = lazy(() => import("@/pages/legal/PrivacyPolicy"));
const LegalContact = lazy(() => import("@/pages/legal/ContactPage"));
const LegalRefunds = lazy(() => import("@/pages/legal/RefundPolicy"));
const LegalReturns = lazy(() => import("@/pages/legal/ReturnPolicy"));
const LegalCancellation = lazy(() => import("@/pages/legal/CancellationPolicy"));
const LegalPromotions = lazy(() => import("@/pages/legal/PromotionsPolicy"));
const LegalRestrictions = lazy(() => import("@/pages/legal/RestrictionsPolicy"));
const LegalInvestors = lazy(() => import("@/pages/legal/InvestorsPage"));

const Payroll = lazy(() => import("@/pages/Payroll"));
const Bills = lazy(() => import("@/pages/Bills"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const BalanceSheet = lazy(() => import("@/pages/BalanceSheet"));

const CalllHomePage = lazy(() => import("@/pages/phone/CalllHomePage"));

const MeetPage = lazy(() => import("@/pages/MeetPage"));
const AdminTickets = lazy(() => import("@/pages/AdminTickets"));
const FeedbackAdmin = lazy(() => import("@/pages/FeedbackAdmin"));
const BotFactory = lazy(() => import("@/pages/BotFactory"));
const DevTasksAdmin = lazy(() => import("@/pages/DevTasksAdmin"));
const JeanClawLanding = lazy(() => import("@/pages/JeanClawLanding"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const FULLSCREEN_ROUTES = ["/world", "/world/play", "/mobile", "/admin/billboards", "/meet", "/jean-claw"];
const GAME_ROUTES = ["/world", "/world/play", "/mobile"];

function CRTFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090b",
        color: "rgba(56,189,248,0.7)",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        letterSpacing: "0.1em",
      }}
    >
      LOADING...
    </div>
  );
}

const MemoHome = memo(Home as React.ComponentType);
const MemoConsole = memo(Console as React.ComponentType);

function HomeOrCover() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <CRTFallback />;
  if (!isAuthenticated) return <Cover />;
  return <MemoHome />;
}

const FLOATING_BAR_ROUTES = [
  "/",
  "/console",
  "/business",
  "/intel",
];

function AppShell() {
  useUndoShortcut();
  const [location] = useLocation();
  const { hideNavBar } = useNavBarVisibility();
  const { isAuthenticated } = useAuth();

  const pathname = location.split("?")[0];
  const isRootRoute = pathname === "/";
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  const showNavBar = !isFullscreenRoute && !hideNavBar && !(isRootRoute && !isAuthenticated);

  const isHome = pathname === "/";
  const isConsole = pathname === "/console" || pathname.startsWith("/console/");
  const isKeepAliveActive = isHome || isConsole;

  const isGameRoute = GAME_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));

  const isPhoneRoute = pathname === "/phone" || pathname.startsWith("/phone/");
  const isLegalRoute = pathname === "/legal" || pathname.startsWith("/legal/");
  const showFloatingBar = isAuthenticated && !isFullscreenRoute && !isGameRoute && !isPhoneRoute && !isLegalRoute &&
    FLOATING_BAR_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  const showChat = isAuthenticated && !isFullscreenRoute && !isGameRoute;

  useEffect(() => {
    if (isGameRoute) {
      document.body.classList.add("game-route");
    } else {
      document.body.classList.remove("game-route");
    }
    return () => {
      document.body.classList.remove("game-route");
    };
  }, [isGameRoute]);

  return (
    <>
      {showNavBar && (
        <div className="sticky top-0 z-50 sm:static sm:z-auto">
          <NavBar />
          <MobileModuleNav />
          <MobileSubNav />
        </div>
      )}
      {showFloatingBar && <ActiveCallBar />}
      {showChat && <ChatPanel />}
      {/* Keep-alive panels */}
      <ErrorBoundary>
        <Suspense fallback={isHome ? <CRTFallback /> : null}>
          <div style={{ display: isHome ? "block" : "none" }}>
            {isAuthenticated ? <MemoHome /> : <Cover />}
          </div>
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={isConsole ? <CRTFallback /> : null}>
          <div style={{ display: isConsole ? "block" : "none" }}>
            <MemoConsole />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Other routes — lazy-loaded */}
      {!isKeepAliveActive && (
        <ErrorBoundary>
        <Suspense fallback={<CRTFallback />}>
          <Switch>
            {/* Standalone routes */}
            <Route path="/features" component={Features} />
            <Route path="/profile" component={Profile} />
            <Route path="/profile/:userId" component={MemberProfile} />
            <Route path="/upgrade" component={Upgrade} />
            <Route path="/world" component={WorldMenu} />
            <Route path="/world/play" component={WorldPlay} />
            <Route path="/admin/billboards" component={BillboardAdmin} />
            <Route path="/admin/tickets" component={AdminTickets} />
            <Route path="/admin/tickets/:id">{(params) => <AdminTickets params={params} />}</Route>
            <Route path="/admin/dev-tasks" component={DevTasksAdmin} />
            <Route path="/mobile" component={MobileTerminal} />
            <Route path="/meet/:code">{(params) => <MeetPage params={params} />}</Route>

            {/* BUSINESS module */}
            <Route path="/business/leads" component={LeadsPage} />
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/business/interview" component={Console} />
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
            <Route path="/business/payroll" component={Payroll} />
            <Route path="/business/bills" component={Bills} />
            <Route path="/business/expenses" component={Expenses} />
            <Route path="/business">{() => <Redirect to="/business/contacts" />}</Route>

            {/* CREATIVE module */}
            <Route path="/creative/studio" component={ContentStudio} />
            <Route path="/creative/lab">{() => <SoundLab />}</Route>
            <Route path="/creative/campaigns" component={Campaigns} />
            <Route path="/creative/brand" component={BrandKit} />
            <Route path="/creative/media" component={MediaLibrary} />
            <Route path="/creative">{() => <Redirect to="/creative/studio" />}</Route>

            {/* INTEL module */}
            <Route path="/intel/reports" component={Reporting} />
            <Route path="/intel/dashboard" component={Dashboard} />
            <Route path="/intel/agents" component={AgentTeam} />
            <Route path="/intel/goals" component={Goals} />
            <Route path="/intel/seo" component={SeoModule} />
            <Route path="/intel/balance-sheet" component={BalanceSheet} />
            <Route path="/intel">{() => <Redirect to="/intel/reports" />}</Route>

            {/* PHONE module — unified Calll Home hub */}
            <Route path="/phone" component={CalllHomePage} />
            <Route path="/phone/:rest*">{(params: { rest: string }) => {
              const TAB_MAP: Record<string, string> = {
                contacts: 'contacts', dialer: 'dial', active: 'live',
                history: 'log', voicemail: 'vm', conference: 'conf',
                sessions: 'auto', coach: 'ai', secretary: 'ai', numbers: 'contacts',
              };
              const tab = TAB_MAP[params.rest?.split('/')[0] ?? ''] ?? '';
              return <Redirect to={tab ? `/phone?tab=${tab}` : '/phone'} />;
            }}</Route>

            {/* Jean Claw landing — standalone sales page */}
            <Route path="/jean-claw" component={JeanClawLanding} />

            {/* BOTS module */}
            <Route path="/bots" component={BotFactory} />
            <Route path="/bots/:rest*" component={BotFactory} />

            {/* Old flat routes — redirect to new module paths */}
            <Route path="/contacts">{() => <Redirect to="/business/contacts" />}</Route>
            <Route path="/hiring">{() => <Redirect to="/business/hiring" />}</Route>
            <Route path="/calendar">{() => <Redirect to="/business/calendar" />}</Route>
            <Route path="/documents">{() => <Redirect to="/business/documents" />}</Route>
            <Route path="/studio">{() => <Redirect to="/creative/studio" />}</Route>
            <Route path="/lab">{() => <Redirect to="/creative/lab" />}</Route>
            <Route path="/campaigns">{() => <Redirect to="/creative/campaigns" />}</Route>
            <Route path="/reporting">{() => <Redirect to="/intel/reports" />}</Route>
            <Route path="/dashboard">{() => <Redirect to="/intel/dashboard" />}</Route>
            <Route path="/agents">{() => <Redirect to="/intel/agents" />}</Route>
            <Route path="/seo">{() => <Redirect to="/intel/seo" />}</Route>

            {/* Feedback admin */}
            <Route path="/feedback" component={FeedbackAdmin} />

            {/* Investor portal — standalone page */}
            <Route path="/investors" component={LegalInvestors} />
            {/* Legacy alias — keeps existing links working */}
            <Route path="/legal/investors">{() => <Redirect to="/investors" />}</Route>

            {/* LEGAL pages */}
            <Route path="/legal" component={LegalHub} />
            <Route path="/legal/terms" component={LegalTerms} />
            <Route path="/legal/privacy" component={LegalPrivacy} />
            <Route path="/legal/contact" component={LegalContact} />
            <Route path="/legal/refunds" component={LegalRefunds} />
            <Route path="/legal/returns" component={LegalReturns} />
            <Route path="/legal/cancellation" component={LegalCancellation} />
            <Route path="/legal/promotions" component={LegalPromotions} />
            <Route path="/legal/restrictions" component={LegalRestrictions} />

            <Route component={NotFound} />
          </Switch>
        </Suspense>
        </ErrorBoundary>
      )}
      {/* Legal footer — subtle, only on non-fullscreen authenticated routes */}
      {showNavBar && isAuthenticated && !pathname.startsWith("/legal") && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            padding: "4px 16px",
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          {[
            { label: "Terms", href: "/legal/terms" },
            { label: "Privacy", href: "/legal/privacy" },
            { label: "Contact", href: "/legal/contact" },
            { label: "Legal", href: "/legal" },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: "9px",
                fontFamily: "monospace",
                color: "rgba(63,63,70,0.6)",
                textDecoration: "none",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                pointerEvents: "auto",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "rgba(56,189,248,0.5)";
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "rgba(63,63,70,0.6)";
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary fallbackTitle="APP CRASHED">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ActiveCallProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <NavBarVisibilityProvider>
                <FeatureStateProvider>
                  <AppShell />
                </FeatureStateProvider>
              </NavBarVisibilityProvider>
            </WouterRouter>
            <Toaster />
          </ActiveCallProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
