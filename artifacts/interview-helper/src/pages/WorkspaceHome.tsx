import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Expand, GripVertical, Menu, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { WorkspaceMenuOverlay } from "@/components/WorkspaceMenuOverlay";
import {
  WORKSPACE_MENU_FEATURED,
  WORKSPACE_MENU_BROWSE,
  WORKSPACE_MENU_SECTIONS,
  type WorkspaceMenuEntry,
} from "@/lib/navigation-menu";
import { WORKSPACE_FEATURE_ASSIGN_EVENT } from "@/lib/workspace-events";
import "./workspace-home.css";

type Feature = { id: string; path: string; label: string; icon: WorkspaceMenuEntry["icon"]; staffOnly?: boolean; prominent?: boolean };
type Slot = string | null;

const SLOT_LIMIT = 9;
const DEFAULT_PATHS = [
  "/pablo",
  "/workspace/notepad",
  "/workspace/calculator",
  "/business/crm",
  "/business/autopilot",
  "/comms",
  "/creative/classroom",
  "/1999",
  "/creative/media",
];
const BASE_URL = import.meta.env.BASE_URL;

function flattenEntry(entry: WorkspaceMenuEntry, result: Feature[]) {
  result.push({
    id: entry.id,
    path: entry.path,
    label: entry.label,
    icon: entry.icon,
    staffOnly: entry.staffOnly,
  });
  entry.children?.forEach((child) => flattenEntry(child, result));
}

function makeFeatureList(canAccessStaff: boolean): Feature[] {
  const all: Feature[] = [];
  flattenEntry(WORKSPACE_MENU_FEATURED, all);
  WORKSPACE_MENU_SECTIONS.forEach((section) => section.entries.forEach((entry) => flattenEntry(entry, all)));
  flattenEntry(WORKSPACE_MENU_BROWSE, all);

  const seen = new Set<string>();
  return all.filter((feature) => {
    if (feature.staffOnly && !canAccessStaff) return false;
    if (seen.has(feature.path)) return false;
    seen.add(feature.path);
    return true;
  }).map((feature) => ({
    ...feature,
    prominent: feature.path === WORKSPACE_MENU_FEATURED.path,
  }));
}

function storageKey(userId?: string | null) {
  return `salaryman-workspace-slots:${userId || "browser"}`;
}

function isSlotArray(value: unknown): value is Slot[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= SLOT_LIMIT &&
    value.every((slot) => slot === null || typeof slot === "string")
  );
}

function loadSlots(key: string): Slot[] {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      let slots: unknown = parsed;
      let legacyArray = Array.isArray(parsed);
      if (!legacyArray && parsed && typeof parsed === "object") {
        const stored = parsed as { version?: unknown; slots?: unknown };
        if (stored.version === 2) {
          slots = stored.slots;
          legacyArray = false;
        }
      }
      if (isSlotArray(slots)) {
        // The shipped nine-tool arrangement was never user-customized. Start
        // old array-format accounts with the new intentional blank canvas.
        // Versioned saves can represent a user who intentionally picked the
        // same arrangement, so do not migrate those back to blank.
        if (legacyArray && slots.length === SLOT_LIMIT && DEFAULT_PATHS.every((path, index) => slots[index] === path)) {
          return [null];
        }
        return slots;
      }
    }
  } catch {
    // Storage can be unavailable in private browsing; defaults remain usable.
  }
  return [null];
}

function embedUrl(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const [relativePath, query = ""] = path.replace(/^\/+/, "").split("?");
  const params = new URLSearchParams(query);
  params.set("embed", "1");
  return `${base}${relativePath}?${params.toString()}`;
}

export default function WorkspaceHome() {
  const { user, logout } = useAuth();
  const { isOwner } = usePlan();
  const userId = user?.id;
  const features = useMemo(() => makeFeatureList(isOwner), [isOwner]);
  const key = storageKey(userId);
  const [slots, setSlots] = useState<Slot[]>(() => loadSlots(key));
  const [readyKey, setReadyKey] = useState(key);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [mobileSlot, setMobileSlot] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    setSlots(loadSlots(key));
    setActiveSlot(null);
    setMobileSlot(0);
    setReadyKey(key);
  }, [key]);

  useEffect(() => {
    if (readyKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 2, slots }));
    } catch {
      // The workspace remains usable for this session if storage is blocked.
    }
  }, [key, readyKey, slots]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const featureByPath = useMemo(() => new Map(features.map((feature) => [feature.path, feature])), [features]);
  const activePath = activeSlot === null ? null : slots[activeSlot];
  const activeFeature = activePath ? featureByPath.get(activePath) : undefined;
  const boundedMobileSlot = Math.min(mobileSlot, slots.length - 1);
  const gridColumns = slots.length === 1 ? 1 : slots.length === 2 ? 2 : slots.length === 4 ? 2 : slots.length === 5 || slots.length === 7 || slots.length === 8 ? 6 : 3;
  const gridRows = Math.ceil(slots.length / (slots.length === 1 ? 1 : slots.length === 2 ? 2 : slots.length === 4 ? 2 : slots.length === 5 || slots.length === 7 || slots.length === 8 ? 3 : 3));

  const openMenuFor = useCallback((index: number) => {
    setMenuTarget(index);
    setMenuOpen(true);
  }, []);

  const assignFeature = useCallback((path: string, requestedSlot: number | null = null) => {
    if (path === "/workspace" || !featureByPath.has(path)) return;
    let target = requestedSlot ?? slots.findIndex((slot) => slot === null);
    if (target < 0) target = slots.length < SLOT_LIMIT ? slots.length : 0;
    setSlots((current) => {
      const next = [...current];
      while (next.length <= target && next.length < SLOT_LIMIT) next.push(null);
      if (target < next.length) next[target] = path;
      return next;
    });
    setMobileSlot(target);
  }, [featureByPath, slots]);

  useEffect(() => {
    const onAssign = (event: Event) => {
      const path = (event as CustomEvent<{ path?: unknown }>).detail?.path;
      if (typeof path === "string") assignFeature(path);
    };
    window.addEventListener(WORKSPACE_FEATURE_ASSIGN_EVENT, onAssign);
    return () => window.removeEventListener(WORKSPACE_FEATURE_ASSIGN_EVENT, onAssign);
  }, [assignFeature]);

  const openGeneralMenu = () => {
    let target = slots.findIndex((slot) => slot === null);
    if (target < 0) {
      if (slots.length < SLOT_LIMIT) {
        target = slots.length;
        setSlots((current) => current.length < SLOT_LIMIT ? [...current, null] : current);
      } else {
        target = 0;
      }
    }
    openMenuFor(target);
  };

  const moveSlot = (from: number, to: number) => {
    if (to < 0 || to >= slots.length || from === to) return;
    setSlots((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setActiveSlot((current) => current === from ? to : current === to ? from : current);
    setMobileSlot((current) => current === from ? to : current === to ? from : current);
  };

  const addSlot = () => {
    if (slots.length >= SLOT_LIMIT) return;
    setSlots((current) => [...current, null]);
    setMobileSlot(slots.length);
  };

  const removeSlot = (index: number) => {
    setSlots((current) => current.length === 1
      ? [null]
      : current.filter((_, slotIndex) => slotIndex !== index));
    setActiveSlot((current) => current === index ? null : current !== null && current > index ? current - 1 : current);
    setMobileSlot((current) => Math.max(0, Math.min(current > index ? current - 1 : current, slots.length - 2)));
  };

  const handleFeaturePick = (path: string) => {
    if (path === "/workspace") {
      setMenuOpen(false);
      setMenuTarget(null);
      return;
    }
    assignFeature(path, menuTarget);
    setMenuOpen(false);
    setMenuTarget(null);
  };

  const handleDrop = (target: number) => {
    if (dragging !== null) moveSlot(dragging, target);
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <main className={`workspace-home${isMobile ? " is-mobile" : ""}`} data-testid="workspace-home">
      <header className="workspace-toolbar">
        <button
          type="button"
          className="workspace-toolbar-button"
          onClick={openGeneralMenu}
          aria-label="Open feature menu"
          aria-expanded={menuOpen}
          data-testid="open-workspace-menu"
        >
          <Menu aria-hidden="true" />
        </button>
        <h1 className="workspace-office-title">THE OFFICE</h1>
        <div className="workspace-toolbar-spacer" />
        <button
          type="button"
          className="workspace-toolbar-button"
          onClick={addSlot}
          disabled={slots.length >= SLOT_LIMIT}
          aria-label="Add widget"
          data-testid="add-workspace-widget"
        >
          <Plus aria-hidden="true" />
        </button>
      </header>

      <section
        className="workspace-grid"
        aria-label="Workspace widgets"
        style={{
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
        }}
      >
        {slots.map((path, index) => {
          const feature = path ? featureByPath.get(path) : undefined;
          const FeatureIcon = feature?.icon ?? Plus;
          const isVisibleOnMobile = !isMobile || index === boundedMobileSlot;
          const renderFrame = Boolean(path) && (isMobile ? isVisibleOnMobile : true) && activeSlot !== index;
          return (
            <article
              key={`slot-${index}`}
              className={`workspace-slot${dragging === index ? " is-dragging" : ""}${dropTarget === index ? " is-drop-target" : ""}${isVisibleOnMobile ? " is-visible" : " is-mobile-hidden"}`}
              style={slots.length === 5
                ? { gridColumn: index < 3 ? "span 2" : "span 3" }
                : slots.length === 7
                  ? { gridColumn: index === 6 ? "span 6" : "span 2" }
                  : slots.length === 8
                    ? { gridColumn: index < 6 ? "span 2" : "span 3" }
                    : undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(index);
              }}
              onDragLeave={() => setDropTarget((current) => current === index ? null : current)}
              onDrop={() => handleDrop(index)}
              data-testid={`workspace-slot-${index + 1}`}
            >
              <div className="workspace-slot-toolbar">
                <button
                  type="button"
                  className="workspace-drag-handle"
                  draggable
                  aria-label={`Drag widget ${index + 1} to reorder`}
                  data-testid={`drag-slot-${index + 1}`}
                  onDragStart={(event) => {
                    setDragging(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                >
                  <GripVertical aria-hidden="true" />
                </button>
                <span className="workspace-slot-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="workspace-slot-actions">
                  <button type="button" onClick={() => moveSlot(index, index - 1)} disabled={index === 0} aria-label={`Move widget ${index + 1} left`} data-testid={`move-slot-left-${index + 1}`}><ArrowLeft aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index + 1)} disabled={index === slots.length - 1} aria-label={`Move widget ${index + 1} right`} data-testid={`move-slot-right-${index + 1}`}><ArrowRight aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index - 3)} disabled={index < 3} aria-label={`Move widget ${index + 1} up`} data-testid={`move-slot-up-${index + 1}`}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index + 3)} disabled={index + 3 >= slots.length} aria-label={`Move widget ${index + 1} down`} data-testid={`move-slot-down-${index + 1}`}><ArrowDown aria-hidden="true" /></button>
                </div>
                <button
                  type="button"
                  className="workspace-remove-button"
                  onClick={() => removeSlot(index)}
                  aria-label={`Remove widget ${index + 1}`}
                  data-testid={`remove-slot-${index + 1}`}
                >
                  <X aria-hidden="true" />
                </button>
              </div>

              {path ? (
                <>
                  <div className="workspace-feature-bar">
                    <div className="workspace-feature-mark"><FeatureIcon aria-hidden="true" /></div>
                    <h2 className="workspace-feature-name">{feature?.label ?? path}</h2>
                    <button type="button" className="workspace-icon-button" onClick={() => openMenuFor(index)} aria-label={`Change ${feature?.label ?? "feature"}`} data-testid={`change-feature-${index + 1}`}><Plus aria-hidden="true" /></button>
                    <button type="button" className="workspace-icon-button" onClick={() => setActiveSlot(index)} aria-label={`Expand ${feature?.label ?? "feature"}`} data-testid={`expand-feature-${index + 1}`}><Expand aria-hidden="true" /></button>
                  </div>
                  {renderFrame && (
                    <iframe
                      className="workspace-feature-frame"
                      src={embedUrl(path)}
                      title={`${feature?.label ?? "Feature"} widget`}
                      loading={isMobile ? "eager" : "lazy"}
                      allow="clipboard-read; clipboard-write"
                      data-testid={`widget-frame-${index + 1}`}
                    />
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="workspace-empty-target"
                  onClick={() => openMenuFor(index)}
                  aria-label={`Add a feature to widget ${index + 1}`}
                  data-testid={`add-feature-${index + 1}`}
                >
                  <Plus aria-hidden="true" />
                </button>
              )}
            </article>
          );
        })}
      </section>

      {isMobile && slots.length > 1 && (
        <nav className="workspace-mobile-pager" aria-label="Widget selection">
          <button type="button" onClick={() => setMobileSlot((current) => (current - 1 + slots.length) % slots.length)} aria-label="Previous widget" data-testid="previous-workspace-widget"><ArrowLeft aria-hidden="true" /></button>
          <span>{String(boundedMobileSlot + 1).padStart(2, "0")} / {String(slots.length).padStart(2, "0")}</span>
          <button type="button" onClick={() => setMobileSlot((current) => (current + 1) % slots.length)} aria-label="Next widget" data-testid="next-workspace-widget"><ArrowRight aria-hidden="true" /></button>
        </nav>
      )}

      {activeSlot !== null && activePath && (
        <div className="workspace-focus" role="dialog" aria-modal="true" aria-label={`${activeFeature?.label ?? "Feature"} workspace`}>
          <div className="workspace-focus-bar">
            <strong>{activeFeature?.label ?? activePath}</strong>
            <button type="button" className="workspace-focus-close" onClick={() => setActiveSlot(null)} aria-label="Close expanded widget" data-testid="close-focused-workspace">
              <X aria-hidden="true" />
            </button>
          </div>
          <iframe
            key={activePath}
            className="workspace-focus-frame"
            src={embedUrl(activePath)}
            title={`${activeFeature?.label ?? "Feature"} embedded workspace`}
            allow="clipboard-read; clipboard-write"
            data-testid="focused-feature-frame"
          />
        </div>
      )}

      <WorkspaceMenuOverlay
        open={menuOpen}
        pathname="/workspace"
        canAccessStaff={isOwner}
        onClose={() => {
          setMenuOpen(false);
          setMenuTarget(null);
        }}
        onNavigate={handleFeaturePick}
        onSignOut={() => { void logout(); }}
      />
    </main>
  );
}
