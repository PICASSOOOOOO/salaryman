import { AUTOPILOT_DEFAULT_STAFF_TARGET, AUTOPILOT_DEFAULT_TASKS_PER_TICK } from "@workspace/db";
import type { AutopilotContext, AutopilotHandler } from "./types";
import { readBusinessOpsPrefs } from "./business-ops-prefs";
import {
  listBusinessTasks,
  updateBusinessTask,
  listTimeEntries,
  updateTimeEntry,
  listAnnouncements,
  createAnnouncement,
} from "../business-ops-service";
import {
  listJobListings,
  listApplicants,
  createJobListing,
  createApplicant,
  updateApplicant,
  countActiveStaff,
  isServiceError,
} from "../hiring-service";

// ─── Business Ops autopilot handler ──────────────────────────────────────────
// Runs an org's day-to-day office operations through the SAME service functions
// the manual screens call (see CONTRACT.md). Each mutating action is gated by
// ctx.claimAction() so the bot can never exceed the per-tick cap. No paid AI is
// used — content is templated — so the only guardrail needed is the action cap.
//
// The bot operates on the org OWNER's records (ctx.ownerId), since the manual
// Business Hub / Hiring screens are keyed by userId and the owner is the account
// that runs the office. Turning autopilot OFF simply stops these ticks; nothing
// here writes data a human couldn't write the same way, so there is no divergence.

// DEFAULT how many open tasks to nudge forward per tick (each still consumes an
// action). Owners can override this via the Business Ops prefs (tasksPerTick).
export const TASK_ADVANCE_PER_TICK = AUTOPILOT_DEFAULT_TASKS_PER_TICK;
// FALLBACK baseline headcount floor. Real staffing capacity is driven by the
// org's OPEN job listings (each open requisition is an explicitly-opened, still
// unfilled seat — the same signal the manual Hiring screen uses). There is no
// per-org seat-capacity column in the schema, so this floor is used ONLY when an
// org has zero open requisitions: the bot may open ONE new req to reach a sane
// baseline, and that action is logged as a fallback so it's auditable. Owners
// can override this floor via the Business Ops prefs (staffTarget).
export const DEFAULT_STAFF_TARGET = AUTOPILOT_DEFAULT_STAFF_TARGET;
// Don't post a routine operational announcement more than once per this window.
export const ANNOUNCEMENT_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const AUTOPILOT_ANNOUNCEMENT_CATEGORY = "operations";

// ── Task progression ──

export const TASK_FLOW = ["todo", "in_progress", "review", "done"] as const;

/** Next status in the board flow, or null if already done / unknown. */
export function nextTaskStatus(status: string): string | null {
  const i = (TASK_FLOW as readonly string[]).indexOf(status);
  if (i < 0 || i >= TASK_FLOW.length - 1) return null;
  return TASK_FLOW[i + 1];
}

export interface AdvanceableTask {
  id: number;
  title: string;
  status: string;
  updatedAt: Date | string | null;
}

/** Oldest-touched non-done tasks that have a next stage, capped at `limit`. */
export function pickTasksToAdvance<T extends AdvanceableTask>(tasks: T[], limit: number): T[] {
  return tasks
    .filter((t) => nextTaskStatus(t.status) !== null)
    .sort((a, b) => new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime())
    .slice(0, Math.max(0, limit));
}

// ── Time entries ──

export interface OpenTimeEntry {
  id: number;
  date: string;
  status: string;
  clockOut: string | null;
  employeeName: string;
}

/**
 * Time entries left clocked-in on a PRIOR day — clearly forgotten and safe to
 * close. We never touch today's entries so a human's live session is untouched.
 */
export function pickStaleTimeEntries<T extends OpenTimeEntry>(entries: T[], todayStr: string): T[] {
  return entries.filter((e) => e.status === "active" && !e.clockOut && e.date < todayStr);
}

// ── Staffing ──

export const APPLICANT_FLOW = ["applied", "screening", "interview", "offer", "hired"] as const;

/** Next pipeline stage toward hire, or null for terminal stages. */
export function nextApplicantStage(stage: string): string | null {
  const i = (APPLICANT_FLOW as readonly string[]).indexOf(stage);
  if (i < 0 || i >= APPLICANT_FLOW.length - 1) return null;
  return APPLICANT_FLOW[i + 1];
}

export interface PipelineApplicant {
  id: number;
  jobId: number;
  stage: string;
  stageUpdatedAt: Date | string | null;
}

export type StaffingAction =
  | { type: "none" }
  | { type: "advance"; applicantId: number; fromStage: string; toStage: string }
  | { type: "source"; jobId: number }
  | { type: "post_job"; fallback: true };

export interface StaffingState {
  activeStaff: number;
  // Open job listings = the org's unfilled seats / configured hiring capacity.
  // The bot fills these and NEVER hires beyond them.
  openJobIds: number[];
  applicants: PipelineApplicant[];
  // Baseline floor used ONLY when there are zero open requisitions. See
  // DEFAULT_STAFF_TARGET — this is a conservative fallback, not a real cap.
  fallbackTarget: number;
}

/**
 * Decide the single most useful staffing step, driven by the org's OPEN job
 * listings (the real unfilled seats / configured capacity):
 *   1. Advance the furthest-along candidate on an open seat toward hire.
 *   2. Source ONE candidate for an open seat that isn't being worked or filled
 *      yet — at most one per open requisition, so the bot can never hire beyond
 *      the seats a human explicitly opened.
 *   3. Only when there are NO open requisitions and the team is below the
 *      fallback baseline floor, open a single new req. This is the only place
 *      the fallback target is used, and it's flagged so the handler logs it.
 * One step per tick keeps the bot observable.
 */
export function decideStaffingAction(state: StaffingState): StaffingAction {
  const openSet = new Set(state.openJobIds);

  // Non-terminal candidates attached to an OPEN requisition (in-flight pipeline).
  const advanceable = state.applicants
    .filter((a) => openSet.has(a.jobId) && nextApplicantStage(a.stage) !== null)
    .sort((a, b) => {
      const ai = (APPLICANT_FLOW as readonly string[]).indexOf(a.stage);
      const bi = (APPLICANT_FLOW as readonly string[]).indexOf(b.stage);
      if (ai !== bi) return bi - ai; // furthest-along first
      return new Date(a.stageUpdatedAt ?? 0).getTime() - new Date(b.stageUpdatedAt ?? 0).getTime();
    });

  if (advanceable.length > 0) {
    const a = advanceable[0];
    return { type: "advance", applicantId: a.id, fromStage: a.stage, toStage: nextApplicantStage(a.stage)! };
  }

  // A seat is "worked or filled" once it has any non-rejected applicant (a live
  // pipeline or an already-hired person). Source only for seats with none, so we
  // never source more than one hire's worth per open requisition.
  const workedJobs = new Set(
    state.applicants.filter((a) => openSet.has(a.jobId) && a.stage !== "rejected").map((a) => a.jobId)
  );
  const unworkedSeat = state.openJobIds.find((id) => !workedJobs.has(id));
  if (unworkedSeat !== undefined) return { type: "source", jobId: unworkedSeat };

  // No open requisitions to work. Only open a NEW one to reach the baseline floor.
  if (state.openJobIds.length === 0 && state.activeStaff < state.fallbackTarget) {
    return { type: "post_job", fallback: true };
  }

  return { type: "none" };
}

// ── Routine announcements ──

const ANNOUNCEMENT_ROTATION = [
  { title: "Daily Ops Sync", body: "Reviewed the board and kept tasks moving. Reach out if anything's blocked." },
  { title: "Pipeline Update", body: "Hiring pipeline reviewed and advanced. We're keeping the team staffed." },
  { title: "Operations Status", body: "Routine operations are running smoothly — open items are being worked down." },
  { title: "Team Check-in", body: "Keeping day-to-day ops on track. Flag anything that needs a human decision." },
];

/** True when no autopilot ops announcement has been posted within the window. */
export function shouldPostAnnouncement(lastAt: Date | string | null | undefined, now: number, intervalMs: number): boolean {
  if (!lastAt) return true;
  return now - new Date(lastAt).getTime() >= intervalMs;
}

/** Deterministic rotating announcement so the feed never repeats the same line back-to-back. */
export function buildRoutineAnnouncement(botName: string, now: number, intervalMs: number = ANNOUNCEMENT_INTERVAL_MS): { title: string; content: string; category: string; authorName: string } {
  const slot = Math.floor(now / intervalMs) % ANNOUNCEMENT_ROTATION.length;
  const pick = ANNOUNCEMENT_ROTATION[slot];
  return {
    title: pick.title,
    content: pick.body,
    category: AUTOPILOT_ANNOUNCEMENT_CATEGORY,
    authorName: botName,
  };
}

const CANDIDATE_FIRST = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Jamie", "Avery", "Quinn"];
const CANDIDATE_LAST = ["Reyes", "Okafor", "Nguyen", "Petrov", "Costa", "Haddad", "Kowalski", "Mbeki", "Larsen", "Tan"];

/** Deterministic procedural candidate name for autopilot sourcing. */
export function genCandidateName(seed: number): string {
  const f = CANDIDATE_FIRST[Math.abs(seed) % CANDIDATE_FIRST.length];
  const l = CANDIDATE_LAST[Math.abs(Math.floor(seed / CANDIDATE_FIRST.length)) % CANDIDATE_LAST.length];
  return `${f} ${l}`;
}

function todayString(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ── Handler ──

export const businessOpsAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  const userId = ctx.ownerId;
  const now = Date.now();
  // Owner-tunable preferences (task throughput, staffing floor, which routine
  // chores run). An org that never set any gets the same behavior as before.
  const prefs = readBusinessOpsPrefs(ctx.config.prefs);
  let acted = 0;
  let capReached = false;

  // Routine-announcement cadence is owner-tunable via the Business Ops prefs.
  const announcementIntervalMs = prefs.announcementIntervalHours * 60 * 60 * 1000;

  // 1. Progress open board tasks one stage each.
  const tasks = await listBusinessTasks(userId);
  for (const t of pickTasksToAdvance(tasks, prefs.tasksPerTick)) {
    const next = nextTaskStatus(t.status);
    if (!next) continue;
    if (!ctx.claimAction()) { capReached = true; break; }
    await updateBusinessTask(userId, t.id, { status: next });
    acted++;
    await ctx.log({
      action: "advance_task",
      summary: `Moved task "${t.title}" from ${t.status.replace(/_/g, " ")} to ${next.replace(/_/g, " ")}.`,
      outcome: "success",
      detail: { taskId: t.id, from: t.status, to: next },
    });
  }

  // 2. Close out time entries forgotten open from a previous day.
  if (!capReached && prefs.closeStaleTimeEntries) {
    const entries = await listTimeEntries(userId);
    for (const e of pickStaleTimeEntries(entries, todayString(now))) {
      if (!ctx.claimAction()) { capReached = true; break; }
      await updateTimeEntry(userId, e.id, { status: "completed", clockOut: "23:59" });
      acted++;
      await ctx.log({
        action: "close_time_entry",
        summary: `Closed an open time entry for ${e.employeeName || "staff"} left running from ${e.date}.`,
        outcome: "success",
        detail: { entryId: e.id, date: e.date },
      });
    }
  }

  // 3. Keep the team staffed — one pipeline step per tick.
  if (!capReached) {
    const [activeStaff, jobs, applicants] = await Promise.all([
      countActiveStaff(userId),
      listJobListings(userId),
      listApplicants(userId),
    ]);
    const openJobIds = jobs.filter((j) => j.status === "open").map((j) => j.id);
    const decision = decideStaffingAction({ activeStaff, fallbackTarget: prefs.staffTarget, openJobIds, applicants });

    if (decision.type !== "none") {
      if (!ctx.claimAction()) {
        capReached = true;
      } else if (decision.type === "advance") {
        const r = await updateApplicant(userId, decision.applicantId, { stage: decision.toStage });
        if (!isServiceError(r)) {
          acted++;
          const hired = decision.toStage === "hired";
          await ctx.log({
            action: "advance_applicant",
            summary: hired
              ? `Hired ${r.name} — added to the active team.`
              : `Advanced applicant ${r.name} from ${decision.fromStage} to ${decision.toStage}.`,
            outcome: "success",
            detail: { applicantId: decision.applicantId, from: decision.fromStage, to: decision.toStage },
          });
        }
      } else if (decision.type === "post_job") {
        const r = await createJobListing(userId, {
          title: "Operations Associate",
          description: "Support day-to-day office operations and keep work flowing.",
          requirements: "Reliable, organized, ready to jump in.",
        });
        if (!isServiceError(r)) {
          acted++;
          await ctx.log({
            action: "post_job",
            summary: `No open roles and the team is below the baseline of ${prefs.staffTarget} — opened a new requisition "${r.title}".`,
            outcome: "success",
            detail: { jobId: r.id, fallback: true, baseline: prefs.staffTarget },
          });
        }
      } else if (decision.type === "source") {
        const name = genCandidateName(now + decision.jobId);
        const r = await createApplicant(userId, {
          jobId: decision.jobId,
          name,
          source: "Autopilot sourcing",
          resumeNotes: "Sourced automatically to fill an open role.",
        });
        if (!isServiceError(r)) {
          acted++;
          await ctx.log({
            action: "source_candidate",
            summary: `Sourced candidate ${name} for an open role.`,
            outcome: "success",
            detail: { applicantId: r.id, jobId: decision.jobId },
          });
        }
      }
    }
  }

  // 4. Post a routine operational announcement (rate-limited, deterministic).
  if (!capReached && prefs.postAnnouncements) {
    const anns = await listAnnouncements(userId);
    const lastOps = anns
      .filter((a) => a.category === AUTOPILOT_ANNOUNCEMENT_CATEGORY && a.authorName === ctx.bot.name)
      .reduce<Date | null>((acc, a) => {
        const t = new Date(a.createdAt);
        return !acc || t > acc ? t : acc;
      }, null);

    if (shouldPostAnnouncement(lastOps, now, announcementIntervalMs)) {
      if (ctx.claimAction()) {
        const ann = buildRoutineAnnouncement(ctx.bot.name, now, announcementIntervalMs);
        await createAnnouncement(userId, ann);
        acted++;
        await ctx.log({
          action: "post_announcement",
          summary: `Posted a routine update "${ann.title}" to the team.`,
          outcome: "success",
          detail: { category: ann.category },
        });
      } else {
        capReached = true;
      }
    }
  }

  if (acted === 0 && !capReached) {
    await ctx.log({
      action: "tick",
      summary: "Business Ops autopilot ran — everything is up to date, nothing to do.",
      outcome: "noop",
    });
  }
};
