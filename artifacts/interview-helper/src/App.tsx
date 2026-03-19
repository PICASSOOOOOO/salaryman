import { Suspense, lazy, memo, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";
import { FeatureStateProvider } from "@/hooks/use-feature-state";
import { useAuth } from "@workspace/replit-auth-web";

const Home = lazy(() => import("@/pages/Home"));
const Cover = lazy(() => import("@/pages/Cover"));
const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const Console = lazy(() => import("@/pages/Console"));
const Profile = lazy(() => import("@/pages/Profile"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Upgrade = lazy(() => import("@/pages/Upgrade"));
const WorldMenu = lazy(() => import("@/pages/WorldMenu"));
const WorldPlay = lazy(() => import("@/pages/WorldPlay"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const Hiring = lazy(() => import("@/pages/Hiring"));
const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const Documents = lazy(() => import("@/pages/Documents"));
const Reporting = lazy(() => import("@/pages/Reporting"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Features = lazy(() => import("@/pages/Features"));
const AgentTeam = lazy(() => import("@/pages/AgentTeam"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const NotFound = lazy(() => import("@/pages/not-found"));

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
const MemoHiring = memo(Hiring as React.ComponentType);

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
  const isHiring = pathname === "/hiring" || pathname.startsWith("/hiring/");
  const isKeepAliveActive = isHome || isConsole || isHiring;

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
      {showNavBar && <NavBar />}
      {/* Keep-alive panels: each gets own Suspense; hidden panels show nothing while loading */}
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
      <Suspense fallback={isHiring ? <CRTFallback /> : null}>
        <div style={{ display: isHiring ? "block" : "none" }}>
          <MemoHiring />
        </div>
      </Suspense>
      {/* Other routes render normally */}
      {!isKeepAliveActive && (
        <Suspense fallback={<CRTFallback />}>
          <Switch>
            <Route path="/features" component={Features} />
            <Route path="/contacts" component={ContactCollector} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/profile" component={Profile} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/upgrade" component={Upgrade} />
            <Route path="/world" component={WorldMenu} />
            <Route path="/world/play" component={WorldPlay} />
            <Route path="/admin/billboards" component={BillboardAdmin} />
            <Route path="/studio" component={ContentStudio} />
            <Route path="/documents" component={Documents} />
            <Route path="/reporting" component={Reporting} />
            <Route path="/mobile" component={MobileTerminal} />
            <Route path="/agents" component={AgentTeam} />
            <Route path="/campaigns" component={Campaigns} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
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
