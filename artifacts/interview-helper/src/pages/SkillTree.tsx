import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { ChevronLeft, Lock, CheckCircle, Zap, Briefcase, Sword } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import {
  SKILL_CATALOG,
  SKILL_BRANCHES,
  getSkillsByBranch,
  canUnlock,
  type SkillBranch,
  type SkillDef,
} from "@/lib/skill-catalog";
import { apiFetch } from "@/lib/api-client";

const BRANCH_ICON: Record<SkillBranch, React.ComponentType<any>> = {
  WORK: Briefcase,
  BUSINESS: Zap,
  POWER: Sword,
};

const BRANCH_COLOR: Record<SkillBranch, string> = {
  WORK: "#ffcc00",
  BUSINESS: "#38bdf8",
  POWER: "#f87171",
};

const TIER_LABEL: Record<number, string> = { 1: "T1", 2: "T2", 3: "T3" };

interface SkillState {
  unlocked: string[];
  skillPoints: number;
}

function SkillCard({
  skill,
  isUnlocked,
  canUnlockNow,
  onUnlock,
  unlocking,
}: {
  skill: SkillDef;
  isUnlocked: boolean;
  canUnlockNow: boolean;
  onUnlock: (skillId: string) => void;
  unlocking: boolean;
}) {
  const color = BRANCH_COLOR[skill.branch];

  const borderColor = isUnlocked
    ? color
    : canUnlockNow
    ? `${color}66`
    : "rgba(255,255,255,0.08)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        background: isUnlocked
          ? `${color}12`
          : canUnlockNow
          ? "rgba(255,255,255,0.03)"
          : "rgba(0,0,0,0.3)",
        borderRadius: "6px",
        padding: "0.75rem",
        position: "relative",
        transition: "border-color 0.2s, background 0.2s",
        opacity: isUnlocked || canUnlockNow ? 1 : 0.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.35rem",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.45rem",
              letterSpacing: "0.15em",
              color: `${color}99`,
              fontFamily: "monospace",
              display: "block",
              marginBottom: "0.1rem",
            }}
          >
            {TIER_LABEL[skill.tier]} · {skill.branch}
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: isUnlocked ? color : "rgba(255,255,255,0.8)",
              fontWeight: 600,
            }}
          >
            {skill.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          {isUnlocked ? (
            <CheckCircle style={{ width: 16, height: 16, color }} />
          ) : !canUnlockNow ? (
            <Lock style={{ width: 14, height: 14, color: "rgba(255,255,255,0.25)" }} />
          ) : null}
          {!isUnlocked && (
            <span
              style={{
                fontSize: "0.55rem",
                fontFamily: "monospace",
                color: canUnlockNow ? color : "rgba(255,255,255,0.3)",
                border: `1px solid ${canUnlockNow ? `${color}66` : "rgba(255,255,255,0.1)"}`,
                borderRadius: "3px",
                padding: "0.1rem 0.35rem",
                letterSpacing: "0.05em",
              }}
            >
              {skill.cost} SP
            </span>
          )}
        </div>
      </div>

      <p
        style={{
          fontSize: "0.55rem",
          color: "rgba(255,255,255,0.5)",
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          margin: "0 0 0.5rem 0",
          lineHeight: 1.5,
        }}
      >
        {skill.desc}
      </p>

      <div
        style={{
          fontSize: "0.5rem",
          color: `${color}bb`,
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          marginBottom: canUnlockNow && !isUnlocked ? "0.6rem" : 0,
        }}
      >
        ⊕ {skill.effect}
      </div>

      {canUnlockNow && !isUnlocked && (
        <button
          onClick={() => onUnlock(skill.id)}
          disabled={unlocking}
          style={{
            width: "100%",
            padding: "0.3rem",
            background: `${color}18`,
            border: `1px solid ${color}88`,
            color,
            fontFamily: "monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.12em",
            cursor: unlocking ? "wait" : "pointer",
            borderRadius: "3px",
            opacity: unlocking ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {unlocking ? "UNLOCKING..." : `UNLOCK — ${skill.cost} SP`}
        </button>
      )}
    </div>
  );
}

export default function SkillTree() {
  const { isAuthenticated, isLoading } = useAuth();
  const [state, setState] = useState<SkillState | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const slot = parseInt(localStorage.getItem("sm_slot") ?? "0", 10);

  const fetchState = useCallback(async () => {
    setFetching(true);
    try {
      const r = await apiFetch(`/api/skills?slot=${slot}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load skills");
      const d = await r.json();
      setState({ unlocked: d.unlocked ?? [], skillPoints: d.skillPoints ?? 0 });
    } catch (e: any) {
      setError(e?.message ?? "Error loading skills");
    } finally {
      setFetching(false);
    }
  }, [slot]);

  useEffect(() => {
    if (isAuthenticated) void fetchState();
  }, [isAuthenticated, fetchState]);

  const handleUnlock = useCallback(
    async (skillId: string) => {
      if (unlocking) return;
      setUnlocking(skillId);
      try {
        const r = await apiFetch("/api/skills/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ slot, skillId }),
        });
        const d = await r.json();
        if (!r.ok) {
          const msg =
            d.error === "Insufficient skill points"
              ? `Not enough SP — need ${d.required}, have ${d.available}`
              : d.error ?? "Unlock failed";
          setToast(msg);
          setTimeout(() => setToast(null), 3000);
          return;
        }
        setState({ unlocked: d.unlocked, skillPoints: d.skillPoints });
        const skill = SKILL_CATALOG.find(s => s.id === skillId);
        setToast(`✓ ${skill?.name ?? skillId} unlocked`);
        setTimeout(() => setToast(null), 2500);
      } catch {
        setToast("Network error — try again");
        setTimeout(() => setToast(null), 3000);
      } finally {
        setUnlocking(null);
      }
    },
    [slot, unlocking],
  );

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInPage />;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 50% 0%, rgba(60,30,90,0.35) 0%, transparent 70%), #060708",
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1rem" }}>
        <Link
          href="/office"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.7rem",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
            textDecoration: "none",
            marginBottom: "1rem",
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} /> OFFICE
        </Link>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.5rem",
                fontFamily: "monospace",
                letterSpacing: "0.3em",
                color: "rgba(255,136,255,0.5)",
                margin: "0 0 0.2rem 0",
              }}
            >
              CHARACTER
            </p>
            <h1
              style={{
                fontSize: "1.1rem",
                fontFamily: "monospace",
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.9)",
                margin: 0,
              }}
            >
              SKILL TREE
            </h1>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,136,255,0.4)",
              background: "rgba(255,136,255,0.08)",
              borderRadius: "5px",
              padding: "0.5rem 0.9rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.4rem",
                fontFamily: "monospace",
                letterSpacing: "0.2em",
                color: "rgba(255,136,255,0.6)",
                marginBottom: "0.1rem",
              }}
            >
              AVAILABLE
            </div>
            <div
              style={{
                fontSize: "1.3rem",
                fontFamily: "monospace",
                color: "#ff88ff",
                lineHeight: 1,
              }}
            >
              {fetching ? "—" : (state?.skillPoints ?? 0)}
              <span
                style={{
                  fontSize: "0.6rem",
                  letterSpacing: "0.1em",
                  marginLeft: "0.25rem",
                  opacity: 0.7,
                }}
              >
                SP
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              border: "1px solid rgba(255,100,100,0.4)",
              background: "rgba(255,50,50,0.06)",
              padding: "0.6rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.6rem",
              fontFamily: "monospace",
              color: "#ff8888",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        {!fetching && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {SKILL_BRANCHES.map(branch => {
              const BranchIcon = BRANCH_ICON[branch];
              const color = BRANCH_COLOR[branch];
              const skills = getSkillsByBranch(branch);
              return (
                <section key={branch}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.75rem",
                      borderBottom: `1px solid ${color}22`,
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <BranchIcon style={{ width: 16, height: 16, color }} />
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        letterSpacing: "0.25em",
                        color,
                        fontWeight: 600,
                      }}
                    >
                      {branch}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: "0.65rem",
                    }}
                  >
                    {skills.map(skill => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        isUnlocked={(state?.unlocked ?? []).includes(skill.id)}
                        canUnlockNow={
                          canUnlock(skill.id, state?.unlocked ?? []) &&
                          (state?.skillPoints ?? 0) >= skill.cost
                        }
                        onUnlock={handleUnlock}
                        unlocking={unlocking === skill.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {fetching && !error && (
          <p
            style={{
              textAlign: "center",
              fontFamily: "monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.3)",
              marginTop: "3rem",
            }}
          >
            LOADING...
          </p>
        )}

        <div
          style={{
            marginTop: "2rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: "1rem",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "0.5rem",
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.2)",
              lineHeight: 1.7,
            }}
          >
            EARN SKILL POINTS (SP) by leveling up (+3 SP per level). Unlock skills
            from the top of each branch down. Effects apply immediately across the
            city.
          </p>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,20,25,0.95)",
            border: "1px solid rgba(255,136,255,0.4)",
            color: "#ff88ff",
            fontFamily: "monospace",
            fontSize: "0.65rem",
            letterSpacing: "0.1em",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            zIndex: 1000,
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
