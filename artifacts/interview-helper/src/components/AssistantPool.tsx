/**
 * AssistantPool — animated pixel-art workers that scurry around inside a
 * bot's office. Each assistant has a name + role + Pro art sprite. Their
 * motion is driven by the supervisor bot's status:
 *   active → walk between workstations, occasional "task" spark
 *   paused → stand still, occasional yawn
 *   error  → cluster around the desk, panic flash
 *
 * Fully presentational — no state owned outside the component. The caller
 * supplies count + supervisor status. Stored count lives in localStorage so
 * the room remembers its staffing per bot.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useArtAsset } from "@/lib/art";

export type AssistantRole = "intern" | "pa" | "engineer";

const ROLE_ART: Record<AssistantRole, string> = {
  intern:   "assistant_intern",
  pa:       "assistant_pa",
  engineer: "assistant_engineer",
};

const ROLE_LABEL: Record<AssistantRole, string> = {
  intern:   "Intern",
  pa:       "PA Droid",
  engineer: "Engineer-Bot",
};

const NAMES = [
  "OTIS", "MIRA", "NIX", "JUNO", "PERCY", "VESPA",
  "ROCKO", "TILDA", "BOON", "CLEO", "WALL-E", "FENN",
];

export interface AssistantInstance {
  id: string;
  name: string;
  role: AssistantRole;
}

interface Props {
  /** Supervisor bot id — used to namespace localStorage. */
  botId: number;
  /** Supervisor status drives the motion mood. */
  status: "active" | "paused" | "error";
  /** Bounding rect (relative to parent) where assistants can roam. */
  className?: string;
  /** Override count (otherwise read from localStorage / defaults to 0). */
  count?: number;
}

export function loadAssistantCount(botId: number): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(`bot:${botId}:assistants`);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : 0;
}

export function saveAssistantCount(botId: number, n: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.min(5, Math.floor(n)));
  window.localStorage.setItem(`bot:${botId}:assistants`, String(clamped));
}

function rosterFor(botId: number, count: number): AssistantInstance[] {
  // Deterministic so the same bot always gets the same crew.
  const roles: AssistantRole[] = ["intern", "pa", "engineer"];
  const out: AssistantInstance[] = [];
  for (let i = 0; i < count; i++) {
    const role = roles[(botId + i) % roles.length];
    const name = NAMES[(botId * 7 + i * 3) % NAMES.length];
    out.push({ id: `${botId}-${i}`, name, role });
  }
  return out;
}

export default function AssistantPool({ botId, status, className, count }: Props) {
  const n = count ?? loadAssistantCount(botId);
  const roster = useMemo(() => rosterFor(botId, n), [botId, n]);

  if (n === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      data-testid="assistant-pool"
    >
      {roster.map((a, idx) => (
        <AssistantSprite key={a.id} a={a} status={status} index={idx} total={n} />
      ))}
    </div>
  );
}

function AssistantSprite({
  a,
  status,
  index,
  total,
}: {
  a: AssistantInstance;
  status: "active" | "paused" | "error";
  index: number;
  total: number;
}) {
  const url = useArtAsset(ROLE_ART[a.role], 4000, { retryOnFail: true });
  // Stagger horizontal home positions evenly across the floor band.
  const homeX = 12 + (index + 0.5) * (76 / Math.max(1, total));
  const [x, setX] = useState(homeX);
  const [y, setY] = useState(70 + ((index * 13) % 12));
  const [flip, setFlip] = useState(false);
  const [spark, setSpark] = useState(false);
  const tickRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const interval = status === "active" ? 1200 : status === "error" ? 300 : 4000;
    function tick() {
      if (cancelled) return;
      tickRef.current += 1;
      if (status === "active") {
        // Wander within ±18% horizontally
        const next = Math.max(8, Math.min(88, homeX + (Math.random() - 0.5) * 36));
        setFlip(next < x);
        setX(next);
        setY(68 + Math.random() * 18);
        if (Math.random() < 0.35) {
          setSpark(true);
          setTimeout(() => !cancelled && setSpark(false), 380);
        }
      } else if (status === "error") {
        // Cluster around centre, jitter
        const next = 45 + (Math.random() - 0.5) * 14;
        setFlip(Math.random() < 0.5);
        setX(next);
        setY(72 + Math.random() * 10);
        setSpark(Math.random() < 0.7);
        setTimeout(() => !cancelled && setSpark(false), 200);
      } else {
        // paused — drift back to home, idle
        setX(homeX);
        setY(74);
      }
    }
    tick();
    const t = setInterval(tick, interval);
    return () => { cancelled = true; clearInterval(t); };
  }, [status, homeX, x]);

  const transition = status === "active" ? "all 1100ms cubic-bezier(0.45,0,0.55,1)" : "all 600ms ease-out";

  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -100%) scaleX(${flip ? -1 : 1})`,
        transition,
        width: "min(7%, 64px)",
        filter:
          status === "error"
            ? "drop-shadow(0 0 6px #ef4444)"
            : status === "paused"
              ? "saturate(0.6) opacity(0.85)"
              : "drop-shadow(0 0 6px rgba(34,211,238,0.5))",
      }}
    >
      <div className="relative aspect-square">
        {url ? (
          <img
            src={url}
            alt={`${a.name} — ${ROLE_LABEL[a.role]}`}
            className="w-full h-full object-contain"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full rounded-sm border border-cyan-400/40 bg-cyan-900/30" />
        )}
        {/* Little task spark */}
        {spark && (
          <div
            className="absolute -top-1 right-0 w-2 h-2 rounded-full"
            style={{
              background: status === "error" ? "#ef4444" : "#fde047",
              boxShadow: status === "error"
                ? "0 0 8px #ef4444, 0 0 14px #ef4444"
                : "0 0 8px #fde047, 0 0 14px #facc15",
            }}
          />
        )}
        {/* Tiny name tag, only on hover-friendly viewports */}
        <div
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[7px] tracking-[0.15em] text-cyan-100/80 whitespace-nowrap"
          style={{ fontFamily: "var(--font-sans)", textShadow: "0 0 4px #000, 0 0 4px #000" }}
        >
          {a.name}
        </div>
      </div>
    </div>
  );
}
