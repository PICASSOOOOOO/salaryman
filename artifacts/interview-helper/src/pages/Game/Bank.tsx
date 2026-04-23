import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Landmark, ArrowLeftRight, ChevronRight, Receipt, ShieldCheck, Coins,
  PiggyBank, CreditCard, TrendingUp, Lock, Loader2,
} from "lucide-react";
import InstitutionCutscene from "@/components/InstitutionCutscene";

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

type Tab = "overview" | "ledger" | "transfer" | "statements" | "cards";

const CUTSCENE_KEY = "salaryman.bank.intro.seen.v1";

/* First-person teller intro. Medium shot framing — the user sees the bank
   counter from their own POV. Skippable and remembered locally. */
const BANK_CUTSCENE = [
  { speaker: "TELLER · MIRA", line: "Welcome to Salaryman Federal. Place your palm on the scanner — there we go." },
  { speaker: "TELLER · MIRA", line: "Three accounts seeded for you: a checking, a high-yield savings at 4.25% APY, and a small bullion vault." },
  { speaker: "TELLER · MIRA", line: "Transfers between your accounts are instant and free. External wires settle on the BTC ledger." },
  { speaker: "TELLER · MIRA", line: "If you ever need me, every branch kiosk in the city routes back here. Good luck out there." },
];

export default function GameBank() {
  const [, navigate] = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [showCutscene, setShowCutscene] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(CUTSCENE_KEY);
  });

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
      const res = await fetch("/api/economy/bank/transfer", {
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
          institution="SALARYMAN FEDERAL · MAIN BRANCH"
          backdrop="bank"
          beats={BANK_CUTSCENE}
          onClose={dismissCutscene}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="mb-6">
          <Link href="/game" className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
            ← Back to Game
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Landmark className="w-6 h-6 text-emerald-300" />
            <div className="flex-1">
              <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500">SALARYMAN FEDERAL</p>
              <h1 className="text-2xl sm:text-3xl font-mono tracking-[0.18em]">BANK</h1>
            </div>
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
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-900/80 border border-emerald-400/40 text-emerald-100 text-[11px] font-mono tracking-[0.3em] px-4 py-2 rounded-md shadow-lg backdrop-blur">
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

function FakeCard({ label, tier, tone, locked }: { label: string; tier: string; tone: string; locked?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/[0.1] bg-gradient-to-br ${tone} p-5 aspect-[1.6/1] flex flex-col justify-between relative overflow-hidden`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-mono tracking-[0.4em] text-white/60">SALARYMAN FED</p>
          <p className="text-sm font-mono tracking-widest text-white/90 mt-1">{label}</p>
        </div>
        <Coins className="w-5 h-5 text-white/50" />
      </div>
      <div>
        <p className="font-mono tracking-[0.3em] text-white/80 text-sm">•••• •••• •••• 4471</p>
        <div className="flex justify-between mt-2 text-[10px] font-mono tracking-widest text-white/50">
          <span>SALARYMAN P.</span>
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
