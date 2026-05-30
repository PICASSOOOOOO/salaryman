import { useEffect, useState } from "react";
import { Link } from "wouter";

/**
 * /wallet — single-pane financial dashboard.
 *
 * Renders one trip to /api/wallet/snapshot. Nothing here issues writes —
 * this page is read-only by design (top-ups, Stripe management, gold
 * conversion happen on dedicated routes that we link out to). That keeps
 * the wallet page safe to refresh and easy to reason about.
 */

type Snapshot = {
  bank: { accounts: { id: string; kind: string; label: string; balance: number; currency: string }[]; fiatTotal: number; quarantineFiat: number; earnedFiat: number };
  debt: number;
  creditScore: number;
  employment: { status: string; title: string };
  pabloTax: {
    period: string;
    primeActive: boolean;
    accruedCents: number;
    billedCents: number;
    owedCents: number;
    primeBudgetCents: number;
    primeRemainingCents: number;
    nextBillIncrementCents: number;
    markupMultiplier: number;
  };
  recentLineItems: { id: number; kind: string; label: string; chargedCents: number; costBasisCents: number; createdAt: string }[];
  pendingInvoices: { id: number; source: string; amountCents: number; createdAt: string }[];
  rates: { fiatPerUsd: number; goldOzPerUsd: number };
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const f = (n: number) => `ƒ${n.toLocaleString()}`;

export default function Wallet() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/wallet/snapshot", { credentials: "include" });
        if (r.status === 401) { setErr("Login required."); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setSnap(await r.json());
      } catch (e) { setErr((e as Error).message); }
    };
    load();
    const t = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  if (err) return <Shell><p style={{ color: "#ff4488" }}>{err}</p></Shell>;
  if (!snap) return <Shell><p style={{ color: "#38bdf8" }}>LOADING WALLET…</p></Shell>;

  const { bank, pabloTax, recentLineItems, pendingInvoices, rates } = snap;
  const earnedUsd = bank.earnedFiat / rates.fiatPerUsd;
  const quarantineUsd = bank.quarantineFiat / rates.fiatPerUsd;
  const earnedGold = earnedUsd * rates.goldOzPerUsd;
  // Pablo Tax shown in fiat (ƒ). USD cents → ƒ via fiatPerUsd ($1 = ƒ1000).
  const usdCentsToFiat = (cents: number) => Math.round((cents / 100) * rates.fiatPerUsd);
  const accruedFiat = usdCentsToFiat(pabloTax.accruedCents);
  const billedFiat = usdCentsToFiat(pabloTax.billedCents);
  const owedFiat = usdCentsToFiat(pabloTax.owedCents);
  const primeRemainingFiat = usdCentsToFiat(pabloTax.primeRemainingCents);
  const nextBillIncrementFiat = usdCentsToFiat(pabloTax.nextBillIncrementCents);

  return (
    <Shell>
      <Header />

      <Section title="BANK">
        <Grid>
          <Stat label="EARNED ƒ (SPENDABLE)" value={f(bank.earnedFiat)} sub={`≈ $${earnedUsd.toFixed(2)} · ${earnedGold.toFixed(4)} oz`} tone="cyan" />
          <Stat label="QUARANTINED ƒ (LOCKED)" value={f(bank.quarantineFiat)} sub={`≈ $${quarantineUsd.toFixed(2)} · earn in-game to unlock equivalent spend`} tone="muted" />
          <Stat label="DEBT" value={snap.debt > 0 ? f(snap.debt) : "—"} tone={snap.debt > 0 ? "red" : "muted"} />
          <Stat label="CREDIT SCORE" value={String(snap.creditScore)} tone={snap.creditScore < 600 ? "red" : "cyan"} />
        </Grid>
        {bank.accounts.length > 0 && (
          <table style={tStyle}>
            <thead><tr><th style={th}>ACCOUNT</th><th style={th}>KIND</th><th style={thR}>BALANCE</th></tr></thead>
            <tbody>
              {bank.accounts.map((a) => (
                <tr key={a.id}><td style={td}>{a.label}</td><td style={td}>{a.kind}</td><td style={tdR}>{a.currency === "FIAT" ? f(a.balance) : a.balance.toLocaleString()} {a.currency !== "FIAT" && a.currency}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="EMPLOYMENT">
        <Grid>
          <Stat label="STATUS" value={snap.employment.status} tone="cyan" />
          <Stat label="TITLE" value={snap.employment.title} tone="cyan" />
        </Grid>
      </Section>

      <Section title={`PABLO TAX · ${pabloTax.period}`}>
        <Grid>
          <Stat label="PABLO PRIME" value={pabloTax.primeActive ? "ACTIVE" : "INACTIVE"} sub={pabloTax.primeActive ? `$149/mo pre-paid · ${f(primeRemainingFiat)} credit left` : "Pay-as-you-go only"} tone={pabloTax.primeActive ? "cyan" : "muted"} />
          <Stat label="ACCRUED THIS PERIOD" value={f(accruedFiat)} sub={`at ${pabloTax.markupMultiplier}× markup`} />
          <Stat label="BILLED" value={f(billedFiat)} sub={`next bill at ${f(nextBillIncrementFiat)} increments`} />
          <Stat label="OWED NOW" value={f(owedFiat)} tone={owedFiat > 0 ? "red" : "muted"} />
        </Grid>
        {!pabloTax.primeActive && (
          <p style={{ marginTop: 12, fontSize: ".7rem", color: "#fbbf24" }}>
            ⚠ NO PRIME · Every API call bills you at {pabloTax.markupMultiplier}× cost.{" "}
            <Link href="/pricing" style={{ color: "#38bdf8" }}>Upgrade to PABLO PRIME →</Link>
          </p>
        )}
      </Section>

      {pendingInvoices.length > 0 && (
        <Section title="⚠ PENDING INVOICES">
          <table style={tStyle}>
            <thead><tr><th style={th}>SOURCE</th><th style={thR}>AMOUNT</th><th style={th}>CREATED</th></tr></thead>
            <tbody>
              {pendingInvoices.map((inv) => (
                <tr key={inv.id}><td style={{ ...td, color: "#ff6644" }}>{inv.source.toUpperCase()}</td><td style={{ ...tdR, color: "#ff6644" }}>{usd(inv.amountCents)}</td><td style={td}>{new Date(inv.createdAt).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: ".65rem", color: "#fbbf24" }}>
            Connect a payment method to settle these. <Link href="/pricing" style={{ color: "#38bdf8" }}>Manage billing →</Link>
          </p>
        </Section>
      )}

      <Section title={`RECENT API CHARGES (${recentLineItems.length})`}>
        {recentLineItems.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: ".75rem" }}>No charges yet this period.</p>
        ) : (
          <table style={tStyle}>
            <thead><tr><th style={th}>TIME</th><th style={th}>KIND</th><th style={th}>LABEL</th><th style={thR}>COST</th><th style={thR}>CHARGED</th></tr></thead>
            <tbody>
              {recentLineItems.map((li) => (
                <tr key={li.id}>
                  <td style={td}>{new Date(li.createdAt).toLocaleTimeString()}</td>
                  <td style={td}>{li.kind}</td>
                  <td style={td}>{li.label}</td>
                  <td style={tdR}>{usd(li.costBasisCents)}</td>
                  <td style={{ ...tdR, color: "#fbbf24" }}>{usd(li.chargedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="CONVERSION RATES">
        <p style={{ fontSize: ".7rem", color: "#94a3b8", lineHeight: 1.7 }}>
          $1 USD = ƒ{rates.fiatPerUsd.toLocaleString()} = {rates.goldOzPerUsd} oz gold.<br />
          ƒ FIAT only — never ¥.
        </p>
      </Section>
    </Shell>
  );
}

function Header() {
  return (
    <div style={{ borderBottom: "1px solid rgba(56,189,248,.3)", paddingBottom: 16, marginBottom: 24 }}>
      <h1 style={{ margin: 0, color: "#ff2266", fontFamily: "'VT323',monospace", fontSize: "2.2rem", letterSpacing: ".1em" }}>WALLET</h1>
      <p style={{ margin: "4px 0 0", color: "#38bdf8", fontSize: ".7rem", letterSpacing: ".2em" }}>SALARYMAN · PICASSO.AI</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", padding: 24, fontFamily: "'VT323','Courier New',monospace" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28, padding: 16, border: "1px solid rgba(56,189,248,.2)", background: "rgba(15,15,25,.6)" }}>
      <h2 style={{ margin: "0 0 12px", color: "#38bdf8", fontSize: ".8rem", letterSpacing: ".2em" }}>{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>{children}</div>;
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "cyan" | "red" | "muted" }) {
  const c = tone === "cyan" ? "#38bdf8" : tone === "red" ? "#ff2266" : tone === "muted" ? "#64748b" : "#fbbf24";
  return (
    <div style={{ padding: 12, border: `1px solid ${c}33`, background: "rgba(0,0,0,.3)" }}>
      <div style={{ fontSize: ".55rem", letterSpacing: ".15em", color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", color: c, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: ".6rem", color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const tStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: ".7rem" };
const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(56,189,248,.3)", color: "#38bdf8", letterSpacing: ".1em", fontSize: ".6rem" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(56,189,248,.08)", color: "#e2e8f0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
