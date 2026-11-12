import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  ContactRound,
  FileText,
  Globe2,
  Hash,
  Layers3,
  ListChecks,
  Megaphone,
  Menu,
  Music2,
  Network,
  Palette,
  PhoneCall,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Terminal,
  TrendingUp,
  UserRound,
  UsersRound,
  Voicemail,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MORE_NAV_ITEMS, PRIMARY_NAV_ITEMS, type AppNavItem } from "./_shared/nav-items";
import { CurrentMiniNebula } from "./Current";
import "./_group.css";

type Destination = {
  path: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  restricted?: "staff";
  secondaryLabel?: string;
  children?: Destination[];
};

type Area = {
  title: string;
  icon: LucideIcon;
  entries: Destination[];
};

const primary = (id: string) => PRIMARY_NAV_ITEMS.find((item) => item.id === id)!;
const more = (id: string) => MORE_NAV_ITEMS.find((item) => item.id === id)!;

const appDestination = (item: AppNavItem, label = item.boomerLabel ?? item.label): Destination => ({
  path: item.path,
  label,
  icon: item.icon,
});

const phoneSubroutes: Destination[] = [
  { path: "/phone/dialer", label: "DIALER", icon: PhoneCall },
  { path: "/phone/active", label: "ACTIVE CALLS", icon: Zap },
  { path: "/phone/history", label: "CALL LOG", icon: Clock3 },
  { path: "/phone/voicemail", label: "VOICEMAIL", icon: Voicemail },
  { path: "/phone/conference", label: "CONFERENCE", icon: UsersRound },
  { path: "/phone/sessions", label: "DIALING SESSIONS", icon: Radio },
  { path: "/phone/coach", label: "AI COACH", icon: Bot },
  { path: "/phone/secretary", label: "AI SECRETARY", icon: Settings2 },
  { path: "/phone/numbers", label: "PHONE NUMBERS", icon: Hash },
];

const featuredItems: Destination[] = [
  { ...appDestination(primary("phone")), children: phoneSubroutes },
  appDestination(primary("comms"), "COMMS"),
  appDestination(primary("office")),
  appDestination({ id: "apps", path: "/my-apps", label: "MY APPS", boomerLabel: "MY APPS", icon: Layers3 }),
  {
    ...appDestination(more("bots")),
    secondaryLabel: "PABLO PRIME AUTOMATION",
  },
];

const areas: Area[] = [
  {
    title: "TOOLS",
    icon: Code2,
    entries: [
      {
        path: "/console",
        label: "TOOLS",
        icon: Terminal,
        hint: "LIVE LISTEN · SCREEN SCAN · INTERVIEW SOLVER",
      },
    ],
  },
  {
    title: "BUSINESS",
    icon: BriefcaseBusiness,
    entries: [
      { path: "/business", label: "BUSINESS", icon: BriefcaseBusiness },
      { path: "/business/hiring", label: "HIRING & HR", icon: UsersRound },
      { path: "/business/calendar", label: "CALENDAR", icon: CalendarDays },
      { path: "/business/documents", label: "DOCUMENTS", icon: Archive },
      { path: "/business/invoices", label: "INVOICES", icon: FileText },
      { path: "/business/deals", label: "DEALS", icon: TrendingUp },
    ],
  },
  {
    title: "CREATIVE STUDIO",
    icon: Layers3,
    entries: [
      { path: "/creative/studio", label: "STUDIO", icon: Layers3 },
      { path: "/creative/music", label: "CREATIVE STUDIO", icon: Music2 },
      { path: "/creative/lab", label: "1999", icon: Radio },
      { path: "/creative/campaigns", label: "CAMPAIGNS", icon: Megaphone },
      { path: "/creative/brand", label: "BRAND KIT", icon: Palette },
    ],
  },
  {
    title: "REPORTS",
    icon: BarChart3,
    entries: [
      { path: "/intel/reports", label: "REPORTS", icon: BarChart3 },
      { path: "/intel/dashboard", label: "DASHBOARD", icon: Activity },
      { path: "/intel/agents", label: "AI AGENTS", icon: Bot },
      { path: "/intel/goals", label: "GOALS", icon: Target },
      { path: "/intel/seo", label: "SEO", icon: Search },
    ],
  },
];

const workspaceItems: Destination[] = [
  { path: "/world", label: "BROWSE", icon: Globe2 },
  { path: "/organizations", label: "ORGANIZATION", icon: Network },
  {
    path: "/contacts",
    label: "CONTACTS",
    icon: ContactRound,
    children: [
      { path: "/business/contacts", label: "CONTACTS", icon: ContactRound, hint: "BUSINESS" },
      { path: "/phone/contacts", label: "CONTACTS", icon: ContactRound, hint: "CALLL HOME" },
    ],
  },
  { path: "/leads", label: "LEADS", icon: ListChecks },
  { path: "/marketing", label: "MARKETING", icon: Megaphone },
  { path: "/platform", label: "PLATFORM API", icon: Code2 },
  { path: "/settings", label: "SETTINGS", icon: Settings2 },
  { path: "/profile", label: "PROFILE", icon: UserRound, hint: "ACCOUNT" },
  { path: "/profile/admin", label: "ADMIN", icon: ShieldCheck, restricted: "staff" },
];

function uniqueDestination(item: Destination, seen: Set<string>): Destination | null {
  if (seen.has(item.path)) return null;
  seen.add(item.path);
  const children = item.children
    ?.map((child) => uniqueDestination(child, seen))
    .filter((child): child is Destination => child !== null);
  return { ...item, children };
}

function filterDestination(item: Destination, query: string): Destination | null {
  if (!query) return item;
  const queryMatches = `${item.label} ${item.path} ${item.hint ?? ""} ${item.secondaryLabel ?? ""}`.toLowerCase().includes(query);
  const children = item.children
    ?.map((child) => filterDestination(child, query))
    .filter((child): child is Destination => child !== null);
  if (!queryMatches && !children?.length) return null;
  return { ...item, children: queryMatches ? item.children : children };
}

const pabloDestination = appDestination(primary("pablo"), "PABLO AI");
const globalSeenPaths = new Set<string>();
const uniquePablo = uniqueDestination(pabloDestination, globalSeenPaths)!;
const uniqueFeatured = featuredItems
  .map((item) => uniqueDestination(item, globalSeenPaths))
  .filter((item): item is Destination => item !== null);
const uniqueAreas: Area[] = areas
  .map((area) => ({
    ...area,
    entries: area.entries
      .map((item) => uniqueDestination(item, globalSeenPaths))
      .filter((item): item is Destination => item !== null),
  }))
  .filter((area) => area.entries.length > 0);
const uniqueWorkspace = workspaceItems
  .map((item) => uniqueDestination(item, globalSeenPaths))
  .filter((item): item is Destination => item !== null);
const uniqueDestinationCount = globalSeenPaths.size;

function DestinationRow({
  item,
  active,
  selectedPath,
  onSelect,
  expanded = false,
  onToggle,
  compact = false,
}: {
  item: Destination;
  active: boolean;
  selectedPath: string;
  onSelect: (item: Destination) => void;
  expanded?: boolean;
  onToggle?: (path: string) => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  const expandable = Boolean(item.children?.length);
  return (
    <div className={`smn-destination-group${compact ? " is-compact" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className={`smn-destination${active ? " is-active" : ""}${compact ? " is-compact" : ""}`}>
        <button
          type="button"
          className="smn-destination-action"
          onClick={() => onSelect(item)}
          aria-current={active ? "page" : undefined}
        >
          <span className="smn-destination-icon"><Icon size={15} strokeWidth={1.8} /></span>
          <span className="smn-destination-copy">
            <span className="smn-destination-label">{item.label}</span>
            {(item.hint || item.secondaryLabel) && (
              <span className="smn-destination-hint">{item.hint ?? item.secondaryLabel}</span>
            )}
          </span>
          {item.restricted && <span className="smn-access-tag">STAFF</span>}
          {!expandable && <ArrowUpRight className="smn-row-arrow" size={13} aria-hidden="true" />}
        </button>
        {expandable && (
          <button
            type="button"
            className="smn-expand"
            onClick={() => onToggle?.(item.path)}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
            aria-expanded={expanded}
          >
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      {expandable && expanded && (
        <div className="smn-nested-destinations">
          {item.children!.map((child) => (
            <DestinationRow
              key={child.path}
              item={child}
              active={selectedPath === child.path}
              selectedPath={selectedPath}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Consolidated() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["/contacts"]));

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setNotice("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const filteredAreas = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return uniqueAreas
      .map((area) => ({
        ...area,
        entries: area.title.toLowerCase().includes(normalized)
          ? area.entries
          : area.entries.map((entry) => filterDestination(entry, normalized)).filter((entry): entry is Destination => entry !== null),
      }))
      .filter((area) => area.entries.length > 0);
  }, [query]);

  const filteredFeatured = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return uniqueFeatured
      .map((item) => filterDestination(item, normalized))
      .filter((item): item is Destination => item !== null);
  }, [query]);

  const filteredWorkspace = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return uniqueWorkspace
      .map((item) => filterDestination(item, normalized))
      .filter((item): item is Destination => item !== null);
  }, [query]);

  const choose = (item: Destination) => {
    setSelected(item.path);
    setNotice(`${item.label} selected`);
  };

  const closeMenu = () => {
    setOpen(false);
    setNotice("");
  };

  const toggleExpanded = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const filteredPablo = filterDestination(uniquePablo, query.trim().toLowerCase());

  return (
    <div className="smn-root">
      <style>{`
        .smn-root {
          --smn-paper: #f4f1e9;
          --smn-surface: #fbf9f3;
          --smn-ink: #171a17;
          --smn-muted: #77766d;
          --smn-line: #e3dfd4;
          --smn-soft: #eeeadf;
          --smn-accent: #a4b7a1;
          min-height: 100dvh;
          color: var(--smn-ink);
          background: var(--smn-paper);
          font-family: var(--font-sans);
          overflow: hidden;
        }
        .smn-root * { box-sizing: border-box; }
        .smn-topbar {
          height: 62px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 clamp(18px, 4vw, 58px); background: #1c211e; color: #f7f4eb;
          border-bottom: 1px solid rgba(255,255,255,.11);
        }
        .smn-brand { display: flex; align-items: center; gap: 11px; font-size: 12px; font-weight: 800; letter-spacing: .22em; }
        .smn-brand-mark { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid rgba(244,241,233,.56); font-family: var(--font-mono); font-size: 12px; letter-spacing: -.1em; }
        .smn-topnav { display: flex; align-items: center; gap: 26px; height: 100%; margin-left: auto; margin-right: 34px; }
        .smn-topnav-label { color: #a7aaa1; font-family: var(--font-mono); font-size: 9px; letter-spacing: .13em; }
        .smn-menu-trigger { display: inline-flex; align-items: center; gap: 10px; height: 34px; border: 1px solid rgba(244,241,233,.32); background: transparent; color: #f7f4eb; padding: 0 12px; font-family: var(--font-mono); font-size: 9px; letter-spacing: .13em; cursor: pointer; }
        .smn-menu-trigger:hover { background: rgba(255,255,255,.08); }
        .smn-avatar { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid #657066; color: #e3e7dd; font-family: var(--font-mono); font-size: 10px; }
        .smn-main { min-height: calc(100dvh - 62px); padding: 54px clamp(22px, 8vw, 120px); }
        .smn-welcome-kicker { color: #85847a; font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; }
        .smn-welcome-title { margin: 12px 0 34px; font-size: clamp(32px, 4vw, 54px); font-weight: 500; letter-spacing: -.055em; line-height: 1; }
        .smn-welcome-title em { color: #738573; font-style: normal; }
        .smn-workspace-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(240px, .75fr); gap: 22px; max-width: 1020px; }
        .smn-quiet-panel { background: rgba(251,249,243,.68); border: 1px solid #e8e4d9; padding: 22px; min-height: 228px; }
        .smn-quiet-label { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #e8e4d9; color: #77766d; font-family: var(--font-mono); font-size: 9px; letter-spacing: .14em; }
        .smn-quiet-line { display: flex; align-items: center; justify-content: space-between; min-height: 48px; border-bottom: 1px solid #eeeadf; color: #585950; font-size: 12px; }
        .smn-quiet-line:last-child { border: 0; }
        .smn-quiet-line span:last-child { color: #8a897f; font-family: var(--font-mono); font-size: 9px; }
        .smn-overlay { position: fixed; inset: 62px 0 0; z-index: 20; display: flex; justify-content: center; padding: 18px 24px 24px; background: rgba(21,25,22,.34); backdrop-filter: blur(2px); }
        .smn-menu { width: min(1180px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d9d4c8; background: var(--smn-surface); box-shadow: 0 22px 70px rgba(31,35,29,.2); animation: smn-enter .24s ease-out both; }
        @keyframes smn-enter { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
        .smn-menu-head { min-height: 66px; display: flex; align-items: center; gap: 25px; padding: 0 22px; border-bottom: 1px solid var(--smn-line); }
        .smn-heading-lockup { display: flex; align-items: center; gap: 12px; min-width: 190px; }
        .smn-eyebrow { font-family: var(--font-mono); color: #72746b; font-size: 9px; letter-spacing: .18em; }
        .smn-heading-title { margin-top: 3px; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
        .smn-menu-count { margin-left: auto; white-space: nowrap; font-family: var(--font-mono); color: #88877d; font-size: 9px; letter-spacing: .08em; }
        .smn-search { width: min(310px, 36vw); height: 34px; display: flex; align-items: center; gap: 9px; border: 1px solid var(--smn-line); background: #f6f3ec; padding: 0 10px; color: #77766d; }
        .smn-search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--smn-ink); font-family: var(--font-sans); font-size: 11px; }
        .smn-search input::placeholder { color: #95938a; }
        .smn-close { width: 32px; height: 32px; display: grid; place-items: center; margin-left: 2px; border: 1px solid transparent; background: transparent; color: #77766d; cursor: pointer; }
        .smn-close:hover { border-color: var(--smn-line); background: #f2efe7; color: var(--smn-ink); }
        .smn-menu-body { min-height: 0; flex: 1; display: grid; grid-template-columns: 236px minmax(0, 1fr); overflow: auto; }
        .smn-rail { display: flex; flex-direction: column; padding: 19px 16px 16px; border-right: 1px solid var(--smn-line); background: #f7f4ed; }
        .smn-section-label { display: flex; align-items: center; gap: 8px; margin: 0 0 9px; color: #85847b; font-family: var(--font-mono); font-size: 9px; font-weight: 400; letter-spacing: .15em; }
        .smn-section-label:after { content: ""; flex: 1; height: 1px; background: var(--smn-line); }
        .smn-pablo-card { display: flex; align-items: center; width: 100%; gap: 12px; border: 1px solid #242a25; background: #1c211e; color: #f4f1e9; padding: 12px; text-align: left; cursor: pointer; transition: background .15s ease, transform .15s ease; }
        .smn-pablo-card:hover { background: #2a302b; transform: translateY(-1px); }
        .smn-pablo-card.is-active { box-shadow: inset 0 0 0 1px #9eb49c; }
        .smn-pablo-copy { display: block; min-width: 0; }
        .smn-pablo-title { display: block; font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; }
        .smn-pablo-sub { display: block; margin-top: 5px; color: #b9c1b5; font-family: var(--font-mono); font-size: 8px; letter-spacing: .1em; }
        .smn-rail-section { margin-top: 24px; }
        .smn-shortcut-list { display: grid; gap: 5px; }
        .smn-shortcut { min-height: 37px; display: flex; align-items: center; gap: 9px; padding: 6px 8px; border: 1px solid transparent; background: transparent; text-align: left; color: #292c27; cursor: pointer; }
        .smn-shortcut:hover, .smn-shortcut.is-active { border-color: #e0dccf; background: #efede4; }
        .smn-shortcut-icon { width: 20px; color: #77796f; }
        .smn-shortcut-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 9px; font-weight: 700; letter-spacing: .09em; }
        .smn-shortcut-text small { color: #79796f; font-family: var(--font-mono); font-size: 7px; font-weight: 400; letter-spacing: .07em; }
        .smn-shortcut-arrow { color: #a4a398; opacity: 0; }
        .smn-shortcut:hover .smn-shortcut-arrow, .smn-shortcut.is-active .smn-shortcut-arrow { opacity: 1; }
        .smn-rail-bottom { margin-top: auto; padding-top: 22px; }
        .smn-account-line { display: flex; align-items: center; gap: 10px; margin: 0 -1px 11px; padding: 11px 8px 13px; border-top: 1px solid var(--smn-line); }
        .smn-user-avatar { display: grid; place-items: center; width: 29px; height: 29px; border: 1px solid #c9c6b9; background: #e8e5d9; color: #51544b; font-family: var(--font-mono); font-size: 9px; }
        .smn-user-copy { min-width: 0; }
        .smn-user-name { font-size: 10px; font-weight: 650; }
        .smn-user-role { margin-top: 3px; color: #85847b; font-family: var(--font-mono); font-size: 8px; letter-spacing: .06em; }
        .smn-logout { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; border: 0; background: transparent; color: #76766c; font-family: var(--font-mono); font-size: 8px; letter-spacing: .1em; text-align: left; cursor: pointer; }
        .smn-logout:hover { color: #1d211d; background: #eeeadf; }
        .smn-areas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; gap: 0 20px; padding: 20px 22px 24px; }
        .smn-area-column { min-width: 0; }
        .smn-area { margin: 0 0 23px; }
        .smn-area-title { display: flex; align-items: center; gap: 7px; margin: 0 0 7px; color: #77786e; font-family: var(--font-mono); font-size: 8px; font-weight: 400; letter-spacing: .14em; }
        .smn-area-title svg { color: #8c9186; }
        .smn-area-links { display: grid; gap: 1px; }
        .smn-destination { min-width: 0; width: 100%; min-height: 31px; display: flex; align-items: center; gap: 8px; padding: 5px 6px; border: 1px solid transparent; background: transparent; text-align: left; color: #262923; cursor: pointer; }
        .smn-destination:hover, .smn-destination.is-active { border-color: #e6e2d7; background: #f1efe7; }
        .smn-destination-icon { width: 17px; flex: 0 0 17px; color: #898a80; }
        .smn-destination-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3px; }
        .smn-destination-label { overflow: hidden; color: #30332d; font-size: 9px; font-weight: 650; letter-spacing: .065em; text-overflow: ellipsis; white-space: nowrap; }
        .smn-destination-hint { color: #8e8d83; font-family: var(--font-mono); font-size: 7px; line-height: 1.5; letter-spacing: .02em; }
        .smn-access-tag { padding: 3px 4px; border: 1px solid #dcd5c4; color: #8a7452; font-family: var(--font-mono); font-size: 7px; letter-spacing: .05em; }
        .smn-row-arrow { color: #aaa99e; opacity: 0; flex: 0 0 auto; }
        .smn-destination:hover .smn-row-arrow, .smn-destination.is-active .smn-row-arrow { opacity: 1; }
        .smn-mobile-only { display: none; }
        .smn-menu-foot { min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 21px; border-top: 1px solid var(--smn-line); background: #f7f4ed; color: #8d8c81; font-family: var(--font-mono); font-size: 8px; letter-spacing: .08em; }
        .smn-foot-status { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .smn-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #82987f; }
        .smn-status-dot.selected { background: #b18755; }
        .smn-foot-right { display: flex; gap: 17px; white-space: nowrap; }
        .smn-no-results { grid-column: 1 / -1; min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 10px; color: #89887e; text-align: center; }
        .smn-no-results strong { color: #50534b; font-size: 11px; font-weight: 600; }
        .smn-no-results span { font-size: 10px; }
        .smn-closed-note { position: fixed; right: 25px; bottom: 22px; z-index: 25; display: flex; align-items: center; gap: 9px; padding: 11px 14px; border: 1px solid #d9d4c8; background: #fbf9f3; color: #62645b; box-shadow: 0 8px 25px rgba(31,35,29,.1); font-family: var(--font-mono); font-size: 9px; letter-spacing: .06em; }
        .smn-closed-note button { border: 0; background: transparent; color: #252822; text-decoration: underline; cursor: pointer; font: inherit; }
        @media (max-width: 900px) {
          .smn-overlay { padding: 13px; }
          .smn-menu-body { grid-template-columns: 205px minmax(0,1fr); }
          .smn-areas { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0 14px; padding: 17px; }
          .smn-menu-count { display: none; }
        }
        @media (max-width: 620px) {
          .smn-topbar { height: 56px; padding: 0 15px; }
          .smn-topnav { display: none; }
          .smn-brand { font-size: 11px; }
          .smn-menu-trigger { margin-left: auto; margin-right: 12px; height: 31px; padding: 0 9px; font-size: 8px; }
          .smn-main { min-height: calc(100dvh - 56px); padding: 38px 19px; }
          .smn-welcome-title { margin-bottom: 25px; font-size: 36px; }
          .smn-workspace-grid { grid-template-columns: 1fr; gap: 12px; }
          .smn-quiet-panel { padding: 17px; min-height: 190px; }
          .smn-quiet-panel.secondary { display: none; }
          .smn-overlay { inset: 56px 0 0; display: block; padding: 0; background: rgba(21,25,22,.28); backdrop-filter: blur(1px); }
          .smn-menu { width: 100%; height: 100%; max-height: 100%; border: 0; border-top: 1px solid #d9d4c8; box-shadow: 0 -8px 32px rgba(31,35,29,.13); animation: smn-mobile-enter .22s ease-out both; }
          @keyframes smn-mobile-enter { from { opacity: .7; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
          .smn-menu-head { min-height: 60px; padding: 0 14px; gap: 10px; }
          .smn-heading-lockup { min-width: 0; gap: 9px; }
          .smn-heading-title { font-size: 11px; }
          .smn-eyebrow { font-size: 8px; }
          .smn-search { width: auto; flex: 1; height: 32px; margin-left: auto; }
          .smn-search input { font-size: 10px; }
          .smn-close { flex: 0 0 30px; width: 30px; height: 30px; }
          .smn-menu-body { display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; }
          .smn-rail { display: block; flex: none; padding: 13px 14px 14px; border-right: 0; border-bottom: 1px solid var(--smn-line); }
          .smn-section-label { margin-bottom: 7px; font-size: 8px; }
          .smn-pablo-card { min-height: 52px; padding: 8px 10px; }
          .smn-rail-section { margin-top: 14px; }
          .smn-shortcut-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
          .smn-shortcut { min-height: 35px; padding: 5px 6px; }
          .smn-shortcut-text { font-size: 8px; letter-spacing: .055em; }
          .smn-shortcut-text small { font-size: 6px; }
          .smn-rail-bottom { display: none; }
          .smn-areas { display: block; padding: 15px 14px 20px; }
          .smn-area { margin-bottom: 19px; }
          .smn-area-title { margin-bottom: 6px; font-size: 8px; }
          .smn-area-links { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 6px; }
          .smn-destination { min-height: 34px; padding: 5px 5px; gap: 6px; }
          .smn-destination-icon { width: 15px; flex-basis: 15px; }
          .smn-destination-label { font-size: 8px; letter-spacing: .035em; }
          .smn-destination-hint { font-size: 6px; }
          .smn-row-arrow { display: none; }
          .smn-menu-foot { min-height: 36px; padding: 0 14px; font-size: 7px; }
          .smn-foot-right { gap: 10px; }
        }
        @media (max-width: 370px) {
          .smn-menu-head { gap: 5px; }
          .smn-eyebrow { display: none; }
          .smn-heading-lockup { min-width: 78px; }
          .smn-shortcut-text { font-size: 7px; }
          .smn-areas { padding-right: 10px; padding-left: 10px; }
          .smn-destination { gap: 4px; }
        }
        .smn-root {
          display: grid;
          place-items: center;
          min-height: 100dvh;
          padding: 20px;
          overflow: auto;
        }
        .smn-overlay {
          position: relative;
          inset: auto;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: calc(100dvh - 40px);
          padding: 0;
          background: transparent;
          backdrop-filter: none;
        }
        .smn-menu {
          width: min(1180px, 100%);
          height: min(820px, calc(100dvh - 40px));
          max-height: calc(100dvh - 40px);
          border-radius: 3px;
        }
        .smn-menu-body { grid-template-columns: 240px minmax(0, 1fr); overflow: hidden; }
        .smn-rail { overflow-y: auto; }
        .smn-areas { min-height: 0; overflow-y: auto; }
        .smn-heading-lockup { min-width: 108px; }
        .smn-heading-title { margin: 0; }
        .smn-destination-group { min-width: 0; }
        .smn-destination { padding: 0; gap: 0; }
        .smn-destination-action {
          min-width: 0;
          min-height: 31px;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 6px;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .smn-destination-action:focus-visible, .smn-expand:focus-visible {
          outline: 2px solid #869983;
          outline-offset: -2px;
        }
        .smn-expand {
          width: 28px;
          min-height: 31px;
          display: grid;
          flex: 0 0 28px;
          place-items: center;
          border: 0;
          background: transparent;
          color: #929287;
          cursor: pointer;
        }
        .smn-expand:hover { color: #242822; background: #eeece3; }
        .smn-expand svg { transition: transform .16s ease; }
        .smn-destination-group.is-expanded > .smn-destination .smn-expand svg { transform: rotate(180deg); }
        .smn-nested-destinations {
          display: grid;
          gap: 1px;
          margin: 3px 0 7px 17px;
          padding-left: 8px;
          border-left: 1px solid #e3dfd4;
        }
        .smn-destination-group.is-compact .smn-destination { min-height: 35px; }
        .smn-destination-group.is-compact .smn-destination-action { min-height: 35px; gap: 7px; padding-left: 7px; }
        .smn-destination-group.is-compact .smn-destination-label { font-size: 8px; letter-spacing: .05em; }
        .smn-destination-group.is-compact .smn-expand { min-height: 35px; }
        .smn-destination-group.is-compact .smn-nested-destinations { margin-left: 15px; }
        .smn-shortcut-list { gap: 3px; }
        .smn-closed-note { position: fixed; inset: 0; display: grid; place-items: center; background: var(--smn-paper); box-shadow: none; }
        .smn-closed-note button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          border: 1px solid #d9d4c8;
          background: var(--smn-surface);
          color: #252822;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: .1em;
        }
        @media (max-width: 900px) {
          .smn-root { padding: 13px; }
          .smn-overlay { min-height: calc(100dvh - 26px); }
          .smn-menu { height: min(900px, calc(100dvh - 26px)); max-height: calc(100dvh - 26px); }
          .smn-menu-body { grid-template-columns: 205px minmax(0,1fr); }
          .smn-menu-head { gap: 14px; }
          .smn-menu-count { display: none; }
        }
        @media (max-width: 620px) {
          .smn-root { display: block; min-height: 100dvh; padding: 0; }
          .smn-overlay { display: block; min-height: 100dvh; }
          .smn-menu { width: 100%; height: 100dvh; max-height: 100dvh; border: 0; border-radius: 0; }
          .smn-menu-body { display: flex; flex-direction: column; overflow-y: auto; }
          .smn-rail { flex: none; overflow: visible; padding: 13px 14px 14px; border-right: 0; border-bottom: 1px solid var(--smn-line); }
          .smn-section-label { margin-bottom: 7px; }
          .smn-pablo-card { min-height: 52px; padding: 8px 10px; }
          .smn-rail-section { margin-top: 14px; }
          .smn-destination-group.is-compact .smn-destination { min-height: 36px; }
          .smn-destination-group.is-compact .smn-destination-action { min-height: 36px; }
          .smn-destination-group.is-compact .smn-expand { min-height: 36px; }
          .smn-areas { display: block; padding: 15px 14px 20px; overflow: visible; }
          .smn-area { margin-bottom: 19px; }
          .smn-area-links { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 6px; }
          .smn-destination-action { min-height: 35px; gap: 6px; padding: 5px; }
          .smn-expand { min-height: 35px; }
          .smn-destination-icon { width: 15px; flex-basis: 15px; }
          .smn-destination-label { font-size: 8px; letter-spacing: .035em; }
          .smn-destination-hint { font-size: 6px; }
          .smn-row-arrow { display: none; }
          .smn-menu-foot { min-height: 36px; padding: 0 14px; font-size: 7px; }
          .smn-foot-right { gap: 10px; }
        }
        @media (max-width: 370px) {
          .smn-menu-head { gap: 5px; }
          .smn-heading-lockup { min-width: 80px; }
          .smn-areas { padding-right: 10px; padding-left: 10px; }
          .smn-destination-action { gap: 4px; }
        }
      `}</style>

      {open ? (
        <div className="smn-overlay">
          <section className="smn-menu" role="dialog" aria-modal="true" aria-label="Workspace navigation">
            <header className="smn-menu-head">
              <div className="smn-heading-lockup">
                <div className="smn-heading-title">WORKSPACE</div>
              </div>
              <div className="smn-menu-count">ALL DESTINATIONS <span style={{ color: "#bbb7aa" }}>/</span> {uniqueDestinationCount}</div>
              <label className="smn-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a destination"
                  aria-label="Find a destination"
                />
              </label>
              <button type="button" className="smn-close" onClick={closeMenu} aria-label="Close navigation">
                <X size={17} />
              </button>
            </header>

            <div className="smn-menu-body">
              <aside className="smn-rail">
                <div className="smn-section-label">START HERE</div>
                {filteredPablo && (
                  <button
                    type="button"
                    className={`smn-pablo-card${selected === uniquePablo.path ? " is-active" : ""}`}
                    onClick={() => choose(uniquePablo)}
                  >
                    <CurrentMiniNebula size={38} />
                    <span className="smn-pablo-copy">
                      <span className="smn-pablo-title">PABLO AI</span>
                      <span className="smn-pablo-sub">CHAT + AUTOMATION</span>
                    </span>
                    <ArrowUpRight size={14} style={{ marginLeft: "auto", color: "#bfc5b8" }} />
                  </button>
                )}
                <div className="smn-rail-section">
                  <div className="smn-section-label">YOUR TOOLS</div>
                  <div className="smn-shortcut-list">
                    {filteredFeatured.map((item) => (
                      <DestinationRow
                        key={item.path}
                        item={item}
                        active={selected === item.path}
                        selectedPath={selected}
                        onSelect={choose}
                        expanded={expandedPaths.has(item.path)}
                        onToggle={toggleExpanded}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </aside>

              <div className="smn-areas">
                {filteredAreas.map((area) => {
                  const AreaIcon = area.icon;
                  return (
                    <section className="smn-area" key={area.title}>
                      <h2 className="smn-area-title"><AreaIcon size={13} /> {area.title}</h2>
                      <div className="smn-area-links">
                        {area.entries.map((item) => (
                          <DestinationRow
                            key={item.path}
                            item={item}
                            active={selected === item.path}
                            selectedPath={selected}
                            onSelect={choose}
                            expanded={expandedPaths.has(item.path)}
                            onToggle={toggleExpanded}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                {filteredWorkspace.length > 0 && (
                  <section className="smn-area">
                    <h2 className="smn-area-title"><Globe2 size={13} /> WORKSPACE</h2>
                    <div className="smn-area-links">
                      {filteredWorkspace.map((item) => (
                        <DestinationRow
                          key={item.path}
                          item={item}
                          active={selected === item.path}
                          selectedPath={selected}
                          onSelect={choose}
                          expanded={expandedPaths.has(item.path)}
                          onToggle={toggleExpanded}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {filteredAreas.length === 0 && filteredWorkspace.length === 0 && filteredFeatured.length === 0 && !filteredPablo && (
                  <div className="smn-no-results">
                    <CircleHelp size={20} />
                    <strong>No destinations found</strong>
                    <span>Try a name such as “business” or “dialer”.</span>
                  </div>
                )}
              </div>
            </div>

            <footer className="smn-menu-foot">
              <div className="smn-foot-status" aria-live="polite">
                <span className={`smn-status-dot${selected ? " selected" : ""}`} />
                <span>{notice || "Workspace ready"}</span>
              </div>
              <div className="smn-foot-right">
                <span>AUTHENTICATED</span>
                <span>ESC <X size={9} style={{ display: "inline", verticalAlign: "-1px" }} /></span>
              </div>
            </footer>
          </section>
        </div>
      ) : (
        <div className="smn-closed-note">
          <button type="button" onClick={() => setOpen(true)}><Menu size={14} /> OPEN WORKSPACE</button>
        </div>
      )}
    </div>
  );
}
