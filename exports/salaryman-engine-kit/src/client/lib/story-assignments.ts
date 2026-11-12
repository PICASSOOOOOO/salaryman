// ── Story assignments ────────────────────────────────────────────────────────
// The SALARYMAN campaign is run like a business: each real-life QUARTER (Q1-Q4)
// is a "term" with TEN ordered assignments. Progress is per-character and lives
// in the save's data.story blob (see StoryState.assignmentsCompleted) — it is
// NOT stored in the per-user season tables, because assignments are bound to a
// single character's story (slot 1 of Q1 is the per-slot Shadow Tower mission).
//
// Slot 1 of every quarter is reserved for the authored story mission. Q1 slot 1
// is the Shadow Tower fire & escape, whose id matches the existing scene id
// 'and_it_all_falls_down' so its completion syncs with the existing story flow.
// The CONTENT of those reserved missions is authored in separate tasks; here we
// only define the slots, their order, titles and objectives.

export const ASSIGNMENTS_PER_QUARTER = 10;

export interface StoryAssignmentDef {
  /** Stable id. For the reserved slot 1 this matches the authored scene id. */
  id: string;
  /** 1-based position within the quarter (1..10). */
  no: number;
  title: string;
  objective: string;
  /** Reserved slots are authored as full story missions in a separate task. */
  reserved?: boolean;
}

// Minimal shape this module needs from the persisted story state.
export interface AssignmentStorySnapshot {
  assignmentsCompleted?: string[];
  missionIndex?: number;
}

// Q1 — WINTER. The year opens cold: the old order falls, you go underground and
// stand up the first cell of the resistance like a fledgling business.
export const Q1_ASSIGNMENTS: StoryAssignmentDef[] = [
  { id: 'and_it_all_falls_down', no: 1, reserved: true,
    title: 'AND IT ALL FALLS DOWN',
    objective: 'Escape the Shadow Tower fire and reach the UNDERGROUND CAMP to claim your MX-75.' },
  { id: 'q1_cold_start', no: 2,
    title: 'COLD START',
    objective: 'Establish the underground camp — light the fire and secure the perimeter against the winter.' },
  { id: 'q1_supply_lines', no: 3,
    title: 'SUPPLY LINES',
    objective: 'Scavenge rations and power cells before the cold deepens.' },
  { id: 'q1_signal_in_the_static', no: 4,
    title: 'SIGNAL IN THE STATIC',
    objective: 'Get the MX-75 online and make first contact with Mila.' },
  { id: 'q1_know_your_block', no: 5,
    title: 'KNOW YOUR BLOCK',
    objective: 'Map the safe zone and find where the gas thins around the core.' },
  { id: 'q1_first_payroll', no: 6,
    title: 'FIRST PAYROLL',
    objective: 'Take a job or register a business to fund the cell.' },
  { id: 'q1_eyes_on_pablo_corp', no: 7,
    title: 'EYES ON PABLO CORP',
    objective: 'Gather intel on PABLO CORP patrols near the plaza.' },
  { id: 'q1_the_collectors', no: 8,
    title: 'THE COLLECTORS',
    objective: 'Settle or dodge a debt collector closing in on the camp.' },
  { id: 'q1_warmth_and_walls', no: 9,
    title: 'WARMTH AND WALLS',
    objective: 'Reinforce the bunker and upgrade the camp against the cold.' },
  { id: 'q1_closing_the_quarter', no: 10,
    title: 'CLOSING THE QUARTER',
    objective: 'Survive to the end of Q1 — the fog begins to lift.' },
];

// Q2-Q4 slots are authored in later tasks; the framework already supports them.
export const QUARTER_ASSIGNMENTS: Record<number, StoryAssignmentDef[]> = {
  1: Q1_ASSIGNMENTS,
  2: [],
  3: [],
  4: [],
};

export function getQuarterAssignments(quarter: number): StoryAssignmentDef[] {
  return QUARTER_ASSIGNMENTS[quarter] ?? [];
}

/**
 * An assignment is complete when it is recorded in assignmentsCompleted. The
 * reserved Q1 slot 1 also derives completion from the legacy missionIndex so
 * saves that finished the Shadow Tower scene before this framework existed still
 * show it as done.
 */
export function isAssignmentComplete(
  story: AssignmentStorySnapshot | null | undefined,
  def: StoryAssignmentDef,
): boolean {
  if (!story) return false;
  if (story.assignmentsCompleted?.includes(def.id)) return true;
  if (def.id === 'and_it_all_falls_down' && (story.missionIndex ?? 0) >= 1) return true;
  return false;
}

/** The first not-yet-complete assignment in the quarter, or null if all done. */
export function getActiveAssignment(
  story: AssignmentStorySnapshot | null | undefined,
  quarter: number,
): StoryAssignmentDef | null {
  for (const def of getQuarterAssignments(quarter)) {
    if (!isAssignmentComplete(story, def)) return def;
  }
  return null;
}

/** Count of completed assignments within a quarter. */
export function countCompletedAssignments(
  story: AssignmentStorySnapshot | null | undefined,
  quarter: number,
): number {
  return getQuarterAssignments(quarter).filter((d) => isAssignmentComplete(story, d)).length;
}
