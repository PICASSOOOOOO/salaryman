import { Link } from "wouter";
import { useState, useEffect, useMemo } from "react";
import {
  Landmark, ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine,
  ChevronRight, Receipt, ShieldCheck, Coins, PiggyBank, CreditCard,
  TrendingUp, Lock,
} from "lucide-react";

/**
 * Banking — full retail-bank shape under Go to Work. Scaffolds checking,
 * savings, transfers, transaction ledger, statements, and card management.
 * UI is fully wired against local state today (with seed data) so the page
 * looks and feels real; the matching `/api/economy/bank/*` endpoints will
 * land in the next pass and replace the seeds with persisted state.
 */

type Account = {
  id: string;
  kind: "checking" | "savings" | "vault";
  label: string;
  number: string; // last 4 shown
  balance: number; // in ƒ
  apy?: number;
};

type Tx = {
  id: string;
  ts: number;
  account: string;
  kind: "deposit" | "withdraw" | "transfer" | "fee" | "interest" | "payroll";
  memo: string;
  amount: number; // signed
  balanceAfter: number;
};

const SEED_ACCOUNTS: Account[] = [
  { id: "chk-01", kind: "checking", label: "STANDARD CHECKING", number: "••4471", balance: 12_400, apy: 0 },
  { id: "sav-01", kind: "savings",  label: "HIGH-YIELD SAVINGS", number: "••8830", balance: 48_000, apy: 4.25 },
  { id: "vlt-01", kind: "vault",    label: "GOLD VAULT",         number: "GLD-V1", balance: 0.4 * 200_000, apy: 0 }, // 0.4 oz at ƒ200k/oz peg
];

const SEED_TX: Tx[] = [
  { id: "t1", ts: Date.now() - 1000 * 60 * 60 * 2,  account: "chk-01", kind: "payroll",  memo: "PAYROLL · PABLO CORP",      amount:  3200, balanceAfter: 12_400 },
  { id: "t2", ts: Date.now() - 1000 * 60 * 60 * 5,  account: "chk-01", kind: "withdraw", memo: "ATM · KOWLOON BR-2",       amount:  -200, balanceAfter:  9_200 },
  { id: "t3", ts: Date.now() - 1000 * 60 * 60 * 26, account: "sav-01", kind: "interest", memo: "MONTHLY INTEREST",         amount:    167, balanceAfter: 48_000 },
  { id: "t4", ts: Date.now() - 1000 * 60 * 60 * 30, account: "chk-01", kind: "transfer", memo: "→ SAVINGS",                amount: -1_000, balanceAfter:  9_400 },
  { id: "t5", ts: Date.now() - 1000 * 60 * 60 * 30, account: "sav-01", kind: "transfer", memo: "← CHECKING",               amount:  1_000, balanceAfter: 47_833 },
  { id: "t6", ts: Date.now() - 1000 * 60 * 60 * 48, account: "chk-01", kind: "fee",      memo: "OVERDRAFT FEE",            amount:    -35, balanceAfter: 10_400 },
  { id: "t7", ts: Date.now() - 1000 * 60 * 60 * 72, account: "chk-01", kind: "deposit",  memo: "DEPOSIT · BTC SETTLEMENT", amount:  2_500, balanceAfter: 10_435 },
];

const fmtFiat = (n: number) =>
  `ƒ${Math.round(n).toLocaleString("en-US")}`;

const fmtDateTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

const TX_TONE: Record<Tx["kind"], string> = {
  deposit:  "text-emerald-300",
  withdraw: "text-rose-300",
  transfer: "text-cyan-300",
  fee:      "text-amber-300",
  interest: "text-emerald-300",
  payroll:  "text-emerald-300",
};

type Tab = "overview" | "ledger" | "transfer" | "statements" | "cards";

export default function GameBank() {
  const [accounts, setAccounts] = useState<Account[]>(SEED_ACCOUNTS);
  const [tx, setTx] = useState<Tx[]>(SEED_TX);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string>("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const totalAssets = useMemo(
    () => accounts.reduce((s, a) => s + a.balance, 0),
    [accounts],
  );

  const txByAccount = useMemo(() => {
    const m = new Map<string, Tx[]>();
    for (const t of tx) {
      if (!m.has(t.account)) m.set(t.account, []);
      m.get(t.account)!.push(t);
    }
    return m;
  }, [tx]);

  const transfer = (from: string, to: string, amount: number, memo: string) => {
    if (from === to || amount <= 0) return;
    const src = accounts.find(a => a.id === from);
    const dst = accounts.find(a => a.id === to);
    if (!src || !dst || src.balance < amount) {
      setToast("INSUFFICIENT FUNDS");
      return;
    }
    const next = accounts.map(a => {
      if (a.id === from) return { ...a, balance: a.balance - amount };
      if (a.id === to)   return { ...a, balance: a.balance + amount };
      return a;
    });
    setAccounts(next);
    const now = Date.now();
    const newTx: Tx[] = [
      { id: `tx-${now}-out`, ts: now, account: from, kind: "transfer", memo: `→ ${dst.label} ${memo ? "· " + memo : ""}`, amount: -amount, balanceAfter: src.balance - amount },
      { id: `tx-${now}-in`,  ts: now, account: to,   kind: "transfer", memo: `← ${src.label} ${memo ? "· " + memo : ""}`, amount:  amount, balanceAfter: dst.balance + amount },
    ];
    setTx(prev => [...newTx, ...prev]);
    setToast("TRANSFER POSTED");
  };

  return (
    <div className="min-h-screen w-full text-zinc-200" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(30,40,50,0.5) 0%, transparent 70%), #050507",
      paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="mb-6">
          <Link href="/game" className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
            ← Back to Game
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Landmark className="w-6 h-6 text-emerald-300" />
            <div>
              <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500">SALARYMAN FEDERAL</p>
              <h1 className="text-2xl sm:text-3xl font-mono tracking-[0.18em]">BANK</h1>
            </div>
          </div>
        </header>

        {/* Total assets summary */}
        <div className="rounded-xl border border-emerald-700/30 bg-gradient-to-br from-emerald-900/20 to-zinc-950 p-5 mb-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-mono tracking-[0.4em] text-emerald-400/80">TOTAL ASSETS</p>
              <p className="text-3xl sm:text-4xl font-mono tracking-wider mt-1">{fmtFiat(totalAssets)}</p>
              <p className="text-[10px] font-mono text-zinc-500 mt-1 tracking-widest">
                FDIC-EQUIVALENT INSURED · UP TO ƒ250,000
              </p>
            </div>
            <div className="flex items-center gap-2 text-emerald-300/80 text-[10px] font-mono tracking-widest">
              <ShieldCheck className="w-4 h-4" /> SECURED · 256-BIT
            </div>
          </div>
        </div>

        {/* Tabs */}
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
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{a.number}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </div>
                <p className="text-2xl font-mono tracking-wider mt-3">{fmtFiat(a.balance)}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-zinc-500 tracking-widest">
                  {a.apy ? (
                    <span className="text-emerald-400">{a.apy.toFixed(2)}% APY</span>
                  ) : (
                    <span>NO INTEREST</span>
                  )}
                  <span>·</span>
                  <span>{(txByAccount.get(a.id) ?? []).length} TX</span>
                </div>
              </button>
            ))}

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
                {tx.map(t => {
                  const acc = accounts.find(a => a.id === t.account);
                  return (
                    <tr key={t.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-zinc-500">{fmtDateTime(t.ts)}</td>
                      <td className="px-3 py-2 text-zinc-400">{acc?.number ?? t.account}</td>
                      <td className="px-3 py-2">{t.memo}</td>
                      <td className={`px-3 py-2 text-right ${TX_TONE[t.kind]}`}>
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
              summary (1099-INT equivalent), and CSV download will land alongside the
              persisted backend.
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
  onTransfer: (from: string, to: string, amount: number, memo: string) => void;
}) {
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    onTransfer(from, to, n, memo);
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
            onChange={e => setFrom(e.target.value)}
            className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-sm tracking-wider"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.label} · {a.number}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-500">TO</span>
          <select
            value={to}
            onChange={e => setTo(e.target.value)}
            className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-md px-3 py-2 font-mono text-sm tracking-wider"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.label} · {a.number}</option>
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
