import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from "react";
import { RESOURCE_CATALOG } from "../lib/resource-catalog";

interface ResourceRow {
  resourceId: string;
  quantity: number;
}

interface Props {
  onClose: () => void;
  onSell: () => void;
  refreshTick?: number;
}

export default function ResourceInventoryPanel({ onClose, onSell, refreshTick }: Props) {
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/resources/inventory", { credentials: "include" })
      .then(r => r.json())
      .then(d => setRows(d.inventory ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [refreshTick]);

  const totalSlots = rows.reduce((acc, r) => acc + 1, 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9100,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 480, maxWidth: "95vw",
        background: "#0a0a0f",
        border: "1px solid rgba(56,189,248,0.3)",
        boxShadow: "0 0 40px rgba(56,189,248,0.08)",
        padding: "1.4rem 1.6rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <div style={{ color: "rgba(56,189,248,0.9)", fontSize: "0.85rem", letterSpacing: "0.18em" }}>RESOURCE INVENTORY</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.5rem", letterSpacing: "0.1em", marginTop: "0.2rem" }}>
              {totalSlots} TYPE{totalSlots !== 1 ? "S" : ""} HELD — SELL AT THE ASSAY OFFICE
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={onSell}
              style={{
                background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)",
                color: "rgba(56,189,248,0.85)", padding: "4px 12px", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em",
              }}
            >SELL</button>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "1px solid rgba(255,60,60,0.3)",
                color: "rgba(255,60,60,0.7)", padding: "4px 10px", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: "0.6rem",
              }}
            >CLOSE</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem", padding: "1rem 0" }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem", padding: "1.5rem 0", textAlign: "center" }}>
            No resources. Explore wasteland zones and press [E] near glowing nodes to harvest.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {rows.map(r => {
              const def = RESOURCE_CATALOG.find(d => d.id === r.resourceId);
              if (!def) return null;
              return (
                <div
                  key={r.resourceId}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "0.6rem 0.8rem",
                    display: "flex", alignItems: "center", gap: "0.6rem",
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>{def.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.6rem", letterSpacing: "0.1em" }}>{def.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.5rem", marginTop: "0.1rem" }}>
                      {def.zone.toUpperCase()} · ≈ƒ{def.basePriceFiat.toLocaleString()} ea
                    </div>
                  </div>
                  <div style={{
                    color: "#ffdd44", fontSize: "0.85rem", fontWeight: "bold",
                    minWidth: "2rem", textAlign: "right",
                  }}>×{r.quantity}</div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{
          marginTop: "1rem", paddingTop: "0.8rem",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.25)", fontSize: "0.48rem", letterSpacing: "0.08em",
        }}>
          WALK TO THE ASSAY OFFICE · DOWNTOWN MARKET DISTRICT · PRESS [E] TO SELL
        </div>
      </div>
    </div>
  );
}
