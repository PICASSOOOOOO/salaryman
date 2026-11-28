import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type SetStateAction,
} from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Expand, GripVertical, Plus, Search, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAlpha } from "@/hooks/use-alpha";
import { apiFetch } from "@/lib/api-client";
import {
  isLegacyWorkspaceStarter,
  WORKSPACE_STARTER_PATHS,
  WORKSPACE_WIDGET_GROUPS,
  type WorkspaceWidgetFeature,
  type WorkspaceWidgetGroup,
} from "@/lib/workspace-widget-catalog";
import {
  consumeQueuedWorkspaceFeatureOpen,
  queueWorkspaceFeatureOpen,
  WORKSPACE_FEATURE_ASSIGN_EVENT,
  WORKSPACE_FEATURE_OPEN_EVENT,
} from "@/lib/workspace-events";
import {
  readAccountWorkspaceLayout,
  writeAccountWorkspaceLayout,
  type WorkspaceLayout,
} from "@/lib/workspace-layout-sync";
import "./workspace-home.css";

type Feature = WorkspaceWidgetFeature;
type Slot = string | null;

const SLOT_LIMIT = 9;
const BASE_URL = import.meta.env.BASE_URL;
const FEATURE_DRAG_TYPE = "application/x-salaryman-feature-path";
const WIDGET_DRAG_TYPE = "application/x-salaryman-widget-index";

function makeFeatureGroups(canAccessAdmin: boolean, canAccessModerator: boolean): WorkspaceWidgetGroup[] {
  return WORKSPACE_WIDGET_GROUPS
    .map((group) => ({
      ...group,
      features: group.features.filter((feature) =>
        !feature.restrictedTo
        || (feature.restrictedTo === "admin" && canAccessAdmin)
        || (feature.restrictedTo === "moderator" && canAccessModerator),
      ),
    }))
    .filter((group) => group.features.length > 0);
}

function storageKey(userId?: string | null) {
  return `salaryman-workspace-slots:${userId || "browser"}`;
}

function isSlotArray(value: unknown): value is Slot[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= SLOT_LIMIT &&
    value.every(
      (slot) => slot === null || (typeof slot === "string" && slot.length > 0 && slot.length <= 300),
    )
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
        // Replace only the old unversioned starter. Versioned saves preserve
        // the user's own choices, including a layout that matches the starter.
        if (legacyArray && isLegacyWorkspaceStarter(slots)) {
          return [...WORKSPACE_STARTER_PATHS];
        }
        return slots;
      }
    }
  } catch {
    // Storage can be unavailable in private browsing; defaults remain usable.
  }
  return [...WORKSPACE_STARTER_PATHS];
}

function embedUrl(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const [relativePath, query = ""] = path.replace(/^\/+/, "").split("?");
  const params = new URLSearchParams(query);
  params.set("embed", "1");
  return `${base}${relativePath}?${params.toString()}`;
}

function WorkspaceFeatureFrame({
  src,
  title,
  testId,
}: {
  src: string;
  title: string;
  testId: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "80px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="workspace-feature-frame-shell">
      {shouldLoad ? (
        <iframe
          className="workspace-feature-frame"
          src={src}
          title={title}
          loading="lazy"
          allow="clipboard-read; clipboard-write"
          data-testid={testId}
        />
      ) : (
        <div className="workspace-feature-frame-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

function syncErrorLabel(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status = message.match(/\((\d{3})\)/)?.[1];
  if (status) return `HTTP ${status}`;
  if (/invalid.*layout|layout.*invalid/i.test(message)) return "invalid saved layout";
  if (/network|fetch/i.test(message)) return "network error";
  return "unknown error";
}

export default function WorkspaceHome() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { isAdmin, isApprovedDev, isApprovedTester } = useAlpha();
  const userId = user?.id;
  const accountAuthenticated = Boolean(isAuthenticated && userId);
  const canAccessAdmin = isAdmin || isApprovedDev;
  const canAccessModerator = canAccessAdmin || isApprovedTester;
  const featureGroups = useMemo(
    () => makeFeatureGroups(canAccessAdmin, canAccessModerator),
    [canAccessAdmin, canAccessModerator],
  );
  const features = useMemo(() => featureGroups.flatMap((group) => group.features), [featureGroups]);
  const key = storageKey(userId);
  const [slots, setSlots] = useState<Slot[]>(() => loadSlots(key));
  const [readyKey, setReadyKey] = useState(key);
  const [serverReadyKey, setServerReadyKey] = useState<string | null>(
    accountAuthenticated ? null : key,
  );
  const [syncStatus, setSyncStatus] = useState<"loading" | "saving" | "error" | null>(
    accountAuthenticated ? "loading" : null,
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pabloUnreadCount, setPabloUnreadCount] = useState(0);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [transientFeaturePath, setTransientFeaturePath] = useState<string | null>(null);
  const [mobileSlot, setMobileSlot] = useState(0);
  const [featurePickerOpen, setFeaturePickerOpen] = useState(false);
  const [featurePickerTarget, setFeaturePickerTarget] = useState<number | null>(null);
  const [featureSearch, setFeatureSearch] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const featurePickerRef = useRef<HTMLElement | null>(null);
  const featurePickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const slotsRef = useRef(slots);
  const localDirtyRef = useRef(false);
  const canEditLayout = !isLoading && (!accountAuthenticated || serverReadyKey === key);

  useEffect(() => {
    setPabloUnreadCount(0);
    if (!accountAuthenticated) return;
    let cancelled = false;
    const controller = new AbortController();
    const refreshPabloUnread = async () => {
      try {
        let response = await apiFetch("/api/chat/channels", {
          skipSessionExpiryRedirect: true,
          signal: controller.signal,
        });
        if (response.status === 401) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (cancelled) return;
          response = await apiFetch("/api/chat/channels", {
            skipSessionExpiryRedirect: true,
            signal: controller.signal,
          });
        }
        if (!response.ok || cancelled) return;
        const data = await response.json() as {
          pabloChannelId?: number | null;
          unreadCounts?: Record<string, unknown>;
        };
        const count = data.pabloChannelId == null
          ? 0
          : Number(data.unreadCounts?.[String(data.pabloChannelId)] ?? 0);
        if (!cancelled) {
          setPabloUnreadCount(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
        }
      } catch {
        // This count never blocks workspace use.
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshPabloUnread();
    };
    void refreshPabloUnread();
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accountAuthenticated, userId]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSlots(loadSlots(key));
    setActiveSlot(null);
    setMobileSlot(0);
    setReadyKey(key);
    localDirtyRef.current = false;

    if (!accountAuthenticated) {
      setServerReadyKey(key);
      setSyncStatus(null);
      setSyncError(null);
      return;
    }

    setServerReadyKey(null);
    setSyncStatus("loading");
    setSyncError(null);
    void (async () => {
      try {
        const serverLayout = await readAccountWorkspaceLayout(controller.signal);
        if (cancelled) return;
        if (serverLayout) {
          // An existing account layout wins over potentially stale browser data.
          setSlots(serverLayout.slots);
        } else {
          // Migrate local storage only after confirming that the account has no
          // saved layout. A failed read can therefore never overwrite the server.
          const localLayout: WorkspaceLayout = {
            version: 2,
            slots: loadSlots(key),
          };
          await writeAccountWorkspaceLayout(localLayout, controller.signal);
          if (cancelled) return;
          setSlots(localLayout.slots);
        }
        localDirtyRef.current = false;
        setServerReadyKey(key);
        setSyncStatus(null);
      } catch (error) {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncError(syncErrorLabel(error));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, accountAuthenticated, syncAttempt]);

  useEffect(() => {
    setTransientFeaturePath(null);
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
    if (!accountAuthenticated || serverReadyKey !== key || !localDirtyRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    const layout: WorkspaceLayout = { version: 2, slots };
    const timer = window.setTimeout(() => {
      setSyncStatus("saving");
      setSyncError(null);
      void writeAccountWorkspaceLayout(layout, controller.signal)
        .then(() => {
          if (
            !cancelled &&
            JSON.stringify(slotsRef.current) === JSON.stringify(layout.slots)
          ) {
            localDirtyRef.current = false;
            setSyncStatus(null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setSyncStatus("error");
            setSyncError(syncErrorLabel(error));
          }
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [slots, key, accountAuthenticated, serverReadyKey]);

  const refreshAccountLayout = useCallback(async (signal?: AbortSignal) => {
    if (
      !accountAuthenticated ||
      serverReadyKey !== key ||
      localDirtyRef.current ||
      signal?.aborted
    ) return;
    try {
      const serverLayout = await readAccountWorkspaceLayout(signal);
      if (signal?.aborted || localDirtyRef.current) return;
      if (serverLayout) {
        setSlots(serverLayout.slots);
      } else {
        await writeAccountWorkspaceLayout({ version: 2, slots: slotsRef.current }, signal);
      }
      if (!signal?.aborted) setSyncStatus(null);
    } catch (error) {
      if (!signal?.aborted) {
        setSyncStatus("error");
        setSyncError(syncErrorLabel(error));
      }
    }
  }, [accountAuthenticated, key, serverReadyKey]);

  useEffect(() => {
    if (!accountAuthenticated || serverReadyKey !== key) return;
    const controller = new AbortController();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAccountLayout(controller.signal);
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accountAuthenticated, key, serverReadyKey, refreshAccountLayout]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!featurePickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFeaturePickerOpen(false);
      setFeaturePickerTarget(null);
      featurePickerButtonRef.current?.focus();
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (featurePickerRef.current?.contains(target) || featurePickerButtonRef.current?.contains(target)) return;
      setFeaturePickerOpen(false);
      setFeaturePickerTarget(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [featurePickerOpen]);

  const featureByPath = useMemo(() => new Map(features.map((feature) => [feature.path, feature])), [features]);
  const normalizedFeatureSearch = featureSearch.trim().toLowerCase();
  const visibleFeatureGroups = useMemo(() => {
    if (!normalizedFeatureSearch) return featureGroups;
    return featureGroups
      .map((group) => ({
        ...group,
        features: group.features.filter((feature) =>
          feature.label.toLowerCase().includes(normalizedFeatureSearch),
        ),
      }))
      .filter((group) => group.features.length > 0);
  }, [featureGroups, normalizedFeatureSearch]);
  const activePath = transientFeaturePath ?? (activeSlot === null ? null : slots[activeSlot]);
  const activeFeature = activePath ? featureByPath.get(activePath) : undefined;
  const boundedMobileSlot = Math.min(mobileSlot, slots.length - 1);
  const gridColumns = slots.length === 1 ? 1 : slots.length === 2 ? 2 : slots.length === 4 ? 2 : slots.length === 5 || slots.length === 7 || slots.length === 8 ? 6 : 3;
  const gridRows = Math.ceil(slots.length / (slots.length === 1 ? 1 : slots.length === 2 ? 2 : slots.length === 4 ? 2 : slots.length === 5 || slots.length === 7 || slots.length === 8 ? 3 : 3));

  const openFeaturePickerFor = useCallback((index: number) => {
    if (!canEditLayout) return;
    setFeaturePickerTarget(index);
    setFeatureSearch("");
    setFeaturePickerOpen(true);
  }, [canEditLayout]);

  const editSlots = useCallback((update: SetStateAction<Slot[]>) => {
    localDirtyRef.current = true;
    setSlots(update);
  }, []);

  const assignFeature = useCallback((path: string, requestedSlot: number | null = null) => {
    if (!canEditLayout || path === "/workspace" || !featureByPath.has(path)) return;
    let target = requestedSlot ?? slots.findIndex((slot) => slot === null);
    if (target < 0) target = slots.length < SLOT_LIMIT ? slots.length : -1;
    if (target < 0 || target >= SLOT_LIMIT) return;
    editSlots((current) => {
      const next = [...current];
      while (next.length <= target && next.length < SLOT_LIMIT) next.push(null);
      if (target < next.length) next[target] = path;
      return next;
    });
    setMobileSlot(target);
  }, [canEditLayout, editSlots, featureByPath, slots]);

  const openFeatureInWorkspace = useCallback((path: string) => {
    if (!canEditLayout || path === "/workspace" || !featureByPath.has(path)) return;
    const existingSlot = slots.findIndex((slot) => slot === path);
    if (existingSlot >= 0) {
      setTransientFeaturePath(null);
      setActiveSlot(existingSlot);
      return;
    }

    const emptySlot = slots.findIndex((slot) => slot === null);
    const target = emptySlot >= 0 ? emptySlot : slots.length < SLOT_LIMIT ? slots.length : -1;
    if (target < 0) {
      // Open full workspaces without replacing or discarding a saved widget.
      setActiveSlot(null);
      setTransientFeaturePath(path);
      return;
    }

    setTransientFeaturePath(null);
    assignFeature(path, target);
    setActiveSlot(target);
  }, [assignFeature, canEditLayout, featureByPath, slots]);

  useEffect(() => {
    const getPath = (event: Event) =>
      (event as CustomEvent<{ path?: unknown }>).detail?.path;
    const onAssign = (event: Event) => {
      const path = getPath(event);
      if (typeof path === "string") assignFeature(path);
    };
    const onOpen = (event: Event) => {
      const path = getPath(event);
      if (typeof path !== "string") return;
      if (!canEditLayout) {
        queueWorkspaceFeatureOpen(path);
        return;
      }
      openFeatureInWorkspace(path);
    };
    window.addEventListener(WORKSPACE_FEATURE_ASSIGN_EVENT, onAssign);
    window.addEventListener(WORKSPACE_FEATURE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(WORKSPACE_FEATURE_ASSIGN_EVENT, onAssign);
      window.removeEventListener(WORKSPACE_FEATURE_OPEN_EVENT, onOpen);
    };
  }, [assignFeature, canEditLayout, openFeatureInWorkspace]);

  useEffect(() => {
    if (!canEditLayout) return;
    const pendingPath = consumeQueuedWorkspaceFeatureOpen();
    if (pendingPath) openFeatureInWorkspace(pendingPath);
  }, [canEditLayout, openFeatureInWorkspace]);

  const openFeaturePicker = () => {
    if (!canEditLayout) return;
    if (featurePickerOpen) {
      setFeaturePickerOpen(false);
      setFeaturePickerTarget(null);
      return;
    }
    let target = slots.findIndex((slot) => slot === null);
    if (target < 0 && slots.length < SLOT_LIMIT) {
      target = slots.length;
      editSlots((current) => current.length < SLOT_LIMIT ? [...current, null] : current);
    }
    if (target < 0) return;
    openFeaturePickerFor(target);
  };

  const moveSlot = (from: number, to: number) => {
    if (!canEditLayout || to < 0 || to >= slots.length || from === to) return;
    editSlots((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setActiveSlot((current) => current === from ? to : current === to ? from : current);
    setMobileSlot((current) => current === from ? to : current === to ? from : current);
  };

  const removeSlot = (index: number) => {
    if (!canEditLayout) return;
    editSlots((current) => current.length === 1
      ? [null]
      : current.filter((_, slotIndex) => slotIndex !== index));
    setActiveSlot((current) => current === index ? null : current !== null && current > index ? current - 1 : current);
    setMobileSlot((current) => Math.max(0, Math.min(current > index ? current - 1 : current, slots.length - 2)));
  };

  const handleFeaturePick = (path: string) => {
    assignFeature(path, featurePickerTarget);
    setFeaturePickerOpen(false);
    setFeaturePickerTarget(null);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>, target: number) => {
    event.preventDefault();
    if (!canEditLayout) return;
    const featurePath = event.dataTransfer.getData(FEATURE_DRAG_TYPE);
    if (featurePath && featureByPath.has(featurePath)) {
      assignFeature(featurePath, target);
      setFeaturePickerOpen(false);
      setFeaturePickerTarget(null);
    } else {
      const sourceValue = event.dataTransfer.getData(WIDGET_DRAG_TYPE);
      const source = sourceValue === "" ? dragging : Number(sourceValue);
      if (source !== null && Number.isInteger(source)) moveSlot(source, target);
    }
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <main
      className={`workspace-home${isMobile ? " is-mobile" : ""}${dragging !== null ? " is-dragging" : ""}`}
      data-testid="workspace-home"
    >
      <header className="workspace-toolbar">
        {(isLoading || (syncStatus && accountAuthenticated)) && (
          <span className="workspace-sync-status" role="status" aria-live="polite">
            {isLoading ? "Checking account…" : syncStatus === "loading" ? "Syncing…" : syncStatus === "saving" ? "Saving…" : (
              <>
                Workspace sync unavailable{syncError ? ` (${syncError})` : ""}
                <button
                  type="button"
                  onClick={() => {
                    setSyncError(null);
                    setSyncAttempt((attempt) => attempt + 1);
                  }}
                  data-testid="retry-workspace-sync"
                >
                  Retry
                </button>
              </>
            )}
          </span>
        )}
        <button
          ref={featurePickerButtonRef}
          type="button"
          className="workspace-toolbar-button workspace-toolbar-button--labeled"
          onClick={openFeaturePicker}
          aria-label={featurePickerOpen ? "Close feature choices" : "Add a feature"}
          aria-expanded={featurePickerOpen}
          aria-controls="workspace-feature-picker"
          disabled={!canEditLayout || (!slots.some((slot) => slot === null) && slots.length >= SLOT_LIMIT && !featurePickerOpen)}
          data-testid="add-workspace-feature"
        >
          <Plus aria-hidden="true" />
          <span>{featurePickerOpen ? "Close" : "Add feature"}</span>
        </button>
      </header>

      {featurePickerOpen && (
        <section
          ref={featurePickerRef}
          id="workspace-feature-picker"
          className="workspace-feature-picker"
          role="region"
          aria-label="Choose a feature for the workspace"
          data-testid="workspace-feature-picker"
        >
          <div className="workspace-feature-picker-header">
            <div>
              <h2>ADD A FEATURE</h2>
            </div>
            <button
              type="button"
              className="workspace-icon-button"
              onClick={() => { setFeaturePickerOpen(false); setFeaturePickerTarget(null); }}
              aria-label="Close feature choices"
              data-testid="close-workspace-feature-picker"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <label className="workspace-feature-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={featureSearch}
              onChange={(event) => setFeatureSearch(event.target.value)}
              aria-label="Search features"
              placeholder="Search features"
              data-testid="workspace-feature-search"
            />
          </label>
          {visibleFeatureGroups.length === 0 ? (
            <p className="workspace-feature-empty">No matching features.</p>
          ) : visibleFeatureGroups.map((group) => (
            <section
              key={group.id}
              className="workspace-feature-group"
              aria-label={group.label}
              data-testid={`workspace-feature-group-${group.id}`}
            >
              <h3>{group.label}</h3>
              <div className="workspace-feature-picker-grid">
                {group.features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <button
                      key={feature.path}
                      type="button"
                      className="workspace-feature-option"
                      draggable
                      onClick={() => handleFeaturePick(feature.path)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(FEATURE_DRAG_TYPE, feature.path);
                        event.dataTransfer.setData("text/plain", feature.path);
                      }}
                      aria-label={`Add ${feature.label} to a widget`}
                      data-testid={`workspace-feature-option-${feature.id}`}
                    >
                      <Icon aria-hidden="true" />
                      <span>{feature.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      )}

      <section
        className="workspace-grid"
        aria-label="Workspace widgets"
        style={{
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridRows}, minmax(24rem, 1fr))`,
        }}
      >
        {slots.map((path, index) => {
          const feature = path ? featureByPath.get(path) : undefined;
          const FeatureIcon = feature?.icon ?? Plus;
          const isVisibleOnMobile = !isMobile || index === boundedMobileSlot;
          const renderFrame = Boolean(path && feature) && (isMobile ? isVisibleOnMobile : true) && activeSlot !== index;
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
              onDrop={(event) => handleDrop(event, index)}
              data-testid={`workspace-slot-${index + 1}`}
            >
              <div className="workspace-slot-toolbar">
                <button
                  type="button"
                  className="workspace-drag-handle"
                  draggable={canEditLayout}
                  aria-label={`Drag widget ${index + 1} to reorder`}
                  data-testid={`drag-slot-${index + 1}`}
                  onDragStart={(event) => {
                    setDragging(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(WIDGET_DRAG_TYPE, String(index));
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
                  <button type="button" onClick={() => moveSlot(index, index - 1)} disabled={!canEditLayout || index === 0} aria-label={`Move widget ${index + 1} left`} data-testid={`move-slot-left-${index + 1}`}><ArrowLeft aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index + 1)} disabled={!canEditLayout || index === slots.length - 1} aria-label={`Move widget ${index + 1} right`} data-testid={`move-slot-right-${index + 1}`}><ArrowRight aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index - 3)} disabled={!canEditLayout || index < 3} aria-label={`Move widget ${index + 1} up`} data-testid={`move-slot-up-${index + 1}`}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" onClick={() => moveSlot(index, index + 3)} disabled={!canEditLayout || index + 3 >= slots.length} aria-label={`Move widget ${index + 1} down`} data-testid={`move-slot-down-${index + 1}`}><ArrowDown aria-hidden="true" /></button>
                </div>
                <button
                  type="button"
                  className="workspace-remove-button"
                  onClick={() => removeSlot(index)}
                  disabled={!canEditLayout}
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
                    <h2 className="workspace-feature-name">
                      <span className="workspace-feature-name-label">{feature?.label ?? "Unavailable feature"}</span>
                      {path.split("?")[0] === "/pablo" && pabloUnreadCount > 0 && (
                        <span
                          className="workspace-feature-unread"
                          aria-label={`${pabloUnreadCount} unread PABLO AI messages`}
                          title={`${pabloUnreadCount} unread PABLO AI messages`}
                          data-testid={`workspace-pablo-unread-${index + 1}`}
                        >
                          {pabloUnreadCount > 99 ? "99+" : pabloUnreadCount}
                        </span>
                      )}
                    </h2>
                    <button type="button" className="workspace-icon-button" onClick={() => openFeaturePickerFor(index)} disabled={!canEditLayout} aria-label={`Change ${feature?.label ?? "feature"}`} data-testid={`change-feature-${index + 1}`}><Plus aria-hidden="true" /></button>
                    <button type="button" className="workspace-icon-button" onClick={() => setActiveSlot(index)} disabled={!feature} aria-label={`Expand ${feature?.label ?? "feature"}`} data-testid={`expand-feature-${index + 1}`}><Expand aria-hidden="true" /></button>
                  </div>
                  {renderFrame && (
                    <WorkspaceFeatureFrame
                      key={`${index}-${path}`}
                      src={embedUrl(path)}
                      title={`${feature?.label ?? "Feature"} widget`}
                      testId={`widget-frame-${index + 1}`}
                    />
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="workspace-empty-target"
                  onClick={() => openFeaturePickerFor(index)}
                  disabled={!canEditLayout}
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

      {activePath && activeFeature && (
        <div className="workspace-focus" role="dialog" aria-modal="true" aria-label={`${activeFeature?.label ?? "Feature"} workspace`}>
          <div className="workspace-focus-bar">
            <strong className="workspace-focus-title">
              <span className="workspace-focus-title-label">{activeFeature?.label ?? activePath}</span>
              {activePath.split("?")[0] === "/pablo" && pabloUnreadCount > 0 && (
                <span
                  className="workspace-feature-unread"
                  aria-label={`${pabloUnreadCount} unread PABLO AI messages`}
                  title={`${pabloUnreadCount} unread PABLO AI messages`}
                  data-testid="focused-pablo-unread"
                >
                  {pabloUnreadCount > 99 ? "99+" : pabloUnreadCount}
                </span>
              )}
            </strong>
            <button
              type="button"
              className="workspace-focus-close"
              onClick={() => { setActiveSlot(null); setTransientFeaturePath(null); }}
              aria-label="Close expanded widget"
              data-testid="close-focused-workspace"
            >
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

    </main>
  );
}
