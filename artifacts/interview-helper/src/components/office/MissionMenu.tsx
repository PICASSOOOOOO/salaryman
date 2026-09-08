/**
 * MISSION MENU — the office's scene picker.
 *
 * Lists the current quarter's authored SCENES (the story assignments) with their
 * status (done / active / locked) and lets the player select one to play. It is
 * the office-side surface of the same story/assignment system the city uses
 * (lib/story-assignments), so the office and the city read from one source of
 * truth.
 *
 * Playing a scene is wired by the caller:
 *  - The reserved Scene 1 ("AND IT ALL FALLS DOWN") before the story has begun is
 *    the natural story start — PLAY there enters the city / begins the run.
 *  - Once the story is active, PLAY on the active scene drops back into the city
 *    where that assignment is tracked.
 *  - Completed and locked scenes show their objective but cannot be replayed.
 */
import {
  getQuarterAssignments,
  getActiveAssignment,
  isAssignmentComplete,
  countCompletedAssignments,
  ASSIGNMENTS_PER_QUARTER,
  type StoryAssignmentDef,
  type AssignmentStorySnapshot,
} from '@/lib/story-assignments';
import { quarterLabel } from '@/gameSystems';

export interface MissionMenuProps {
  quarter: number;
  story: AssignmentStorySnapshot | null;
  /** Server story gate: drives whether a scene is playable from the office. */
  storyActive: boolean;
  eligible: boolean;
  onPlay: (def: StoryAssignmentDef) => void;
  onClose: () => void;
}

const VT2: React.CSSProperties = { fontFamily: "var(--font-sans)" };

/** A scene is playable from the office when it's the active scene AND either the
 *  story is already running, or it's the reserved opener (which BEGINS the run). */
export function isScenePlayable(
  def: StoryAssignmentDef,
  isActive: boolean,
  storyActive: boolean,
): boolean {
  if (!isActive) return false;
  if (storyActive) return true;
  return !!def.reserved;
}

export function MissionMenu({
  quarter,
  story,
  storyActive,
  eligible,
  onPlay,
  onClose,
}: MissionMenuProps) {
  const list = getQuarterAssignments(quarter);
  const active = getActiveAssignment(story, quarter);
  const doneCount = countCompletedAssignments(story, quarter);

  return (
    <div
      data-testid="office-mission-menu"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 710, padding: '1rem',
      }}
    >
      <div style={{ width: 560, maxWidth: '92vw', border: '1px solid rgba(255,200,60,.4)', background: 'rgba(0,6,2,.98)', fontFamily: "var(--font-sans)", padding: '1.2rem', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div style={{ ...VT2, fontSize: '1.6rem', color: '#ffcc44', letterSpacing: '.18em' }}>MISSIONS · {quarterLabel(quarter)}</div>
          <button onClick={onClose} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(255,200,60,.2)', color: 'rgba(255,200,60,.4)', cursor: 'pointer', fontFamily: "var(--font-sans)", fontSize: '.5rem' }}>ESC</button>
        </div>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', fontSize: '.5rem', letterSpacing: '.1em', marginBottom: '.5rem', color: 'rgba(56,189,248,.55)' }}>
          <span style={{ border: '1px solid rgba(56,189,248,.25)', padding: '.2rem .45rem' }}>QUARTER {quarterLabel(quarter)}</span>
          <span style={{ border: '1px solid rgba(255,200,60,.3)', padding: '.2rem .45rem', color: '#ffcc44' }}>{doneCount}/{ASSIGNMENTS_PER_QUARTER} DONE</span>
        </div>
        <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,200,60,.3),transparent)', marginBottom: '.8rem' }} />

        {list.length === 0 && (
          <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.7, padding: '.6rem' }}>
            No scenes are scheduled for this quarter yet.
          </div>
        )}

        {list.map((def) => {
          const complete = isAssignmentComplete(story, def);
          const isActive = !complete && active?.id === def.id;
          const locked = !complete && !isActive;
          const playable = isScenePlayable(def, isActive, storyActive);
          const col = complete ? '#38bdf8' : isActive ? '#ffcc44' : 'rgba(56,189,248,.4)';
          return (
            <div key={def.id} style={{ border: `1px solid ${complete ? 'rgba(56,189,248,.2)' : isActive ? 'rgba(255,200,60,.4)' : 'rgba(56,189,248,.12)'}`, padding: '.7rem', marginBottom: '.5rem', background: complete ? 'rgba(56,189,248,.03)' : isActive ? 'rgba(255,200,60,.04)' : 'rgba(0,0,0,.2)', opacity: locked ? 0.65 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
                <span style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', minWidth: '2.4rem' }}>{String(def.no).padStart(2, '0')}</span>
                <span style={{ ...VT2, fontSize: '1.1rem', color: col, letterSpacing: '.1em', flex: 1 }}>{def.title}</span>
                <span style={{ fontSize: '.45rem', letterSpacing: '.12em', color: col, border: `1px solid ${col}`, padding: '1px 5px', flexShrink: 0 }}>
                  {complete ? '✓ DONE' : isActive ? '▶ ACTIVE' : '🔒 LOCKED'}
                </span>
                {def.reserved && <span style={{ fontSize: '.4rem', letterSpacing: '.1em', color: 'rgba(244,114,182,.6)', border: '1px solid rgba(244,114,182,.3)', padding: '1px 4px', flexShrink: 0 }}>STORY</span>}
              </div>
              <div style={{ fontSize: '.52rem', color: complete ? 'rgba(56,189,248,.4)' : 'rgba(255,200,60,.5)', lineHeight: 1.7, paddingLeft: '2.9rem' }}>{def.objective}</div>
              {playable && (
                <div style={{ paddingLeft: '2.9rem', marginTop: '.55rem' }}>
                  <button
                    data-testid={`office-mission-play-${def.id}`}
                    onClick={() => onPlay(def)}
                    style={{
                      padding: '.4rem .9rem',
                      background: 'linear-gradient(135deg, rgba(236,72,153,.92), rgba(56,189,248,.82))',
                      border: '1px solid rgba(244,180,255,.95)', borderRadius: 6, color: '#0a0414',
                      font: 'bold .62rem "var(--font-sans)", monospace', letterSpacing: '.14em',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {!storyActive && def.reserved
                      ? (eligible ? '▸ PLAY · BEGIN STORY' : '▸ HOW TO START')
                      : '▸ PLAY IN THE CITY'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
