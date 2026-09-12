import { ArrowUpRight, Bot, Download, Menu, Phone, Workflow, X } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { MORE_NAV_ITEMS } from "@/lib/app-navigation";
import "./ProfessionalHome.css";

const MODULES = [
  {
    id: "automation",
    title: "PIXEL AGENT AUTOMATION",
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
    title: "APP DOWNLOAD",
    href: "/desktop",
    icon: Download,
    logoSrc: undefined,
  },
] as const;

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
        </Link>
        <div className="home-header-actions">
          <button
            type="button"
            className={`home-menu-button${menuOpen ? " is-open" : ""}`}
            onClick={() => setMenuOpen(open => !open)}
            aria-expanded={menuOpen}
            aria-controls="home-features-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span>MENU</span>
          </button>
        </div>
        {menuOpen && (
          <div id="home-features-menu" className="home-features-menu" role="menu">
            <div className="home-features-heading">MENU</div>
            {!isAuthenticated && (
              <Link
                href="/sign-in?returnTo=%2Fbusiness"
                role="menuitem"
                className="home-feature-link home-feature-link--primary"
                onClick={() => setMenuOpen(false)}
              >
                <span>LOG IN</span>
              </Link>
            )}
            {MORE_NAV_ITEMS
              .filter(item => !item.authOnly || isAuthenticated)
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
