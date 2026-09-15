import { ChevronDown, Globe, LogIn, LogOut, Menu, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { HISTORIC_MODULES } from "@/lib/historic-navigation";
import { MiniNebula } from "./MiniNebula";
import "./AppHeader.css";

const MENU_MODULES = HISTORIC_MODULES.filter(
  module => module.id !== "pablo" && module.id !== "phone",
);

const PRODUCT_SHORTCUTS = [
  { label: "PABLO AI", path: "/pablo" },
  { label: "PIXEL AGENTS", path: "/business/autopilot" },
  { label: "CALLL HOME", path: "/phone" },
  { label: "SALARYMAN OS", path: "/desktop" },
  { label: "COMMS", path: "/comms" },
];

export function StartWorkMenu({ previewMode = false }: { previewMode?: boolean }) {
  const [, navigate] = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(previewMode && isAuthenticated);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const go = (path: string) => {
    if (!previewMode) navigate(path);
    setMenuOpen(false);
  };

  return (
    <div className="start-work-control">
      {isAuthenticated ? (
        <button
          type="button"
          className={`start-work-button${menuOpen ? " is-open" : ""}`}
          onClick={() => setMenuOpen(open => !open)}
          aria-expanded={menuOpen}
          aria-controls="home-start-work-panel"
          aria-label={menuOpen ? "Close start work" : "Open start work"}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>START WORK</span>
          <ChevronDown className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : (
        <Link href="/sign-in?returnTo=%2F" className="start-work-login home-login-link">
          <LogIn aria-hidden="true" />
          <span>LOG IN</span>
        </Link>
      )}

      {isAuthenticated && menuOpen && (
        <div id="home-start-work-panel" className="start-work-panel" role="menu">
          <div className="start-work-heading">START WORK</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => go("/pablo")}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") go("/pablo");
            }}
            className="flex cursor-pointer items-center gap-3 border border-black bg-black px-3 py-2 text-left text-[#FAFAF7] hover:bg-[#211B2B]"
            aria-label="Open Pablo Prime"
          >
            <MiniNebula size={38} status="idle" title="Open Pablo Prime" interactive={false} />
            <span className="min-w-0">
              <span className="block font-mono text-[10px] tracking-[0.16em]">PABLO PRIME</span>
              <span className="mt-0.5 block font-mono text-[8px] tracking-wider text-[#D8CBE6]">
                PABLO AI + PIXEL AGENTS
              </span>
            </span>
          </div>

          <div className="start-work-section-label">PRODUCTS</div>
          <div className="start-work-shortcuts">
            {PRODUCT_SHORTCUTS.map(item => (
              <button
                type="button"
                key={item.path}
                onClick={() => go(item.path)}
                className="start-work-shortcut"
                role="menuitem"
              >
                {item.label}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>

          <div className="start-work-section-label">WORKSPACE</div>
          <div className="start-work-module-list">
            {MENU_MODULES.map(module => {
              const ModuleIcon = module.icon;
              return (
                <section key={module.id}>
                  <button type="button" onClick={() => go(module.defaultPath)} className="start-work-module-title">
                    <ModuleIcon className="h-3.5 w-3.5" />
                    {module.label}
                  </button>
                  <div className="start-work-module-links">
                    {module.subs.map(sub => {
                      const SubIcon = sub.icon;
                      return (
                        <button
                          type="button"
                          key={sub.id}
                          onClick={() => go(sub.path)}
                          className="start-work-module-link"
                          role="menuitem"
                        >
                          <SubIcon aria-hidden="true" />
                          {sub.boomerLabel}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="start-work-footer">
            <button type="button" onClick={() => go("/world")}>
              <Globe className="h-3 w-3" />
              EXPLORE
            </button>
            <button type="button" onClick={() => go("/profile")}>
              <User className="h-3 w-3" />
              ACCOUNT
            </button>
            <button
              type="button"
              className="start-work-logout"
              onClick={() => {
                if (!previewMode) logout();
                setMenuOpen(false);
              }}
            >
              <LogOut className="h-3 w-3" />
              LOG OUT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}