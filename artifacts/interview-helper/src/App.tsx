import { apiFetch } from '@/lib/api-client';
import { Suspense, lazy, memo, useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import AbandonmentBanner from "@/components/AbandonmentBanner";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { MobileModuleNav } from "@/components/MobileBottomBar";
import { installAppHistoryTracking } from "@/lib/app-navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useUndoShortcut } from "@/hooks/use-undo";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";
import { FeatureStateProvider } from "@/hooks/use-feature-state";
import { PledgeStorePopupProvider } from "@/components/PledgeStorePopup";
import { useAuth } from "@/hooks/use-auth";
import { usePageMeta } from "@/hooks/use-page-meta";
import { hydrateSettingsFromServer, initSettingsSync } from "@/lib/settings-sync";
import { hydrateOnboardingStatus, resetOnboardingStatus, useOnboardingResolved } from "@/lib/onboarding-sync";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioDeviceProvider } from "@/contexts/TwilioDeviceContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { isTutorialDone } from "@/lib/tutorial-progress";
import { isEmbedMode } from "@/lib/embed-mode";
import { sanitizeReturnPath } from "@/lib/safe-path";
import { DeviceControlBridge } from "@/components/DeviceControlBridge";
import { DeferredChatPanel } from "@/components/DeferredChatPanel";
import Console from "@/pages/Console";

const Home = lazy(() => import("@/pages/Home"));
const ProfessionalHome = lazy(() => import("@/pages/ProfessionalHome"));
const loadPabloTerminal = () => import("@/pages/PabloTerminal");
const PabloTerminal = lazy(loadPabloTerminal);
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const PabloDeck = lazy(() => import("@/pages/PabloDeck"));
const PledgeStore = lazy(() => import("@/pages/PledgeStore"));
const DesktopDownload = lazy(() => import("@/pages/DesktopDownload"));
const Profile = lazy(() => import("@/pages/Profile"));
const SettingsPage = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.SettingsPage })));
const AdminHub = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.AdminHub })));
const ModeratorPanel = lazy(() => import("@/pages/ModeratorPanel"));
const ProfilePicker = lazy(() => import("@/pages/ProfilePicker"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const SeoModule = lazy(() => import("@/pages/SeoModule"));
const NotFound = lazy(() => import("@/pages/not-found"));

const ActiveCallBar = lazy(() => import("@/components/FloatingCallBar").then((m) => ({ default: m.ActiveCallBar })));
const NotificationToaster = lazy(() => import("@/components/NotificationToaster").then((m) => ({ default: m.NotificationToaster })));
const CommandPalette = lazy(() => import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette })));

const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const Hiring = lazy(() => import("@/pages/Hiring"));
const JobOffers = lazy(() => import("@/pages/JobOffers"));
const JobBoard = lazy(() => import("@/pages/JobBoard"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Documents = lazy(() => import("@/pages/Documents"));
const ResumeBuilder = lazy(() => import("@/pages/ResumeBuilder"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Deals = lazy(() => import("@/pages/Deals"));
const CrmWorkspace = lazy(() => import("@/pages/CrmWorkspace"));
const OrgWebsite = lazy(() => import("@/pages/OrgWebsite"));
const LeadsPage = lazy(() => import("@/pages/LeadsPage"));

const DarkRoom = lazy(() => import("@/pages/DarkRoom"));
const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const WriterStudio = lazy(() => import("@/pages/WriterStudio"));
const Classroom = lazy(() => import("@/pages/Classroom"));
const VideoStudio = lazy(() => import("@/pages/VideoStudio"));
const SchematicDecoder = lazy(() => import("@/pages/SchematicDecoder"));
const SoundLab = lazy(() => import("@/pages/SoundLab"));
const TerrenceStudio = lazy(() => import("@/pages/TerrenceStudio"));
const MusicJukebox = lazy(() => import("@/pages/MusicJukebox"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Marketing = lazy(() => import("@/pages/Marketing"));
const Autopilot = lazy(() => import("@/pages/Autopilot"));
const Armory = lazy(() => import("@/pages/Armory"));
const OrgHub = lazy(() => import("@/pages/OrgHub"));
const BrandKit = lazy(() => import("@/pages/BrandKit"));
const MediaLibrary = lazy(() => import("@/pages/MediaLibrary"));
const Colleagues = lazy(() => import("@/pages/Colleagues"));
const Comms = lazy(() => import("@/pages/Comms"));

const Reporting = lazy(() => import("@/pages/Reporting"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Goals = lazy(() => import("@/pages/Goals"));
const VideoAnalyzer = lazy(() => import("@/pages/VideoAnalyzer"));
const JobCommandCenter = lazy(() => import("@/pages/JobCommandCenter"));
const ClaudeTemplates = lazy(() => import("@/pages/ClaudeTemplates"));
const ProductionStudio = lazy(() => import("@/pages/ProductionStudio"));

const LegalHub = lazy(() => import("@/pages/legal/LegalHub"));
const LegalTerms = lazy(() => import("@/pages/legal/TermsOfService"));
const LegalPrivacy = lazy(() => import("@/pages/legal/PrivacyPolicy"));
const LegalContact = lazy(() => import("@/pages/legal/ContactPage"));
const LegalRefunds = lazy(() => import("@/pages/legal/RefundPolicy"));
const LegalReturns = lazy(() => import("@/pages/legal/ReturnPolicy"));
const LegalCancellation = lazy(() => import("@/pages/legal/CancellationPolicy"));
const LegalPromotions = lazy(() => import("@/pages/legal/PromotionsPolicy"));
const LegalRestrictions = lazy(() => import("@/pages/legal/RestrictionsPolicy"));
const SmsOptIn = lazy(() => import("@/pages/SmsOptIn"));

const BusinessHub = lazy(() => import("@/pages/BusinessHub"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const GustoPayroll = lazy(() => import("@/pages/GustoPayroll"));
const Bills = lazy(() => import("@/pages/Bills"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const BalanceSheet = lazy(() => import("@/pages/BalanceSheet"));
const Accounting = lazy(() => import("@/pages/Accounting"));
const TurboTax = lazy(() => import("@/pages/TurboTax"));
const TimeTracking = lazy(() => import("@/pages/TimeTracking"));
const TaskBoard = lazy(() => import("@/pages/TaskBoard"));
const TeamDirectory = lazy(() => import("@/pages/TeamDirectory"));
const Announcements = lazy(() => import("@/pages/Announcements"));
const Estimates = lazy(() => import("@/pages/Estimates"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const ProfitLoss = lazy(() => import("@/pages/ProfitLoss"));
const Partnerships = lazy(() => import("@/pages/Partnerships"));
const OrgAccounts = lazy(() => import("@/pages/OrgAccounts"));

const CalllHomePage = lazy(() => import("@/pages/phone/CalllHomePage"));

// /phone opens CALLL HOME directly. Entitlement UX stays inside the product.
function PhoneGate({ redirectTo }: { redirectTo?: string } = {}) {
  if (redirectTo) return <Redirect to={redirectTo} />;
  return <CalllHomePage />;
}

function LegacyUpgradeRedirect() {
  const params = new URLSearchParams(window.location.search);
  params.set("view", "prime");
  return <Redirect to={`/pledge?${params.toString()}`} />;
}

function PledgeStoreRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "agents") return <Redirect to="/pledge" />;
  return <PledgeStore />;
}

const MeetPage = lazy(() => import("@/pages/MeetPage"));
const AdminTickets = lazy(() => import("@/pages/AdminTickets"));
const FeedbackAdmin = lazy(() => import("@/pages/FeedbackAdmin"));
const ArtLibrary = lazy(() => import("@/pages/ArtLibrary"));
const BotFactory = lazy(() => import("@/pages/BotFactory"));
const CutscenePage = lazy(() => import("@/pages/CutscenePage"));
const BotVendingMachine = lazy(() => import("@/pages/BotVendingMachine"));
const RealtyStore = lazy(() => import("@/pages/RealtyStore"));
const BusinessMarketplace = lazy(() => import("@/pages/BusinessMarketplace"));
const BusinessFloorPlanner = lazy(() => import("@/pages/BusinessFloorPlanner"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const BusinessServices = lazy(() => import("@/pages/BusinessServices"));
const VendingMachine = lazy(() => import("@/pages/VendingMachine"));
const DevTasksAdmin = lazy(() => import("@/pages/DevTasksAdmin"));
const AlphaApply = lazy(() => import("@/pages/AlphaApply"));
const AlphaAdmin = lazy(() => import("@/pages/AlphaAdmin"));

const MediaCenter = lazy(() => import("@/pages/MediaCenter"));
const KnowledgeVault = lazy(() => import("@/pages/KnowledgeVault"));
const PromptSensei = lazy(() => import("@/pages/PromptSensei"));
const InsuranceHub = lazy(() => import("@/pages/InsuranceHub"));
const PlatformAPI = lazy(() => import("@/pages/PlatformAPI"));
const SocialMediaManager = lazy(() => import("@/pages/SocialMediaManager"));
const MarketingCommandCenter = lazy(() => import("@/pages/MarketingCommandCenter"));
const StemStudio = lazy(() => import("@/pages/StemStudio"));
const DesignStudio = lazy(() => import("@/pages/DesignStudio"));
const WebScraper = lazy(() => import("@/pages/WebScraper"));
const MyOffice = lazy(() => import("@/pages/MyOffice"));
const TheaterPage = lazy(() => import("@/pages/TheaterPage"));
const DeviceLink = lazy(() => import("@/pages/DeviceLink"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const FULLSCREEN_ROUTES = ["/mobile", "/terminal", "/profile/admin/billboards", "/admin/billboards", "/meet", "/pablo", "/pablo/deck", "/onboarding", "/theater", "/device-link", "/sms-opt-in"];

function LoadingFallback() {
  return (
    <div
      className="app-loading-screen"
      role="status"
      aria-live="polite"
      aria-label="Pablo is synchronizing this workspace"
    >
      <div className="app-loading-card">
        <div className="app-loading-signal" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="app-loading-label">PABLO // SYNCING</p>
        <p className="app-loading-detail">ROUTE HANDSHAKE</p>
      </div>
    </div>
  );
}

const MemoHome = memo(Home as React.ComponentType);
const MemoConsole = memo(Console as React.ComponentType);

function HomeOrCover() {
  const [location] = useLocation();
  // This component is kept-alive (always mounted, just hidden via display:none
  // on non-home routes). Guard on the actual path so the homepage surface does
  // not interfere with deep routes (e.g. /my-office).
  if (location.split("?")[0] !== "/") return null;
  // The homepage is the browser product index. Pablo's full nebula/chat
  // experience remains a dedicated destination at /pablo.
  return <ProfessionalHome />;
}

const FLOATING_BAR_ROUTES = [
  "/",
  "/console",
  "/business",
  "/intel",
];

function AppShell() {
  useUndoShortcut();
  const { isAuthenticated, isLoading, user } = useAuth();
  const onboardingResolved = useOnboardingResolved();
  useHeartbeat(isAuthenticated && onboardingResolved && !isLoading);
  usePageMeta();
  const [location] = useLocation();
  const { hideNavBar } = useNavBarVisibility();

  useEffect(() => {
    const root = document.documentElement;
    const syncViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - height - top);
      root.style.setProperty("--app-viewport-height", `${height}px`);
      root.style.setProperty("--app-viewport-top", `${top}px`);
      root.style.setProperty("--app-keyboard-inset", `${keyboardInset}px`);
      root.classList.toggle("app-keyboard-open", keyboardInset > 120);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      root.classList.remove("app-keyboard-open");
    };
  }, []);

  const pathname = location.split("?")[0];
  useEffect(() => {
    // Keep Pablo out of the initial homepage bundle, but warm its route chunk
    // after the landing surface has painted so opening it does not feel slow.
    if (pathname !== "/") return;
    const timer = window.setTimeout(() => { void loadPabloTerminal(); }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  // ── Route-change audio backstop ────────────────────────────────────────────
  // Pages own starting their background audio and stopping it on unmount, but a
  // page that forgets to clean up would leak its procedural score/bed (module
  // singletons in soundEngine survive route changes) into the next route. On
  // every navigation, force-stop the engine background tiers the DESTINATION
  // route does not legitimately run. The destination's own mount effects restart
  // whatever it needs, and soundEngine's running-flag guards make a redundant
  // stop a no-op, so this never fights the page that owns the route. The radio /
  // Hummingbird and the global Shadow Radio HTMLAudio tiers self-clean through
  // the background coordinator, so
  // they are handled by the coordinator's claim/release, not stopped here.
  useEffect(() => {
    let cancelled = false;
    void import("@/soundEngine").then(({ stopAllBackgroundAudio }) => {
      if (cancelled) return;
      stopAllBackgroundAudio();
    });
    return () => { cancelled = true; };
  }, [pathname]);

  const isRootRoute = pathname === "/";
  const isDeviceLinkRoute = pathname === "/device-link";
  const isPabloRoute = pathname === "/pablo";
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  // The browser product has one visual contract: cream/white surfaces and
  // black ink. The downloadable game owns the cyberpunk palette.
  const isLightWorkspace = true;
  // ProfessionalHome owns the root header. Keep the global workspace chrome
  // off / so the homepage does not render two navigation systems.
  const showNavBar = !isFullscreenRoute && !hideNavBar && !isRootRoute;
  // EMBED — when a page is iframed as a chrome-free monitor (?embed=1, e.g. the
  // /my-office surveillance pane), suppress ALL app-level floating chrome
  // (alpha banner, audio control, toaster) so the iframe reads as one clean
  // feed instead of a miniature copy of the whole app.
  const isEmbed = isEmbedMode();

  const isHome = pathname === "/";
  const consoleSubRoutes = ["/console/agents", "/console/video", "/console/vault", "/console/scraper"];
  const isConsoleTerminal = pathname === "/console";
  const isConsoleSubRoute = consoleSubRoutes.some(r => pathname === r || pathname.startsWith(r + "/"));
  const isConsole = isConsoleTerminal || pathname.startsWith("/console/");
  const isPrimarySurfaceActive = isHome || (isConsole && !isConsoleSubRoute);

  // /mobile is the business workspace, not a gameplay surface.
  const isGameRoute = false;

  // Edge-swipe back/forward navigation. Disabled on game/canvas routes that
  // already own touch gestures. Swipe right from the left edge → previous
  // page; swipe left from the right edge → forward in browser history.
  useSwipeNavigation({ enabled: !isGameRoute });

  const isPhoneRoute = pathname === "/phone" || pathname.startsWith("/phone/");
  const isLegalRoute = pathname === "/legal" || pathname.startsWith("/legal/");
  const showFloatingBar = isAuthenticated && !isFullscreenRoute && !isGameRoute && !isPhoneRoute && !isLegalRoute &&
    FLOATING_BAR_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  // GLOBAL GATE. Before a visitor passes security (signs in), the visible
  // surface is Pablo's homepage, plus the /auth + /api machinery that performs
  // the sign-in. Pablo remains the homepage after sign-in too; Tower entry is
  // an explicit handoff from that surface.
  // Typing or deep-linking ANY other URL (/game, /console, /business,
  // /world, /profile, /legal, /alpha, …) silently bounces them back to the
  // queue, so nothing behind the firewall is reachable by guessing a path.
  //
  // Once authenticated, the open Tower lobby and legal pages are available
  // before any optional outside-world paperwork.
  const ANON_ALLOWED_PREFIXES = ["/desktop", "/phone", "/pablo", "/pledge", "/upgrade", "/sign-in", "/sign-up", "/legal", "/device-link", "/sms-opt-in", "/auth", "/api"];
  // A freshly authenticated account must complete the one-screen registry
  // choice before it can reach the workspace. Onboarding provides the two
  // valid exits: register a business or skip business setup for now.
  const NEW_USER_ALLOWED_PREFIXES = ["/onboarding", "/sign-in", "/sign-up", "/legal", "/device-link", "/sms-opt-in", "/auth", "/api"];
  // Powering on the landing cinematic's terminal sends visitors to /console
   // so an anonymous visitor must be allowed to reach EXACTLY
  // /console and see the console's own sign-in screen there — without being
  // bounced back to the nebula front door. We allow only the exact path, never
  // the /console/* subroutes (those tool deep-routes stay protected: guessing
  // them while logged out still bounces to the door). The console sign-in
  // screen passes returnTo="/console" to OAuth, so after signing in the visitor
  // lands back on the console rather than the app base.
  const ANON_ALLOWED_EXACT = [
    "/console",
    "/business/autopilot",
    "/bots",
    "/agents",
    "/intel/agents",
  ];
  const matchesPrefix = (list: string[]) =>
    list.some(p => pathname === p || pathname.startsWith(p + "/"));
  const allowedForAnon = pathname === "/" || matchesPrefix(ANON_ALLOWED_PREFIXES) || ANON_ALLOWED_EXACT.includes(pathname);
  const allowedForAuthedNew = matchesPrefix(NEW_USER_ALLOWED_PREFIXES);
  const tutorialDone = isTutorialDone();
  const isAllowedForNewUser = isAuthenticated ? allowedForAuthedNew : allowedForAnon;
  // Wait for auth to resolve before bouncing: isAuthenticated starts false on
  // cold load, so acting during isLoading would kick a signed-in-but-uncleared
  // user off a post-sign-in route before we know they're authed.
  // Also wait for the server onboarding check (authed users only): a returning,
  // already-onboarded user has no local salaryman_tutorial_done flag yet, so
  // bouncing before hydrateOnboardingStatus() resolves would force them back
  // through intake. Anonymous visitors don't run that check, so this never
  // delays their bounce to /pablo.
  const onboardingPending = isAuthenticated && !onboardingResolved;
  // Do not mount a protected game/office surface while the save-list check is
  // still deciding whether this browser is stale after a development reset.
  // Once an authenticated empty list is observed, hydration clears the local
  // tutorial flag and this rerenders into the Tower reception redirect.
  // /console is the explicit post-login handoff destination. Let its own
  // auth-aware surface render while the background onboarding check catches up;
  // otherwise a returning user can be trapped on the sync screen immediately
  // after the callback even though the session is already valid.
  const holdForOnboarding =
    onboardingPending && isAuthenticated && !allowedForAuthedNew && !isConsoleTerminal;
  const newUserBlocked = !isLoading && !onboardingPending && !tutorialDone && !isAllowedForNewUser;
  // Close the hydration window: while auth is still resolving, hold any path an
  // anonymous visitor may NOT see behind a loading screen instead of rendering
  // it. This stops a logged-out deep link (/profile, /legal, …) from flashing
  // the protected page before the bounce fires, without mis-kicking a signed-in
  // user who is legitimately allowed to be there. Cleared users (tutorialDone)
  // are never held.
  const holdForAuth = isLoading && !tutorialDone && !allowedForAnon;
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!newUserBlocked) return;
    const requested = `${window.location.pathname}${window.location.search}`;
    if (!isAuthenticated) {
      const returnTo = requested === "/" ? "" : `?returnTo=${encodeURIComponent(requested)}`;
      navigate(`/sign-in${returnTo}`, { replace: true });
      return;
    }
    const returnTo = requested === "/onboarding" ? "" : `?returnTo=${encodeURIComponent(requested)}`;
    navigate(`/onboarding${returnTo}`, { replace: true });
  }, [newUserBlocked, isAuthenticated, location, navigate]);

  // Server-authoritative onboarding skip: resolve the server state as soon as
  // Clerk reports a signed-in user. Background API work is kept below until
  // this handshake completes.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      resetOnboardingStatus();
      return;
    }
    void hydrateOnboardingStatus(user.id);
  }, [isAuthenticated, user?.id]);

  // Cross-device settings sync: once the server-authoritative onboarding read
  // finishes, pull the player's saved display / visual-quality preferences down
  // to this device and mirror further local changes back up. This deliberately
  // avoids the Clerk-to-API bootstrap 401 window.
  useEffect(() => {
    if (!isAuthenticated || !onboardingResolved) return;
    void hydrateSettingsFromServer();
    const teardown = initSettingsSync();
    return teardown;
  }, [isAuthenticated, onboardingResolved]);

  useEffect(() => {
    if (!isAuthenticated || !onboardingResolved) return;
    const sendHeartbeat = () => {
      apiFetch('/api/world/heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
    };
    sendHeartbeat();
    const hbInterval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(hbInterval);
  }, [isAuthenticated, onboardingResolved]);

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

  useEffect(() => {
    document.body.classList.toggle("workspace-light", isLightWorkspace);
    return () => {
      document.body.classList.remove("workspace-light");
    };
  }, [isLightWorkspace]);

  // Hold protected paths behind a loading screen until auth resolves (see
  // holdForAuth above) so a logged-out deep link can never flash the page.
  if (holdForAuth || holdForOnboarding) return <LoadingFallback />;
  // Do not mount a protected route for even one frame while the effect above
  // updates browser history. Mounting it can start authenticated API requests;
  // their expected 401 would otherwise win the race and send the visitor to
  // the legacy Pablo sign-in surface instead of Tower reception.
  if (newUserBlocked) return <LoadingFallback />;

  return (
    <>
      <DeviceControlBridge />
      {showNavBar && (
          <div className={`app-chrome${isRootRoute ? " app-chrome--home" : ""}`}>
          <AbandonmentBanner />
          <NavBar />
          <MobileModuleNav />
        </div>
      )}
      {/* Site-wide command palette (nav search bar + ⌘K). Mounted wherever the
          nav chrome shows — never on the /pablo front door, embeds, or
          fullscreen routes, so it doesn't touch those experiences. */}
      <Suspense fallback={null}>
        {showNavBar && <CommandPalette />}
        {showFloatingBar && <ActiveCallBar />}
      {/* Route-independent toaster for the persistent notification stream.
          Immersive gameplay intentionally keeps this surface out of the
          viewport; ordinary fullscreen routes still receive it. */}
        {isAuthenticated && !isEmbed && !isRootRoute && !isGameRoute && !isDeviceLinkRoute && <NotificationToaster />}
      </Suspense>
      {/* Primary surfaces are mounted only while active. Keeping both large
          trees hidden behind every office/paid-feature route retained their
          state, effects, and DOM for the entire session. Route state already
          persists through the app stores, so unmounting here releases memory
          without weakening the office or paid-feature paths. */}
      <div key={location} className="app-route-surface">
      {isHome && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <HomeOrCover />
          </Suspense>
        </ErrorBoundary>
      )}
      {isConsoleTerminal && (
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <MemoConsole />
          </Suspense>
        </ErrorBoundary>
      )}
      {isConsoleTerminal && isAuthenticated && <DeferredChatPanel />}

      {/* Other routes — lazy-loaded */}
      {!isPrimarySurfaceActive && (
        <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Switch>
            <Route path="/sign-in/*?" component={ReplitAuthPage} />
            <Route path="/sign-up/*?" component={ReplitAuthPage} />
            {/* Standalone routes */}
            <Route path="/pablo/promo">{() => <Redirect to="/pablo" />}</Route>
            <Route path="/pablo/deck" component={PabloDeck} />
            <Route path="/pablo">{() => <PabloTerminal />}</Route>
            <Route path="/sms-opt-in" component={SmsOptIn} />
            <Route path="/onboarding" component={Onboarding} />
            <Route path="/profile/admin/billboards" component={BillboardAdmin} />
            <Route path="/profile/admin/tickets" component={AdminTickets} />
            <Route path="/profile/admin/tickets/:id">{(params) => <AdminTickets params={params} />}</Route>
            <Route path="/profile/admin/dev-tasks" component={DevTasksAdmin} />
            <Route path="/profile/admin/feedback" component={FeedbackAdmin} />
            <Route path="/profile/admin/alpha" component={AlphaAdmin} />
            <Route path="/profile/admin/art" component={ArtLibrary} />
            <Route path="/alpha" component={AlphaApply} />
            <Route path="/desktop" component={DesktopDownload} />
            <Route path="/download">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/subway">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/travel">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/profile/admin" component={AdminHub} />
            <Route path="/profile/moderator" component={ModeratorPanel} />
            <Route path="/profile/world-map">{() => <Redirect to="/desktop" />}</Route>
            {/* Platform API + the legacy APIs tab now live inside the unified
                /settings page (General group). Preserve old deep links. */}
            <Route path="/profile/platform">{() => <Redirect to={`/settings${window.location.search}`} />}</Route>
            <Route path="/profile/apis">{() => <Redirect to="/settings" />}</Route>
            <Route path="/settings" component={SettingsPage} />
            <Route path="/profile" component={Profile} />
            <Route path="/profiles" component={ProfilePicker} />
            <Route path="/profile/:userId" component={MemberProfile} />
            <Route path="/upgrade" component={LegacyUpgradeRedirect} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/wallet" component={Wallet} />
            {/* Playable React gameplay retired. Keep old bookmarks useful by
                sending them to the native desktop client landing page. */}
            <Route path="/world">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/world/*">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/game">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/game/*">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/office">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/office/*">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/recreation">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/tower">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/tower/*">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/my-office" component={MyOffice} />
            <Route path="/game/settings">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/skills">{() => <Redirect to="/desktop" />}</Route>
            {/* The legacy bathroom->office cutscene now folds into the single
                walkable office (no separate tutorial-office surface). */}
            <Route path="/game/office">{() => <Redirect to="/desktop" />}</Route>
            <Route path="/admin/billboards">{() => <Redirect to="/profile/admin/billboards" />}</Route>
            <Route path="/admin/tickets">{() => <Redirect to="/profile/admin/tickets" />}</Route>
            <Route path="/admin/tickets/:id">{(params) => <Redirect to={`/profile/admin/tickets/${params.id}`} />}</Route>
            <Route path="/admin/dev-tasks">{() => <Redirect to="/profile/admin/dev-tasks" />}</Route>
            <Route path="/admin/feedback">{() => <Redirect to="/profile/admin/feedback" />}</Route>
            <Route path="/admin">{() => {
              const qs = window.location.search;
              return <Redirect to={`/profile/admin${qs}`} />;
            }}</Route>
            <Route path="/mobile">{() => <MobileTerminal />}</Route>
            <Route path="/terminal">{() => <MobileTerminal physicalTerminal />}</Route>
            <Route path="/device-link" component={DeviceLink} />
            <Route path="/theater" component={TheaterPage} />
            <Route path="/meet/:code">{(params) => <MeetPage params={params} />}</Route>

            {/* BUSINESS module */}
            <Route path="/business/marketplace" component={BusinessMarketplace} />
            <Route path="/business/floor-plans" component={BusinessFloorPlanner} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/business/services" component={BusinessServices} />
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/business/jobs" component={JobBoard} />
            <Route path="/business/job-command" component={JobCommandCenter} />
            <Route path="/job-offers" component={JobOffers} />
            <Route path="/business/interview" component={Console} />
             <Route path="/calendar">{() => <Redirect to="/business/calendar" />}</Route>
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/resume" component={ResumeBuilder} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
             <Route path="/business/crm" component={CrmWorkspace} />
             <Route path="/crm">{() => <Redirect to="/business/crm" />}</Route>
            <Route path="/business/website" component={OrgWebsite} />
            <Route path="/business/payroll" component={Payroll} />
            <Route path="/business/gusto" component={GustoPayroll} />
            <Route path="/business/time-tracking" component={TimeTracking} />
            <Route path="/business/tasks" component={TaskBoard} />
            <Route path="/business/team" component={TeamDirectory} />
            <Route path="/business/autopilot" component={Autopilot} />
            <Route path="/business/partnerships" component={Partnerships} />
            <Route path="/business/announcements" component={Announcements} />
            <Route path="/business/estimates" component={Estimates} />
            <Route path="/business/contracts" component={Contracts} />
            <Route path="/business/vendors" component={Vendors} />
            <Route path="/business/profit-loss" component={ProfitLoss} />
            <Route path="/business/bills" component={Bills} />
            <Route path="/business/expenses" component={Expenses} />
            <Route path="/business/leads">{() => <Redirect to="/marketing/leads" />}</Route>
            <Route path="/business" component={BusinessHub} />

            {/* CREATIVE module */}
            <Route path="/creative/darkroom" component={DarkRoom} />
            <Route path="/creative/studio">{() => <Redirect to="/creative/darkroom" />}</Route>
            <Route path="/creative/production">{() => <Redirect to="/creative/darkroom" />}</Route>
            <Route path="/creative/lab">{() => <SoundLab />}</Route>
            <Route path="/creative/music" component={MusicJukebox} />
            <Route path="/creative/jukebox">{() => <Redirect to="/creative/music" />}</Route>
            <Route path="/creative/writer" component={WriterStudio} />
            <Route path="/creative/video" component={VideoStudio} />
            <Route path="/creative/schematic" component={SchematicDecoder} />
            <Route path="/creative/terrence-studio" component={TerrenceStudio} />
            <Route path="/terrence-studio" component={TerrenceStudio} />
            <Route path="/creative/campaigns">{() => <Redirect to="/marketing/campaigns" />}</Route>
            <Route path="/creative/brand" component={BrandKit} />
            <Route path="/creative/media" component={MediaLibrary} />
            <Route path="/comms" component={Comms} />
            <Route path="/social/colleagues">{() => <Redirect to="/comms" />}</Route>
            <Route path="/creative/stems" component={StemStudio} />
            <Route path="/creative/design" component={DesignStudio} />
            <Route path="/tools/media-center" component={MediaCenter} />
            <Route path="/creative/classroom" component={Classroom} />
            <Route path="/creative">{() => <Redirect to="/creative/music" />}</Route>

            {/* MARKETING module */}
            <Route path="/marketing/ads" component={Marketing} />
            <Route path="/marketing/campaigns" component={Campaigns} />
            <Route path="/marketing/seo" component={SeoModule} />
            <Route path="/marketing/leads" component={LeadsPage} />
            <Route path="/leads" component={LeadsPage} />
            <Route path="/marketing/social" component={SocialMediaManager} />
            <Route path="/marketing/command" component={MarketingCommandCenter} />
            <Route path="/marketing" component={MarketingCommandCenter} />

            {/* ARMORY module */}
            <Route path="/armory/inventory" component={Armory} />
            <Route path="/armory" component={Armory} />

            {/* ORG module — dedicated org-management hub (separate from OFFICE) */}
            <Route path="/org" component={OrgHub} />
            <Route path="/organizations" component={OrgHub} />

            {/* Legacy agent status page now belongs to the Agent Command Center. */}
            <Route path="/console/agents">{() => <Redirect to="/pledge" />}</Route>
            <Route path="/console/video" component={VideoAnalyzer} />
             <Route path="/knowledge">{() => <Redirect to="/console/vault" />}</Route>
             <Route path="/knowledge-hub">{() => <Redirect to="/console/vault" />}</Route>
             <Route path="/vault">{() => <Redirect to="/console/vault" />}</Route>
            <Route path="/console/vault" component={KnowledgeVault} />
            <Route path="/console/scraper" component={WebScraper} />

            {/* INTEL module */}
            <Route path="/intel/reports" component={Reporting} />
            <Route path="/intel/dashboard" component={Dashboard} />
            <Route path="/intel/goals" component={Goals} />
            <Route path="/business/accounts" component={OrgAccounts} />
            <Route path="/business/balance-sheet" component={BalanceSheet} />
            <Route path="/business/accounting" component={Accounting} />
            <Route path="/business/taxes" component={TurboTax} />
            <Route path="/intel/balance-sheet">{() => { window.location.href = '/business/balance-sheet'; return null; }}</Route>
             <Route path="/intel/agents">{() => <Redirect to="/pledge" />}</Route>
            <Route path="/intel/video">{() => <Redirect to="/console/video" />}</Route>
            <Route path="/intel/seo">{() => <Redirect to="/marketing/seo" />}</Route>
            <Route path="/intel">{() => <Redirect to="/intel/reports" />}</Route>

            {/* PHONE module — one hub; free comms stay open while paid tabs
                render their Stripe-backed access options in-shell. */}
            <Route path="/phone">{() => <PhoneGate />}</Route>
            <Route path="/phone/:rest*">{(params: { rest: string }) => {
              const TAB_MAP: Record<string, string> = {
                contacts: 'contacts', dialer: 'dial', active: 'cmd', cmd: 'cmd',
                history: 'log', recordings: 'rec', recording: 'rec',
                voicemail: 'vm', conference: 'conf', sms: 'sms',
                sessions: 'cmd', coach: 'ai', secretary: 'ai',
                numbers: 'numbers', 'call-center': 'cc',
              };
              // Wouter's wildcard parameter shape differs across versions.
              // The browser pathname is authoritative for these legacy links.
              const legacySegment = window.location.pathname.slice('/phone/'.length).split('/')[0] ?? params.rest ?? '';
              const tab = TAB_MAP[legacySegment] ?? '';
              return <PhoneGate redirectTo={tab ? `/phone?tab=${tab}` : '/phone'} />;
            }}</Route>


            {/* INSURANCE module */}
            <Route path="/insurance" component={InsuranceHub} />

            {/* PLATFORM API module — folded into /settings (preserves query params) */}
            <Route path="/platform">{() => {
              const qs = window.location.search;
              return <Redirect to={`/settings${qs}`} />;
            }}</Route>

            {/* BOTS module */}
            {/* Job Command Center moved into BUSINESS — redirect old bookmarks. */}
            <Route path="/bots/jobs">{() => <Redirect to="/business/job-command" />}</Route>
            <Route path="/bots/templates">{() => <Redirect to="/pablo" />}</Route>
            <Route path="/bots/prompt-sensei">{() => <Redirect to="/pablo" />}</Route>
            {/* The isometric "android factory" office was a divergent, no-exit
                dead-end with its own renderer. It now folds into the single
                walkable pixel office (same artwork, live + surveillance). */}
            <Route path="/bots/office">{() => <Redirect to="/office" />}</Route>
            {/* Per-bot "cinematic office" shells are retired; the office is one
                place. Per-bot management still lives at /bots/:id/command etc. */}
            <Route path="/bots/:id/office">{() => <Redirect to="/office" />}</Route>
            <Route path="/cutscene/:id" component={CutscenePage} />
            <Route path="/vending">{() => <VendingMachine />}</Route>
            <Route path="/store/bots/vending">{() => <Redirect to="/pledge" />}</Route>
            {/* The realty showroom is the functional acquire flow (RealtyStore):
                rent/buy persists server-side via /api/real-estate/acquire. The
                VendingMachine "homebase" tab was a non-persisting V1 stub. */}
            <Route path="/store/realty" component={RealtyStore} />
            <Route path="/cutscene" component={CutscenePage} />
            <Route path="/bots">{() => <Redirect to="/business/autopilot" />}</Route>
            <Route path="/bots/:rest*">{() => <Redirect to="/business/autopilot" />}</Route>

            {/* Old flat routes — redirect to new module paths */}
            <Route path="/dashboard">{() => <Redirect to="/intel/dashboard" />}</Route>
            <Route path="/agents">{() => <Redirect to="/pledge" />}</Route>
            <Route path="/seo">{() => <Redirect to="/marketing/seo" />}</Route>


            {/* Investor portal — standalone page */}
            <Route path="/pledge/agents">{() => <Redirect to="/pledge" />}</Route>
            <Route path="/pledge" component={PledgeStoreRoute} />
            <Route path="/investors" component={PledgeStore} />
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
      {/* Legal links used to render as a fixed footer on every
          authenticated page; it was too small to be useful and partly
          covered the music indicator and other corner widgets. The full
          legal section now lives at /legal (linked from the pledge store
          and the onboarding desk). */}
      </div>
    </>
  );
}

function App() {
  // Tag every client-side route entry so the shared back control can distinguish
  // app navigation from a direct browser entry or an external page.
  installAppHistoryTracking();
  return (
    <ErrorBoundary fallbackTitle="APP CRASHED">
      <WouterRouter base={basePath}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <TwilioDeviceProvider>
              <ActiveCallProvider>
                <MusicPlayerProvider>
                  <NavBarVisibilityProvider>
                    <FeatureStateProvider>
                      <PledgeStorePopupProvider>
                        <AppShell />
                      </PledgeStorePopupProvider>
                    </FeatureStateProvider>
                  </NavBarVisibilityProvider>
                  <Toaster />
                </MusicPlayerProvider>
              </ActiveCallProvider>
            </TwilioDeviceProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;

function ReplitAuthPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const returnTo = sanitizeReturnPath(
    new URLSearchParams(window.location.search).get("returnTo"),
  ) ?? "/business";
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.replace(returnTo);
    }
  }, [isLoading, isAuthenticated, returnTo]);
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#FFFAF0] px-4">
    <div className="w-full max-w-md border border-black/10 bg-[#FFFCF5] p-8 text-center">
      <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em]">SALARYMAN ACCESS</p>
      <p className="mb-6 text-sm text-black/60">
        {isLoading
          ? "Checking your session…"
          : isAuthenticated
            ? "Returning you to your destination…"
            : "Continue to secure sign-in when you’re ready."}
      </p>
      {!isLoading && !isAuthenticated && (
        <button
          type="button"
          onClick={() => login(returnTo)}
          data-testid="sign-in-continue"
          className="inline-block border border-black bg-black px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800"
        >
           SIGN IN
        </button>
      )}
      <noscript>
        <a
          href={`${basePath}/api/login?returnTo=${encodeURIComponent(returnTo)}`}
        className="inline-block border border-black bg-black px-6 py-3 text-xs font-bold uppercase tracking-widest text-white"
        >
           SIGN IN
        </a>
      </noscript>
    </div>
  </div>;
}
