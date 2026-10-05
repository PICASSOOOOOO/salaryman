import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, X } from "lucide-react";
import { MiniNebula } from "./MiniNebula";
import {
  WORKSPACE_MENU_BROWSE,
  WORKSPACE_MENU_FEATURED,
  WORKSPACE_MENU_SECTIONS,
  type WorkspaceMenuEntry,
} from "@/lib/navigation-menu";
import "./WorkspaceMenuOverlay.css";

type WorkspaceMenuOverlayProps = {
  open: boolean;
  pathname: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

function isEntryActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function Destination({
  entry,
  pathname,
  onNavigate,
}: {
  entry: WorkspaceMenuEntry;
  pathname: string;
  onNavigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = entry.icon;
  const active = isEntryActive(pathname, entry.path);

  return (
    <div className={`workspace-menu-entry${active ? " is-active" : ""}`}>
      <div className="workspace-menu-entry-row">
        <button
          type="button"
          className="workspace-menu-link"
          onClick={() => onNavigate(entry.path)}
          aria-current={active ? "page" : undefined}
        >
          <Icon className="workspace-menu-link-icon" aria-hidden="true" />
          <span className="workspace-menu-link-copy">
            <span className="workspace-menu-link-label">{entry.label}</span>
            {entry.hint && <span className="workspace-menu-link-hint">{entry.hint}</span>}
          </span>
        </button>
        {entry.children?.length ? (
          <button
            type="button"
            className="workspace-menu-expand"
            aria-label={`${expanded ? "Hide" : "Show"} ${entry.label} destinations`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown className={expanded ? "is-expanded" : ""} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded && entry.children?.length ? (
        <div className="workspace-menu-children">
          {entry.children.map((child) => (
            <Destination
              key={`${child.id}:${child.path}`}
              entry={child}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceMenuOverlay({
  open,
  pathname,
  onClose,
  onNavigate,
  onSignOut,
}: WorkspaceMenuOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const featured = WORKSPACE_MENU_FEATURED;
  const FeaturedIcon = featured.icon;

  return createPortal(
    <div
      className="workspace-menu-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <section
        id="workspace-navigation-menu"
        className="workspace-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-menu-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-menu-header">
          <span id="workspace-menu-title" className="workspace-menu-title">WORKSPACE</span>
          <button type="button" onClick={onClose} className="workspace-menu-close" aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className={`workspace-menu-feature${isEntryActive(pathname, featured.path) ? " is-active" : ""}`}
          onClick={() => onNavigate(featured.path)}
          aria-current={isEntryActive(pathname, featured.path) ? "page" : undefined}
        >
          <MiniNebula size={38} status="idle" title="Open Pablo AI" interactive={false} />
          <span className="workspace-menu-feature-copy">
            <span className="workspace-menu-feature-label">{featured.label}</span>
            <span className="workspace-menu-feature-hint">{featured.hint}</span>
          </span>
          <FeaturedIcon className="workspace-menu-feature-icon" aria-hidden="true" />
        </button>

        <div className="workspace-menu-sections">
          {WORKSPACE_MENU_SECTIONS.map((section) => (
            <section key={section.id} className="workspace-menu-section" aria-labelledby={`workspace-section-${section.id}`}>
              <h2 id={`workspace-section-${section.id}`} className="workspace-menu-section-title">
                {section.label}
              </h2>
              <div className="workspace-menu-grid">
                {section.entries.map((entry) => (
                  <Destination
                    key={entry.id}
                    entry={entry}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="workspace-menu-utility">
          <button type="button" onClick={() => onNavigate(WORKSPACE_MENU_BROWSE.path)}>
            <WORKSPACE_MENU_BROWSE.icon aria-hidden="true" />
            {WORKSPACE_MENU_BROWSE.label}
          </button>
          <button type="button" onClick={onSignOut} className="workspace-menu-signout">
            <LogOut aria-hidden="true" />
            SIGN OUT
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
