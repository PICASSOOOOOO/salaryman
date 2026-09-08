import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useStreamerMode } from "@/hooks/use-streamer-mode";
import { STREAMER_MASK, isStreamerMode } from "@/lib/streamer-mode";

/**
 * /wallet — full PLAYER PROFILE dashboard.
 *
 * One trip to /api/wallet/snapshot renders the whole character sheet:
 * identity, faction/employment, health, property + net worth, finances,
 * projects, and a synthesized bio. Read-only by design — writes (top-ups,
 * Stripe, gold conversion) live on dedicated routes we link out to.
 */

type Snapshot = {
  identity: {
    playerName: string;
    fullName: string | null;
    email: string | null;
    avatarColor: string;
    profileImageUrl: string | null;
    memberSince: string | null;
  };
  faction: {
    primary: { name: string; industry: string | null; role: string; title: string | null; salary: number } | null;
    companies: { orgId: number; name: string; industry: string | null; role: string; title: string | null; salary: number }[];
    totalSalary: number;
  };
  health: {
    hasSave: boolean;
    hp: number; maxHp: number;
    energy: number; hunger: number; thirst: number;
    level: number; exp: number;
    poisoned: boolean;
    lastPlayedAt: string | null;
  };
  property: {
    netWorth: number;
    businesses: { businessType: string; companyName: string | null; industry: string | null; companySize: string | null }[];
  };
  projects: { id: number; name: string; goal: string; status: string; progressPct: number; officeLabel: string; updatedAt: string }[];
  bio: { summary: string; memories: { content: string; kind: string; weight: number }[] };
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
const f = (n: number) => `ƒ${Math.round(n).toLocaleString()}`;

export default function Wallet() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const streamerMode = useStreamerMode();
  const maskUsd = (s: string) => (streamerMode ? STREAMER_MASK : s);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await apiFetch("/api/wallet/snapshot", { credentials: "include" });
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
  if (!snap) return <Shell><p style={{ color: "#38bdf8" }}>LOADING PROFILE…</p></Shell>;

  const { identity, faction, health, property, projects, bio, bank, pabloTax, recentLineItems, pendingInvoices, rates } = snap;

  // Money conversions.
  const earnedUsd = bank.earnedFiat / rates.fiatPerUsd;
  const quarantineUsd = bank.quarantineFiat / rates.fiatPerUsd;
  const earnedGold = earnedUsd * rates.goldOzPerUsd;
  const netWorthFiat = property.netWorth * rates.fiatPerUsd;
  const salaryFiat = faction.totalSalary * rates.fiatPerUsd;
  const usdCentsToFiat = (cents: number) => Math.round((cents / 100) * rates.fiatPerUsd);
  const accruedFiat = usdCentsToFiat(pabloTax.accruedCents);
  const billedFiat = usdCentsToFiat(pabloTax.billedCents);
  const owedFiat = usdCentsToFiat(pabloTax.owedCents);
  const primeRemainingFiat = usdCentsToFiat(pabloTax.primeRemainingCents);
  const nextBillIncrementFiat = usdCentsToFiat(pabloTax.nextBillIncrementCents);

  const hpPct = health.maxHp > 0 ? Math.round((health.hp / health.maxHp) * 100) : 0;

  return (
    <Shell>
      {/* ===== IDENTITY HERO ===== */}
      <ProfileHero identity={identity} employment={snap.employment} level={health.level} netWorthFiat={netWorthFiat} />

      {/* ===== BIO ===== */}
      <Section title="DOSSIER">
        <p style={{ fontSize: ".85rem", color: "#cbd5e1", lineHeight: 1.7, margin: 0 }}>{bio.summary}</p>
        {bio.memories.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            {bio.memories.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: ".7rem" }}>
                <span style={{ color: "#a78bfa", textTransform: "uppercase", fontSize: ".55rem", letterSpacing: ".1em", minWidth: 70 }}>{m.kind}</span>
                <span style={{ color: "#94a3b8" }}>{m.content}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ===== FACTION ===== */}
      <Section title="FACTION & EMPLOYMENT">
        {faction.primary ? (
          <>
            <Grid>
              <Stat label="ORGANIZATION" value={faction.primary.name} tone="violet" />
              <Stat label="RANK" value={(faction.primary.role || "—").toUpperCase()} sub={faction.primary.title || undefined} tone="cyan" />
              <Stat label="INDUSTRY" value={(faction.primary.industry || "UNSPECIFIED").toUpperCase()} tone="muted" />
              <Stat label="TOTAL SALARY" value={f(salaryFiat)} sub={`${faction.companies.length} ${faction.companies.length === 1 ? "company" : "companies"} · ≈ $${faction.totalSalary.toLocaleString()}`} tone="cyan" />
            </Grid>
            {faction.companies.length > 1 && (
              <table style={tStyle}>
                <thead><tr><th style={th}>COMPANY</th><th style={th}>ROLE</th><th style={th}>TITLE</th><th style={thR}>SALARY</th></tr></thead>
                <tbody>
                  {faction.companies.map((c) => (
                    <tr key={c.orgId}><td style={td}>{c.name}</td><td style={td}>{c.role}</td><td style={td}>{c.title || "—"}</td><td style={tdR}>{f(c.salary * rates.fiatPerUsd)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p style={{ color: "#64748b", fontSize: ".8rem" }}>UNAFFILIATED · No active organization. <Link href="/orgs" style={{ color: "#38bdf8" }}>Join or found one →</Link></p>
        )}
      </Section>

      {/* ===== HEALTH ===== */}
      <Section title="VITALS">
        {health.hasSave ? (
          <>
            <Grid>
              <Stat label="HEALTH" value={`${health.hp}/${health.maxHp}`} sub={`${hpPct}%${health.poisoned ? " · ☣ POISONED" : ""}`} tone={health.poisoned || hpPct < 35 ? "red" : "cyan"} />
              <Stat label="LEVEL" value={String(health.level)} sub={`${health.exp.toLocaleString()} XP`} tone="violet" />
              <Stat label="ENERGY" value={`${Math.round(health.energy)}%`} tone={health.energy < 25 ? "red" : "default"} />
              <Stat label="HUNGER / THIRST" value={`${Math.round(health.hunger)}% / ${Math.round(health.thirst)}%`} tone={health.hunger < 25 || health.thirst < 25 ? "red" : "muted"} />
            </Grid>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <Bar label="HP" pct={hpPct} color={health.poisoned || hpPct < 35 ? "#ff2266" : "#38bdf8"} />
              <Bar label="ENERGY" pct={Math.round(health.energy)} color="#fbbf24" />
              <Bar label="HUNGER" pct={Math.round(health.hunger)} color="#84cc16" />
              <Bar label="THIRST" pct={Math.round(health.thirst)} color="#22d3ee" />
            </div>
            {health.lastPlayedAt && <p style={{ marginTop: 10, fontSize: ".6rem", color: "#64748b" }}>Last active {new Date(health.lastPlayedAt).toLocaleString()}</p>}
          </>
        ) : (
          <p style={{ color: "#64748b", fontSize: ".8rem" }}>No active save. <Link href="/office" style={{ color: "#38bdf8" }}>Enter your office →</Link> to start tracking vitals.</p>
        )}
      </Section>

      {/* ===== PROPERTY & NET WORTH ===== */}
      <Section title="PROPERTY & NET WORTH">
        <Grid>
          <Stat label="NET WORTH" value={f(netWorthFiat)} sub={maskUsd(`≈ $${property.netWorth.toLocaleString()} · ${(property.netWorth * rates.goldOzPerUsd).toFixed(4)} oz`)} tone="violet" />
          <Stat label="REGISTERED VENTURES" value={String(property.businesses.length)} tone="cyan" />
          <Stat label="SPENDABLE ƒ" value={f(bank.earnedFiat)} sub={maskUsd(`≈ $${earnedUsd.toFixed(2)}`)} tone="cyan" />
          <Stat label="DEBT" value={snap.debt > 0 ? f(snap.debt) : "—"} tone={snap.debt > 0 ? "red" : "muted"} />
        </Grid>
        {property.businesses.length > 0 && (
          <table style={tStyle}>
            <thead><tr><th style={th}>NAME</th><th style={th}>TYPE</th><th style={th}>INDUSTRY</th><th style={th}>SIZE</th></tr></thead>
            <tbody>
              {property.businesses.map((b, i) => (
                <tr key={i}><td style={td}>{b.companyName || "—"}</td><td style={td}>{b.businessType.toUpperCase()}</td><td style={td}>{b.industry || "—"}</td><td style={td}>{b.companySize || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ===== FINANCES ===== */}
      <Section title="BANCO OMBRA · FINANCES">
        <Grid>
          <Stat label="EARNED ƒ (SPENDABLE)" value={f(bank.earnedFiat)} sub={maskUsd(`≈ $${earnedUsd.toFixed(2)} · ${earnedGold.toFixed(4)} oz`)} tone="cyan" />
          <Stat label="QUARANTINED ƒ (LOCKED)" value={f(bank.quarantineFiat)} sub={maskUsd(`≈ $${quarantineUsd.toFixed(2)} · earn in-game to unlock`)} tone="muted" />
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

      {/* ===== PROJECTS ===== */}
      <Section title={`PROJECTS (${projects.length})`}>
        {projects.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: ".8rem" }}>No ventures yet. <Link href="/projects" style={{ color: "#38bdf8" }}>Start one →</Link></p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {projects.map((p) => (
              <div key={p.id} style={{ padding: 14, border: "1px solid rgba(167,139,250,.25)", background: "rgba(0,0,0,.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ color: "#e2e8f0", fontSize: "1rem" }}>{p.name}</span>
                  <span style={{ fontSize: ".55rem", letterSpacing: ".1em", color: statusColor(p.status), textTransform: "uppercase" }}>{p.status}</span>
                </div>
                {p.goal && <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 4, lineHeight: 1.5 }}>{p.goal}</div>}
                <Bar label="" pct={p.progressPct} color={statusColor(p.status)} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".55rem", color: "#64748b", marginTop: 6 }}>
                  <span>{p.officeLabel || "NO OFFICE"}</span>
                  <span>{p.progressPct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ===== PABLO TAX ===== */}
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

function statusColor(status: string): string {
  switch (status) {
    case "live": return "#22c55e";
    case "building": return "#fbbf24";
    case "review": return "#38bdf8";
    case "paused": return "#64748b";
    default: return "#a78bfa";
  }
}

function ProfileHero({ identity, employment, level, netWorthFiat }: {
  identity: Snapshot["identity"];
  employment: Snapshot["employment"];
  level: number;
  netWorthFiat: number;
}) {
  const initial = (identity.playerName || "A").charAt(0).toUpperCase();
  const streamerMode = isStreamerMode();
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid rgba(56,189,248,.3)", paddingBottom: 20, marginBottom: 28 }}>
      <div style={{
        width: 84, height: 84, flexShrink: 0, borderRadius: 4,
        background: identity.avatarColor, color: "#0a0a0f",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)", fontSize: "3rem",
        boxShadow: `0 0 24px ${identity.avatarColor}66`,
        overflow: "hidden",
      }}>
        {identity.profileImageUrl
          ? <img src={identity.profileImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initial}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 style={{ margin: 0, color: "#ff2266", fontFamily: "var(--font-sans)", fontSize: "2.4rem", letterSpacing: ".08em", lineHeight: 1 }}>{identity.playerName}</h1>
        <p style={{ margin: "6px 0 0", color: "#38bdf8", fontSize: ".72rem", letterSpacing: ".15em" }}>
          {employment.status} · {employment.title.toUpperCase()} · LVL {level}
        </p>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: ".62rem" }}>
          {[identity.fullName, streamerMode ? STREAMER_MASK : identity.email].filter(Boolean).join(" · ") || "SALARYMAN · PICASSO.AI"}
          {identity.memberSince && ` · since ${new Date(identity.memberSince).toLocaleDateString()}`}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: ".55rem", letterSpacing: ".15em", color: "#94a3b8" }}>NET WORTH</div>
        <div style={{ fontSize: "1.8rem", color: "#a78bfa", fontFamily: "var(--font-sans)", lineHeight: 1 }}>{f(netWorthFiat)}</div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", padding: 24, fontFamily: "var(--font-sans)" }}>
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

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "cyan" | "red" | "muted" | "violet" }) {
  const c = tone === "cyan" ? "#38bdf8" : tone === "red" ? "#ff2266" : tone === "muted" ? "#64748b" : tone === "violet" ? "#a78bfa" : "#fbbf24";
  return (
    <div style={{ padding: 12, border: `1px solid ${c}33`, background: "rgba(0,0,0,.3)" }}>
      <div style={{ fontSize: ".55rem", letterSpacing: ".15em", color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", color: c, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: ".6rem", color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      {label && <div style={{ fontSize: ".5rem", letterSpacing: ".1em", color: "#64748b", marginBottom: 2 }}>{label}</div>}
      <div style={{ height: 8, background: "rgba(255,255,255,.06)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${clamped}%`, height: "100%", background: color, transition: "width .3s" }} />
      </div>
    </div>
  );
}

const tStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: ".7rem" };
const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(56,189,248,.3)", color: "#38bdf8", letterSpacing: ".1em", fontSize: ".6rem" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(56,189,248,.08)", color: "#e2e8f0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
