// ─── Tax Engine ─────────────────────────────────────────────────────────────
// A "TurboTax"-style estimator for the self-employed / Schedule-C founder. The
// finance engine is an OPTIONAL attachment: pass a live AccountingReport to
// auto-import revenue & expenses from the books, or pass null and supply the
// numbers manually. Either way the same computation runs.
//
// EDUCATIONAL ESTIMATE ONLY — not tax advice. Figures use TY2025 federal
// brackets / TY2026 standard deductions and should be verified annually.

import type { AccountingReport } from "./finance-engine";

export type FilingStatus = "single" | "mfj" | "hoh";

// 2026 standard deduction (per tax-reviewer reference).
const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 16100,
  mfj: 32200,
  hoh: 24150,
};

// 2025 federal ordinary-income brackets (lower bound → marginal rate).
const BRACKETS: Record<FilingStatus, Array<{ upTo: number; rate: number }>> = {
  single: [
    { upTo: 11925, rate: 0.10 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23850, rate: 0.10 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17000, rate: 0.10 },
    { upTo: 64850, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250500, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

// QBI (199A) full-deduction income threshold; above this, wage/capital limits
// kick in — we flag it rather than model the phase-out.
const QBI_THRESHOLD: Record<FilingStatus, number> = {
  single: 197300,
  mfj: 394600,
  hoh: 197300,
};

// Social Security wage base (2025). Medicare has no cap. Verify annually.
const SS_WAGE_BASE = 176100;
const SS_RATE = 0.124;
const MEDICARE_RATE = 0.029;
const SE_TAXABLE_FACTOR = 0.9235; // 92.35% of net SE income is taxable for SE
const SE_FLOOR = 400; // no SE tax below $400 net

export interface TaxOverrides {
  filingStatus?: FilingStatus;
  income?: number; // gross business income override
  expenses?: number; // business expense override
  retirement?: number; // Solo 401(k)/SEP contributions
  healthInsurance?: number; // SE health insurance premiums
  homeOffice?: number; // home office deduction
}

export interface TaxEstimate {
  attached: boolean; // were the figures pulled from the finance engine?
  asOf: string;
  taxYear: string;
  filingStatus: FilingStatus;
  inputs: {
    grossIncome: number;
    businessExpenses: number;
    homeOffice: number;
    netBusinessIncome: number;
    retirement: number;
    healthInsurance: number;
  };
  selfEmployment: {
    netSeIncome: number;
    socialSecurity: number;
    medicare: number;
    total: number;
    deductibleHalf: number;
  };
  deductions: {
    standardDeduction: number;
    qbiDeduction: number;
    halfSeTax: number;
    retirement: number;
    healthInsurance: number;
    aboveTheLineTotal: number;
  };
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

function bracketTax(taxable: number, status: FilingStatus): { tax: number; marginal: number } {
  if (taxable <= 0) return { tax: 0, marginal: 0 };
  const brackets = BRACKETS[status];
  let tax = 0;
  let lower = 0;
  let marginal = brackets[0].rate;
  for (const b of brackets) {
    if (taxable > lower) {
      const slice = Math.min(taxable, b.upTo) - lower;
      tax += slice * b.rate;
      marginal = b.rate;
    }
    lower = b.upTo;
    if (taxable <= b.upTo) break;
  }
  return { tax, marginal };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute a TurboTax-style federal estimate. `report` is the OPTIONAL finance
 * engine attachment — when present, gross income and business expenses are
 * auto-imported from the live books unless explicitly overridden.
 */
export function computeTaxEstimate(report: AccountingReport | null, opts: TaxOverrides = {}): TaxEstimate {
  const filingStatus: FilingStatus = opts.filingStatus ?? "single";
  const attached = report != null;

  const bookGross = report ? report.summary.totalRevenue : 0;
  const bookExpenses = report
    ? report.summary.totalPayroll + report.summary.totalBills + report.summary.totalExpenses
    : 0;

  const grossIncome = Math.max(0, opts.income ?? bookGross);
  const businessExpenses = Math.max(0, opts.expenses ?? bookExpenses);
  const homeOffice = Math.max(0, opts.homeOffice ?? 0);
  const retirement = Math.max(0, opts.retirement ?? 0);
  const healthInsurance = Math.max(0, opts.healthInsurance ?? 0);

  // Home office (Schedule C) reduces net business income, so it also lowers SE
  // tax. Retirement & SE health insurance are Schedule 1 adjustments — they
  // lower AGI but NOT SE tax.
  const netBusinessIncome = Math.max(0, grossIncome - businessExpenses - homeOffice);

  // ── Self-employment tax ──────────────────────────────────────────────────
  const netSeIncome = netBusinessIncome * SE_TAXABLE_FACTOR;
  let socialSecurity = 0;
  let medicare = 0;
  if (netSeIncome >= SE_FLOOR) {
    socialSecurity = Math.min(netSeIncome, SS_WAGE_BASE) * SS_RATE;
    medicare = netSeIncome * MEDICARE_RATE;
  }
  const seTax = socialSecurity + medicare;
  const halfSeTax = seTax / 2;

  // ── Adjusted gross income ────────────────────────────────────────────────
  const aboveTheLine = halfSeTax + retirement + healthInsurance;
  const agi = Math.max(0, netBusinessIncome - aboveTheLine);

  // ── QBI (199A) — 20% of qualified business income, capped at 20% of taxable
  // income before the QBI deduction. ──────────────────────────────────────
  const standardDeduction = STANDARD_DEDUCTION[filingStatus];
  const qbiBase = Math.max(0, netBusinessIncome - aboveTheLine);
  const taxableBeforeQbi = Math.max(0, agi - standardDeduction);
  const qbiDeduction = Math.max(0, Math.min(0.2 * qbiBase, 0.2 * taxableBeforeQbi));
  const qbiThresholdExceeded = agi > QBI_THRESHOLD[filingStatus];

  const taxableIncome = Math.max(0, agi - standardDeduction - qbiDeduction);
  const { tax: incomeTax, marginal } = bracketTax(taxableIncome, filingStatus);

  const totalTax = incomeTax + seTax;
  const effectiveRate = grossIncome > 0 ? totalTax / grossIncome : 0;
  const quarterlyPayment = totalTax / 4;

  // ── Deduction finder ─────────────────────────────────────────────────────
  const combinedRate = marginal + (seTax > 0 ? SE_RATE_ON_DEDUCTION : 0);
  const suggestions: TaxEstimate["suggestions"] = [];
  if (netBusinessIncome > 0 && retirement === 0) {
    const room = Math.min(netSeIncome * 0.25, 70000);
    suggestions.push({
      title: "Open a Solo 401(k) or SEP-IRA",
      detail: `You can shelter up to ~${money(room)} of net self-employment income pre-tax. Contributions lower your AGI dollar-for-dollar.`,
      estSavings: round2(room * marginal),
    });
  }
  if (netBusinessIncome > 0 && healthInsurance === 0) {
    suggestions.push({
      title: "Deduct self-employed health insurance",
      detail: "100% of your medical/dental/vision premiums (self, spouse, dependents) is an above-the-line deduction on Schedule 1.",
      estSavings: 0,
    });
  }
  if (netBusinessIncome > 0 && homeOffice === 0) {
    const ho = 1500; // simplified method: $5/sqft up to 300 sqft
    suggestions.push({
      title: "Claim the home office deduction",
      detail: "Simplified method: $5/sq ft up to 300 sq ft = $1,500. It also reduces self-employment tax since it lowers Schedule C net income.",
      estSavings: round2(ho * combinedRate),
    });
  }
  if (qbiDeduction > 0) {
    suggestions.push({
      title: "QBI deduction applied",
      detail: `The 20% Qualified Business Income deduction is already reducing your taxable income by ${money(qbiDeduction)}.${qbiThresholdExceeded ? " You're above the income threshold — wage/capital limits may reduce this; confirm with a CPA." : ""}`,
      estSavings: round2(qbiDeduction * marginal),
    });
  }

  return {
    attached,
    asOf: report?.asOf ?? new Date().toISOString().slice(0, 10),
    taxYear: "2025 (estimate)",
    filingStatus,
    inputs: {
      grossIncome: round2(grossIncome),
      businessExpenses: round2(businessExpenses),
      homeOffice: round2(homeOffice),
      netBusinessIncome: round2(netBusinessIncome),
      retirement: round2(retirement),
      healthInsurance: round2(healthInsurance),
    },
    selfEmployment: {
      netSeIncome: round2(netSeIncome),
      socialSecurity: round2(socialSecurity),
      medicare: round2(medicare),
      total: round2(seTax),
      deductibleHalf: round2(halfSeTax),
    },
    deductions: {
      standardDeduction,
      qbiDeduction: round2(qbiDeduction),
      halfSeTax: round2(halfSeTax),
      retirement: round2(retirement),
      healthInsurance: round2(healthInsurance),
      aboveTheLineTotal: round2(aboveTheLine),
    },
    adjustedGrossIncome: round2(agi),
    taxableIncome: round2(taxableIncome),
    incomeTax: round2(incomeTax),
    totalTax: round2(totalTax),
    effectiveRate: round2(effectiveRate * 100) / 100,
    marginalRate: marginal,
    quarterlyPayment: round2(quarterlyPayment),
    qbiThresholdExceeded,
    suggestions,
    disclaimer:
      "Educational estimate only — not tax advice. Uses TY2025 federal brackets and TY2026 standard deductions; ignores state tax, credits, withholding, and other income. Consult a CPA before filing.",
  };
}

// SE tax on a Schedule-C deduction is ~14.13% (15.3% × 92.35%); used to value
// deductions that also reduce self-employment income.
const SE_RATE_ON_DEDUCTION = 0.1413;

function money(v: number): string {
  return `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
