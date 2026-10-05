import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Search, X } from "lucide-react";
import { MiniNebula } from "./MiniNebula";
import {
  WORKSPACE_MENU_BROWSE,
  WORKSPACE_MENU_FEATURED,
  WORKSPACE_MENU_SECTIONS,
  filterWorkspaceMenuEntry,
  type WorkspaceMenuEntry,
} from "@/lib/navigation-menu";
import "./WorkspaceMenuOverlay.css";

type WorkspaceMenuOverlayProps = {
  open: boolean;
  pathname: string;
  canAccessStaff: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

function isEntryActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function hasActiveDescendant(pathname: string, entry: WorkspaceMenuEntry): boolean {
  return entry.children?.some((child) =>
    isEntryActive(pathname, child.path) || hasActiveDescendant(pathname, child),
  ) ?? false;
}

function Destination({
  entry,
  pathname,
  onNavigate,
  searching,
}: {
  entry: WorkspaceMenuEntry;
  pathname: string;
  onNavigate: (path: string) => void;
  searching: boolean;
}) {
  const activeChild = hasActiveDescendant(pathname, entry);
  const [expanded, setExpanded] = useState(activeChild);
  useEffect(() => {
    if (activeChild) setExpanded(true);
  }, [activeChild]);

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
        {entry.children?.length && !searching ? (
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
      {(expanded || searching) && entry.children?.length ? (
        <div className="workspace-menu-children">
          {entry.children.map((child) => (
            <Destination
              key={`${child.id}:${child.path}`}
              entry={child}
              pathname={pathname}
              onNavigate={onNavigate}
              searching={searching}
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
  canAccessStaff,
  onClose,
  onNavigate,
  onSignOut,
}: WorkspaceMenuOverlayProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus();

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !panel.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFeatured = filterWorkspaceMenuEntry(WORKSPACE_MENU_FEATURED, normalizedQuery, canAccessStaff);
  const visibleSections = WORKSPACE_MENU_SECTIONS
    .map((section) => ({
      ...section,
      entries: section.entries
        .map((entry) => filterWorkspaceMenuEntry(entry, normalizedQuery, canAccessStaff))
        .filter((entry): entry is WorkspaceMenuEntry => entry !== null),
    }))
    .filter((section) => section.entries.length > 0);
  const browseMatches = filterWorkspaceMenuEntry(WORKSPACE_MENU_BROWSE, normalizedQuery, canAccessStaff);
  const BrowseIcon = browseMatches?.icon;
  const hasResults = Boolean(visibleFeatured) || visibleSections.length > 0 || Boolean(browseMatches);
  const FeaturedIcon = visibleFeatured?.icon;

  return createPortal(
    <div
      className="workspace-menu-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <section
        id="workspace-navigation-menu"
        className="workspace-menu-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-menu-title"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-menu-header">
          <span id="workspace-menu-title" className="workspace-menu-title">WORKSPACE</span>
          <label className="workspace-menu-search">
            <Search aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a destination"
              aria-label="Find a destination"
            />
          </label>
          <button type="button" onClick={onClose} className="workspace-menu-close" aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>

        {visibleFeatured && FeaturedIcon && (
          <button
            type="button"
            className={`workspace-menu-feature${isEntryActive(pathname, visibleFeatured.path) ? " is-active" : ""}`}
            onClick={() => onNavigate(visibleFeatured.path)}
            aria-current={isEntryActive(pathname, visibleFeatured.path) ? "page" : undefined}
          >
            <MiniNebula size={38} status="idle" title="Open Pablo AI" interactive={false} />
            <span className="workspace-menu-feature-copy">
              <span className="workspace-menu-feature-label">{visibleFeatured.label}</span>
              <span className="workspace-menu-feature-hint">{visibleFeatured.hint}</span>
            </span>
            <FeaturedIcon className="workspace-menu-feature-icon" aria-hidden="true" />
          </button>
        )}

        <div className="workspace-menu-sections">
          {visibleSections.map((section) => (
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
                    searching={Boolean(normalizedQuery)}
                  />
                ))}
              </div>
            </section>
          ))}
          {!hasResults && (
            <p className="workspace-menu-no-results">No destinations found.</p>
          )}
        </div>

        <div className="workspace-menu-utility">
          {browseMatches && BrowseIcon && (
            <button type="button" onClick={() => onNavigate(browseMatches.path)}>
              <BrowseIcon aria-hidden="true" />
              {browseMatches.label}
            </button>
          )}
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
