import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Landmark, Loader2, RefreshCw, Link2, PencilLine,
  TrendingDown, Lightbulb, AlertTriangle, CalendarClock, Percent,
  FileSpreadsheet, FileJson, FileText, Building2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

type FilingStatus = 'single' | 'mfj' | 'hoh';

interface TaxEstimate {
  attached: boolean;
  asOf: string;
  taxYear: string;
  filingStatus: FilingStatus;
  inputs: { grossIncome: number; businessExpenses: number; homeOffice: number; netBusinessIncome: number; retirement: number; healthInsurance: number };
  selfEmployment: { netSeIncome: number; socialSecurity: number; medicare: number; total: number; deductibleHalf: number };
  deductions: { standardDeduction: number; qbiDeduction: number; halfSeTax: number; retirement: number; healthInsurance: number; aboveTheLineTotal: number };
  adjustedGrossIncome: number;
  taxableIncome: number;
  incomeTax: number;
  totalTax: number;
  effectiveRate: number;
  marginalRate: number;
  quarterlyPayment: number;
  qbiThresholdExceeded: boolean;
  suggestions: Array<{ title: string; detail: string; estSavings: number }>;
  disclaimer: string;
}

interface ScheduleCLine { line: string; label: string; amount: number; note?: string }
interface ScheduleC {
  form: string;
  taxYear: string;
  asOf: string;
  partI: { grossReceipts: number; returnsAllowances: number; grossIncome: number };
  partII: ScheduleCLine[];
  totalExpenses: number;
  netProfit: number;
  unmappedToOther: Array<{ category: string; amount: number }>;
  disclaimer: string;
}

function fmt$(v: number) {
  const neg = v < 0;
  return `${neg ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const FILING_OPTIONS: { id: FilingStatus; label: string; boomer: string }[] = [
  { id: 'single', label: 'SINGLE', boomer: 'Single' },
  { id: 'mfj', label: 'MARRIED · JOINT', boomer: 'Married (Joint)' },
  { id: 'hoh', label: 'HEAD OF HOUSEHOLD', boomer: 'Head of Household' },
];

interface ManualInputs { income: string; expenses: string; retirement: string; healthInsurance: string; homeOffice: string }
const EMPTY_MANUAL: ManualInputs = { income: '', expenses: '', retirement: '', healthInsurance: '', homeOffice: '' };

export default function TurboTax() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TaxEstimate | null>(null);
  const [scheduleC, setScheduleC] = useState<ScheduleC | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [attach, setAttach] = useState(true);
  const [scope, setScope] = useState<'personal' | 'org'>('personal');
  const [scopeError, setScopeError] = useState('');
  const [manual, setManual] = useState<ManualInputs>(EMPTY_MANUAL);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('attach', attach ? '1' : '0');
    p.set('filingStatus', filingStatus);
    // Org scope only makes sense when pulling live books across members.
    if (attach && scope === 'org') p.set('scope', 'org');
    // Adjustments always apply; income/expenses only when entering manually.
    const fields: (keyof ManualInputs)[] = attach
      ? ['retirement', 'healthInsurance', 'homeOffice']
      : ['income', 'expenses', 'retirement', 'healthInsurance', 'homeOffice'];
    for (const f of fields) {
      const v = manual[f].trim();
      if (v !== '' && Number.isFinite(Number(v))) p.set(f, String(Number(v)));
    }
    return p.toString();
  }, [attach, filingStatus, manual, scope]);

  const fetchData = useCallback(async (query: string) => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    setScopeError('');
    try {
      const r = await apiFetch(`/api/enterprise/tax/schedule-c?${query}`);
      if (r.ok) {
        const json = await r.json() as { estimate: TaxEstimate; scheduleC: ScheduleC };
        setData(json.estimate);
        setScheduleC(json.scheduleC);
      } else if (r.status === 428 || r.status === 403 || r.status === 400) {
        const msg = (await r.json().catch(() => ({}))).error || 'Tax data is not available until you connect your tax provider.';
        setScopeError(msg);
        setData(null);
        setScheduleC(null);
      }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  const downloadExport = useCallback(async (format: 'csv' | 'json') => {
    if (!isAuthenticated || exporting) return;
    setExporting(format);
    try {
      const p = new URLSearchParams(buildQuery());
      p.set('format', format);
      const r = await apiFetch(`/api/enterprise/tax/export?${p.toString()}`);
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'csv' ? `schedule-c-${data?.asOf ?? 'export'}.csv` : `tax-ready-${data?.asOf ?? 'export'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }, [isAuthenticated, exporting, buildQuery, data]);

  // Debounce so typing in the manual fields doesn't hammer the API.
  useEffect(() => {
    const query = buildQuery();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [buildQuery, fetchData]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to estimate your business taxes." />;

  const owe = data?.totalTax ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] right-[-5%] w-[34%] h-[34%] bg-amber-500/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Tax Estimator' : 'TURBO TAX — ESTIMATE ENGINE'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Estimate your self-employment taxes.' : 'SELF-EMPLOYMENT · INCOME TAX · QBI · QUARTERLY'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => downloadExport('csv')} disabled={!data || !!exporting}
              data-testid="tax-export-csv"
              title="Download a tax-ready Schedule C as CSV (TurboTax / CPA import)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-xs font-mono transition-colors disabled:opacity-50">
              {exporting === 'csv' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
              CSV
            </button>
            <button onClick={() => downloadExport('json')} disabled={!data || !!exporting}
              data-testid="tax-export-json"
              title="Download the full tax-ready data as JSON"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 text-xs font-mono transition-colors disabled:opacity-50">
              {exporting === 'json' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3" />}
              JSON
            </button>
            <button onClick={() => fetchData(buildQuery())} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              RECALCULATE
            </button>
          </div>
        </div>

        {/* Attach toggle + filing status */}
        <div className="space-y-3 mb-6">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAttach(true)}
              data-testid="tax-attach-books"
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${attach ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
              <Link2 className="w-3.5 h-3.5" />
              <span className="text-left leading-tight">{boomerMode ? 'Use my books' : 'ATTACH ACCOUNTING BOOKS'}</span>
            </button>
            <button
              onClick={() => setAttach(false)}
              data-testid="tax-manual-entry"
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${!attach ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
              <PencilLine className="w-3.5 h-3.5" />
              <span className="text-left leading-tight">{boomerMode ? 'Enter manually' : 'MANUAL ENTRY'}</span>
            </button>
          </div>
          <div className="text-[10px] text-zinc-600 font-mono px-1">
            {attach
              ? 'Income & expenses are pulled live from your accounting books. Add optional deductions below.'
              : 'Enter your own figures. Nothing is pulled from your books.'}
          </div>

          {/* Data scope — personal books vs. the whole organization (gated by org permissions). */}
          {attach && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setScope('personal')}
                  data-testid="tax-scope-personal"
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${scope === 'personal' ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
                  <Link2 className="w-3.5 h-3.5" />
                  <span className="text-left leading-tight">{boomerMode ? 'Just me' : 'MY BOOKS'}</span>
                </button>
                <button
                  onClick={() => setScope('org')}
                  data-testid="tax-scope-org"
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${scope === 'org' ? 'bg-violet-500/15 border-violet-500/40 text-violet-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-left leading-tight">{boomerMode ? 'My whole company' : 'ORGANIZATION'}</span>
                </button>
              </div>
              <div className="text-[10px] text-zinc-600 font-mono px-1">
                {scope === 'org'
                  ? "Combines every member's books org-wide. Requires org finance permissions."
                  : 'Uses only your own accounting books.'}
              </div>
              {scopeError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>{scopeError}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {FILING_OPTIONS.map((f) => {
              const active = filingStatus === f.id;
              return (
                <button key={f.id} onClick={() => setFilingStatus(f.id)} data-testid={`tax-filing-${f.id}`}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-colors border ${active ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
                  {boomerMode ? f.boomer : f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {!attach && (
            <>
              <NumField label="Gross business income" value={manual.income} onChange={(v) => setManual((m) => ({ ...m, income: v }))} />
              <NumField label="Business expenses" value={manual.expenses} onChange={(v) => setManual((m) => ({ ...m, expenses: v }))} />
            </>
          )}
          <NumField label="Retirement (Solo 401k / SEP)" value={manual.retirement} onChange={(v) => setManual((m) => ({ ...m, retirement: v }))} />
          <NumField label="SE health insurance premiums" value={manual.healthInsurance} onChange={(v) => setManual((m) => ({ ...m, healthInsurance: v }))} />
          <NumField label="Home office deduction" value={manual.homeOffice} onChange={(v) => setManual((m) => ({ ...m, homeOffice: v }))} />
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : !data ? (
          <div className="text-center py-20 text-sm text-muted-foreground">No estimate available.</div>
        ) : (
          <div className="space-y-6">
            {/* Hero — what you owe */}
            <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.06] to-transparent p-6 text-center">
              <div className="text-[10px] font-mono text-amber-400/70 uppercase tracking-widest mb-1">ESTIMATED FEDERAL TAX · {data.taxYear}</div>
              <div className="text-4xl sm:text-5xl font-black text-amber-300 tabular-nums">{fmt$(owe)}</div>
              <div className="flex items-center justify-center gap-4 mt-3 text-[11px] font-mono text-zinc-500">
                <span className="flex items-center gap-1"><Percent className="w-3 h-3" /> {(data.effectiveRate).toFixed(1)}% effective</span>
                <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {(data.marginalRate * 100).toFixed(0)}% marginal</span>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
                <CalendarClock className="w-3.5 h-3.5" />
                {fmt$(data.quarterlyPayment)} / quarter estimated payment
              </div>
            </div>

            {/* Breakdown grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownCard title="INCOME">
                <Row label="Gross business income" value={fmt$(data.inputs.grossIncome)} />
                <Row label="Business expenses" value={`(${fmt$(data.inputs.businessExpenses)})`} muted />
                {data.inputs.homeOffice > 0 && <Row label="Home office" value={`(${fmt$(data.inputs.homeOffice)})`} muted />}
                <Row label="Net business income" value={fmt$(data.inputs.netBusinessIncome)} bold />
              </BreakdownCard>

              <BreakdownCard title="SELF-EMPLOYMENT TAX">
                <Row label="Net SE income (92.35%)" value={fmt$(data.selfEmployment.netSeIncome)} muted />
                <Row label="Social Security (12.4%)" value={fmt$(data.selfEmployment.socialSecurity)} />
                <Row label="Medicare (2.9%)" value={fmt$(data.selfEmployment.medicare)} />
                <Row label="SE tax" value={fmt$(data.selfEmployment.total)} bold tone="red" />
              </BreakdownCard>

              <BreakdownCard title="DEDUCTIONS">
                <Row label="Standard deduction" value={`(${fmt$(data.deductions.standardDeduction)})`} muted />
                <Row label="½ SE tax" value={`(${fmt$(data.deductions.halfSeTax)})`} muted />
                {data.deductions.qbiDeduction > 0 && <Row label="QBI (20%)" value={`(${fmt$(data.deductions.qbiDeduction)})`} muted />}
                {data.deductions.retirement > 0 && <Row label="Retirement" value={`(${fmt$(data.deductions.retirement)})`} muted />}
                {data.deductions.healthInsurance > 0 && <Row label="SE health insurance" value={`(${fmt$(data.deductions.healthInsurance)})`} muted />}
              </BreakdownCard>

              <BreakdownCard title="INCOME TAX">
                <Row label="Adjusted gross income" value={fmt$(data.adjustedGrossIncome)} muted />
                <Row label="Taxable income" value={fmt$(data.taxableIncome)} />
                <Row label="Federal income tax" value={fmt$(data.incomeTax)} bold tone="red" />
                <Row label="+ SE tax" value={fmt$(data.selfEmployment.total)} muted />
                <Row label="Total tax" value={fmt$(data.totalTax)} bold tone="amber" />
              </BreakdownCard>
            </div>

            {/* Deduction finder */}
            {data.suggestions.length > 0 && (
              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">DEDUCTION FINDER</span>
                </div>
                <div className="divide-y divide-zinc-800/60">
                  {data.suggestions.map((s, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                      <Lightbulb className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground font-semibold">{s.title}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{s.detail}</div>
                      </div>
                      {s.estSavings > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-[9px] font-mono text-zinc-600 uppercase">est. saves</div>
                          <div className="text-sm font-bold text-emerald-400">{fmt$(s.estSavings)}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tax-ready Schedule C */}
            {scheduleC && (
              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      {boomerMode ? 'Tax-Ready Schedule C' : 'TAX-READY · SCHEDULE C (FORM 1040)'}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-600 uppercase">{scheduleC.taxYear}</span>
                </div>
                <div className="px-5 py-3 space-y-2">
                  <Row label="Line 1 · Gross receipts" value={fmt$(scheduleC.partI.grossReceipts)} />
                  {scheduleC.partI.returnsAllowances > 0 && (
                    <Row label="Line 2 · Returns & allowances" value={`(${fmt$(scheduleC.partI.returnsAllowances)})`} muted />
                  )}
                  <Row label="Line 7 · Gross income" value={fmt$(scheduleC.partI.grossIncome)} bold />
                  <div className="h-px bg-zinc-800/60 my-1.5" />
                  {scheduleC.partII.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-600 py-1">No categorized expenses on the books yet.</div>
                  ) : (
                    scheduleC.partII.map((l) => (
                      <div key={l.line}>
                        <Row label={`Line ${l.line} · ${l.label}`} value={`(${fmt$(l.amount)})`} muted />
                        {l.note && <div className="text-[9px] text-amber-500/60 font-mono pl-1 -mt-1 mb-1">{l.note}</div>}
                      </div>
                    ))
                  )}
                  <div className="h-px bg-zinc-800/60 my-1.5" />
                  <Row label="Line 28 · Total expenses" value={`(${fmt$(scheduleC.totalExpenses)})`} muted />
                  <Row label="Line 31 · Net profit / (loss)" value={fmt$(scheduleC.netProfit)} bold tone="amber" />
                </div>
                <div className="bg-zinc-900/30 px-5 py-2.5 border-t border-zinc-800 text-[9px] text-zinc-600 font-mono leading-relaxed">
                  {scheduleC.disclaimer}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-[10px] text-zinc-500 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
              <span>{data.disclaimer}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-white/8 bg-zinc-900/40 focus-within:border-amber-500/40 transition-colors">
        <span className="pl-3 text-zinc-600 text-sm">$</span>
        <input
          type="number" inputMode="decimal" min="0" placeholder="0"
          value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-2 py-2 text-sm text-foreground font-mono outline-none placeholder:text-zinc-700"
        />
      </div>
    </label>
  );
}

function BreakdownCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-5 py-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, muted, tone }: { label: string; value: string; bold?: boolean; muted?: boolean; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-300' : muted ? 'text-zinc-500' : 'text-foreground';
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className={muted ? 'text-zinc-600' : 'text-zinc-400'}>{label}</span>
      <span className={`tabular-nums ${color} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}
