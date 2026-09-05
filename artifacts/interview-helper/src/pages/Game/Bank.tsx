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
  accountNumber?: string | null;
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
  a.accountNumber ?? "ACCOUNT NUMBER PENDING";

const TX_TONE: Record<string, string> = {
  deposit:  "text-emerald-300",
  withdraw: "text-rose-300",
  transfer: "text-cyan-300",
  fee:      "text-amber-300",
  interest: "text-emerald-300",
  payroll:  "text-emerald-300",
};

type Tab = "overview" | "ledger" | "transfer" | "debt" | "statements" | "cards";

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
type CreditApplication = {
  id: number;
  product: string;
  requestedFiat: number;
  approvedFiat: number;
  aprBps: number;
  termMonths: number;
  purpose: string;
  status: string;
  orgId: number | null;
  createdAt: string;
};
type CreditApplicationQuote = {
  applicantScore: number;
  orgScore: number | null;
  orgAgeDays: number | null;
  monthlyIncomeFiat: number;
  consistencyScore: number;
  aprBps: number;
  recommendedMaxFiat: number;
  eligible: boolean;
  orgName: string | null;
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
  const returnPath = useMemo(() => {
    if (typeof window === "undefined") return "/office";
    const candidate = new URLSearchParams(window.location.search).get("returnTo");
    return candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/office";
  }, []);
  const returnFloor = useMemo(() => {
    if (typeof window === "undefined") return null;
    const explicit = Number(new URLSearchParams(window.location.search).get("returnFloor"));
    if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 67) return explicit;
    if (returnPath === "/tower/mezzanine") return 2;
    if (returnPath === "/tower/rest") return 3;
    if (returnPath === "/tower/security") return 4;
    return null;
  }, [returnPath]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "debt" || requested === "credit") return "debt";
    return "overview";
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

  // Detailed live market data is intentionally confined to the Economy page.
  const [market, setMarket] = useState<MarketIndex | null>(null);
  useEffect(() => {
    setMarket(null);
  }, []);

  // Credit dossier: score, loan eligibility odds, active plan / debt.
  const [credit, setCredit] = useState<CreditScore | null>(null);
  const [loan, setLoan] = useState<LoanEligibility | null>(null);
  const [plan, setPlan] = useState<CreditPlan | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const refreshCredit = useCallback(async () => {
    setCreditLoading(true);
    try {
      const [sRes, lRes, pRes] = await Promise.all([
        apiFetch("/api/credit/score"),
        apiFetch("/api/credit/loan/eligibility"),
        apiFetch("/api/credit/plan"),
      ]);
      if (sRes.ok) setCredit(await sRes.json());
      if (lRes.ok) setLoan(await lRes.json());
      if (pRes.ok) setPlan(await pRes.json());
    } catch { /* keep the last known dossier visible */ }
    finally { setCreditLoading(false); }
  }, []);
  useEffect(() => {
    void refreshCredit();
  }, [refreshCredit]);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [accRes, txRes] = await Promise.all([
        apiFetch("/api/economy/bank/accounts", { credentials: "include" }),
        apiFetch("/api/economy/bank/transactions?limit=200", { credentials: "include" }),
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
  const refreshDebtWorkspace = useCallback(async () => {
    await Promise.all([refresh(), refreshCredit()]);
  }, [refresh, refreshCredit]);
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
      background: "linear-gradient(180deg, rgba(5,8,15,.84), rgba(5,8,15,.97)), url('/pixel-agents/shadow-tower/spaces/tower_space_lobby.jpg') center / cover fixed",
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
          <div className="flex items-center justify-between gap-3">
            <Link href={returnPath} className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
              ← RETURN TO FLOOR
            </Link>
            {returnFloor && <span className="border border-emerald-300/30 bg-emerald-300/5 px-2 py-1 font-mono text-[10px] font-bold tracking-[.18em] text-emerald-200 animate-pulse">FROM FLOOR {returnFloor}</span>}
          </div>
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
                 BANK BALANCE · CASH IS HELD SEPARATELY
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
            ["debt",       "DEBT",       FileWarning],
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
                       {a.kind === "checking" ? "CHECKING" : "SAVINGS"}
                    </p>
                    <p className="font-mono tracking-widest text-sm mt-1">{a.label}</p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{accountNumber(a)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </div>
                <p className="text-2xl font-mono tracking-wider mt-3">{fmtFiat(a.balance)}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-zinc-500 tracking-widest">
                   <span>PERSONAL ACCOUNT</span>
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

             <OpenAccountCard onOpened={refresh} />
             <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/20 p-4 sm:col-span-2">
              <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-mono tracking-[0.3em]">
                <TrendingUp className="w-3.5 h-3.5" /> COMING NEXT
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                 You choose which accounts to open and what to call them. Savings interest is not available yet.
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


        {tab === "debt" && (
          <DebtPanel credit={credit} loan={loan} plan={plan} loading={creditLoading} onChanged={refreshDebtWorkspace} />
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
           <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/20 p-8 text-center">
             <CreditCard className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
             <p className="font-mono text-sm tracking-widest text-zinc-300">NO CARDS ISSUED</p>
             <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
               You have not applied for a debit or credit card. Until one is approved, purchases are paid with cash.
             </p>
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

function DebtPanel({
  credit, loan, plan, loading, onChanged,
}: {
  credit: CreditScore | null;
  loan: LoanEligibility | null;
  plan: CreditPlan | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<"individual" | "organization">("individual");
  const [product, setProduct] = useState<"loan" | "credit_line" | "grant">("loan");
  const [requestedFiat, setRequestedFiat] = useState("10000");
  const [termMonths, setTermMonths] = useState("12");
  const [purpose, setPurpose] = useState("");
  const [quote, setQuote] = useState<CreditApplicationQuote | null>(null);
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationNotice, setApplicationNotice] = useState("");
  const refreshApplications = useCallback(async () => {
    const [quoteRes, appRes] = await Promise.all([
      apiFetch(`/api/credit/applications/quote?scope=${scope}`),
      apiFetch("/api/credit/applications"),
    ]);
    if (quoteRes.ok) setQuote(await quoteRes.json());
    else setQuote(null);
    if (appRes.ok) setApplications((await appRes.json()).applications ?? []);
  }, [scope]);
  useEffect(() => { void refreshApplications(); }, [refreshApplications]);
  const submitApplication = async () => {
    setApplicationBusy(true);
    setApplicationNotice("");
    try {
      const r = await apiFetch("/api/credit/applications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, product, requestedFiat: Number(requestedFiat), termMonths: Number(termMonths), purpose }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setApplicationNotice(body.error ?? "Application could not be submitted."); return; }
      setPurpose("");
      setApplicationNotice("Application submitted for manual moderator review. No Fiat has been issued.");
      await refreshApplications();
    } finally {
      setApplicationBusy(false);
    }
  };
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
      <div>
        <p className="text-[10px] font-mono tracking-[0.35em] text-zinc-400">DEBT &amp; PAYMENT PLANS</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Review balances, restructure collections debt, and manage active installments directly with Banco Ombra.
        </p>
      </div>

      <BillsAndDebts plan={plan} onChanged={onChanged} />

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

      <div className="rounded-lg border border-violet-700/30 bg-violet-950/10 p-4 space-y-3">
        <div>
          <p className="text-[10px] font-mono tracking-[0.3em] text-violet-300">APPLY FOR FIAT CREDIT</p>
          <p className="mt-1 text-[11px] text-zinc-500">Every application is manually reviewed. Loans and credit never price below 15% APR. Approved funding is deposited only into personal or organization Fiat checking.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200">
            <option value="individual">INDIVIDUAL SALARYMAN</option>
            <option value="organization">CURRENT ORGANIZATION</option>
          </select>
          <select value={product} onChange={(e) => setProduct(e.target.value as typeof product)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200">
            <option value="loan">TERM LOAN</option>
            <option value="credit_line">CREDIT LINE</option>
            <option value="grant">REVIEWED FUNDING GRANT</option>
          </select>
          <input value={requestedFiat} onChange={(e) => setRequestedFiat(e.target.value)} inputMode="numeric" placeholder="FIAT REQUESTED" className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200" />
          <select value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200">
            {[3, 6, 12, 24, 36, 60].map((m) => <option key={m} value={m}>{m} MONTHS</option>)}
          </select>
        </div>
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} maxLength={2000} placeholder="Describe exactly how the Fiat will be used…" className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200" />
        {quote && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
            <Stat label="QUOTED APR" value={`${(quote.aprBps / 100).toFixed(2)}%`} />
            <Stat label="CONSISTENCY" value={`${quote.consistencyScore}/100`} />
            <Stat label="REVIEW GUIDE" value={fmtFiat(quote.recommendedMaxFiat)} />
            <Stat label={scope === "organization" ? "ORG AGE" : "CREDIT"} value={scope === "organization" ? `${Math.floor((quote.orgAgeDays ?? 0) / 365)}Y` : String(quote.applicantScore)} />
          </div>
        )}
        <button type="button" onClick={() => void submitApplication()} disabled={applicationBusy || purpose.trim().length < 20}
          className="rounded-md border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-[10px] font-mono tracking-[0.2em] text-violet-200 hover:bg-violet-500/25 disabled:opacity-40">
          {applicationBusy ? "SUBMITTING…" : "SUBMIT FOR MANUAL REVIEW"}
        </button>
        {applicationNotice && <p className="text-[10px] font-mono text-amber-300/90">{applicationNotice}</p>}
        {applications.length > 0 && (
          <div className="border-t border-white/[0.06] pt-3 space-y-1.5">
            <p className="text-[9px] font-mono tracking-[0.25em] text-zinc-500">APPLICATION HISTORY</p>
            {applications.slice(0, 5).map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                <span>#{app.id} · {app.product.toUpperCase()} · {fmtFiat(app.requestedFiat)}</span>
                <span className={app.status === "funded" ? "text-emerald-300" : app.status === "declined" ? "text-rose-300" : "text-amber-300"}>{app.status.toUpperCase()} · {(app.aprBps / 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function BillsAndDebts({ plan, onChanged }: { plan: CreditPlan | null; onChanged: () => void }) {
  const [enrolling, setEnrolling] = useState<number | null>(null);
  const [paying, setPaying] = useState<"installment" | "payoff" | null>(null);
  const [notice, setNotice] = useState("");
  if (!plan) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-4 text-[11px] font-mono text-zinc-500 tracking-widest">
        NO CREDIT FILE
      </div>
    );
  }
  if (plan.active) {
    const due = plan.nextDueAt ? fmtDateTime(plan.nextDueAt) : "—";
    const pay = async (kind: "installment" | "payoff") => {
      setPaying(kind);
      setNotice("");
      try {
        const path = kind === "installment" ? "/api/credit/plan/pay" : "/api/credit/plan/payoff";
        const r = await apiFetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const required = typeof body.required === "number" ? ` Need ${fmtFiat(body.required)}.` : "";
          setNotice(`${body.error ?? "Payment could not be completed."}${required}`);
          onChanged();
          return;
        }
        setNotice(kind === "payoff"
          ? `Debt paid in full · ${fmtFiat(body.paid ?? plan.balance)}`
          : body.done
            ? "Final installment paid · account clear"
            : `Installment paid · ${fmtFiat(body.paid ?? plan.installment)}`);
        onChanged();
      } catch {
        setNotice("Payment could not be completed. Check your connection and try again.");
      } finally {
        setPaying(null);
      }
    };
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
        <p className="mt-2 text-[10px] font-mono text-zinc-500 tracking-widest">
          APR {(plan.apr * 100).toFixed(1)}% · PRINCIPAL {fmtFiat(plan.principal)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pay("installment")}
            disabled={paying != null}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-[10px] font-mono tracking-[0.2em] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {paying === "installment" ? "PAYING…" : `PAY INSTALLMENT · ${fmtFiat(plan.installment)}`}
          </button>
          <button
            type="button"
            onClick={() => pay("payoff")}
            disabled={paying != null}
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[10px] font-mono tracking-[0.2em] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-200 disabled:opacity-50"
          >
            {paying === "payoff" ? "PAYING…" : `PAY OFF IN FULL · ${fmtFiat(plan.balance)}`}
          </button>
        </div>
        {notice && (
          <p className="mt-3 text-[10px] font-mono tracking-widest text-zinc-300" role="status">
            {notice}
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
    setNotice("");
    try {
      const r = await apiFetch("/api/credit/plan/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term }),
      });
      if (r.ok) {
        setNotice(`Debt restructured into ${term} installments.`);
        onChanged();
      } else {
        const body = await r.json().catch(() => ({}));
        setNotice(body.error ?? "Debt could not be restructured.");
      }
    } catch {
      setNotice("Debt could not be restructured. Check your connection and try again.");
    }
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
      {notice && (
        <p className="mt-3 text-[10px] font-mono tracking-widest text-zinc-300" role="status">
          {notice}
        </p>
      )}
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

function OpenAccountCard({ onOpened }: { onOpened: () => void }) {
  const [kind, setKind] = useState<"checking" | "savings">("checking");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const r = await apiFetch("/api/economy/bank/accounts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: label.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "Could not open account"); return; }
      setLabel(""); onOpened();
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="rounded-lg border border-emerald-700/30 bg-emerald-950/10 p-4 sm:col-span-2">
      <p className="text-[10px] font-mono tracking-[0.3em] text-emerald-400">OPEN AN ACCOUNT</p>
      <p className="mt-1 text-[11px] text-zinc-500">Choose the type and name it yourself. No interest is paid on savings yet.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select value={kind} onChange={e => setKind(e.target.value as "checking" | "savings")} className="rounded border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-200">
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
        <input value={label} onChange={e => setLabel(e.target.value.slice(0, 64))} placeholder="Account name" className="min-w-0 flex-1 rounded border border-white/10 bg-black/50 px-3 py-2 font-mono text-sm text-zinc-200 placeholder-zinc-600" />
        <button disabled={busy || !label.trim()} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-emerald-300 disabled:opacity-40">
          {busy ? "OPENING…" : "OPEN ACCOUNT"}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
    </form>
  );
}
