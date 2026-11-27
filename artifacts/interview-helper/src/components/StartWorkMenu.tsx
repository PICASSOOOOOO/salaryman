import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  LogIn,
  Menu,
  Monitor,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  queueWorkspaceFeatureOpen,
  requestWorkspaceFeatureOpen,
} from "@/lib/workspace-events";
import {
  WORKSPACE_MENU_OFFICE,
  WORKSPACE_MENU_OS,
  WORKSPACE_MENU_SECTIONS,
  type WorkspaceMenuEntry,
} from "@/lib/navigation-menu";
import { NotificationBell } from "./NotificationBell";
import "./AppHeader.css";

type SelectDestination = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => void;

function WorkspaceMenuEntryLink({
  entry,
  onSelect,
  className = "workspace-menu-link",
}: {
  entry: WorkspaceMenuEntry;
  onSelect: SelectDestination;
  className?: string;
}) {
  const Icon = entry.icon;
  return (
    <a
      href={entry.path}
      className={className}
      onClick={onSelect(entry.path)}
      data-testid={entry.id === "workspace" ? "workspace-menu-office" : `workspace-menu-link-${entry.id}`}
    >
      <Icon aria-hidden="true" />
      <span>{entry.label}</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

export function StartWorkMenu({ previewMode = false }: { previewMode?: boolean }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const menuId = `start-work-menu-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  const selectDestination = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const modifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (modifiedClick) {
      setOpen(false);
      return;
    }
    event.preventDefault();
    if (previewMode) {
      setOpen(false);
      return;
    }
    const currentPath = location.split("?")[0];
    if (href === "/workspace" || href === "/desktop") {
      navigate(href);
    } else if (currentPath === "/workspace") {
      requestWorkspaceFeatureOpen(href);
    } else {
      queueWorkspaceFeatureOpen(href);
      navigate("/workspace");
    }
    setOpen(false);
  };

  return (
    <div className="start-work-control" data-testid="start-work-control">
      {isAuthenticated ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`start-work-button${open ? " is-open" : ""}`}
            onClick={() => setOpen((current) => !current)}
            aria-label="Open Start Work menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={menuId}
            title="Open Start Work menu"
            data-testid="start-work-menu-trigger"
          >
            <Menu aria-hidden="true" />
            <span>START WORK</span>
            <ChevronDown aria-hidden="true" />
          </button>
          <NotificationBell
            buttonClassName="relative inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded border border-black/15 bg-white px-1.5 text-black transition-colors hover:bg-black/5"
            iconClassName="h-4 w-4"
          />
          {open && createPortal(
            <div className="workspace-menu-layer" data-testid="workspace-navigation-menu-layer">
              <button
                type="button"
                className="workspace-menu-scrim"
                aria-label="Close Start Work menu"
                onClick={() => setOpen(false)}
              />
              <section
                id={menuId}
                ref={panelRef}
                className="workspace-navigation-menu"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${menuId}-title`}
                data-testid="workspace-navigation-menu"
              >
                <header className="workspace-menu-header">
                  <div>
                    <p className="workspace-menu-eyebrow">SALARYMAN WORKSPACE</p>
                    <h2 id={`${menuId}-title`}>START WORK</h2>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="workspace-menu-close"
                    aria-label="Close Start Work menu"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    data-testid="close-start-work-menu"
                  >
                    <X aria-hidden="true" />
                  </button>
                </header>

                <a
                  href={WORKSPACE_MENU_OFFICE.path}
                  className="workspace-menu-office"
                  onClick={selectDestination(WORKSPACE_MENU_OFFICE.path)}
                  data-testid="workspace-menu-office"
                >
                  <Building2 aria-hidden="true" />
                  <span>
                    <strong>{WORKSPACE_MENU_OFFICE.label}</strong>
                    <small>{WORKSPACE_MENU_OFFICE.hint}</small>
                  </span>
                  <ArrowUpRight aria-hidden="true" />
                </a>

                <nav className="workspace-menu-groups" aria-label="SALARYMAN features">
                  {WORKSPACE_MENU_SECTIONS.map((section) => (
                    <section className="workspace-menu-group" key={section.id} data-testid={`workspace-menu-group-${section.id}`}>
                      <h3>{section.label}</h3>
                      <div className="workspace-menu-group-links">
                        {section.entries.map((entry) => (
                          <WorkspaceMenuEntryLink
                            key={entry.id}
                            entry={entry}
                            onSelect={selectDestination}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </nav>

                <footer className="workspace-menu-footer">
                  <a
                    href={WORKSPACE_MENU_OS.path}
                    className="workspace-menu-os-link"
                    onClick={selectDestination(WORKSPACE_MENU_OS.path)}
                    data-testid="workspace-menu-salaryman-os"
                  >
                    <Monitor aria-hidden="true" />
                    <span>{WORKSPACE_MENU_OS.label}</span>
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </footer>
              </section>
            </div>,
            document.body,
          )}
        </>
      ) : (
        <Link
          href="/sign-in?returnTo=%2F"
          className="start-work-login home-login-link"
          aria-label="Log in to your SALARYMAN account"
        >
          <LogIn aria-hidden="true" />
          <span>LOG IN</span>
        </Link>
      )}
    </div>
  );
}