// Pure helpers for the OFFICE MONITOR — the bot-floor dashboard rendered on
// /office (monitor mode). Extracted so the grouping / activation / skill logic
// can be unit-tested without mounting the component, the same way the Twilio
// phone system has its own suite.
//
// Core rules the UI relies on:
//   - A bot is only AWAKE (working, out of its sleep capsule) when it has been
//     ACTIVATED, i.e. status === "active". Everything else (paused / error /
//     unknown) renders dormant in a SLEEP CAPSULE.
//   - Bots are grouped by TEAM (the `department` column) and, within a team,
//     ordered so similar SKILLS (the `permissions` array) sit next to each
//     other.

export type BotStatusKey = "active" | "paused" | "error";

export interface MonitorBot {
  id: number;
  name: string;
  status: string | null | undefined;
  department?: string | null;
  permissions?: string[] | null;
  collaborationRole?: string | null;
}

/** Normalise the free-form status string to the three known states. */
export function statusKey(s: string | null | undefined): BotStatusKey {
  if (s === "active" || s === "paused" || s === "error") return s;
  return "paused";
}

/** A bot is awake (working) ONLY once it has been activated. */
export function isAwake(bot: MonitorBot): boolean {
  return statusKey(bot.status) === "active";
}

/**
 * A non-activated bot is FAULTED if it errored out. This is secondary
 * metadata only — a faulted bot is still asleep in its capsule (NOT awake),
 * it just gets a warning badge. Activated bots are never "faulted" here.
 */
export function isFaulted(bot: MonitorBot): boolean {
  return statusKey(bot.status) === "error";
}

/**
 * The visual state of a bot's pod on the monitor floor:
 *   - "working": activated + awake at its desk
 *   - "fault":   asleep in a capsule but flagged with an error badge
 *   - "asleep":  asleep in a capsule, healthy
 * Both "fault" and "asleep" are CAPSULE states — only "working" is awake.
 */
export function podState(bot: MonitorBot): "working" | "fault" | "asleep" {
  if (isAwake(bot)) return "working";
  return isFaulted(bot) ? "fault" : "asleep";
}

/** Split the roster into the working crew vs. the ones asleep in capsules. */
export function partitionByActivation(bots: MonitorBot[]): {
  working: MonitorBot[];
  asleep: MonitorBot[];
} {
  const working: MonitorBot[] = [];
  const asleep: MonitorBot[] = [];
  for (const b of bots) (isAwake(b) ? working : asleep).push(b);
  return { working, asleep };
}

// ── Teams ────────────────────────────────────────────────────────────────
export interface TeamMeta {
  key: string;
  label: string;
  /** Hex accent used for the team's section + capsule trim. */
  accent: string;
}

const TEAM_META: Record<string, TeamMeta> = {
  trading: { key: "trading", label: "Trading Desk", accent: "#fbbf24" },
  sales: { key: "sales", label: "Sales", accent: "#34d399" },
  marketing: { key: "marketing", label: "Marketing", accent: "#f472b6" },
  support: { key: "support", label: "Support", accent: "#38bdf8" },
  creative: { key: "creative", label: "Creative", accent: "#a78bfa" },
  general: { key: "general", label: "General Staff", accent: "#94a3b8" },
};

/** Display order — known departments first, the catch-all "general" last. */
const TEAM_ORDER = ["trading", "sales", "marketing", "support", "creative", "general"];

/** The team a bot belongs to (department, lower-cased; "general" if unset). */
export function teamKey(bot: MonitorBot): string {
  const d = (bot.department || "").trim().toLowerCase();
  return d || "general";
}

export function teamMeta(key: string): TeamMeta {
  return TEAM_META[key] || { key, label: titleCase(key), accent: "#94a3b8" };
}

// ── Skills ───────────────────────────────────────────────────────────────
const SKILL_LABELS: Record<string, string> = {
  ai_chat: "Chat",
  trading_execute: "Trade Exec",
  trading_read: "Market Read",
  email_send: "Email",
  email_read: "Inbox",
  crm_write: "CRM Write",
  crm_read: "CRM Read",
  calendar_write: "Calendar",
  web_search: "Research",
  code_execute: "Code",
  file_write: "Files",
  voice_call: "Voice",
};

/** Human label for a single permission/skill key. */
export function skillLabel(permission: string): string {
  return SKILL_LABELS[permission] || titleCase(permission);
}

/** Skill labels for one bot, in declared order, de-duplicated. */
export function botSkills(bot: MonitorBot): string[] {
  return uniq((bot.permissions || []).map(skillLabel));
}

/** The union of skill labels across a set of bots, sorted for stable display. */
export function teamSkills(bots: MonitorBot[]): string[] {
  const all: string[] = [];
  for (const b of bots) all.push(...botSkills(b));
  return uniq(all).sort((a, b) => a.localeCompare(b));
}

// ── Grouping ─────────────────────────────────────────────────────────────
export interface TeamGroup {
  key: string;
  label: string;
  accent: string;
  bots: MonitorBot[];
  skills: string[];
  workingCount: number;
  asleepCount: number;
}

/** The raw skill key a bot is primarily defined by — used to cluster similar
 *  skills next to each other within a team. */
function primarySkill(bot: MonitorBot): string {
  return (bot.permissions && bot.permissions[0]) || "";
}

/**
 * Group the roster by team, ordered by TEAM_ORDER (unknown teams alpha-sorted
 * after the known ones). Within each team, bots are ordered so that members
 * sharing a primary skill sit together, then by name.
 */
export function groupByTeam(bots: MonitorBot[]): TeamGroup[] {
  const buckets = new Map<string, MonitorBot[]>();
  for (const b of bots) {
    const k = teamKey(b);
    const arr = buckets.get(k);
    if (arr) arr.push(b);
    else buckets.set(k, [b]);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = TEAM_ORDER.indexOf(a);
    const ib = TEAM_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  return keys.map((k) => {
    const meta = teamMeta(k);
    const members = [...(buckets.get(k) || [])].sort((a, b) => {
      const sa = primarySkill(a);
      const sb = primarySkill(b);
      if (sa !== sb) return sa.localeCompare(sb);
      return a.name.localeCompare(b.name);
    });
    const { working, asleep } = partitionByActivation(members);
    return {
      key: k,
      label: meta.label,
      accent: meta.accent,
      bots: members,
      skills: teamSkills(members),
      workingCount: working.length,
      asleepCount: asleep.length,
    };
  });
}

// ── Floor placement (the walkable pixel office) ───────────────────────────
// The pixel office shows the SAME activation model as the dashboard: activated
// bots stand at desks, everyone else sleeps in a capsule. We hand the engine
// two already-ordered lists (grouped by team, then skill) plus each bot's team
// colour + label so same-team bots cluster and read as a group on the floor.
export interface FloorBot {
  id: number;
  name: string;
  status: string;
  /** Hex accent for the bot's team — tints its desk/capsule trim. */
  teamColor: string;
  /** Human team label (e.g. "Trading Desk"). */
  teamLabel: string;
}

function toFloorBot(bot: MonitorBot): FloorBot {
  const meta = teamMeta(teamKey(bot));
  return {
    id: bot.id,
    name: bot.name,
    status: statusKey(bot.status),
    teamColor: meta.accent,
    teamLabel: meta.label,
  };
}

/**
 * Split the roster into the two floor populations, each ordered by team (then
 * skill, via groupByTeam): `deskBots` are activated and stand at desks,
 * `capsuleBots` are dormant and sleep in capsules. Team clustering is preserved
 * so the floor visually groups teams and similar skills together.
 */
export function floorPlacement(bots: MonitorBot[]): {
  deskBots: FloorBot[];
  capsuleBots: FloorBot[];
} {
  const deskBots: FloorBot[] = [];
  const capsuleBots: FloorBot[] = [];
  for (const group of groupByTeam(bots)) {
    for (const b of group.bots) {
      (isAwake(b) ? deskBots : capsuleBots).push(toFloorBot(b));
    }
  }
  return { deskBots, capsuleBots };
}

/** Authoritative floor assignments are the final placement gate: active but
 * unassigned bots remain off the playable floor. */
export function floorPlacementForAssignments(bots: MonitorBot[], assignedBotIds: readonly number[]): FloorBot[] {
  const allowed = new Set(assignedBotIds);
  return floorPlacement(bots).deskBots.filter((bot) => allowed.has(bot.id));
}

// ── small utils ──────────────────────────────────────────────────────────
function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
