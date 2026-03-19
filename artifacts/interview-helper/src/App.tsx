import { Suspense, lazy, memo, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import { MobileBottomBar, MobileSubNav } from "@/components/MobileBottomBar";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const FULLSCREEN_ROUTES = ["/world", "/world/play", "/mobile", "/admin/billboards"];
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
  const isFullscreenRoute = FULLSCREEN_ROUTES.includes(pathname);
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

  const showMobileBar = !isFullscreenRoute && !hideNavBar && !(isRootRoute && !isAuthenticated);

  return (
    <>
      {showNavBar && <NavBar />}
      {showNavBar && <MobileSubNav />}
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

            {/* BUSINESS module */}
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
            <Route path="/business/phone">{() => <Redirect to="/business/contacts" />}</Route>
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

            <Route component={NotFound} />
          </Switch>
        </Suspense>
      )}
      {/* Mobile bottom tab bar */}
      {showMobileBar && <MobileBottomBar />}
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
