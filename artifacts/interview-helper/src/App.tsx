import { Suspense, lazy, memo, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import { MobileSubNav, MobileModuleNav } from "@/components/MobileBottomBar";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";
import { FeatureStateProvider } from "@/hooks/use-feature-state";
import { useAuth } from "@workspace/replit-auth-web";

const Home = lazy(() => import("@/pages/Home"));
const Cover = lazy(() => import("@/pages/Cover"));
const Console = lazy(() => import("@/pages/Console"));
const Profile = lazy(() => import("@/pages/Profile"));
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

const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const SoundLab = lazy(() => import("@/pages/SoundLab"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const BrandKit = lazy(() => import("@/pages/BrandKit"));

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

const CalllHomePage = lazy(() => import("@/pages/phone/CalllHomePage"));

const MeetPage = lazy(() => import("@/pages/MeetPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const FULLSCREEN_ROUTES = ["/world", "/world/play", "/mobile", "/admin/billboards", "/meet"];
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
        color: "rgba(34,197,94,0.7)",
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

function AppShell() {
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
      {/* Keep-alive panels */}
      <Suspense fallback={isHome ? <CRTFallback /> : null}>
        <div style={{ display: isHome ? "block" : "none" }}>
          {isAuthenticated ? <MemoHome /> : <Cover />}
        </div>
      </Suspense>
      <Suspense fallback={isConsole ? <CRTFallback /> : null}>
        <div style={{ display: isConsole ? "block" : "none" }}>
          <MemoConsole />
        </div>
      </Suspense>

      {/* Other routes — lazy-loaded */}
      {!isKeepAliveActive && (
        <Suspense fallback={<CRTFallback />}>
          <Switch>
            {/* Standalone routes */}
            <Route path="/features" component={Features} />
            <Route path="/profile" component={Profile} />
            <Route path="/upgrade" component={Upgrade} />
            <Route path="/world" component={WorldMenu} />
            <Route path="/world/play" component={WorldPlay} />
            <Route path="/admin/billboards" component={BillboardAdmin} />
            <Route path="/mobile" component={MobileTerminal} />
            <Route path="/meet/:code">{(params) => <MeetPage params={params} />}</Route>

            {/* BUSINESS module */}
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
            <Route path="/business">{() => <Redirect to="/business/contacts" />}</Route>

            {/* CREATIVE module */}
            <Route path="/creative/studio" component={ContentStudio} />
            <Route path="/creative/lab">{() => <SoundLab />}</Route>
            <Route path="/creative/campaigns" component={Campaigns} />
            <Route path="/creative/brand" component={BrandKit} />
            <Route path="/creative">{() => <Redirect to="/creative/studio" />}</Route>

            {/* INTEL module */}
            <Route path="/intel/reports" component={Reporting} />
            <Route path="/intel/dashboard" component={Dashboard} />
            <Route path="/intel/agents" component={AgentTeam} />
            <Route path="/intel/goals" component={Goals} />
            <Route path="/intel/seo" component={SeoModule} />
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
                (e.currentTarget as HTMLAnchorElement).style.color = "rgba(34,197,94,0.5)";
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <NavBarVisibilityProvider>
            <FeatureStateProvider>
              <AppShell />
            </FeatureStateProvider>
          </NavBarVisibilityProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
