import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { PicassoLogo } from "@/components/PicassoLogo";
import { playNav, playSting, playClick } from "@/lib/ui-sound";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import {
  Briefcase, Code2, Phone, Bot, Building2, Layers, Megaphone,
  BarChart2, User, MessageCircle, LogIn, LogOut, LayoutDashboard,
  Volume2, VolumeX, Radio,
} from "lucide-react";

// The clean "terminal" — the plain, list-of-buttons home the player
// returns to from the game (CLOCK OUT) and the normal landing for
// returning users. Deliberately NOT the purple "ask Pablo" promo and
// NOT the heavily-themed WorldMenu: it reads like any normal app menu.
// Locked tools still enforce access at the route level (sign-in / PABLO
// PRIME prompt), so everything is listed here for discoverability.

type Item = {
  id: string;
  path: string;
  label: string;
  desc: string;
  icon: typeof Briefcase;
  accent: string;
};

const ITEMS: Item[] = [
  { id: "business", path: "/business", label: "BUSINESS", desc: "Org, payroll, invoices, deals", icon: Briefcase, accent: "#34d399" },
  { id: "console", path: "/console", label: "CONSOLE", desc: "Interview solver & screen scan", icon: Code2, accent: "#38bdf8" },
  { id: "phone", path: "/phone/dialer", label: "PHONE", desc: "Calls, secretary, contacts", icon: Phone, accent: "#a78bfa" },
  { id: "bots", path: "/bots", label: "BOTS", desc: "Your agent network", icon: Bot, accent: "#c084fc" },
  { id: "office", path: "/office/surveillance", label: "OFFICE", desc: "Live office feed", icon: Building2, accent: "#34d399" },
  { id: "creative", path: "/creative/music", label: "CREATIVE", desc: "Music, brand, dark room", icon: Layers, accent: "#f472b6" },
  { id: "marketing", path: "/marketing/campaigns", label: "MARKETING", desc: "Campaigns, leads, SEO", icon: Megaphone, accent: "#fb7185" },
  { id: "intel", path: "/intel/reports", label: "INTEL", desc: "Reports & analytics", icon: BarChart2, accent: "#fbbf24" },
  { id: "workspace", path: "/home", label: "WORKSPACE", desc: "Dashboard, notes, tools", icon: LayoutDashboard, accent: "#60a5fa" },
  { id: "pablo", path: "/pablo", label: "ASK PABLO", desc: "Free AI assistant", icon: MessageCircle, accent: "#818cf8" },
];

const MONO = "'Share Tech Mono', monospace";
const VT = "'VT323', monospace";

export default function Terminal() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user, login, logout } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(120% 120% at 50% 0%, #0a1418 0%, #050708 60%, #030405 100%)",
        color: "#cbe7f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "clamp(1.25rem, 4vw, 3rem) 1rem 4rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
            <PicassoLogo />
            <span style={{ fontFamily: MONO, letterSpacing: ".22em", fontSize: ".82rem", color: "rgba(56,189,248,.65)" }}>
              SALARYMAN
            </span>
          </div>
          {isAuthenticated ? (
            <button
              onClick={() => { playClick(); logout(); }}
              style={{ ...btnGhost, display: "flex", alignItems: "center", gap: ".4rem" }}
            >
              <LogOut style={{ width: 13, height: 13 }} />
              {(user?.firstName || "SIGN OUT").toString().toUpperCase()}
            </button>
          ) : (
            <button
              onClick={() => { playClick(); login(); }}
              style={{ ...btnGhost, display: "flex", alignItems: "center", gap: ".4rem" }}
            >
              <LogIn style={{ width: 13, height: 13 }} />
              SIGN IN
            </button>
          )}
        </div>

        {/* Primary CTA — enter the world */}
        <button
          onClick={() => { playSting(); navigate("/world/play"); }}
          style={{
            width: "100%",
            textAlign: "left",
            background: "linear-gradient(180deg, rgba(251,191,36,.16), rgba(251,191,36,.04))",
            border: "1.5px solid rgba(251,191,36,.55)",
            color: "#fde68a",
            padding: "1.1rem 1.2rem",
            cursor: "pointer",
            borderRadius: 10,
            boxShadow: "0 0 22px rgba(251,191,36,.12)",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ fontFamily: VT, fontSize: "1.7rem", lineHeight: 1, letterSpacing: ".04em", color: "#fbbf24" }}>
            LATE FOR WORK ▶
          </div>
          <div style={{ fontFamily: MONO, fontSize: ".62rem", letterSpacing: ".08em", color: "rgba(253,230,138,.7)", marginTop: ".4rem" }}>
            CLOCK IN — STEP INTO MINX CITY
          </div>
        </button>

        <div style={{ fontFamily: MONO, fontSize: ".58rem", letterSpacing: ".22em", color: "rgba(56,189,248,.35)", marginBottom: ".7rem" }}>
          TERMINAL
        </div>

        {/* Clean grid of sections */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".55rem" }}>
          {ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => { playNav(); navigate(it.path); }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: ".25rem",
                  textAlign: "left",
                  background: "rgba(56,189,248,.025)",
                  border: "1px solid rgba(56,189,248,.12)",
                  borderRadius: 8,
                  padding: ".7rem .8rem",
                  cursor: "pointer",
                  transition: "background .15s, border-color .15s, transform .1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(56,189,248,.07)";
                  e.currentTarget.style.borderColor = it.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(56,189,248,.025)";
                  e.currentTarget.style.borderColor = "rgba(56,189,248,.12)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
                  <Icon style={{ width: 15, height: 15, color: it.accent }} />
                  <span style={{ fontFamily: MONO, fontSize: ".74rem", fontWeight: 700, letterSpacing: ".06em", color: it.accent }}>
                    {it.label}
                  </span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: ".54rem", letterSpacing: ".02em", color: "rgba(203,231,240,.4)" }}>
                  {it.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Audio quick-controls — same options as the game, surfaced here */}
        <TerminalAudioBar />

        {/* Profile / settings footer */}
        <button
          onClick={() => { playClick(); navigate("/profile"); }}
          style={{
            ...btnGhost,
            width: "100%",
            marginTop: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: ".5rem",
          }}
        >
          <User style={{ width: 13, height: 13 }} />
          PROFILE & SETTINGS
        </button>
      </div>
    </div>
  );
}

// Quick audio controls inside the terminal — the same settings as the game
// (they share the central audio store), so muting/adjusting here applies
// everywhere. Full controls live in the game settings + Hummingbird hub.
function TerminalAudioBar() {
  const { settings, set, toggleMuted } = useAudioSettings();
  const labelCss: React.CSSProperties = {
    fontFamily: MONO, fontSize: ".5rem", letterSpacing: ".12em",
    color: "rgba(56,189,248,.5)", minWidth: 64,
  };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: ".5rem" };
  return (
    <div
      style={{
        marginTop: "1rem",
        border: "1px solid rgba(56,189,248,.12)",
        background: "rgba(56,189,248,.025)",
        borderRadius: 8,
        padding: ".7rem .8rem",
        display: "flex",
        flexDirection: "column",
        gap: ".5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: ".55rem", letterSpacing: ".2em", color: "rgba(56,189,248,.45)" }}>
          AUDIO
        </span>
        <button
          onClick={() => { playClick(); toggleMuted(); }}
          style={{
            ...btnGhost,
            display: "flex", alignItems: "center", gap: ".35rem",
            color: settings.muted ? "rgba(248,113,113,.9)" : "rgba(56,189,248,.7)",
            borderColor: settings.muted ? "rgba(248,113,113,.4)" : "rgba(56,189,248,.18)",
          }}
        >
          {settings.muted ? <VolumeX style={{ width: 12, height: 12 }} /> : <Volume2 style={{ width: 12, height: 12 }} />}
          {settings.muted ? "MUTED" : "ON"}
        </button>
      </div>
      <div style={row}>
        <Volume2 style={{ width: 12, height: 12, color: "rgba(56,189,248,.5)" }} />
        <span style={labelCss}>MASTER</span>
        <input
          type="range" min={0} max={1} step={0.05} value={settings.master}
          disabled={settings.muted}
          onChange={(e) => set({ master: Number(e.target.value) })}
          style={{ flex: 1, accentColor: "#38bdf8", opacity: settings.muted ? 0.4 : 1 }}
        />
      </div>
      <div style={row}>
        <Radio style={{ width: 12, height: 12, color: "rgba(251,191,36,.6)" }} />
        <span style={labelCss}>RADIO</span>
        <input
          type="range" min={0} max={1} step={0.05} value={settings.soundtrack}
          disabled={settings.muted}
          onChange={(e) => set({ soundtrack: Number(e.target.value) })}
          style={{ flex: 1, accentColor: "#fbbf24", opacity: settings.muted ? 0.4 : 1 }}
        />
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: ".62rem",
  letterSpacing: ".1em",
  color: "rgba(56,189,248,.7)",
  background: "rgba(56,189,248,.04)",
  border: "1px solid rgba(56,189,248,.18)",
  borderRadius: 7,
  padding: ".5rem .75rem",
  cursor: "pointer",
};
