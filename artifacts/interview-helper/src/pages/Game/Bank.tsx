import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Landmark, ArrowLeftRight, ChevronRight, Receipt, ShieldCheck, Coins,
  PiggyBank, CreditCard, TrendingUp, Lock, Loader2, Bitcoin, Globe, Gauge, FileWarning,
} from "lucide-react";
import InstitutionCutscene from "@/components/InstitutionCutscene";
import { apiFetch, clearStableRequestIds, stableRequestId } from "@/lib/api-client";
import { SUPPORTED_CURRENCIES, setLiveRates, getCityCurrencyCode, getCityCostMultipliers } from "@/lib/currency";
import { useCurrency } from "@/hooks/use-currency";
import { getActiveCityId, hydrateActiveCityFromSave } from "@/lib/city-defs";

/**
 * Banking — full retail bank under Go to Work, also reachable in-world via
 * any branch kiosk. State is persisted server-side via /api/economy/bank/*.
 * First visit auto-plays a first-person teller cutscene (skippable, once).
 */

type Account = {
  id: number;
  userId: string;
  kind: string;
  label: string;
  balance: number;
  currency: string;
  apyBps: number;
};
type Tx = {
  id: number;
  userId: string;
  accountId: number;
  counterpartyAccountId: number | null;
  kind: string;
  description: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};
type FiatTopupPack = { id: string; fiat: number; usdCents: number };
type FiatTopup = {
  stripeSessionId: string;
  fiatAmount: number;
  amountCents: number;
  status: "pending" | "completed" | "failed" | "cancelled";
  createdAt: string;
};

const fmtFiat = (n: number) => `ƒ${Math.round(n).toLocaleString("en-US")}`;
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const accountNumber = (a: Account) =>
  a.kind === "vault" ? `GLD-V${a.id}` : `••${String(a.id).padStart(4, "0").slice(-4)}`;

const TX_TONE: Record<string, string> = {
  deposit:  "text-emerald-300",
  withdraw: "text-rose-300",
  transfer: "text-cyan-300",
  fee:      "text-amber-300",
  interest: "text-emerald-300",
  payroll:  "text-emerald-300",
};

type Tab = "overview" | "ledger" | "transfer" | "finance" | "credit" | "statements" | "cards";

type MarketIndex = {
  btcUsd: number;
  multiplier: number;
  asOf: number;
  source: string;
  conversion: { usdToFiat: number; usdToGoldOz: number; btcToFiat: number; btcToGoldOz: number };
  fx?: Record<string, number>;
  cityMultipliers?: Record<string, { labor: number; property: number }>;
};
type CreditScore = {
  score: number;
  tier: string;
  apr: number;
  priceMult: number;
  actions?: { label: string; delta: number }[];
};
type LoanEligibility = {
  score: number;
  tier: string;
  hasIncome: boolean;
  monthlyIncomeEstimate: number;
  maxLoanAmount: number | null;
  eligible: boolean;
  reason: string | null;
};
type CreditPlan =
  | { active: true; balance: number; principal: number; apr: number; installment: number; term: number; paid: number; missed: number; nextDueAt: string | null; overdue: boolean; defaultsAfter: number }
  | { active: false; debt: number; score: number; apr: number; quotes: { term: number; installment: number; total: number }[] };

// Approx BTC circulating supply (~19.9M coins). The "money supply" cap is a
// FLAVOR readout only — Banco Ombra pegs the total fiat float to BTC supply ×99.
const BTC_CIRCULATING_SUPPLY = 19_900_000;
const MONEY_SUPPLY_MULT = 99;

const CUTSCENE_KEY = "salaryman.bank.intro.seen.v1";

/* First-person teller intro. Medium shot framing — the user sees the bank
   counter from their own POV. Skippable and remembered locally. */
const BANK_CUTSCENE = [
  { speaker: "TELLER · MIRA", line: "Welcome to Banco Ombra. Place your palm on the scanner — there we go." },
  { speaker: "TELLER · MIRA", line: "Three accounts seeded for you: a checking, a high-yield savings at 4.25% APY, and a small bullion vault." },
  { speaker: "TELLER · MIRA", line: "Transfers between your accounts are instant and free. External wires settle on the BTC ledger." },
  { speaker: "TELLER · MIRA", line: "If you ever need me, every branch kiosk in the city routes back here. Good luck out there." },
];

export default function GameBank() {
  hydrateActiveCityFromSave();
  const [, navigate] = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    return new URLSearchParams(window.location.search).get("tab") === "finance" ? "finance" : "overview";
  });
  const [toast, setToast] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [topupPacks, setTopupPacks] = useState<FiatTopupPack[]>([]);
  const [topups, setTopups] = useState<FiatTopup[]>([]);
  const [topupBusy, setTopupBusy] = useState<string | null>(null);
  const [topupNotice, setTopupNotice] = useState<string>("");
  const [showCutscene, setShowCutscene] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(CUTSCENE_KEY);
  });

  // Real-world display currency (secondary-currency preference). Selecting a
  // currency converts the market readouts live and is remembered (sm_currency).
  const { code: curCode, info: cur, setCurrency } = useCurrency();
  const localCode = getCityCurrencyCode(getActiveCityId());

  // BTC / FX market index (BTC-pegged economy spine).
  const [market, setMarket] = useState<MarketIndex | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/real-estate/market-index");
        if (!r.ok) return;
        const j = (await r.json()) as MarketIndex;
        if (!alive) return;
        setLiveRates(j.fx);
        setMarket(j);
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Credit dossier: score, loan eligibility odds, active plan / debt.
  const [credit, setCredit] = useState<CreditScore | null>(null);
  const [loan, setLoan] = useState<LoanEligibility | null>(null);
  const [plan, setPlan] = useState<CreditPlan | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setCreditLoading(true);
      try {
        const [sRes, lRes, pRes] = await Promise.all([
          apiFetch("/api/credit/score"),
          apiFetch("/api/credit/loan/eligibility"),
          apiFetch("/api/credit/plan"),
        ]);
        if (!alive) return;
        if (sRes.ok) setCredit(await sRes.json());
        if (lRes.ok) setLoan(await lRes.json());
        if (pRes.ok) setPlan(await pRes.json());
      } catch { /* ignore */ }
      finally { if (alive) setCreditLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [accRes, txRes] = await Promise.all([
        fetch("/api/economy/bank/accounts", { credentials: "include" }),
        fetch("/api/economy/bank/transactions?limit=200", { credentials: "include" }),
      ]);
      if (accRes.status === 401) {
        navigate("/login?next=/game/bank");
        return;
      }
      if (!accRes.ok) throw new Error(await accRes.text());
      const accData = await accRes.json();
      setAccounts(accData.accounts ?? []);
      if (txRes.ok) {
        const txData = await txRes.json();
        setTx(txData.transactions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bank");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void refresh(); }, [refresh]);
  const refreshTopups = useCallback(async () => {
    const [packsResponse, historyResponse] = await Promise.all([
      apiFetch("/api/stripe/fiat-topup-packs"),
      apiFetch("/api/stripe/topup-history", { credentials: "include" }),
    ]);
    if (packsResponse.ok) setTopupPacks((await packsResponse.json()).packs ?? []);
    if (historyResponse.ok) {
      const history = (await historyResponse.json()).history ?? [];
      setTopups(history);
      return history as FiatTopup[];
    }
    return [] as FiatTopup[];
  }, []);
  useEffect(() => { void refreshTopups(); }, [refreshTopups]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnState = params.get("topup");
    const sessionId = params.get("session_id");
    if (returnState) clearStableRequestIds("fiat-topup");
    if (returnState === "cancel") {
      setTopupNotice("TOP-UP CANCELLED — NO FIAT WAS CREDITED.");
      return;
    }
    if (returnState !== "return" || !sessionId) return;
    let cancelled = false;
    let attempts = 0;
    setTopupNotice("PAYMENT RECEIVED BY STRIPE — WAITING FOR SETTLEMENT CONFIRMATION.");
    const poll = async () => {
      attempts += 1;
      try {
        const history = await refreshTopups();
        const row = history.find((entry) => entry.stripeSessionId === sessionId);
        if (cancelled) return;
        if (row?.status === "completed") {
          setTopupNotice(`TOP-UP COMPLETE — ƒ${row.fiatAmount.toLocaleString()} CREDITED.`);
          void refresh();
          return;
        }
        if (row?.status === "failed") {
          setTopupNotice("PAYMENT FAILED — NO FIAT WAS CREDITED.");
          return;
        }
        if (row?.status === "cancelled") {
          setTopupNotice("TOP-UP CANCELLED — NO FIAT WAS CREDITED.");
          return;
        }
      } catch { /* keep polling a delayed webhook */ }
      if (!cancelled && attempts < 20) window.setTimeout(poll, 1500);
      else if (!cancelled) setTopupNotice("PAYMENT IS STILL PENDING. FIAT WILL APPEAR AFTER STRIPE CONFIRMS SETTLEMENT.");
    };
    void poll();
    return () => { cancelled = true; };
  }, [refresh, refreshTopups]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const totalAssets = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const txByAccount = useMemo(() => {
    const m = new Map<number, Tx[]>();
    for (const t of tx) {
      if (!m.has(t.accountId)) m.set(t.accountId, []);
      m.get(t.accountId)!.push(t);
    }
    return m;
  }, [tx]);

  const transfer = async (from: number, to: number, amount: number, memo: string) => {
    if (from === to || amount <= 0) return;
    try {
      const res = await apiFetch("/api/economy/bank/transfer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from, toId: to, amount, memo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast((data?.error ?? "TRANSFER FAILED").toUpperCase());
        return;
      }
      setAccounts(data.accounts ?? []);
      void refresh();
      setToast("TRANSFER POSTED");
    } catch {
      setToast("NETWORK ERROR");
    }
  };
  const startTopup = async (packId: string) => {
    setTopupBusy(packId);
    setTopupNotice("");
    try {
      const response = await apiFetch("/api/stripe/create-topup-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, requestId: stableRequestId("fiat-topup", packId) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        setTopupNotice((result.error ?? "COULD NOT START TOP-UP").toUpperCase());
        return;
      }
      window.location.href = result.url;
    } catch {
      setTopupNotice("NETWORK ERROR — NO PAYMENT WAS STARTED.");
    } finally {
      setTopupBusy(null);
    }
  };

  const dismissCutscene = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(CUTSCENE_KEY, "1");
    setShowCutscene(false);
  };

  return (
    <div className="min-h-screen w-full text-zinc-200" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(30,40,50,0.5) 0%, transparent 70%), #050507",
      paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      {showCutscene && (
        <InstitutionCutscene
          institution="BANCO OMBRA · MAIN BRANCH"
          backdrop="bank"
          beats={BANK_CUTSCENE}
          onClose={dismissCutscene}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="mb-6">
          <Link href="/office" className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
            ← OFFICE
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Landmark className="w-6 h-6 text-emerald-300" />
            <div className="flex-1">
              <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500">A PABLO CORP BANK</p>
              <h1 className="text-2xl sm:text-3xl font-mono tracking-[0.18em]">BANCO OMBRA</h1>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 tracking-widest">
              <Globe className="w-3.5 h-3.5 text-emerald-300/70" />
              <select
                value={curCode}
                onChange={(e) => setCurrency(e.target.value as typeof curCode)}
                className="bg-black/50 border border-white/10 rounded px-2 py-1 font-mono text-[10px] tracking-widest text-zinc-300"
                title="Display currency preference"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowCutscene(true)}
              className="text-[10px] font-mono text-zinc-500 hover:text-emerald-300 tracking-widest border border-white/10 rounded px-2 py-1"
            >
              REPLAY INTRO
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded border border-rose-700/40 bg-rose-950/30 text-rose-200 px-4 py-2 text-[11px] font-mono tracking-widest">
            {error}
          </div>
        )}
        {topupNotice && (
          <div className="mb-4 rounded border border-amber-600/40 bg-amber-950/20 text-amber-200 px-4 py-2 text-[11px] font-mono tracking-widest">
            {topupNotice}
          </div>
        )}

        <div className="rounded-xl border border-emerald-700/30 bg-gradient-to-br from-emerald-900/20 to-zinc-950 p-5 mb-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-mono tracking-[0.4em] text-emerald-400/80">TOTAL ASSETS</p>
              <p className="text-3xl sm:text-4xl font-mono tracking-wider mt-1">
                {loading ? <Loader2 className="w-6 h-6 animate-spin inline" /> : fmtFiat(totalAssets)}
              </p>
              <p className="text-[10px] font-mono text-zinc-500 mt-1 tracking-widest">
                FDIC-EQUIVALENT INSURED · UP TO ƒ250,000
              </p>
            </div>
            <div className="flex items-center gap-2 text-emerald-300/80 text-[10px] font-mono tracking-widest">
              <ShieldCheck className="w-4 h-4" /> SECURED · 256-BIT
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-4 border-b border-white/[0.06] overflow-x-auto">
          {([
            ["overview",   "OVERVIEW",   PiggyBank],
            ["ledger",     "TRANSACTIONS", Receipt],
            ["transfer",   "TRANSFER",   ArrowLeftRight],
            ["finance",    "FINANCE",    Bitcoin],
            ["credit",     "CREDIT",     Gauge],
            ["statements", "STATEMENTS", Lock],
            ["cards",      "CARDS",      CreditCard],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-[10px] font-mono tracking-[0.2em] flex items-center gap-1.5 border-b-2 -mb-px ${
                tab === id ? "text-emerald-300 border-emerald-400" : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid sm:grid-cols-2 gap-3">
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setTab("ledger")}
                className="text-left rounded-lg border border-white/[0.07] bg-black/40 p-4 hover:border-emerald-700/40 hover:bg-emerald-900/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-mono tracking-[0.35em] text-zinc-500">
                      {a.kind === "checking" ? "CHECKING" : a.kind === "savings" ? "SAVINGS" : "BULLION VAULT"}
                    </p>
                    <p className="font-mono tracking-widest text-sm mt-1">{a.label}</p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{accountNumber(a)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </div>
                <p className="text-2xl font-mono tracking-wider mt-3">{fmtFiat(a.balance)}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-zinc-500 tracking-widest">
                  {a.apyBps > 0 ? (
                    <span className="text-emerald-400">{(a.apyBps / 100).toFixed(2)}% APY</span>
                  ) : (
                    <span>NO INTEREST</span>
                  )}
                  <span>·</span>
                  <span>{(txByAccount.get(a.id) ?? []).length} TX</span>
                </div>
              </button>
            ))}

            {!loading && accounts.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/20 p-6 sm:col-span-2 text-center text-[11px] font-mono text-zinc-500 tracking-widest">
                NO ACCOUNTS ON FILE
              </div>
            )}

            <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/10 p-4 sm:col-span-2">
              <div className="flex items-center gap-2 text-emerald-300 text-[10px] font-mono tracking-[0.3em]">
                <CreditCard className="w-3.5 h-3.5" /> ADD FIAT BY CARD
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                Stripe payments credit this server bank only after settlement is confirmed. Plaid-linked balances remain view-only.
              </p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {topupPacks.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    disabled={topupBusy !== null}
                    onClick={() => void startTopup(pack.id)}
                    className="rounded border border-emerald-700/40 bg-emerald-900/10 px-2 py-2 font-mono text-[10px] tracking-wider text-emerald-200 hover:bg-emerald-900/20 disabled:opacity-40"
                  >
                    {topupBusy === pack.id ? "OPENING…" : `${fmtFiat(pack.fiat)} · $${(pack.usdCents / 100).toFixed(2)}`}
                  </button>
                ))}
              </div>
              {topups[0] && (
                <p className="text-[9px] text-zinc-600 mt-3 font-mono tracking-widest">
                  LATEST: {fmtFiat(topups[0].fiatAmount)} · {topups[0].status.toUpperCase()}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/20 p-4 sm:col-span-2">
              <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-mono tracking-[0.3em]">
                <TrendingUp className="w-3.5 h-3.5" /> COMING NEXT
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                Direct deposit to BTC settlement · Auto-sweep checking → savings ·
                Bill pay (rent, utilities, hospital) · Loans &amp; mortgages priced live to BTC ·
                Cross-currency conversion (ƒ ↔ USD ↔ Gold) at the live ticker rate
              </p>
            </div>
          </div>
        )}

        {tab === "ledger" && (
          <div className="rounded-lg border border-white/[0.06] bg-black/30 overflow-hidden">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-white/[0.03] text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2 tracking-widest">DATE</th>
                  <th className="text-left px-3 py-2 tracking-widest">ACCOUNT</th>
                  <th className="text-left px-3 py-2 tracking-widest">MEMO</th>
                  <th className="text-right px-3 py-2 tracking-widest">AMOUNT</th>
                  <th className="text-right px-3 py-2 tracking-widest hidden sm:table-cell">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {tx.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600 tracking-widest">NO TRANSACTIONS YET</td></tr>
                )}
                {tx.map(t => {
                  const acc = accounts.find(a => a.id === t.accountId);
                  return (
                    <tr key={t.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-zinc-500">{fmtDateTime(t.createdAt)}</td>
                      <td className="px-3 py-2 text-zinc-400">{acc ? accountNumber(acc) : `#${t.accountId}`}</td>
                      <td className="px-3 py-2">{t.description}</td>
                      <td className={`px-3 py-2 text-right ${TX_TONE[t.kind] ?? "text-zinc-300"}`}>
                        {t.amount > 0 ? "+" : ""}{fmtFiat(t.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-500 hidden sm:table-cell">{fmtFiat(t.balanceAfter)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "transfer" && (
          <TransferForm accounts={accounts} onTransfer={transfer} />
        )}

        {tab === "finance" && (
          <MarketPanel market={market} curCode={curCode} cur={cur} localCode={localCode} />
        )}

        {tab === "credit" && (
          <CreditPanel credit={credit} loan={loan} plan={plan} loading={creditLoading} onChanged={refresh} />
        )}

        {tab === "statements" && (
          <div className="rounded-lg border border-white/[0.06] bg-black/30 p-6 text-center">
            <Lock className="w-8 h-8 mx-auto text-zinc-500 mb-3" />
            <p className="font-mono text-zinc-300 tracking-widest">MONTHLY STATEMENTS</p>
            <p className="text-[11px] text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed">
              Statements generate on the 1st of each month. PDF export, year-end tax
              summary (1099-INT equivalent), and CSV download will land in the next pass.
            </p>
          </div>
        )}

        {tab === "cards" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <FakeCard label="STANDARD DEBIT" tier="STANDARD" tone="from-zinc-700 to-zinc-900" />
            <FakeCard label="EXEC PLATINUM"  tier="EXEC"     tone="from-fuchsia-900 to-zinc-950" locked />
          </div>
        )}

        {toast && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-40 bg-emerald-900/80 border border-emerald-400/40 text-emerald-100 text-[11px] font-mono tracking-[0.3em] px-4 py-2 rounded-md shadow-lg backdrop-blur"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function TransferForm({
  accounts,
  onTransfer,
}: {
  accounts: Account[];
  onTransfer: (from: number, to: number, amount: number, memo: string) => void;
}) {
  const [from, setFrom] = useState<number | "">(accounts[0]?.id ?? "");
  const [to, setTo] = useState<number | "">(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (from === "" && accounts[0]) setFrom(accounts[0].id);
    if (to === "" && accounts[1]) setTo(accounts[1].id);
  }, [accounts, from, to]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || from === "" || to === "") return;
    onTransfer(Number(from), Number(to), n, memo);
    setAmount("");
    setMemo("");
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/[0.06] bg-black/30 p-5 max-w-xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-500">FROM</span>
          <select
            value={from}
            onChange={e => setFrom(Number(e.target.value))}
            className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-sm tracking-wider"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.label} · {accountNumber(a)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-500">TO</span>
          <select
            value={to}
            onChange={e => setTo(Number(e.target.value))}
            className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-sm tracking-wider"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.label} · {accountNumber(a)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-500">AMOUNT (ƒ)</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0"
          className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-lg tracking-wider"
        />
      </label>
      <label className="block mt-3">
        <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-500">MEMO (OPTIONAL)</span>
        <input
          value={memo}
          onChange={e => setMemo(e.target.value.slice(0, 64))}
          placeholder="rent · payroll · etc."
          className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-sm tracking-wider"
        />
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 font-mono text-[11px] tracking-[0.3em] hover:bg-emerald-500/25 flex items-center gap-2"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> POST TRANSFER
        </button>
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest">
          NO FEE · INSTANT · SAME-OWNER ACCOUNTS
        </span>
      </div>
    </form>
  );
}

function MarketPanel({
  market, curCode, cur, localCode,
}: {
  market: MarketIndex | null;
  curCode: string;
  cur: { symbol: string; ratePerUsd: number };
  localCode: string;
}) {
  if (!market) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-6 text-center text-[11px] font-mono text-zinc-500 tracking-widest">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> LOADING MARKET…
      </div>
    );
  }
  const btcInCur = market.btcUsd * cur.ratePerUsd;
  const oneCurInFiat = market.conversion.usdToFiat / cur.ratePerUsd;
  const oneCurInGold = market.conversion.usdToGoldOz / cur.ratePerUsd;
  // Money supply (flavor): total fiat float is pegged to BTC circulating
  // supply × 99. Movements track the live BTC multiplier.
  const moneySupplyFiat = BTC_CIRCULATING_SUPPLY * MONEY_SUPPLY_MULT * market.multiplier;
  // A small spread of headline currencies pulled from the live FX table.
  const fxCodes = ["USD", "EUR", "GBP", "JPY", "VND", "INR"];
  const fx = market.fx ?? {};
  const cityMultipliers = market.cityMultipliers ?? {
    minx_city: getCityCostMultipliers("minx_city", market.multiplier),
    huda_city: getCityCostMultipliers("huda_city", market.multiplier),
  };
  const minx = cityMultipliers.minx_city;
  const huda = cityMultipliers.huda_city;
  const propertyDelta = minx && huda ? ((minx.property / huda.property) - 1) * 100 : 0;
  const laborDelta = minx && huda ? ((minx.labor / huda.labor) - 1) * 100 : 0;
  const activeCity = getActiveCityId();
  const activeName = activeCity === "huda_city" ? "HUDA" : "MINX";
  const favored = propertyDelta >= 0 ? "HUDA" : "MINX";
  const narrative = propertyDelta >= 1
    ? `Asian markets undercut Western by ${Math.round(propertyDelta)}% — labor arbitrage window is open.`
    : `${favored} currently offers the sharper cost-of-living edge — watch the spread as BTC moves.`;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-amber-700/30 bg-gradient-to-br from-amber-900/15 to-zinc-950 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-amber-300/80">
            <Bitcoin className="w-3.5 h-3.5" /> BTC PRICE
          </div>
          <p className="text-2xl font-mono tracking-wider mt-2 text-amber-200">
            {cur.symbol}{btcInCur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 tracking-widest">
            ×{market.multiplier.toFixed(2)} INDEX · SRC {market.source.toUpperCase()}
          </p>
        </div>
        <div className="rounded-lg border border-fuchsia-700/30 bg-gradient-to-br from-fuchsia-900/15 to-zinc-950 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-fuchsia-300/80">
            <ArrowLeftRight className="w-3.5 h-3.5" /> EXCHANGE RATE
          </div>
          <p className="text-xl font-mono tracking-wider mt-2 text-fuchsia-200">
            1 {curCode} → ƒ{oneCurInFiat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 tracking-widest">
            {oneCurInGold.toLocaleString(undefined, { maximumFractionDigits: 4 })} oz GOLD / {curCode}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-700/30 bg-gradient-to-br from-emerald-900/15 to-zinc-950 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-emerald-300/80">
            <Gauge className="w-3.5 h-3.5" /> MONEY SUPPLY
          </div>
          <p className="text-xl font-mono tracking-wider mt-2 text-emerald-200">
            ƒ{moneySupplyFiat.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 tracking-widest">
            BTC SUPPLY {(BTC_CIRCULATING_SUPPLY / 1e6).toFixed(1)}M × {MONEY_SUPPLY_MULT} CAP
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-mono tracking-[0.3em] text-zinc-400">FX BOARD · USD BASE</p>
          <span className="text-[10px] font-mono text-zinc-600 tracking-widest">LOCAL: {localCode}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {fxCodes.map((code) => {
            const rate = code === "USD" ? 1 : fx[code];
            const info = SUPPORTED_CURRENCIES.find((c) => c.code === code);
            const r = rate ?? info?.ratePerUsd;
            return (
              <div
                key={code}
                className={`flex items-center justify-between rounded border px-3 py-2 font-mono text-[11px] ${
                  code === localCode ? "border-emerald-600/40 bg-emerald-900/10" : "border-white/[0.06] bg-black/20"
                }`}
              >
                <span className="text-zinc-400 tracking-widest">{info?.symbol ?? ""} {code}</span>
                <span className="text-zinc-200">{r != null ? r.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] font-mono text-zinc-600 mt-3 tracking-widest leading-relaxed">
          Rates are USD→currency (units per USD). The whole Banco Ombra economy
          settles on the live BTC ledger; ƒ, Gold and local currencies all peg back
          to it. Display-only — your in-game ƒ balances are unaffected.
        </p>
      </div>

      <div className="rounded-lg border border-cyan-700/30 bg-gradient-to-br from-cyan-950/20 to-zinc-950 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-mono tracking-[0.3em] text-cyan-300/90">CITY SPREAD · LIVE INDEX</p>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{narrative}</p>
          </div>
          <span className="shrink-0 rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono tracking-widest text-emerald-200">
            {activeName} ACTIVE
          </span>
        </div>
        <div className="overflow-x-auto rounded border border-white/[0.06]">
          <table className="w-full min-w-[420px] text-[11px] font-mono">
            <thead className="bg-white/[0.03] text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2 tracking-widest">CITY</th>
                <th className="text-right px-3 py-2 tracking-widest">LABOR</th>
                <th className="text-right px-3 py-2 tracking-widest">PROPERTY</th>
                <th className="text-right px-3 py-2 tracking-widest">POSITION</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["MINX CITY", minx, "Western Premium"],
                ["HUDA CITY", huda, "Asian Labor Advantage"],
              ].map(([label, rates, flavor]) => {
                const r = rates as { labor: number; property: number } | undefined;
                return (
                  <tr key={label as string} className="border-t border-white/[0.04]">
                    <td className="px-3 py-2 text-zinc-200">{label as string}</td>
                    <td className="px-3 py-2 text-right text-amber-200">{r ? `×${r.labor.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right text-fuchsia-200">{r ? `×${r.property.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right text-[10px] text-zinc-400">{flavor as string}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono tracking-widest">
          <span className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200">PROPERTY DELTA +{propertyDelta.toFixed(0)}%</span>
          <span className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-amber-200">LABOR DELTA +{laborDelta.toFixed(0)}%</span>
        </div>
        <p className="mt-3 text-[10px] font-mono tracking-widest text-zinc-600">
          {activeName} display rate · local settlement remains ƒ · BTC ×{market.multiplier.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

function CreditPanel({
  credit, loan, plan, loading, onChanged,
}: {
  credit: CreditScore | null;
  loan: LoanEligibility | null;
  plan: CreditPlan | null;
  loading: boolean;
  onChanged: () => void;
}) {
  if (loading && !credit) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-6 text-center text-[11px] font-mono text-zinc-500 tracking-widest">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> PULLING CREDIT FILE…
      </div>
    );
  }
  const score = credit?.score ?? 0;
  // Approval-odds band from the 300–850 score scale.
  const odds =
    score >= 740 ? { label: "EXCELLENT", pct: "95%+", tone: "text-emerald-300" } :
    score >= 670 ? { label: "STRONG", pct: "~75%", tone: "text-emerald-300" } :
    score >= 580 ? { label: "FAIR", pct: "~45%", tone: "text-amber-300" } :
    { label: "POOR", pct: "<20%", tone: "text-rose-300" };
  const scorePct = Math.max(0, Math.min(1, (score - 300) / 550));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-700/30 bg-gradient-to-br from-cyan-900/15 to-zinc-950 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-cyan-300/80">
            <Gauge className="w-3.5 h-3.5" /> CREDIT SCORE
          </div>
          <p className="text-4xl font-mono tracking-wider mt-2 text-cyan-100">{score || "—"}</p>
          <p className="text-[11px] font-mono text-zinc-400 mt-1 tracking-widest">
            {credit?.tier ?? "—"} {credit ? `· APR ${(credit.apr * 100).toFixed(1)}%` : ""}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400" style={{ width: `${scorePct * 100}%` }} />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-zinc-600 mt-1 tracking-widest">
            <span>300</span><span>850</span>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-700/30 bg-gradient-to-br from-emerald-900/15 to-zinc-950 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-emerald-300/80">
            <TrendingUp className="w-3.5 h-3.5" /> LOAN ELIGIBILITY
          </div>
          <p className={`text-2xl font-mono tracking-wider mt-2 ${odds.tone}`}>{odds.pct}</p>
          <p className="text-[11px] font-mono text-zinc-400 mt-1 tracking-widest">{odds.label} ODDS</p>
          {loan && (
            <div className="mt-2 space-y-0.5 text-[10px] font-mono text-zinc-500 tracking-widest">
              <p>MAX LOAN · {loan.maxLoanAmount == null ? "NO CAP" : fmtFiat(loan.maxLoanAmount)}</p>
              <p>INCOME · {loan.hasIncome ? `${fmtFiat(loan.monthlyIncomeEstimate)}/MO VERIFIED` : "UNVERIFIED"}</p>
              {loan.reason && <p className="text-amber-400/80 normal-case tracking-wide leading-snug">{loan.reason}</p>}
            </div>
          )}
        </div>
      </div>

      {credit?.actions && credit.actions.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-black/30 p-4">
          <p className="text-[10px] font-mono tracking-[0.3em] text-zinc-400 mb-2">RAISE YOUR SCORE</p>
          <div className="space-y-1.5">
            {credit.actions.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-400">{a.label}</span>
                <span className={a.delta >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {a.delta >= 0 ? "+" : ""}{a.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BillsAndDebts plan={plan} onChanged={onChanged} />
    </div>
  );
}

function BillsAndDebts({ plan, onChanged }: { plan: CreditPlan | null; onChanged: () => void }) {
  const [enrolling, setEnrolling] = useState<number | null>(null);
  if (!plan) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-4 text-[11px] font-mono text-zinc-500 tracking-widest">
        NO CREDIT FILE
      </div>
    );
  }
  if (plan.active) {
    const due = plan.nextDueAt ? fmtDateTime(plan.nextDueAt) : "—";
    return (
      <div className={`rounded-lg border p-4 ${plan.overdue ? "border-rose-700/40 bg-rose-950/20" : "border-amber-700/30 bg-amber-950/10"}`}>
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-amber-300/80 mb-2">
          <FileWarning className="w-3.5 h-3.5" /> ACTIVE PAYMENT PLAN
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
          <Stat label="BALANCE" value={fmtFiat(plan.balance)} />
          <Stat label="INSTALLMENT" value={`${fmtFiat(plan.installment)}/MO`} />
          <Stat label="PROGRESS" value={`${plan.paid}/${plan.term}`} />
          <Stat label="NEXT DUE" value={due} tone={plan.overdue ? "text-rose-300" : undefined} />
        </div>
        {plan.overdue && (
          <p className="text-[10px] font-mono text-rose-300/90 mt-2 tracking-widest">
            OVERDUE · {plan.missed}/{plan.defaultsAfter} MISSES BEFORE DEFAULT
          </p>
        )}
      </div>
    );
  }
  // No active plan — show outstanding debt and any restructure quotes.
  if (plan.debt <= 0) {
    return (
      <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/10 p-4 text-[11px] font-mono text-emerald-300/90 tracking-widest">
        NO OUTSTANDING DEBTS · ACCOUNT IN GOOD STANDING
      </div>
    );
  }
  const enroll = async (term: number) => {
    setEnrolling(term);
    try {
      const r = await apiFetch("/api/credit/plan/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term }),
      });
      if (r.ok) onChanged();
    } catch { /* ignore */ }
    finally { setEnrolling(null); }
  };
  return (
    <div className="rounded-lg border border-rose-700/30 bg-rose-950/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-rose-300/80">
          <FileWarning className="w-3.5 h-3.5" /> BILLS &amp; DEBTS
        </div>
        <span className="text-[11px] font-mono text-rose-200">{fmtFiat(plan.debt)} OWED</span>
      </div>
      <p className="text-[10px] font-mono text-zinc-500 tracking-widest mb-3">
        RESTRUCTURE INTO INSTALLMENTS · APR {(plan.apr * 100).toFixed(1)}%
      </p>
      <div className="grid sm:grid-cols-3 gap-2">
        {plan.quotes.map((q) => (
          <button
            key={q.term}
            onClick={() => enroll(q.term)}
            disabled={enrolling != null}
            className="rounded-lg border border-white/[0.08] bg-black/30 p-3 text-left hover:border-emerald-700/40 hover:bg-emerald-900/10 disabled:opacity-50"
          >
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest">{q.term}-MONTH</p>
            <p className="text-sm font-mono text-zinc-200 mt-1">{fmtFiat(q.installment)}/MO</p>
            <p className="text-[10px] font-mono text-zinc-600 mt-0.5">TOTAL {fmtFiat(q.total)}</p>
            {enrolling === q.term && <Loader2 className="w-3.5 h-3.5 animate-spin mt-1 text-emerald-300" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono tracking-[0.3em] text-zinc-500">{label}</p>
      <p className={`mt-0.5 tracking-wider ${tone ?? "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function FakeCard({ label, tier, tone, locked }: { label: string; tier: string; tone: string; locked?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/[0.1] bg-gradient-to-br ${tone} p-5 aspect-[1.6/1] flex flex-col justify-between relative overflow-hidden`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-mono tracking-[0.4em] text-white/60">BANCO OMBRA</p>
          <p className="text-sm font-mono tracking-widest text-white/90 mt-1">{label}</p>
        </div>
        <Coins className="w-5 h-5 text-white/50" />
      </div>
      <div>
        <p className="font-mono tracking-[0.3em] text-white/80 text-sm">•••• •••• •••• 4471</p>
        <div className="flex justify-between mt-2 text-[10px] font-mono tracking-widest text-white/50">
          <span>OMBRA MEMBER</span>
          <span>{tier}</span>
        </div>
      </div>
      {locked && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4">
          <Lock className="w-5 h-5 text-zinc-300 mb-2" />
          <p className="text-[10px] font-mono tracking-[0.3em] text-zinc-300">REQUIRES EXEC TIER</p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1">Hold ƒ100,000+ avg balance</p>
        </div>
      )}
    </div>
  );
}
