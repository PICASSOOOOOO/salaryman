import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch } from "@/lib/api-client";
import { FURNITURE_CATALOG } from "./worldInteriorData";
import {
  Loader2, MapPin, Lock, Unlock, Hammer, Check, ArrowLeft, Building2,
  HardHat, ShieldCheck, X, Trash2, RotateCw,
} from "lucide-react";

const FONT = "'JetBrains Mono', 'Courier New', monospace";
const CRT = "#38bdf8";
const panel: React.CSSProperties = {
  background: "rgba(10,12,18,0.85)",
  border: "1px solid rgba(56,189,248,0.18)",
  borderRadius: 12,
};

type PlotStatus = "unclaimed" | "claimed" | "open" | "building" | "built";
interface Project {
  id: number;
  plotId: number;
  ownerId: string;
  buildingType: string;
  label: string;
  laborRequired: number;
  laborApplied: number;
  progress: number;
  priorityScore: number;
  status: string;
}
interface Plot {
  id: number;
  cityId: string;
  sector: string;
  zone: string;
  district: string;
  hamlet: string;
  commune: string;
  name: string;
  x: number; y: number; w: number; h: number;
  status: PlotStatus;
  claimedBy: string | null;
  approvedBy: string | null;
  buildingId: string | null;
  project: Project | null;
}

const BUILDING_TYPES = ["studio", "home", "retail", "office", "warehouse", "tower", "penthouse", "hq"] as const;
type DesignFurniture = { furnitureId: string; variantId: string; gridX: number; gridY: number };
const DESIGN_W = 10;
const DESIGN_H = 7;

const STATUS_META: Record<PlotStatus, { label: string; color: string }> = {
  unclaimed: { label: "UNCLAIMED", color: "#94a3b8" },
  claimed: { label: "CLAIMED · AWAITING APPROVAL", color: "#f59e0b" },
  open: { label: "OPEN FOR CONSTRUCTION", color: "#34d399" },
  building: { label: "UNDER CONSTRUCTION", color: "#38bdf8" },
  built: { label: "BUILT", color: "#a78bfa" },
};

export default function LandRegistry() {
  const [, navigate] = useLocation();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [designPlot, setDesignPlot] = useState<Plot | null>(null);
  const { user } = useAuth();
  const myId = user?.id ? String(user.id) : null;

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/land/plots");
      if (!r.ok) throw new Error("Failed to load");
      const j = await r.json();
      setPlots(j.plots || []);
      setCanApprove(!!j.canApprove);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load land registry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (plotId: number, action: string, body?: unknown) => {
    setBusy(plotId);
    setErr(null);
    try {
      const r = await apiFetch(`/api/land/plots/${plotId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || `${action} failed`); return false; }
      await load();
      return true;
    } catch {
      setErr(`${action} failed`);
      return false;
    } finally {
      setBusy(null);
    }
  }, [load]);

  // Group plots: Sector › Zone › District › Hamlet › Commune.
  const tree = useMemo(() => {
    const out = new Map<string, Map<string, Map<string, Map<string, Map<string, Plot[]>>>>>();
    for (const p of plots) {
      const sec = out.get(p.sector) ?? new Map();
      out.set(p.sector, sec);
      const zone = sec.get(p.zone) ?? new Map();
      sec.set(p.zone, zone);
      const dist = zone.get(p.district) ?? new Map();
      zone.set(p.district, dist);
      const ham = dist.get(p.hamlet) ?? new Map();
      dist.set(p.hamlet, ham);
      const com = ham.get(p.commune) ?? [];
      ham.set(p.commune, com);
      com.push(p);
    }
    return out;
  }, [plots]);

  return (
    <div style={{ minHeight: "100vh", background: "#05070d", color: "#e4e4e7", fontFamily: FONT, padding: "20px 16px 80px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/world")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "rgba(56,189,248,0.7)", cursor: "pointer", fontFamily: FONT, fontSize: 12, padding: 0, marginBottom: 14 }}
        >
          <ArrowLeft className="w-4 h-4" /> WORLD
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <MapPin className="w-7 h-7" style={{ color: CRT }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1, margin: 0 }}>LAND REGISTRY</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(228,228,231,0.55)", lineHeight: 1.6, maxWidth: 680, margin: "0 0 8px" }}>
          The city is being rebuilt from the ruin. Claim a parcel, but nothing rises until
          the OWNER or a PICASSO admin opens that plot for construction. Then design it and
          rally a crew — debt-holders' projects are built first, and debtors work off what
          they owe on the line.
        </p>
        {canApprove && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", padding: "3px 8px", borderRadius: 6, marginBottom: 8 }}>
            <ShieldCheck className="w-3.5 h-3.5" /> APPROVAL AUTHORITY — you can open plots for construction
          </div>
        )}

        {err && (
          <div style={{ ...panel, padding: 10, borderColor: "rgba(248,113,113,0.4)", color: "#f87171", fontSize: 12, margin: "10px 0" }}>
            {err}
          </div>
        )}

        {loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: CRT }} />
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 22 }}>
            {[...tree.entries()].map(([sector, zones]) => (
              <section key={sector}>
                <h2 style={{ fontSize: 15, letterSpacing: 1.5, color: CRT, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Building2 className="w-4 h-4" /> {sector} <span style={{ fontSize: 10, color: "rgba(228,228,231,0.4)" }}>SECTOR</span>
                </h2>
                {[...zones.entries()].map(([zone, districts]) => (
                  <div key={zone} style={{ marginLeft: 6, marginTop: 8 }}>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: "rgba(56,189,248,0.8)", marginBottom: 6 }}>▸ {zone} ZONE</div>
                    {[...districts.entries()].map(([district, hamlets]) => (
                      <div key={district} style={{ marginLeft: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "rgba(228,228,231,0.5)", marginBottom: 6 }}>
                          {district} · {[...hamlets.keys()].join(" / ")}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                          {[...hamlets.entries()].flatMap(([hamlet, communes]) =>
                            [...communes.entries()].flatMap(([commune, ps]) =>
                              ps.map((p) => (
                                <PlotCard
                                  key={p.id}
                                  plot={p}
                                  hamlet={hamlet}
                                  commune={commune}
                                  busy={busy === p.id}
                                  canApprove={canApprove}
                                  mine={!!myId && p.claimedBy === myId}
                                  onClaim={() => act(p.id, "claim")}
                                  onRelease={() => act(p.id, "release")}
                                  onOpen={() => act(p.id, "open")}
                                  onClose={() => act(p.id, "close")}
                                  onDesign={() => setDesignPlot(p)}
                                  onWork={async () => {
                                    if (!p.project) return;
                                    setBusy(p.id);
                                    setErr(null);
                                    try {
                                      const r = await apiFetch(`/api/construction/${p.project.id}/work`, { method: "POST" });
                                      const j = await r.json().catch(() => ({}));
                                      if (!r.ok) setErr(j.error || "Shift failed");
                                      await load();
                                    } finally { setBusy(null); }
                                  }}
                                />
                              )),
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            ))}
            {plots.length === 0 && (
              <div style={{ ...panel, padding: 24, textAlign: "center", color: "rgba(228,228,231,0.5)" }}>
                No land parcels registered yet.
              </div>
            )}
          </div>
        )}
      </div>

      {designPlot && (
        <DesignModal
          plot={designPlot}
          onClose={() => setDesignPlot(null)}
          onSubmit={async (payload) => {
            const ok = await act(designPlot.id, "construct", payload);
            if (ok) setDesignPlot(null);
          }}
        />
      )}
    </div>
  );
}

function PlotCard(props: {
  plot: Plot; hamlet: string; commune: string; busy: boolean; canApprove: boolean; mine: boolean;
  onClaim: () => void; onRelease: () => void; onOpen: () => void; onClose: () => void;
  onDesign: () => void; onWork: () => void;
}) {
  const { plot, commune, busy, canApprove, mine } = props;
  const meta = STATUS_META[plot.status];
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, color: string) => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${color}55`, background: `${color}14`, color, cursor: busy ? "wait" : "pointer", fontFamily: FONT, fontSize: 11, width: "100%" }}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon} {label}
    </button>
  );

  return (
    <div style={{ ...panel, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{plot.name}</div>
        <div style={{ fontSize: 9, color: "rgba(228,228,231,0.4)" }}>{commune}</div>
      </div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: meta.color }}>{meta.label}</div>

      {plot.project && (plot.status === "building") && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(228,228,231,0.55)", display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>{plot.project.label} · {plot.project.status === "queued" ? "QUEUED" : "BUILDING"}</span>
            <span>{plot.project.progress}%</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${plot.project.progress}%`, height: "100%", background: CRT, transition: "width .3s" }} />
          </div>
          {plot.project.priorityScore > 0 && (
            <div style={{ fontSize: 9, color: "#f59e0b", marginTop: 3 }}>PRIORITY ƒ{plot.project.priorityScore.toLocaleString()} debt</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
        {plot.status === "unclaimed" && btn("Claim parcel", <MapPin className="w-3.5 h-3.5" />, props.onClaim, CRT)}
        {plot.status === "claimed" && mine && btn("Release claim", <X className="w-3.5 h-3.5" />, props.onRelease, "#f87171")}
        {plot.status === "claimed" && canApprove && btn("Open for construction", <Unlock className="w-3.5 h-3.5" />, props.onOpen, "#34d399")}
        {plot.status === "claimed" && !mine && !canApprove && (
          <div style={{ fontSize: 10, color: "rgba(228,228,231,0.4)", display: "flex", alignItems: "center", gap: 4 }}>
            <Lock className="w-3 h-3" /> Awaiting owner / Picasso approval
          </div>
        )}
        {plot.status === "open" && mine && btn("Design & build", <Hammer className="w-3.5 h-3.5" />, props.onDesign, "#34d399")}
        {plot.status === "open" && canApprove && btn("Revoke approval", <Lock className="w-3.5 h-3.5" />, props.onClose, "#f59e0b")}
        {plot.status === "open" && !mine && !canApprove && (
          <div style={{ fontSize: 10, color: "rgba(52,211,153,0.7)" }}>Open — the claimer may now build.</div>
        )}
        {plot.status === "building" && btn("Work a shift", <HardHat className="w-3.5 h-3.5" />, props.onWork, CRT)}
        {plot.status === "built" && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a78bfa" }}>
            <Check className="w-3.5 h-3.5" /> Building complete
          </div>
        )}
      </div>
    </div>
  );
}

function DesignModal(props: {
  plot: Plot;
  onClose: () => void;
  onSubmit: (payload: { buildingType: string; label: string; design: unknown }) => void;
}) {
  const [type, setType] = useState<string>("home");
  const [label, setLabel] = useState<string>("");
  const [selected, setSelected] = useState<string>(FURNITURE_CATALOG[0]?.id ?? "");
  const [placed, setPlaced] = useState<DesignFurniture[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const placeAt = (gx: number, gy: number) => {
    const occupied = placed.find((f) => f.gridX === gx && f.gridY === gy);
    if (occupied) {
      setPlaced((p) => p.filter((f) => f !== occupied));
      return;
    }
    const def = FURNITURE_CATALOG.find((f) => f.id === selected);
    if (!def) return;
    setPlaced((p) => [...p, { furnitureId: def.id, variantId: def.variants[0]?.id ?? "", gridX: gx, gridY: gy }]);
  };

  const colorFor = (furnitureId: string) =>
    FURNITURE_CATALOG.find((f) => f.id === furnitureId)?.variants[0]?.color ?? "rgb(90,90,95)";

  const submit = () => {
    setSubmitting(true);
    props.onSubmit({
      buildingType: type,
      label: label.trim() || `${type.toUpperCase()} on ${props.plot.name}`,
      design: { footprint: { w: DESIGN_W, h: DESIGN_H }, furniture: placed },
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }} onClick={props.onClose}>
      <div style={{ ...panel, padding: 18, maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto", fontFamily: FONT }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Hammer className="w-5 h-5" style={{ color: CRT }} /> DESIGN — {props.plot.name}
          </h2>
          <button onClick={props.onClose} style={{ background: "none", border: "none", color: "rgba(228,228,231,0.6)", cursor: "pointer" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <label style={{ fontSize: 10, color: "rgba(228,228,231,0.5)", letterSpacing: 1 }}>BUILDING TYPE</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 12px" }}>
          {BUILDING_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)}
              style={{ padding: "5px 9px", borderRadius: 7, fontFamily: FONT, fontSize: 11, cursor: "pointer",
                border: `1px solid ${type === t ? CRT : "rgba(255,255,255,0.12)"}`,
                background: type === t ? "rgba(56,189,248,0.14)" : "transparent",
                color: type === t ? CRT : "rgba(228,228,231,0.7)" }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 10, color: "rgba(228,228,231,0.5)", letterSpacing: 1 }}>NAME</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. The Ember Loft" maxLength={40}
          style={{ width: "100%", margin: "6px 0 14px", padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(56,189,248,0.2)", color: "#e4e4e7", fontFamily: FONT, fontSize: 13 }} />

        <label style={{ fontSize: 10, color: "rgba(228,228,231,0.5)", letterSpacing: 1 }}>FURNITURE — tap an item, then tap the floor to place (tap again to remove)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "6px 0 10px", maxHeight: 96, overflowY: "auto" }}>
          {FURNITURE_CATALOG.slice(0, 28).map((f) => (
            <button key={f.id} onClick={() => setSelected(f.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 6, fontFamily: FONT, fontSize: 10, cursor: "pointer",
                border: `1px solid ${selected === f.id ? CRT : "rgba(255,255,255,0.1)"}`,
                background: selected === f.id ? "rgba(56,189,248,0.12)" : "transparent", color: "rgba(228,228,231,0.8)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: f.variants[0]?.color ?? "#555" }} />
              {f.name}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${DESIGN_W}, 1fr)`, gap: 2, background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 8, padding: 6, marginBottom: 4 }}>
          {Array.from({ length: DESIGN_W * DESIGN_H }).map((_, i) => {
            const gx = i % DESIGN_W, gy = Math.floor(i / DESIGN_W);
            const here = placed.find((f) => f.gridX === gx && f.gridY === gy);
            return (
              <button key={i} onClick={() => placeAt(gx, gy)}
                style={{ aspectRatio: "1", borderRadius: 3, cursor: "pointer", border: "1px solid rgba(255,255,255,0.05)",
                  background: here ? colorFor(here.furnitureId) : "rgba(0,0,0,0.3)" }}
                title={here ? here.furnitureId : "empty"} />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "rgba(228,228,231,0.45)", marginBottom: 14 }}>
          <span>{placed.length} item{placed.length === 1 ? "" : "s"} placed</span>
          {placed.length > 0 && (
            <button onClick={() => setPlaced([])} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#f87171", cursor: "pointer", fontFamily: FONT, fontSize: 10 }}>
              <Trash2 className="w-3 h-3" /> CLEAR
            </button>
          )}
        </div>

        <button onClick={submit} disabled={submitting}
          style={{ width: "100%", padding: "11px", borderRadius: 9, border: "1px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.14)", color: "#34d399", cursor: submitting ? "wait" : "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />} BREAK GROUND
        </button>
      </div>
    </div>
  );
}
