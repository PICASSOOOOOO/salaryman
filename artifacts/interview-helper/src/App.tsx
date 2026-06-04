import { Suspense, lazy, memo, useEffect } from "react";
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

// Arm the iOS audio unlock listeners as soon as the bundle loads. They are
// one-shot and detach themselves after the first user gesture, so this is
// effectively free until the user taps anywhere.
if (typeof window !== "undefined") {
  armAudioAutoUnlock();
}
import { ActiveCallProvider } from "@/contexts/ActiveCallContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { GlobalMusicMiniIndicator } from "@/components/GlobalMusicMiniIndicator";
import { OfficeRadio } from "@/components/OfficeRadio";
import { AudioControl } from "@/components/AudioControl";
import { ActiveCallBar } from "@/components/FloatingCallBar";
import { ChatPanel } from "@/components/ChatPanel";
import { isTutorialDone, isPasscodeUnlocked } from "@/lib/tutorial-progress";

const Home = lazy(() => import("@/pages/Home"));
const PabloTerminal = lazy(() => import("@/pages/PabloTerminal"));
const Immigration = lazy(() => import("@/pages/Immigration"));
const Cover = lazy(() => import("@/pages/Cover"));
const PabloPromo = lazy(() => import("@/pages/PabloPromo"));
const PabloDeck = lazy(() => import("@/pages/PabloDeck"));
const PledgeStore = lazy(() => import("@/pages/PledgeStore"));
const PixelAgents = lazy(() => import("@/pages/PixelAgents"));
const Console = lazy(() => import("@/pages/Console"));
const Profile = lazy(() => import("@/pages/Profile"));
const ProfilePicker = lazy(() => import("@/pages/ProfilePicker"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const Upgrade = lazy(() => import("@/pages/Upgrade"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const WorldMenu = lazy(() => import("@/pages/WorldMenu"));
const WorldPlay = lazy(() => import("@/pages/WorldPlay"));
const GameIntro = lazy(() => import("@/pages/GameIntro"));
const BathroomScene = lazy(() => import("@/pages/BathroomScene"));
const BillboardAdmin = lazy(() => import("@/pages/BillboardAdmin"));
const MobileTerminal = lazy(() => import("@/pages/MobileTerminal"));
const Features = lazy(() => import("@/pages/Features"));
const SeoModule = lazy(() => import("@/pages/SeoModule"));
const NotFound = lazy(() => import("@/pages/not-found"));

const ContactCollector = lazy(() => import("@/pages/ContactCollector"));
const Hiring = lazy(() => import("@/pages/Hiring"));
const JobOffers = lazy(() => import("@/pages/JobOffers"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Documents = lazy(() => import("@/pages/Documents"));
const ResumeBuilder = lazy(() => import("@/pages/ResumeBuilder"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Deals = lazy(() => import("@/pages/Deals"));
const LeadsPage = lazy(() => import("@/pages/LeadsPage"));

const DarkRoom = lazy(() => import("@/pages/DarkRoom"));
const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const WriterStudio = lazy(() => import("@/pages/WriterStudio"));
const Classroom = lazy(() => import("@/pages/Classroom"));
const VideoStudio = lazy(() => import("@/pages/VideoStudio"));
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
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Marketing = lazy(() => import("@/pages/Marketing"));
const Armory = lazy(() => import("@/pages/Armory"));
const BrandKit = lazy(() => import("@/pages/BrandKit"));
const MediaLibrary = lazy(() => import("@/pages/MediaLibrary"));
const Colleagues = lazy(() => import("@/pages/Colleagues"));
const Comms = lazy(() => import("@/pages/Comms"));

const Reporting = lazy(() => import("@/pages/Reporting"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AgentTeam = lazy(() => import("@/pages/AgentTeam"));
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
const TimeTracking = lazy(() => import("@/pages/TimeTracking"));
const TaskBoard = lazy(() => import("@/pages/TaskBoard"));
const TeamDirectory = lazy(() => import("@/pages/TeamDirectory"));
const Announcements = lazy(() => import("@/pages/Announcements"));
const Estimates = lazy(() => import("@/pages/Estimates"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const ProfitLoss = lazy(() => import("@/pages/ProfitLoss"));
const Partnerships = lazy(() => import("@/pages/Partnerships"));

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

const MeetPage = lazy(() => import("@/pages/MeetPage"));
const AdminTickets = lazy(() => import("@/pages/AdminTickets"));
const FeedbackAdmin = lazy(() => import("@/pages/FeedbackAdmin"));
const BotFactory = lazy(() => import("@/pages/BotFactory"));
const CutscenePage = lazy(() => import("@/pages/CutscenePage"));
const BotVendingMachine = lazy(() => import("@/pages/BotVendingMachine"));
const RealtyStore = lazy(() => import("@/pages/RealtyStore"));
const VendingMachine = lazy(() => import("@/pages/VendingMachine"));
const DevTasksAdmin = lazy(() => import("@/pages/DevTasksAdmin"));
const AlphaApply = lazy(() => import("@/pages/AlphaApply"));
const Rebellion = lazy(() => import("@/pages/Rebellion"));
const Subway = lazy(() => import("@/pages/Subway"));
const AlphaAdmin = lazy(() => import("@/pages/AlphaAdmin"));

const MediaCenter = lazy(() => import("@/pages/MediaCenter"));
const KnowledgeVault = lazy(() => import("@/pages/KnowledgeVault"));
const PromptSensei = lazy(() => import("@/pages/PromptSensei"));
const JeanClawLanding = lazy(() => import("@/pages/JeanClawLanding"));
const InsuranceHub = lazy(() => import("@/pages/InsuranceHub"));
const PlatformAPI = lazy(() => import("@/pages/PlatformAPI"));
const SocialMediaManager = lazy(() => import("@/pages/SocialMediaManager"));
const StemStudio = lazy(() => import("@/pages/StemStudio"));
const DesignStudio = lazy(() => import("@/pages/DesignStudio"));
const WebScraper = lazy(() => import("@/pages/WebScraper"));
const MyOffice = lazy(() => import("@/pages/MyOffice"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const FULLSCREEN_ROUTES = ["/world", "/world/play", "/mobile", "/profile/admin/billboards", "/admin/billboards", "/meet", "/pablo", "/pablo/deck", "/game", "/immigration"];
const GAME_ROUTES = ["/world", "/world/play", "/mobile", "/game"];

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

function GameLock({ children }: { children: React.ReactNode }) {
  // The city is now open to all users. (Previously gated to the Picasso org +
  // approved alpha testers/devs during the art/OFFICE MODE rework.)
  return <>{children}</>;
}

function HomeOrCover() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <CRTFallback />;
  // Funnel — modeled like immigration, not a revolving door:
  //   1. Anonymous visitor → /pablo. Pablo tells the story, takes the
  //      passcode, asks for name + email, hands off to OAuth.
  //   2. Authenticated but uncleared (tutorialDone=false) → /immigration.
  //      A dedicated, non-game-locked desk where Pablo files the new
  //      arrival's intent (business / unemployed). Only completing this
  //      sets tutorialDone, which is what unlocks the rest of the app.
  //   3. Cleared → Home dashboard.
  // The previous build sent post-OAuth users to /world/play, which is
  // GameLock'd for non-owners. Bouncing off the lock dropped them back
  // here, and since tutorialDone was still false, this redirect kicked
  // them to /pablo, which re-asked their name → loop. The /immigration
  // gate fixes that: it lives outside GameLock and is the only path that
  // can flip tutorialDone for an authed user.
  if (typeof window !== "undefined") {
    if (!isAuthenticated && !isTutorialDone()) return <Redirect to="/pablo" />;
    if (isAuthenticated && !isTutorialDone()) return <Redirect to="/immigration" />;
  }
  if (!isAuthenticated) return <Redirect to="/pablo" />;
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
  useHeartbeat();
  const [location] = useLocation();
  const { hideNavBar } = useNavBarVisibility();
  const { isAuthenticated } = useAuth();

  const pathname = location.split("?")[0];
  const isRootRoute = pathname === "/";
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
  const showNavBar = !isFullscreenRoute && !hideNavBar && !isRootRoute;

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

  // GLOBAL GATE: until the user finishes the Pablo intro (tutorial-done),
  // they are NOT allowed anywhere except Pablo himself, the marketing
  // landing, legal pages, the alpha/auth handoff, and OAuth callbacks.
  // Any other URL — /game, /console, /business, /world, /profile, etc. —
  // is silently bounced to /pablo. Pablo is the only door in.
  const NEW_USER_ALLOWED_PREFIXES = ["/pablo", "/immigration", "/landing", "/legal", "/alpha", "/auth", "/api"];
  const tutorialDone = isTutorialDone();
  const isAllowedForNewUser =
    pathname === "/" ||
    NEW_USER_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
  const newUserBlocked = !tutorialDone && !isAllowedForNewUser;
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!newUserBlocked) return;
    // Send authed-but-uncleared users straight to the immigration desk
    // (Pablo's intake gate, outside GameLock) instead of bouncing them
    // through the terminal that already collected their name + email.
    navigate(isAuthenticated ? "/immigration" : "/pablo", { replace: true });
  }, [newUserBlocked, isAuthenticated, navigate]);

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

  return (
    <>
      {/* Alpha wipe warning — rendered globally so it shows AND can be dismissed
          on every page (including fullscreen office/game routes that hide the
          NavBar), not just navbar pages. Self-hides once dismissed per build. */}
      <AlphaWipeBanner />
      {showNavBar && (
        <div className="sticky top-0 z-50 sm:static sm:z-auto">
          <AbandonmentBanner />
          <NavBar />
          <MobileModuleNav />
          <MobileSubNav />
        </div>
      )}
      {showFloatingBar && <ActiveCallBar />}
      {showChat && <ChatPanel />}
      {/* Hide ALL ambient HUD widgets on fullscreen routes (immigration,
          world, mobile, meet, pablo, game, billboard admin). The
          immigration desk and the Pablo terminal are the only doors into
          the app for new arrivals — leaking the music indicator there
          breaks the "you haven't been admitted yet" fiction. */}
      {!isFullscreenRoute && <GlobalMusicMiniIndicator />}
      {/* Distant office radio — low background soundtrack on game/office scenes.
          Headless + self-gating by route; renders nothing. */}
      <OfficeRadio />
      {/* Always-available music/sound control — an obvious way to mute or turn
          down the music from anywhere (full mixer still on /game/settings).
          Shown on every route, including the terminal, where the jukebox
          mini-indicator above is hidden. */}
      <AudioControl />
      {/* Keep-alive panels */}
      <ErrorBoundary>
        <Suspense fallback={isHome ? <CRTFallback /> : null}>
          <div style={{ display: isHome ? "block" : "none" }}>
            <HomeOrCover />
          </div>
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={isConsoleTerminal ? <CRTFallback /> : null}>
          <div style={{ display: isConsoleTerminal ? "block" : "none" }}>
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
            <Route path="/pablo/promo" component={PabloPromo} />
            <Route path="/pablo/deck">{() => <GameLock><PabloDeck /></GameLock>}</Route>
            <Route path="/pablo" component={PabloTerminal} />
            <Route path="/immigration" component={Immigration} />
            <Route path="/profile/admin/billboards" component={BillboardAdmin} />
            <Route path="/profile/admin/tickets" component={AdminTickets} />
            <Route path="/profile/admin/tickets/:id">{(params) => <AdminTickets params={params} />}</Route>
            <Route path="/profile/admin/dev-tasks" component={DevTasksAdmin} />
            <Route path="/profile/admin/alpha" component={AlphaAdmin} />
            <Route path="/profile/admin/feedback" component={FeedbackAdmin} />
            <Route path="/alpha" component={AlphaApply} />
            <Route path="/rebellion" component={Rebellion} />
            <Route path="/manifesto" component={Rebellion} />
            <Route path="/subway" component={Subway} />
            <Route path="/travel" component={Subway} />
            <Route path="/profile/admin" component={Profile} />
            <Route path="/profile/platform" component={Profile} />
            <Route path="/profile/moderator" component={Profile} />
            <Route path="/profile/world-map" component={Profile} />
            <Route path="/profile" component={Profile} />
            <Route path="/profiles" component={ProfilePicker} />
            <Route path="/profile/:userId" component={MemberProfile} />
            <Route path="/upgrade" component={Upgrade} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/wallet" component={Wallet} />
            <Route path="/world">{() => <GameLock><WorldMenu /></GameLock>}</Route>
            <Route path="/world/play">{() => <GameLock><WorldPlay /></GameLock>}</Route>
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
            <Route path="/meet/:code">{(params) => <MeetPage params={params} />}</Route>

            {/* BUSINESS module */}
            <Route path="/business/contacts" component={ContactCollector} />
            <Route path="/business/hiring" component={Hiring} />
            <Route path="/job-offers" component={JobOffers} />
            <Route path="/business/interview" component={Console} />
            <Route path="/business/calendar" component={Calendar} />
            <Route path="/business/documents" component={Documents} />
            <Route path="/business/resume" component={ResumeBuilder} />
            <Route path="/business/invoices" component={Invoices} />
            <Route path="/business/deals" component={Deals} />
            <Route path="/business/payroll" component={Payroll} />
            <Route path="/business/gusto" component={GustoPayroll} />
            <Route path="/business/time-tracking" component={TimeTracking} />
            <Route path="/business/tasks" component={TaskBoard} />
            <Route path="/business/team" component={TeamDirectory} />
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
            <Route path="/marketing">{() => <Redirect to="/marketing/campaigns" />}</Route>

            {/* ARMORY module */}
            <Route path="/armory/inventory" component={Armory} />
            <Route path="/armory" component={Armory} />

            {/* CONSOLE sub-routes (agents + video moved here) */}
            <Route path="/console/agents" component={AgentTeam} />
            <Route path="/console/video" component={VideoAnalyzer} />
            <Route path="/console/vault" component={KnowledgeVault} />
            <Route path="/console/scraper" component={WebScraper} />

            {/* INTEL module */}
            <Route path="/intel/reports" component={Reporting} />
            <Route path="/intel/dashboard" component={Dashboard} />
            <Route path="/intel/goals" component={Goals} />
            <Route path="/business/balance-sheet" component={BalanceSheet} />
            <Route path="/intel/balance-sheet">{() => { window.location.href = '/business/balance-sheet'; return null; }}</Route>
            <Route path="/intel/agents">{() => <Redirect to="/console/agents" />}</Route>
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

            {/* Jean Claw landing page */}
            <Route path="/jean-claw" component={JeanClawLanding} />
            <Route path="/landing" component={Cover} />

            {/* INSURANCE module */}
            <Route path="/insurance" component={InsuranceHub} />

            {/* PLATFORM API module — redirected into profile (preserves query params) */}
            <Route path="/platform">{() => {
              const qs = window.location.search;
              return <Redirect to={`/profile/platform${qs}`} />;
            }}</Route>

            {/* BOTS module */}
            <Route path="/bots/jobs" component={JobCommandCenter} />
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
            <Route path="/store/bots/vending">{() => <VendingMachine initialTab="bots" />}</Route>
            <Route path="/store/realty">{() => <VendingMachine initialTab="homebase" />}</Route>
            <Route path="/cutscene" component={CutscenePage} />
            <Route path="/bots" component={BotFactory} />
            <Route path="/bots/:rest*" component={BotFactory} />

            {/* Old flat routes — redirect to new module paths */}
            <Route path="/contacts">{() => <Redirect to="/business/contacts" />}</Route>
            <Route path="/hiring">{() => <Redirect to="/business/hiring" />}</Route>
            <Route path="/calendar">{() => <Redirect to="/business/calendar" />}</Route>
            <Route path="/documents">{() => <Redirect to="/business/documents" />}</Route>
            <Route path="/studio">{() => <Redirect to="/creative/darkroom" />}</Route>
            <Route path="/lab">{() => <Redirect to="/creative/lab" />}</Route>
            <Route path="/campaigns">{() => <Redirect to="/marketing/campaigns" />}</Route>
            <Route path="/reporting">{() => <Redirect to="/intel/reports" />}</Route>
            <Route path="/dashboard">{() => <Redirect to="/intel/dashboard" />}</Route>
            <Route path="/agents">{() => <Redirect to="/console/agents" />}</Route>
            <Route path="/seo">{() => <Redirect to="/marketing/seo" />}</Route>

            {/* Feedback admin */}
            <Route path="/feedback" component={FeedbackAdmin} />

            {/* Investor portal — standalone page */}
            <Route path="/pledge/agents" component={PixelAgents} />
            <Route path="/pledge" component={PledgeStore} />
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
          legal section now lives on the public promo page (PabloPromo)
          where new visitors actually look for it. */}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary fallbackTitle="APP CRASHED">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
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
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
