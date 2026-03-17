import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";

const Home = lazy(() => import("@/pages/Home"));
const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const PresenterMode = lazy(() => import("@/pages/PresenterMode"));
const Profile = lazy(() => import("@/pages/Profile"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Upgrade = lazy(() => import("@/pages/Upgrade"));
const WorldMenu = lazy(() => import("@/pages/WorldMenu"));
const WorldPlay = lazy(() => import("@/pages/WorldPlay"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const Hiring = lazy(() => import("@/pages/Hiring"));
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

function CRTFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#030803",
        color: "rgba(0,255,65,0.7)",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        letterSpacing: "0.1em",
      }}
    >
      LOADING...
    </div>
  );
}

function AppShell() {
  const [location] = useLocation();
  const { hideNavBar } = useNavBarVisibility();

  const pathname = location.split("?")[0];
  const isFullscreenRoute = FULLSCREEN_ROUTES.includes(pathname);
  const showNavBar = !isFullscreenRoute && !hideNavBar;

  return (
    <Suspense fallback={<CRTFallback />}>
      {showNavBar && <NavBar />}
      <Switch>
          <Route path="/" component={Home} />
          <Route path="/contacts" component={ContactCollector} />
          <Route path="/presenter" component={PresenterMode} />
          <Route path="/profile" component={Profile} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/upgrade" component={Upgrade} />
          <Route path="/world" component={WorldMenu} />
          <Route path="/world/play" component={WorldPlay} />
          <Route path="/admin/billboards" component={BillboardAdmin} />
          <Route path="/hiring" component={Hiring} />
          <Route path="/mobile" component={MobileTerminal} />
          <Route component={NotFound} />
        </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <NavBarVisibilityProvider>
            <AppShell />
          </NavBarVisibilityProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
