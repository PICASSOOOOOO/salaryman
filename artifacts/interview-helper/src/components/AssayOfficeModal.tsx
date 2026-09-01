import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from "react";
import { RESOURCE_CATALOG } from "../lib/resource-catalog";

interface PriceRow {
  resourceId: string;
  priceFiat: number;
  effectiveDate: string;
}

interface InvRow {
  resourceId: string;
  quantity: number;
}

interface Props {
  onClose: () => void;
  onSold: (fiat: number) => void;
  slot?: number;
}

export default function AssayOfficeModal({ onClose, onSold, slot = 0 }: Props) {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [statusMsg, setStatusMsg] = useState("");
  const [date, setDate] = useState("");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      apiFetch("/api/resources/prices", { credentials: "include" }).then(r => r.json()),
      apiFetch("/api/resources/inventory", { credentials: "include" }).then(r => r.json()),
    ]).then(([p, i]) => {
      setPrices(p.prices ?? []);
      setDate(p.date ?? "");
      setInventory(i.inventory ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleSell = async (resourceId: string) => {
    const inv = inventory.find(i => i.resourceId === resourceId);
    if (!inv || inv.quantity === 0) return;
    const qty = selectedQty[resourceId] ?? inv.quantity;
    if (qty < 1) return;

    setSelling(resourceId);
    setStatusMsg("");
    try {
      const r = await apiFetch("/api/resources/sell", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, quantity: qty, slot }),
      });
      const data = await r.json();
      if (data.ok) {
        const price = prices.find(p => p.resourceId === resourceId);
        const total = data.totalFiat ?? (price?.priceFiat ?? 0) * qty;
        setStatusMsg(`+ƒ${total.toLocaleString()} credited.`);
        onSold(total);
        refresh();
        setSelectedQty(q => ({ ...q, [resourceId]: 0 }));
      } else {
        setStatusMsg(data.error ?? "Sell failed.");
      }
    } catch {
      setStatusMsg("Network error.");
    } finally {
      setSelling(null);
    }
  };

  const rows = RESOURCE_CATALOG.map(def => {
    const priceRow = prices.find(p => p.resourceId === def.id);
    const invRow = inventory.find(i => i.resourceId === def.id);
    return { def, price: priceRow?.priceFiat ?? def.basePriceFiat, qty: invRow?.quantity ?? 0 };
  }).filter(r => r.qty > 0 || prices.length > 0);

  const ownedRows = rows.filter(r => r.qty > 0);
  const marketRows = rows.filter(r => r.qty === 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9200,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 560, maxWidth: "96vw", maxHeight: "90vh",
        background: "#080810",
        border: "1px solid rgba(255,200,50,0.3)",
        boxShadow: "0 0 60px rgba(255,200,50,0.06)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "1.2rem 1.6rem 0.8rem",
          borderBottom: "1px solid rgba(255,200,50,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "rgba(255,200,50,0.9)", fontSize: "0.9rem", letterSpacing: "0.2em" }}>
                THE ASSAY OFFICE
              </div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.48rem", letterSpacing: "0.1em", marginTop: "0.2rem" }}>
                COMMODITY BROKER · DOWNTOWN MARKET DISTRICT
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "1px solid rgba(255,60,60,0.3)",
                color: "rgba(255,60,60,0.7)", padding: "4px 10px",
                cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.6rem",
              }}
            >LEAVE [ESC]</button>
          </div>
          <div style={{
            marginTop: "0.6rem", color: "rgba(255,255,255,0.25)", fontSize: "0.5rem", letterSpacing: "0.08em",
          }}>
            "We buy what the Corp won't touch. Prices fluctuate daily — check the board before you haul."
          </div>
          {date && (
            <div style={{ color: "rgba(255,200,50,0.4)", fontSize: "0.45rem", letterSpacing: "0.1em", marginTop: "0.3rem" }}>
              TODAY'S RATES · {date}
            </div>
          )}
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "1rem 1.6rem" }}>
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.65rem", padding: "1rem 0" }}>Loading prices...</div>
          ) : (
            <>
              {ownedRows.length > 0 && (
                <>
                  <div style={{ color: "rgba(255,200,50,0.6)", fontSize: "0.5rem", letterSpacing: "0.15em", marginBottom: "0.5rem" }}>
                    YOUR INVENTORY
                  </div>
                  {ownedRows.map(({ def, price, qty }) => {
                    const selQty = selectedQty[def.id] ?? qty;
                    const totalEarned = price * selQty;
                    return (
                      <div key={def.id} style={{
                        background: "rgba(255,200,50,0.04)",
                        border: "1px solid rgba(255,200,50,0.15)",
                        padding: "0.7rem 0.9rem",
                        marginBottom: "0.4rem",
                        display: "flex", alignItems: "center", gap: "0.8rem",
                      }}>
                        <span style={{ fontSize: "1.3rem" }}>{def.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>{def.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.48rem", marginTop: "0.1rem" }}>
                            ƒ{price.toLocaleString()}/unit · you have ×{qty}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <input
                            type="number" min={1} max={qty}
                            value={selQty}
                            onChange={e => setSelectedQty(q => ({ ...q, [def.id]: Math.max(1, Math.min(qty, parseInt(e.target.value) || 1)) }))}
                            style={{
                              width: "3rem", background: "rgba(0,0,0,0.5)",
                              border: "1px solid rgba(255,255,255,0.15)",
                              color: "#fff", padding: "2px 4px", textAlign: "center",
                              fontFamily: "var(--font-sans)", fontSize: "0.6rem",
                            }}
                          />
                          <button
                            onClick={() => handleSell(def.id)}
                            disabled={selling === def.id}
                            style={{
                              background: selling === def.id ? "rgba(255,200,50,0.05)" : "rgba(255,200,50,0.15)",
                              border: "1px solid rgba(255,200,50,0.4)",
                              color: "rgba(255,200,50,0.9)", padding: "4px 10px",
                              cursor: selling === def.id ? "default" : "pointer",
                              fontFamily: "var(--font-sans)", fontSize: "0.58rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {selling === def.id ? "..." : `SELL ƒ${totalEarned.toLocaleString()}`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {ownedRows.length === 0 && (
                <div style={{
                  color: "rgba(255,255,255,0.3)", fontSize: "0.62rem",
                  padding: "1rem 0", textAlign: "center",
                }}>
                  No resources to sell. Explore wasteland zones and hold [E] near glowing nodes.
                </div>
              )}

              <div style={{
                marginTop: "1rem",
                color: "rgba(255,200,50,0.5)", fontSize: "0.5rem", letterSpacing: "0.15em", marginBottom: "0.5rem",
              }}>
                TODAY'S BUY PRICES
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
                {RESOURCE_CATALOG.map(def => {
                  const priceRow = prices.find(p => p.resourceId === def.id);
                  const price = priceRow?.priceFiat ?? def.basePriceFiat;
                  const delta = price - def.basePriceFiat;
                  const pct = Math.round((delta / def.basePriceFiat) * 100);
                  return (
                    <div key={def.id} style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      padding: "0.4rem 0.6rem",
                      display: "flex", alignItems: "center", gap: "0.4rem",
                    }}>
                      <span style={{ fontSize: "1rem" }}>{def.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.52rem", letterSpacing: "0.05em" }}>{def.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.44rem" }}>{def.zone.toUpperCase()}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#ffdd44", fontSize: "0.58rem" }}>ƒ{price.toLocaleString()}</div>
                        <div style={{ fontSize: "0.42rem", color: delta >= 0 ? "#4ade80" : "#f87171" }}>
                          {delta >= 0 ? "+" : ""}{pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {statusMsg && (
            <div style={{
              marginTop: "0.8rem",
              color: statusMsg.startsWith("+") ? "#4ade80" : "#f87171",
              fontSize: "0.65rem", letterSpacing: "0.08em",
            }}>
              {statusMsg}
            </div>
          )}
        </div>

        <div style={{
          padding: "0.7rem 1.6rem",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.2)", fontSize: "0.46rem", letterSpacing: "0.08em",
        }}>
          PRICES RESET DAILY · GAS-ZONE NODES PAY +0% BONUS · MAX 3 HARVESTERS PER NODE
        </div>
      </div>
    </div>
  );
}
