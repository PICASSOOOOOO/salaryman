import { apiFetch } from '@/lib/api-client';
import { useCallback, useEffect, useState } from "react";

// Server-authoritative crafting, available to EVERY player (no faction gate).
// Recipes, requirements and craft actions all come from /api/items/* — this
// panel is a thin renderer over the server's crafting catalog + the player's
// two material ledgers (harvested resources + stackable inventory materials).

interface RecipeInput {
  kind: "resource" | "item";
  id: string;
  qty: number;
  name: string;
  icon: string;
}
interface RecipeOutput {
  itemId: string;
  qty: number;
  name: string;
  icon: string;
  type: string;
  stackable: boolean;
}
interface Recipe {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  category: "refine" | "gear";
  inputs: RecipeInput[];
  output: RecipeOutput;
}

interface Props {
  slot: number;
  onClose: () => void;
  /** Called after a successful craft so the host can refresh HUD/inventory. */
  onCrafted?: () => void;
}

const CYAN = "rgba(56,189,248";
const VT2: React.CSSProperties = { fontFamily: "var(--font-sans)" };
const MONO: React.CSSProperties = { fontFamily: "var(--font-sans)" };

const CATEGORY_LABEL: Record<Recipe["category"], string> = {
  refine: "REFINE — HARVEST → MATERIALS",
  gear: "FABRICATE — MATERIALS → GEAR",
};

export default function CraftingPanel({ slot, onClose, onCrafted }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [resources, setResources] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rr, res, inv] = await Promise.all([
        apiFetch("/api/items/recipes", { credentials: "include" }),
        apiFetch("/api/resources/inventory", { credentials: "include" }),
        apiFetch(`/api/items/inventory?slot=${slot}`, { credentials: "include" }),
      ]);
      const rj = rr.ok ? await rr.json() : { recipes: [] };
      const sj = res.ok ? await res.json() : { inventory: [] };
      const ij = inv.ok ? await inv.json() : { rows: [] };
      setRecipes(Array.isArray(rj.recipes) ? rj.recipes : []);
      const resMap: Record<string, number> = {};
      for (const row of sj.inventory ?? []) resMap[row.resourceId] = (resMap[row.resourceId] ?? 0) + (row.quantity ?? 0);
      setResources(resMap);
      const itemMap: Record<string, number> = {};
      for (const row of ij.rows ?? []) itemMap[row.itemId] = (itemMap[row.itemId] ?? 0) + (row.quantity ?? 0);
      setItems(itemMap);
    } catch {
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [slot]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  const have = (inp: RecipeInput) => (inp.kind === "resource" ? resources[inp.id] : items[inp.id]) ?? 0;
  const canCraft = (r: Recipe) => r.inputs.every((inp) => have(inp) >= inp.qty);

  const doCraft = async (r: Recipe) => {
    if (busy) return;
    setBusy(r.id);
    setMsg(null);
    try {
      const resp = await apiFetch("/api/items/craft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: r.id, slot }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok) {
        const o = j.output ?? r.output;
        setMsg(`✓ CRAFTED ${o.icon ?? ""} ${o.name ?? r.output.name}${o.qty > 1 ? ` ×${o.qty}` : ""}`);
        await refresh();
        onCrafted?.();
      } else {
        setMsg(`✗ ${j.error ?? "Craft failed"}`);
      }
    } catch {
      setMsg("✗ Network error");
    } finally {
      setBusy(null);
    }
  };

  const categories: Recipe["category"][] = ["refine", "gear"];

  return (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.93)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 360 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...MONO, width: 600, maxWidth: "95vw", maxHeight: "82vh", overflow: "auto", border: `1px solid ${CYAN},.4)`, background: "rgba(0,6,2,.98)", padding: "1.2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".6rem" }}>
          <div>
            <div style={{ ...VT2, fontSize: "1.6rem", color: "#7dd3fc", letterSpacing: ".18em" }}>CRAFTING BENCH</div>
            <div style={{ fontSize: ".44rem", color: `${CYAN},.4)`, letterSpacing: ".1em", marginTop: ".2rem" }}>
              TURN HARVESTED RESOURCES + MATERIALS INTO USEFUL GEAR · OPEN TO ALL
            </div>
          </div>
          <button onClick={onClose} style={{ ...VT2, background: "none", border: "1px solid rgba(255,60,60,.3)", color: "rgba(255,60,60,.7)", padding: "2px 10px", cursor: "pointer", fontSize: "1rem" }}>ESC</button>
        </div>

        {msg && (
          <div style={{ fontSize: ".7rem", padding: ".4rem .5rem", marginBottom: ".6rem", border: `1px solid ${CYAN},.25)`, color: msg.startsWith("✓") ? "#7dd3fc" : "#ff6b6b" }}>{msg}</div>
        )}

        {loading ? (
          <div style={{ color: `${CYAN},.4)`, fontSize: ".7rem", padding: "1.5rem 0" }}>Loading recipes…</div>
        ) : recipes.length === 0 ? (
          <div style={{ color: `${CYAN},.4)`, fontSize: ".7rem", padding: "1.5rem 0", textAlign: "center" }}>No recipes available.</div>
        ) : (
          categories.map((cat) => {
            const list = recipes.filter((r) => r.category === cat);
            if (list.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: ".8rem" }}>
                <div style={{ fontSize: ".5rem", color: `${CYAN},.5)`, letterSpacing: ".14em", margin: ".4rem 0 .35rem" }}>{CATEGORY_LABEL[cat]}</div>
                {list.map((r) => {
                  const ok = canCraft(r);
                  const crafting = busy === r.id;
                  return (
                    <div key={r.id} style={{ border: `1px solid ${CYAN},.2)`, padding: ".6rem", marginBottom: ".4rem", opacity: crafting ? 0.6 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...VT2, fontSize: "1.15rem", color: "#7dd3fc" }}>
                            {r.icon} {r.name}
                            <span style={{ fontSize: ".7rem", color: `${CYAN},.45)`, marginLeft: ".4rem" }}>→ {r.output.icon} {r.output.name}{r.output.qty > 1 ? ` ×${r.output.qty}` : ""}</span>
                          </div>
                          <div style={{ fontSize: ".5rem", color: `${CYAN},.4)`, marginTop: ".15rem" }}>{r.blurb}</div>
                          <div style={{ fontSize: ".5rem", marginTop: ".25rem", display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
                            {r.inputs.map((inp) => {
                              const h = have(inp);
                              const enough = h >= inp.qty;
                              return (
                                <span key={inp.kind + inp.id} style={{ color: enough ? "rgba(125,211,252,.7)" : "#ff8585" }}>
                                  {inp.icon} {inp.name} {h}/{inp.qty}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          onClick={() => doCraft(r)}
                          disabled={!ok || crafting}
                          style={{
                            ...VT2, flexShrink: 0, padding: ".4rem .9rem",
                            background: ok ? "rgba(56,189,248,.1)" : "transparent",
                            border: `1px solid ${ok ? `${CYAN},.5)` : `${CYAN},.15)`}`,
                            color: ok ? "#7dd3fc" : `${CYAN},.25)`,
                            cursor: ok && !crafting ? "pointer" : "default", fontSize: ".95rem",
                          }}
                        >
                          {crafting ? "…" : "CRAFT"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        <div style={{ fontSize: ".42rem", color: `${CYAN},.3)`, letterSpacing: ".08em", marginTop: ".6rem" }}>
          BATTERIES, FUEL &amp; ELECTRICITY ARE PABLO-MONOPOLY — NOT CRAFTABLE.
        </div>
      </div>
    </div>
  );
}
