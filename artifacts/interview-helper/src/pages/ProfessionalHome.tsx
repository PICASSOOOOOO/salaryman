import { ArrowUpRight, Bot, Download, Menu, Phone, Workflow, X } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { MORE_NAV_ITEMS, PRIMARY_NAV_ITEMS, type AppNavItem } from "@/lib/app-navigation";
import "./ProfessionalHome.css";

const MODULES = [
  {
    id: "pixel-agents",
    title: "PIXEL AGENTS",
    href: "/business/autopilot",
    icon: Workflow,
    logoSrc: undefined,
  },
  {
    id: "pablo",
    title: "PABLO AI",
    href: "/pablo",
    icon: Bot,
    logoSrc: undefined,
  },
  {
    id: "phone",
    title: "CALLL HOME",
    href: "/phone",
    icon: Phone,
    logoSrc: `${import.meta.env.BASE_URL}brand/callhome/calll-home-logo-2.png`,
  },
  {
    id: "desktop",
    title: "SALARYMAN OS",
    href: "/desktop",
    icon: Download,
    logoSrc: undefined,
  },
] as const;

const pabloPrimeItems: AppNavItem[] = [
  PRIMARY_NAV_ITEMS.find(item => item.id === "pablo")!,
  MORE_NAV_ITEMS.find(item => item.id === "bots")!,
];

const standaloneProductItems: AppNavItem[] = [
  PRIMARY_NAV_ITEMS.find(item => item.id === "phone")!,
  PRIMARY_NAV_ITEMS.find(item => item.id === "office")!,
];

export default function ProfessionalHome() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] text-black overflow-x-hidden flex flex-col">
      <header className="home-header relative shrink-0 px-4 sm:px-8 h-14 flex items-center justify-between gap-2 border-b border-black/10">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-7 w-7 rounded-md"
          />
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase">SALARYMAN</span>
          <span className="home-alpha-badge">
            ALPHA {typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "DEV"}
          </span>
        </Link>
        <div className="home-header-actions">
          {isAuthenticated ? (
            <button
              type="button"
              className={`home-start-work-button${menuOpen ? " is-open" : ""}`}
              onClick={() => setMenuOpen(open => !open)}
              aria-expanded={menuOpen}
              aria-controls="home-start-work-panel"
              aria-label={menuOpen ? "Close start work" : "Open start work"}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
              <span>START WORK</span>
            </button>
          ) : (
            <Link
              href="/sign-in?returnTo=%2F"
              className="home-login-link"
            >
              LOG IN
            </Link>
          )}
        </div>
        {isAuthenticated && menuOpen && (
          <div id="home-start-work-panel" className="home-features-menu" role="menu">
            <div className="home-features-heading">START WORK</div>
            <div className="home-features-section-label">PABLO PRIME</div>
            {pabloPrimeItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  role="menuitem"
                  className="home-feature-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span className="home-feature-copy">
                    <span>{item.label}</span>
                    <small>{index === 0 ? "UPGRADED PABLO AI" : "PABLO PRIME"}</small>
                  </span>
                </Link>
              );
            })}
            <div className="home-features-section-label">PRODUCTS</div>
            {standaloneProductItems.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  role="menuitem"
                  className="home-feature-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="home-features-section-label">WORKSPACE</div>
            {MORE_NAV_ITEMS
              .filter(item => item.id !== "bots" && (!item.authOnly || isAuthenticated))
              .map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    role="menuitem"
                    className="home-feature-link"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        )}
      </header>

      <section className="home-stage">
        <h1 className="home-title">
          Make work possible.
        </h1>

        <div className="home-modules">
          {MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className={`home-module home-module--${mod.id}`}
            >
              <div className="home-module-visual" aria-hidden="true">
                {mod.logoSrc ? (
                  <img
                    src={mod.logoSrc}
                    alt=""
                    className="home-module-logo"
                  />
                ) : (
                  <mod.icon className="home-module-icon" strokeWidth={1.35} />
                )}
                <div className="home-signal">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="home-module-action">
                <h2>
                  {mod.title}
                </h2>
                <ArrowUpRight aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
