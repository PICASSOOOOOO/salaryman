import { Suspense, lazy, memo, useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar";
import AlphaWipeBanner from "@/components/AlphaWipeBanner";
import AbandonmentBanner from "@/components/AbandonmentBanner";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { MobileSubNav, MobileModuleNav } from "@/components/MobileBottomBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorReporter } from "@/components/GlobalErrorReporter";
import { armAudioAutoUnlock } from "@/lib/tts";
import { useUndoShortcut } from "@/hooks/use-undo";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { NavBarVisibilityProvider, useNavBarVisibility } from "@/hooks/use-navbar-visibility";
import { FeatureStateProvider } from "@/hooks/use-feature-state";
import { PledgeStorePopupProvider } from "@/components/PledgeStorePopup";
import { useAuth } from "@workspace/replit-auth-web";
import { usePlan } from "@/hooks/use-plan";
import { usePageMeta } from "@/hooks/use-page-meta";
import { hydrateSettingsFromServer, initSettingsSync } from "@/lib/settings-sync";
import { hydrateOnboardingStatus, useOnboardingResolved } from "@/lib/onboarding-sync";
import PabloTerminal from "@/pages/PabloTerminal";

// Arm the iOS audio unlock listeners as soon as the bundle loads. They are
// one-shot and detach themselves after the first user gesture, so this is
// effectively free until the user taps anywhere.
if (typeof window !== "undefined") {
  armAudioAutoUnlock();
}
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { TwilioDeviceProvider } from "@/contexts/TwilioDeviceContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { GlobalMusicMiniIndicator } from "@/components/GlobalMusicMiniIndicator";
import { OfficeRadio } from "@/components/OfficeRadio";
import { pauseMusic, stopOfficeAmbient, stopCrowdMurmur } from "@/soundEngine";
import { AudioControl } from "@/components/AudioControl";
import { ActiveCallBar } from "@/components/FloatingCallBar";
import { ChatPanel } from "@/components/ChatPanel";
import { NotificationToaster } from "@/components/NotificationToaster";
import { CommandPalette } from "@/components/CommandPalette";
import { isTutorialDone, isPasscodeUnlocked } from "@/lib/tutorial-progress";
import { isEmbedMode } from "@/lib/embed-mode";
import { sanitizeReturnPath } from "@/lib/safe-path";
import {
  readLocalStoryActive,
  readStoryBeginIntent,
  clearStoryBeginIntent,
  fetchServerStoryActive,
} from "@/lib/story-gate";

const Home = lazy(() => import("@/pages/Home"));
const Immigration = lazy(() => import("@/pages/Immigration"));
const PabloDeck = lazy(() => import("@/pages/PabloDeck"));
const PledgeStore = lazy(() => import("@/pages/PledgeStore"));
const Console = lazy(() => import("@/pages/Console"));
const Profile = lazy(() => import("@/pages/Profile"));
const SettingsPage = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.SettingsPage })));
const AdminHub = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.AdminHub })));
const ProfilePicker = lazy(() => import("@/pages/ProfilePicker"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const WorldPlay = lazy(() => import("@/pages/WorldPlay"));
const LandRegistry = lazy(() => import("@/pages/LandRegistry"));
const GameIntro = lazy(() => import("@/pages/GameIntro"));
const BathroomScene = lazy(() => import("@/pages/BathroomScene"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const SeoModule = lazy(() => import("@/pages/SeoModule"));
const NotFound = lazy(() => import("@/pages/not-found"));

const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const Hiring = lazy(() => import("@/pages/Hiring"));
const JobOffers = lazy(() => import("@/pages/JobOffers"));
const JobBoard = lazy(() => import("@/pages/JobBoard"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Documents = lazy(() => import("@/pages/Documents"));
const ResumeBuilder = lazy(() => import("@/pages/ResumeBuilder"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Deals = lazy(() => import("@/pages/Deals"));
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
const GameHub = lazy(() => import("@/pages/Game/Hub"));
const PabloOffice = lazy(() => import("@/pages/PabloOffice"));
const GameSettings = lazy(() => import("@/pages/Game/Settings"));
const GameEconomy = lazy(() => import("@/pages/Game/Economy"));
const GameMap = lazy(() => import("@/pages/Game/Map"));
const CityDirectory = lazy(() => import("@/pages/CityDirectory"));
const GameCharacter = lazy(() => import("@/pages/Game/Character"));
const GameBank = lazy(() => import("@/pages/Game/Bank"));
const SkillTree = lazy(() => import("@/pages/SkillTree"));
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

// Paywall gate for /phone* routes. The phone system (dialer, voicemail,
// AI secretary, call center, etc.) is a paid feature inside the PABLO
// bundle. Free users land on /upgrade instead of a screen of 403s.
// While the plan is loading we render nothing (avoids a flicker that
// would briefly redirect a paid user to /upgrade on cold load). The
// `redirectTo` prop preserves the tab query param when /phone/:rest
// rewrites land here, so paid users still get their deep link.
function PhoneGate({ redirectTo }: { redirectTo?: string } = {}) {
  const { isOwner, features, trials, loading } = usePlan();
  if (loading) return null;
  // Match CalllHomePage's own access check — trial holders count as
  // entitled. Without this, a phone_system trial user is bounced to
  // /upgrade by the gate and never reaches the in-page trial UX.
  const allowed =
    isOwner ||
    features.has('phone_system') ||
    trials.some(t => t.featureKey === 'phone_system');
  if (!allowed) return <Redirect to="/upgrade" />;
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
const BusinessServices = lazy(() => import("@/pages/BusinessServices"));
const VendingMachine = lazy(() => import("@/pages/VendingMachine"));
const DevTasksAdmin = lazy(() => import("@/pages/DevTasksAdmin"));
const AlphaApply = lazy(() => import("@/pages/AlphaApply"));
const Subway = lazy(() => import("@/pages/Subway"));
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const FULLSCREEN_ROUTES = ["/world", "/world/play", "/mobile", "/profile/admin/billboards", "/admin/billboards", "/meet", "/pablo", "/pablo/deck", "/game", "/office", "/immigration", "/theater"];
const GAME_ROUTES = ["/world", "/world/play", "/mobile", "/game", "/office"];

function LoadingFallback() {
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

function GameLock({ children }: { children: React.ReactNode }) {
  // The city is now open to all users. (Previously gated to the Picasso org +
  // approved alpha testers/devs during the art/OFFICE MODE rework.)
  return <>{children}</>;
}

/**
 * Confines the player to the office until the story begins. The city
 * (/world/play, /world/land) is open only once server-authoritative
 * `story.active` is true; until then a city visit bounces to /office, which
 * carries the "BEGIN STORY" path that flips story.active before sending the
 * player out into the city (so they're never soft-locked).
 *
 * Authority: optimistic-open on the local flag / begin-intent so the
 * begin-story → city hop never flashes a lock, then the server result is the
 * final word — a locked server response downgrades to the office, and an
 * unknown (offline / unauthenticated) result falls back to the local flag.
 */
function StoryCityLock({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  // Optimistic open: local save says active, or we just pressed BEGIN STORY.
  const [open, setOpen] = useState<boolean>(
    () => readLocalStoryActive() || readStoryBeginIntent(),
  );
  // null = still resolving the server truth; false = server says locked.
  const [serverActive, setServerActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // Logged-out players never have a server story; fall back to local only.
      setServerActive(null);
      return;
    }
    let cancelled = false;
    fetchServerStoryActive().then((active) => {
      if (cancelled) return;
      setServerActive(active);
      if (active === true) {
        setOpen(true);
        clearStoryBeginIntent();
      } else if (active === false) {
        // Server is authoritative: a locked result closes the optimistic open
        // UNLESS the player is mid begin-story (intent set), to avoid a race
        // where the city loads before the begin PUT has landed.
        if (!readStoryBeginIntent()) setOpen(false);
      }
      // active === null → leave the optimistic/local decision in place.
    });
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading]);

  // Embedded surveillance/preview never participates in the gate.
  if (isEmbedMode()) return <>{children}</>;
  if (isLoading) return null;

  const allowed = open || serverActive === true;
  if (!allowed) return <Redirect to="/office" />;
  return <>{children}</>;
}

function HomeOrCover() {
  const { isAuthenticated, isLoading } = useAuth();
  const onboardingResolved = useOnboardingResolved();
  const [location] = useLocation();
  // This component is kept-alive (always mounted, just hidden via display:none
  // on non-home routes). wouter's <Redirect> fires once when it mounts, so on a
  // hard load / refresh / bookmark of ANY authed route it would bounce the user
  // to /office. Guard on the actual path: only run the office-first funnel when
  // the user is genuinely on "/", so deep routes (e.g. /my-office) stay put.
  if (location.split("?")[0] !== "/") return null;
  if (isLoading) return <LoadingFallback />;
  // Funnel — modeled like immigration, not a revolving door:
  //   1. Anonymous visitor → /pablo. Pablo tells the story, takes the
  //      passcode, asks for name + email, hands off to OAuth.
  //   2. Authenticated but uncleared (tutorialDone=false) → /immigration.
  //      A dedicated, non-game-locked desk where Pablo files the new
  //      arrival's intent (business / unemployed). Only completing this
  //      sets tutorialDone, which is what unlocks the rest of the app.
  //   3. Cleared → their OFFICE (office-sim first). The old Home dashboard is
  //      no longer the landing surface; signed-in players live in /office and
  //      reach everything else (the TERMINAL, the city) from there.
  // The previous build sent post-OAuth users to /world/play, which is
  // GameLock'd for non-owners. Bouncing off the lock dropped them back
  // here, and since tutorialDone was still false, this redirect kicked
  // them to /pablo, which re-asked their name → loop. The /immigration
  // gate fixes that: it lives outside GameLock and is the only path that
  // can flip tutorialDone for an authed user.
  // A logged-out / first-time visitor starts at Pablo's canonical nebula
  // terminal. Authenticated users keep the office-first funnel below —
  // already-onboarded players still skip straight to their /office.
  // Hold the gate until the server onboarding check resolves. A returning,
  // already-onboarded user signing in on a fresh device has no local
  // salaryman_tutorial_done flag yet — without this wait we'd flash them through
  // to /immigration before hydrateOnboardingStatus() flips the flag and skips
  // them straight to /office. The check resolves instantly when the local flag
  // is already set, so cleared users on their usual device never see a hold.
  if (isAuthenticated && !onboardingResolved) return <LoadingFallback />;
  if (typeof window !== "undefined") {
    if (isAuthenticated && !isTutorialDone()) return <Redirect to="/immigration" />;
  }
  if (!isAuthenticated) return <Redirect to="/pablo" />;
  return <Redirect to="/office" />;
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

  const pathname = location.split("?")[0];

  // ── Route-change audio backstop ────────────────────────────────────────────
  // Pages own starting their background audio and stopping it on unmount, but a
  // page that forgets to clean up would leak its procedural score/bed (module
  // singletons in soundEngine survive route changes) into the next route. On
  // every navigation, force-stop the engine background tiers the DESTINATION
  // route does not legitimately run. The destination's own mount effects restart
  // whatever it needs, and soundEngine's running-flag guards make a redundant
  // stop a no-op, so this never fights the page that owns the route. The radio /
  // Hummingbird and the global Pablo Radio HTMLAudio tiers self-clean through
  // the background coordinator, so
  // they are handled by the coordinator's claim/release, not stopped here.
  useEffect(() => {
    const allowsWorldScore = pathname === "/world/play" || pathname.startsWith("/world/play/");
    const allowsOfficeAmbient =
      pathname === "/office" || pathname.startsWith("/office/") ||
      pathname === "/immigration" || pathname.startsWith("/immigration/") ||
      pathname === "/pablo" || pathname.startsWith("/pablo/");
    if (!allowsWorldScore) { pauseMusic(); stopCrowdMurmur(); }
    if (!allowsOfficeAmbient) { stopOfficeAmbient(); }
  }, [pathname]);

  const isRootRoute = pathname === "/";
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
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
  const isKeepAliveActive = isHome || (isConsole && !isConsoleSubRoute);

  const isGameRoute = GAME_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));

  // Edge-swipe back/forward navigation. Disabled on game/canvas routes that
  // already own touch gestures. Swipe right from the left edge → previous
  // page; swipe left from the right edge → forward in browser history.
  useSwipeNavigation({ enabled: !isGameRoute });

  const isPhoneRoute = pathname === "/phone" || pathname.startsWith("/phone/");
  const isLegalRoute = pathname === "/legal" || pathname.startsWith("/legal/");
  const showFloatingBar = isAuthenticated && !isFullscreenRoute && !isGameRoute && !isPhoneRoute && !isLegalRoute &&
    FLOATING_BAR_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  const showChat = isAuthenticated && !isFullscreenRoute && !isGameRoute;

  // GLOBAL GATE / FRONT DOOR. Before a visitor passes security (signs in),
  // the ONLY surface they can reach is the front door — the Pablo nebula —
  // plus the /auth + /api machinery that actually performs the sign-in.
  // Typing or deep-linking ANY other URL (/game, /console, /business,
  // /world, /profile, /legal, /alpha, …) silently bounces them back to the
  // door, so nothing behind the firewall is reachable by guessing a path.
  // Pablo is the only way in.
  //
  // Once authenticated — but not yet cleared through immigration — the
  // intake desk and legal pages open up too (those are post-sign-in).
  const ANON_ALLOWED_PREFIXES = ["/pablo", "/pledge", "/upgrade", "/auth", "/api"];
  const NEW_USER_ALLOWED_PREFIXES = ["/pablo", "/pledge", "/upgrade", "/immigration", "/legal", "/alpha", "/auth", "/api"];
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
  // user off /immigration or /legal before we know they're authed.
  // Also wait for the server onboarding check (authed users only): a returning,
  // already-onboarded user has no local salaryman_tutorial_done flag yet, so
  // bouncing before hydrateOnboardingStatus() resolves would force them back
  // through intake. Anonymous visitors don't run that check, so this never
  // delays their bounce to /pablo.
  const onboardingPending = isAuthenticated && !onboardingResolved;
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
    // Send authed-but-uncleared users straight to the immigration desk
    // (Pablo's intake gate, outside GameLock) instead of bouncing them
    // through the terminal that already collected their name + email.
    if (isAuthenticated) {
      navigate("/immigration", { replace: true });
    } else {
      // Preserve the destination so after sign-in Pablo's OAuth callback lands
      // the user back on the page they tried to reach, not /immigration.
      const safePath = sanitizeReturnPath(location);
      const query =
        safePath && safePath !== "/" && !safePath.startsWith("/pablo")
          ? `?returnTo=${encodeURIComponent(safePath)}`
          : "";
      navigate(`/pablo${query}`, { replace: true });
    }
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
    // treats them as cleared and they land on /office instead of re-running
    // intake. Resolves instantly when the local flag is already set.
    void hydrateOnboardingStatus();
    void hydrateSettingsFromServer();
    const teardown = initSettingsSync();
    return teardown;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sendHeartbeat = () => {
      fetch(`${import.meta.env.BASE_URL}api/world/heartbeat`, { method: 'POST', credentials: 'include' }).catch(() => {});
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

  // Hold protected paths behind a loading screen until auth resolves (see
  // holdForAuth above) so a logged-out deep link can never flash the page.
  if (holdForAuth) return <LoadingFallback />;

  return (
    <>
      {/* Alpha wipe warning — rendered globally so it shows AND can be dismissed
          on every page (including fullscreen office/game routes that hide the
          NavBar), not just navbar pages. Self-hides once dismissed per build. */}
      {!isEmbed && <AlphaWipeBanner />}
      {showNavBar && (
        <div className="sticky top-0 z-50 sm:static sm:z-auto">
          <AbandonmentBanner />
          <NavBar />
          <MobileModuleNav />
          <MobileSubNav />
        </div>
      )}
      {/* Site-wide command palette (nav search bar + ⌘K). Mounted wherever the
          nav chrome shows — never on the /pablo front door, embeds, or
          fullscreen routes, so it doesn't touch those experiences. */}
      {showNavBar && <CommandPalette />}
      {showFloatingBar && <ActiveCallBar />}
      {showChat && <ChatPanel />}
      {/* Route-independent toaster for the persistent notification stream —
          mounted OUTSIDE the chat gate so org invites, ticket replies, missed
          DMs & mentions still pop (with chime) on game/full-screen routes. */}
      {isAuthenticated && !isEmbed && <NotificationToaster />}
      {/* Hide ALL ambient HUD widgets on fullscreen routes (immigration,
          world, mobile, meet, pablo, game, billboard admin). The
          immigration desk and the Pablo terminal are the only doors into
          the app for new arrivals — leaking the music indicator there
          breaks the "you haven't been admitted yet" fiction. */}
      {!isFullscreenRoute && <GlobalMusicMiniIndicator />}
      {/* Pablo Radio — one headless station for every non-phone route. */}
      {!isEmbed && <OfficeRadio />}
      {/* Always-available music/sound control — an obvious way to mute or turn
          down the audio from anywhere (full mixer still on /game/settings).
          Hidden on /immigration because PabloOnboarding is full-screen there
          and the FAB would overlap the "ASK ►" / NEXT ► buttons at the bottom
          of the screen on mobile. The subtle onboarding score still plays;
          users can adjust audio once they reach the main game. */}
      {!isEmbed && !isRootRoute && !pathname.startsWith('/immigration') && <AudioControl chatFabPresent={showChat} inGame={isGameRoute} />}
      {/* Keep-alive panels */}
      <ErrorBoundary>
        <Suspense fallback={isHome ? <LoadingFallback /> : null}>
          <div style={{ display: isHome ? "block" : "none" }}>
            <HomeOrCover />
          </div>
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={isConsoleTerminal ? <LoadingFallback /> : null}>
          <div style={{ display: isConsoleTerminal ? "block" : "none" }}>
            <MemoConsole />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Other routes — lazy-loaded */}
      {!isKeepAliveActive && (
        <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Switch>
            {/* Standalone routes */}
            <Route path="/pablo/promo">{() => <Redirect to="/" />}</Route>
            <Route path="/pablo/deck">{() => <GameLock><PabloDeck /></GameLock>}</Route>
            <Route path="/pablo" component={PabloTerminal} />
            <Route path="/immigration" component={Immigration} />
            <Route path="/profile/admin/billboards" component={BillboardAdmin} />
            <Route path="/profile/admin/tickets" component={AdminTickets} />
            <Route path="/profile/admin/tickets/:id">{(params) => <AdminTickets params={params} />}</Route>
            <Route path="/profile/admin/dev-tasks" component={DevTasksAdmin} />
            <Route path="/profile/admin/alpha" component={AlphaAdmin} />
            <Route path="/profile/admin/feedback" component={FeedbackAdmin} />
            <Route path="/profile/admin/art" component={ArtLibrary} />
            <Route path="/alpha" component={AlphaApply} />
            <Route path="/subway" component={Subway} />
            <Route path="/travel" component={Subway} />
            <Route path="/profile/admin" component={AdminHub} />
            <Route path="/profile/moderator" component={AdminHub} />
            <Route path="/profile/world-map" component={AdminHub} />
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
            <Route path="/world">{() => <Redirect to="/office" />}</Route>
            <Route path="/world/play">{() => <GameLock><StoryCityLock><WorldPlay /></StoryCityLock></GameLock>}</Route>
            <Route path="/world/land">{() => <GameLock><StoryCityLock><LandRegistry /></StoryCityLock></GameLock>}</Route>
            <Route path="/game">{() => <GameLock><GameHub /></GameLock>}</Route>
            <Route path="/office">{() => <GameLock><PabloOffice /></GameLock>}</Route>
            {/* CCTV "watching the office" view is now a MODE of the single
                office surface (same artwork, passive feed). Any lingering deep
                link drops you into the office with surveillance pre-selected. */}
            <Route path="/office/surveillance">{() => <Redirect to="/office?mode=surveillance" />}</Route>
            <Route path="/my-office" component={MyOffice} />
            <Route path="/game/settings">{() => <GameLock><GameSettings /></GameLock>}</Route>
            <Route path="/game/economy">{() => <GameLock><GameEconomy /></GameLock>}</Route>
            <Route path="/game/map">{() => <GameLock><GameMap /></GameLock>}</Route>
            <Route path="/game/directory">{() => <GameLock><CityDirectory /></GameLock>}</Route>
            <Route path="/game/character">{() => <GameLock><GameCharacter /></GameLock>}</Route>
            <Route path="/game/bank">{() => <GameLock><GameBank /></GameLock>}</Route>
            <Route path="/skills" component={SkillTree} />
            <Route path="/game/intro">{() => <GameLock><GameIntro /></GameLock>}</Route>
            <Route path="/game/bathroom">{() => <GameLock><BathroomScene /></GameLock>}</Route>
            {/* The legacy bathroom->office cutscene now folds into the single
                walkable office (no separate tutorial-office surface). */}
            <Route path="/game/office">{() => <Redirect to="/office" />}</Route>
            <Route path="/admin/billboards">{() => <Redirect to="/profile/admin/billboards" />}</Route>
            <Route path="/admin/tickets">{() => <Redirect to="/profile/admin/tickets" />}</Route>
            <Route path="/admin/tickets/:id">{(params) => <Redirect to={`/profile/admin/tickets/${params.id}`} />}</Route>
            <Route path="/admin/dev-tasks">{() => <Redirect to="/profile/admin/dev-tasks" />}</Route>
            <Route path="/admin">{() => {
              const qs = window.location.search;
              return <Redirect to={`/profile/admin${qs}`} />;
            }}</Route>
            <Route path="/mobile" component={MobileTerminal} />
            <Route path="/theater" component={TheaterPage} />
            <Route path="/meet/:code">{(params) => <MeetPage params={params} />}</Route>

            {/* BUSINESS module */}
            <Route path="/business/marketplace" component={BusinessMarketplace} />
            <Route path="/business/services" component={BusinessServices} />
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/business/jobs" component={JobBoard} />
            <Route path="/business/job-command" component={JobCommandCenter} />
            <Route path="/job-offers" component={JobOffers} />
            <Route path="/business/interview" component={Console} />
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/resume" component={ResumeBuilder} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
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
            <Route path="/marketing/social" component={SocialMediaManager} />
            <Route path="/marketing/command" component={MarketingCommandCenter} />
            <Route path="/marketing" component={MarketingCommandCenter} />

            {/* ARMORY module */}
            <Route path="/armory/inventory" component={Armory} />
            <Route path="/armory" component={Armory} />

            {/* ORG module — dedicated org-management hub (separate from OFFICE) */}
            <Route path="/org" component={OrgHub} />

            {/* Legacy agent status page now belongs to the Agent Command Center. */}
            <Route path="/console/agents">{() => <Redirect to="/bots" />}</Route>
            <Route path="/console/video" component={VideoAnalyzer} />
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
            <Route path="/intel/agents">{() => <Redirect to="/bots" />}</Route>
            <Route path="/intel/video">{() => <Redirect to="/console/video" />}</Route>
            <Route path="/intel/seo">{() => <Redirect to="/marketing/seo" />}</Route>
            <Route path="/intel">{() => <Redirect to="/intel/reports" />}</Route>

            {/* PHONE module — unified Calll Home hub. Paid feature
                (PABLO bundle): users without phone_system are bounced
                to /upgrade so they can subscribe instead of landing
                on a screen full of broken 403s. */}
            <Route path="/phone">{() => <PhoneGate />}</Route>
            <Route path="/phone/:rest*">{(params: { rest: string }) => {
              const TAB_MAP: Record<string, string> = {
                contacts: 'contacts', dialer: 'cmd', active: 'cmd', cmd: 'cmd',
                history: 'log', voicemail: 'vm', conference: 'conf',
                sessions: 'cmd', coach: 'ai', secretary: 'ai', numbers: 'contacts',
              };
              const tab = TAB_MAP[params.rest?.split('/')[0] ?? ''] ?? '';
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
            <Route path="/bots/templates" component={ClaudeTemplates} />
            <Route path="/bots/prompt-sensei" component={PromptSensei} />
            {/* The isometric "android factory" office was a divergent, no-exit
                dead-end with its own renderer. It now folds into the single
                walkable pixel office (same artwork, live + surveillance). */}
            <Route path="/bots/office">{() => <Redirect to="/office" />}</Route>
            {/* Per-bot "cinematic office" shells are retired; the office is one
                place. Per-bot management still lives at /bots/:id/command etc. */}
            <Route path="/bots/:id/office">{() => <Redirect to="/office" />}</Route>
            <Route path="/cutscene/:id" component={CutscenePage} />
            <Route path="/vending">{() => <VendingMachine />}</Route>
            <Route path="/store/bots/vending">{() => <Redirect to="/bots" />}</Route>
            {/* The realty showroom is the functional acquire flow (RealtyStore):
                rent/buy persists server-side via /api/real-estate/acquire. The
                VendingMachine "homebase" tab was a non-persisting V1 stub. */}
            <Route path="/store/realty" component={RealtyStore} />
            <Route path="/cutscene" component={CutscenePage} />
            <Route path="/bots" component={BotFactory} />
            <Route path="/bots/:rest*" component={BotFactory} />

            {/* Old flat routes — redirect to new module paths */}
            <Route path="/dashboard">{() => <Redirect to="/intel/dashboard" />}</Route>
            <Route path="/agents">{() => <Redirect to="/bots" />}</Route>
            <Route path="/seo">{() => <Redirect to="/marketing/seo" />}</Route>

            {/* Feedback admin */}
            <Route path="/feedback" component={FeedbackAdmin} />

            {/* Investor portal — standalone page */}
            <Route path="/pledge/agents">{() => <Redirect to="/bots" />}</Route>
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <TwilioDeviceProvider>
            <ActiveCallProvider>
              <MusicPlayerProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <NavBarVisibilityProvider>
                <FeatureStateProvider>
                  <PledgeStorePopupProvider>
                    <AppShell />
                  </PledgeStorePopupProvider>
                </FeatureStateProvider>
              </NavBarVisibilityProvider>
            </WouterRouter>
            <Toaster />
            <GlobalErrorReporter />
              </MusicPlayerProvider>
            </ActiveCallProvider>
          </TwilioDeviceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
