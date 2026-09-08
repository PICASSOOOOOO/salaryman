import { apiFetch } from '@/lib/api-client';
import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import AlphaWipeBanner from "@/components/AlphaWipeBanner";
import AbandonmentBanner from "@/components/AbandonmentBanner";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { MobileSubNav, MobileModuleNav } from "@/components/MobileBottomBar";
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
import { hydrateOnboardingStatus, useOnboardingResolved } from "@/lib/onboarding-sync";
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioDeviceProvider } from "@/contexts/TwilioDeviceContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { isTutorialDone } from "@/lib/tutorial-progress";
import { isEmbedMode } from "@/lib/embed-mode";
import { DeviceControlBridge } from "@/components/DeviceControlBridge";

const Home = lazy(() => import("@/pages/Home"));
const ProfessionalHome = lazy(() => import("@/pages/ProfessionalHome"));
const PabloTerminal = lazy(() => import("@/pages/PabloTerminal"));
const Immigration = lazy(() => import("@/pages/Immigration"));
const PabloDeck = lazy(() => import("@/pages/PabloDeck"));
const PledgeStore = lazy(() => import("@/pages/PledgeStore"));
const Console = lazy(() => import("@/pages/Console"));
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

const GlobalErrorReporter = lazy(() => import("@/components/GlobalErrorReporter").then((m) => ({ default: m.GlobalErrorReporter })));
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
  if (params.get("view") === "agents") return <Redirect to="/bots" />;
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

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const FULLSCREEN_ROUTES = ["/mobile", "/terminal", "/profile/admin/billboards", "/admin/billboards", "/meet", "/pablo", "/pablo/deck", "/immigration", "/theater", "/device-link", "/sms-opt-in"];

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: "var(--app-viewport-height, 100dvh)",
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
  const [location] = useLocation();
  // This component is kept-alive (always mounted, just hidden via display:none
  // on non-home routes). Guard on the actual path so the homepage terminal does
  // not interfere with deep routes (e.g. /my-office).
  if (location.split("?")[0] !== "/") return null;
  // Keep the public door focused on finished browser capabilities. The
  // downloadable gameplay client is still in development and should not be
  // marketed from the homepage until its visual slice is complete.
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
  useHeartbeat();
  usePageMeta();
  const [location] = useLocation();
  const { hideNavBar } = useNavBarVisibility();
  const { isAuthenticated, isLoading } = useAuth();
  const onboardingResolved = useOnboardingResolved();

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
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  // The browser product has one visual contract: cream/white surfaces and
  // black ink. The downloadable game owns the cyberpunk palette.
  const isLightWorkspace = true;
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
  const NEW_USER_ALLOWED_PREFIXES = ["/pablo", "/terminal", "/pledge", "/upgrade", "/sign-in", "/sign-up", "/desktop", "/legal", "/alpha", "/device-link", "/sms-opt-in", "/auth", "/api", "/phone", "/comms", "/contacts", "/leads", "/organizations", "/org", "/bots", "/business", "/business/crm", "/business/calendar", "/calendar", "/console/vault", "/knowledge", "/knowledge-hub", "/vault"];
  // Powering on the landing cinematic's terminal sends visitors to /console
   // so an anonymous visitor must be allowed to reach EXACTLY
  // /console and see the console's own sign-in screen there — without being
  // bounced back to the nebula front door. We allow only the exact path, never
  // the /console/* subroutes (those tool deep-routes stay protected: guessing
  // them while logged out still bounces to the door). The console sign-in
  // screen passes returnTo="/console" to OAuth, so after signing in the visitor
  // lands back on the console rather than the app base.
  const ANON_ALLOWED_EXACT = ["/console"];
  const matchesPrefix = (list: string[]) =>
    pathname === "/" || list.some(p => pathname === p || pathname.startsWith(p + "/"));
  const allowedForAnon = matchesPrefix(ANON_ALLOWED_PREFIXES) || ANON_ALLOWED_EXACT.includes(pathname);
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
  const holdForOnboarding = onboardingPending && isAuthenticated && !allowedForAuthedNew;
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
    // Send authed-but-uncleared users to the desktop client handoff. The
    // browser now contains practical tools only; office simulation lives in
    // the native client.
    navigate("/desktop", { replace: true });
  }, [newUserBlocked, isAuthenticated, location, navigate]);

  // Cross-device settings sync: once signed in, pull the player's saved display
  // / visual-quality preferences down to this device, then mirror any further
  // local changes back up. Logged-out players never run this and keep their
  // local-only settings blob.
  useEffect(() => {
    if (!isAuthenticated) return;
    // Server-authoritative onboarding skip: if the server says this user already
    // onboarded (has a world business row) but the local flag is missing (fresh
    // device / cleared browser), flip salaryman_tutorial_done so every gate
    // treats them as cleared and they land on the practical tools instead of
    // re-running
    // intake. Resolves instantly when the local flag is already set.
    void hydrateOnboardingStatus();
    void hydrateSettingsFromServer();
    const teardown = initSettingsSync();
    return teardown;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sendHeartbeat = () => {
      apiFetch('/api/world/heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
    };
    sendHeartbeat();
    const hbInterval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(hbInterval);
  }, [isAuthenticated]);

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
  if (newUserBlocked) return <Redirect to="/desktop" />;

  return (
    <>
      <DeviceControlBridge />
      {/* Alpha wipe warning — rendered globally so it shows AND can be dismissed
          on every page (including fullscreen office/game routes that hide the
          NavBar), not just navbar pages. Self-hides once dismissed per build. */}
      {!isEmbed && !isGameRoute && !showNavBar && !isRootRoute && !isDeviceLinkRoute && <AlphaWipeBanner />}
      {showNavBar && (
        <div className="app-chrome">
          {!isEmbed && <AlphaWipeBanner />}
          <AbandonmentBanner />
          <NavBar />
          <MobileModuleNav />
          <MobileSubNav />
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

      {/* Other routes — lazy-loaded */}
      {!isPrimarySurfaceActive && (
        <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Switch>
            <Route path="/sign-in/*?" component={ClerkSignInPage} />
            <Route path="/sign-up/*?" component={ClerkSignUpPage} />
            {/* Standalone routes */}
            <Route path="/pablo/promo">{() => <Redirect to="/pablo" />}</Route>
            <Route path="/pablo/deck" component={PabloDeck} />
            <Route path="/pablo" component={PabloTerminal} />
            <Route path="/sms-opt-in" component={SmsOptIn} />
            <Route path="/immigration" component={Immigration} />
            <Route path="/profile/admin/billboards" component={BillboardAdmin} />
            <Route path="/profile/admin/tickets" component={AdminTickets} />
            <Route path="/profile/admin/tickets/:id">{(params) => <AdminTickets params={params} />}</Route>
            <Route path="/profile/admin/dev-tasks" component={DevTasksAdmin} />
            <Route path="/profile/admin/alpha" component={AlphaAdmin} />
            <Route path="/profile/admin/feedback" component={FeedbackAdmin} />
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
            <Route path="/console/agents">{() => <Redirect to="/pablo" />}</Route>
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
            <Route path="/intel/agents">{() => <Redirect to="/pablo" />}</Route>
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
            <Route path="/store/bots/vending">{() => <Redirect to="/pablo" />}</Route>
            {/* The realty showroom is the functional acquire flow (RealtyStore):
                rent/buy persists server-side via /api/real-estate/acquire. The
                VendingMachine "homebase" tab was a non-persisting V1 stub. */}
            <Route path="/store/realty" component={RealtyStore} />
            <Route path="/cutscene" component={CutscenePage} />
            <Route path="/bots">{() => <Redirect to="/pablo" />}</Route>
            <Route path="/bots/:rest*">{() => <Redirect to="/pablo" />}</Route>

            {/* Old flat routes — redirect to new module paths */}
            <Route path="/dashboard">{() => <Redirect to="/intel/dashboard" />}</Route>
            <Route path="/agents">{() => <Redirect to="/pablo" />}</Route>
            <Route path="/seo">{() => <Redirect to="/marketing/seo" />}</Route>

            {/* Feedback admin */}
            <Route path="/feedback" component={FeedbackAdmin} />

            {/* Investor portal — standalone page */}
            <Route path="/pledge/agents">{() => <Redirect to="/pablo" />}</Route>
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
          and the immigration desk). */}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary fallbackTitle="APP CRASHED">
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ErrorBoundary>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back to SALARYMAN", subtitle: "Sign in to continue" } },
        signUp: { start: { title: "Join SALARYMAN", subtitle: "Create your account" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
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
                <Suspense fallback={null}><GlobalErrorReporter /></Suspense>
              </MusicPlayerProvider>
            </ActiveCallProvider>
          </TwilioDeviceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
export default App;

function ClerkSignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-4">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
  </div>;
}

function ClerkSignInPage() {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? undefined;
  return <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-4">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={returnTo} />
  </div>;
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#38bdf8",
    colorForeground: "#f4f4f5",
    colorMutedForeground: "#a1a1aa",
    colorDanger: "#fb7185",
    colorBackground: "#18181b",
    colorInput: "#09090b",
    colorInputForeground: "#f4f4f5",
    colorNeutral: "#3f3f46",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-zinc-900 rounded-xl w-[440px] max-w-full overflow-hidden border border-zinc-700",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-zinc-50 font-semibold",
    headerSubtitle: "text-zinc-400",
    socialButtonsBlockButtonText: "text-zinc-100",
    formFieldLabel: "text-zinc-200",
    footerActionLink: "text-sky-400",
    footerActionText: "text-zinc-400",
    dividerText: "text-zinc-400",
    identityPreviewEditButton: "text-sky-400",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-zinc-100",
    logoBox: "mb-5",
    logoImage: "w-12 h-12",
    socialButtonsBlockButton: "border-zinc-600 bg-zinc-800 hover:bg-zinc-700",
    formButtonPrimary: "bg-sky-500 hover:bg-sky-400 text-zinc-950",
    formFieldInput: "bg-zinc-950 border-zinc-600 text-zinc-100",
    footerAction: "border-zinc-700",
    dividerLine: "bg-zinc-700",
    alert: "bg-zinc-800 border-zinc-600",
    otpCodeFieldInput: "bg-zinc-950 border-zinc-600 text-zinc-100",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.externalId ?? user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }), [addListener]);

  return null;
}

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}
