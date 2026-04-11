import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase, Users, CalendarDays, Archive, FileText, TrendingUp,
  DollarSign, Receipt, CreditCard, Scale, Shield, Code2, Loader2,
  ArrowRight, Building2, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Megaphone, Target, Search,
  BarChart2, LayoutDashboard, Bot, Zap, Clock, Phone,
  Lightbulb, BookOpen, Star, Info,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { Link } from 'wouter';

interface OrgData {
  org: { id: number; name: string; industry: string | null; size: string | null } | null;
  member: { role: string; title: string | null; salary: string | null } | null;
  members: { userId: string; role: string; status: string; title: string | null }[];
}

interface Summary {
  employees: { active: number };
  bills: { total: number; pending: number; overdue: number };
  expenses: { total: number; amount: number };
  invoices: { total: number; paid: number; open: number; overdue: number };
  payroll: { runs: number; total: number };
  financials: { grossIncome: number; payrollTotal: number; billsTotal: number; expensesTotal: number; netProfit: number };
}

interface ModuleLink {
  path: string;
  label: string;
  boomer: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}

interface Section {
  title: string;
  subtitle: string;
  items: ModuleLink[];
}

const SECTIONS: Section[] = [
  {
    title: 'PEOPLE & OPERATIONS',
    subtitle: 'MANAGE YOUR TEAM, CONTACTS, AND DAY-TO-DAY OPERATIONS',
    items: [
      { path: '/business/contacts', label: 'CONTACTS', boomer: 'CONTACTS', desc: 'MANAGE YOUR CONTACT DATABASE, COMPANY RELATIONSHIPS, AND INTERACTION HISTORY. IMPORT/EXPORT CSV, LOG CALLS AND EMAILS, AND TRACK ENGAGEMENT ACROSS YOUR NETWORK.', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/hiring', label: 'HIRING', boomer: 'HIRING & HR', desc: 'POST JOB LISTINGS, TRACK APPLICANTS THROUGH YOUR PIPELINE, MANAGE YOUR STAFF DIRECTORY, AND HANDLE ONBOARDING. FULL HR SUITE WITH ROLE MANAGEMENT AND TEAM OVERVIEW.', icon: Briefcase, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
      { path: '/business/interview', label: 'INTERVIEW OFFICE', boomer: 'INTERVIEW OFFICE', desc: 'CONDUCT AI-POWERED INTERVIEWS AND TECHNICAL ASSESSMENTS. GENERATE CUSTOM QUESTIONS, EVALUATE RESPONSES, AND BUILD STRUCTURED INTERVIEW TEMPLATES FOR YOUR HIRING PROCESS.', icon: Code2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
      { path: '/business/calendar', label: 'CALENDAR', boomer: 'CALENDAR', desc: 'SCHEDULE MEETINGS, SET DEADLINES, AND MANAGE EVENTS. ORGANIZE YOUR BUSINESS TIMELINE WITH REMINDERS, RECURRING EVENTS, AND TEAM COORDINATION.', icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/documents', label: 'DOCUMENTS', boomer: 'DOCUMENTS', desc: 'STORE, ORGANIZE, AND RETRIEVE YOUR BUSINESS FILES. CENTRALIZED DOCUMENT ARCHIVE WITH CATEGORIZATION, SEARCH, AND VERSION TRACKING.', icon: Archive, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    ],
  },
  {
    title: 'SALES & REVENUE',
    subtitle: 'TRACK YOUR PIPELINE, CLOSE DEALS, AND MANAGE CLIENT BILLING',
    items: [
      { path: '/business/deals', label: 'DEALS', boomer: 'DEALS', desc: 'KANBAN-STYLE SALES PIPELINE TRACKING FROM LEAD TO CLOSE. MANAGE DEAL STAGES (LEAD, PROPOSAL, NEGOTIATION, WON, LOST), ASSIGN VALUES, SET EXPECTED CLOSE DATES, AND LINK CONTACTS.', icon: TrendingUp, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/invoices', label: 'INVOICES', boomer: 'INVOICES', desc: 'CREATE PROFESSIONAL INVOICES WITH LINE ITEMS, TAX RATES, AND PAYMENT TERMS. TRACK STATUS FROM DRAFT THROUGH SENT TO PAID. GENERATE PDF EXPORTS AND MANAGE YOUR RECEIVABLES LEDGER.', icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/marketing/leads', label: 'LEADS', boomer: 'LEAD DATABASE', desc: 'BUILD AND MANAGE YOUR PROSPECT DATABASE. SCORE AND QUALIFY LEADS, TRACK SOURCE CHANNELS, AND MOVE QUALIFIED PROSPECTS INTO YOUR SALES PIPELINE FOR CONVERSION.', icon: Target, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    ],
  },
  {
    title: 'FINANCIALS',
    subtitle: 'PAYROLL, ACCOUNTS PAYABLE, EXPENSE TRACKING, AND P&L OVERVIEW',
    items: [
      { path: '/business/payroll', label: 'PAYROLL', boomer: 'PAYROLL', desc: 'MANAGE YOUR EMPLOYEE ROSTER WITH PAY RATES AND FREQUENCIES. RUN PAYROLL CYCLES, TRACK TOTAL COMPENSATION, AND MAINTAIN COMPLETE PAYMENT HISTORY ACROSS YOUR WORKFORCE.', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
      { path: '/business/bills', label: 'BILLS', boomer: 'BILLS', desc: 'TRACK ACCOUNTS PAYABLE WITH VENDORS, DUE DATES, AND PAYMENT STATUS. CATEGORIZE BY TYPE (RENT, UTILITIES, SUBSCRIPTIONS, INSURANCE, VENDOR), SET RECURRENCE SCHEDULES, AND PREVENT OVERDUE PAYMENTS.', icon: Receipt, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
      { path: '/business/expenses', label: 'EXPENSES', boomer: 'EXPENSES', desc: 'LOG AND CATEGORIZE BUSINESS SPENDING WITH RECEIPT TRACKING. ORGANIZE BY CATEGORY (TRAVEL, SUPPLIES, SOFTWARE, MEALS, EQUIPMENT), ATTACH DOCUMENTATION, AND MONITOR SPENDING PATTERNS.', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
      { path: '/business/balance-sheet', label: 'BALANCE SHEET', boomer: 'BALANCE SHEET', desc: 'REAL-TIME PROFIT AND LOSS OVERVIEW COMBINING GROSS INVOICE INCOME AGAINST PAYROLL, BILLS, AND EXPENSES. COMPLETE LEDGER VIEW WITH CATEGORY BREAKDOWNS AND FINANCIAL HISTORY.', icon: Scale, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    ],
  },
  {
    title: 'MARKETING & GROWTH',
    subtitle: 'CAMPAIGNS, SEO, AND OUTREACH TO GROW YOUR BUSINESS',
    items: [
      { path: '/marketing/campaigns', label: 'CAMPAIGNS', boomer: 'CAMPAIGNS', desc: 'PLAN AND EXECUTE MARKETING CAMPAIGNS. MANAGE OUTREACH SEQUENCES, TRACK PERFORMANCE METRICS, AND COORDINATE MULTI-CHANNEL MARKETING EFFORTS TO DRIVE BUSINESS GROWTH.', icon: Megaphone, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
      { path: '/marketing/seo', label: 'SEO', boomer: 'SEO', desc: 'ANALYZE AND OPTIMIZE YOUR WEB PRESENCE. CRAWL YOUR SITE, IDENTIFY TECHNICAL ISSUES, TRACK KEYWORD RANKINGS, AND GET ACTIONABLE RECOMMENDATIONS TO IMPROVE SEARCH VISIBILITY.', icon: Search, color: 'text-lime-400', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
    ],
  },
  {
    title: 'ANALYTICS & INTELLIGENCE',
    subtitle: 'REPORTS, DASHBOARDS, AND GOAL TRACKING FOR DATA-DRIVEN DECISIONS',
    items: [
      { path: '/intel/reports', label: 'REPORTS', boomer: 'REPORTS', desc: 'GENERATE DETAILED BUSINESS INTELLIGENCE REPORTS WITH DATA VISUALIZATION. ANALYZE TRENDS, COMPARE PERIODS, AND EXPORT INSIGHTS FOR STAKEHOLDER PRESENTATIONS.', icon: BarChart2, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
      { path: '/intel/dashboard', label: 'DASHBOARD', boomer: 'DASHBOARD', desc: 'REAL-TIME COMMAND DASHBOARD WITH KEY PERFORMANCE INDICATORS. AT-A-GLANCE VIEW OF YOUR MOST IMPORTANT BUSINESS METRICS, ACTIVITY FEEDS, AND OPERATIONAL STATUS.', icon: LayoutDashboard, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
      { path: '/intel/goals', label: 'GOALS', boomer: 'GOALS', desc: 'SET QUARTERLY AND ANNUAL BUSINESS OBJECTIVES. TRACK PROGRESS WITH MILESTONES, ASSIGN OWNERSHIP, AND ALIGN TEAM EFFORTS AROUND MEASURABLE KEY RESULTS.', icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    ],
  },
  {
    title: 'AI & AUTOMATION',
    subtitle: 'LEVERAGE AI BOTS AND AUTOMATION TO SCALE YOUR OPERATIONS',
    items: [
      { path: '/bots', label: 'BOT FACTORY', boomer: 'BOT FACTORY', desc: 'ACCESS THE FULL MARKETPLACE OF 77 SPECIALIZED AI BOTS. DEPLOY AGENTS FOR CUSTOMER SERVICE, DATA ANALYSIS, CONTENT CREATION, AND MORE. MANAGED BY JEAN CLAW.', icon: Bot, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
      { path: '/bots/jobs', label: 'JOB CENTER', boomer: 'JOB COMMAND CENTER', desc: 'AI-POWERED JOB SEARCH AUTOMATION. PIPELINE SCORING, APPLICATION TRACKING, RESUME TAILORING, AND INTERVIEW PREPARATION ALL IN ONE COMMAND CENTER.', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
      { path: '/bots/templates', label: 'TEMPLATES', boomer: 'CLAUDE TEMPLATES', desc: 'BROWSE A LIBRARY OF PRE-BUILT AI AGENT TEMPLATES, SKILLS, AND WORKFLOW COMMANDS. COPY AND CUSTOMIZE TEMPLATES TO ACCELERATE YOUR BOT DEPLOYMENTS.', icon: BookOpen, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    ],
  },
  {
    title: 'COMMUNICATION',
    subtitle: 'PHONE SYSTEM, MEETINGS, AND INTERNAL MESSAGING',
    items: [
      { path: '/phone/dialer', label: 'PHONE SYSTEM', boomer: 'PHONE SYSTEM', desc: 'FULL BUSINESS PHONE WITH DIALER, CALL LOG, VOICEMAIL, AND CONFERENCE CALLING. AI CALL COACHING AND AUTOMATED DIALING SESSIONS FOR SALES TEAMS.', icon: Phone, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/phone/secretary', label: 'AI SECRETARY', boomer: 'AI SECRETARY', desc: 'AUTOMATED CALL HANDLING AND SCHEDULING. YOUR AI SECRETARY SCREENS CALLS, TAKES MESSAGES, BOOKS APPOINTMENTS, AND MANAGES YOUR AVAILABILITY.', icon: Clock, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    ],
  },
  {
    title: 'TOOLS & INTEGRATIONS',
    subtitle: 'SPECIALIZED TOOLS AND EXTERNAL SERVICE CONNECTIONS',
    items: [
      { path: '/insurance', label: 'INSURANCE API', boomer: 'INSURANCE API', desc: 'SEARCH AND COMPARE INSURANCE CARRIERS ACROSS MULTIPLE LINES OF COVERAGE. ACCESS CARRIER DETAILS, RATINGS, CONTACT INFORMATION, AND COVERAGE SPECIALIZATIONS.', icon: Shield, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
      { path: '/profile/platform', label: 'PLATFORM API', boomer: 'PLATFORM API', desc: 'MANAGE API KEYS, WEBHOOKS, AND CONNECTED APPLICATIONS. FULL DEVELOPER TOOLS FOR INTEGRATING SALARYMAN WITH YOUR EXTERNAL SYSTEMS AND WORKFLOWS.', icon: Zap, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    ],
  },
];

const QUICK_ACTIONS = [
  { path: '/business/contacts', label: 'ADD CONTACT', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { path: '/business/invoices', label: 'CREATE INVOICE', icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { path: '/business/deals', label: 'NEW DEAL', icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { path: '/business/hiring', label: 'POST JOB', icon: Briefcase, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { path: '/business/expenses', label: 'LOG EXPENSE', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { path: '/business/bills', label: 'ADD BILL', icon: Receipt, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
];

const TIPS = [
  { icon: Lightbulb, text: 'USE THE BALANCE SHEET TO GET A REAL-TIME VIEW OF YOUR PROFIT AND LOSS ACROSS ALL FINANCIAL ACTIVITY.' },
  { icon: Star, text: 'CONNECT YOUR CONTACTS TO DEALS FOR END-TO-END PIPELINE TRACKING FROM FIRST TOUCH TO CLOSED-WON.' },
  { icon: Info, text: 'SET UP RECURRING BILLS TO AUTOMATICALLY TRACK RENT, SUBSCRIPTIONS, AND VENDOR PAYMENTS.' },
  { icon: Zap, text: 'DEPLOY AI BOTS FROM THE BOT FACTORY TO AUTOMATE CUSTOMER SERVICE, DATA ENTRY, AND CONTENT CREATION.' },
  { icon: Target, text: 'USE THE GOALS MODULE TO SET QUARTERLY OBJECTIVES AND TRACK PROGRESS AGAINST KEY RESULTS.' },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function BusinessHub() {
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [orgRes, sumRes] = await Promise.all([
        apiFetch('/api/orgs/me'),
        apiFetch('/api/enterprise/summary'),
      ]);
      if (orgRes.ok) setOrgData(await orgRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAuthenticated) return <SignInPage />;

  const hasOrg = orgData?.org;
  const netProfit = summary?.financials?.netProfit ?? 0;
  const isPositive = netProfit >= 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase">{boomerMode ? 'BUSINESS MANAGEMENT' : 'OPS-CORE // COMMAND'}</h1>
            <p className="text-xs text-muted-foreground tracking-wider uppercase">
              {hasOrg ? orgData.org!.name : 'YOUR BUSINESS HEADQUARTERS'}
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          REFRESH
        </button>
      </motion.div>

      {hasOrg && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-card/50 border border-border/50 p-4"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-bold tracking-wider uppercase">{orgData!.org!.name}</div>
              <div className="text-xs text-muted-foreground tracking-wider uppercase">
                {orgData!.org!.industry || 'NO INDUSTRY SET'} {orgData!.org!.size ? `· ${orgData!.org!.size}` : ''}
              </div>
            </div>
            {orgData!.member && (
              <div className="text-right">
                <div className="text-xs font-bold uppercase tracking-wider text-primary">{orgData!.member!.role}</div>
                {orgData!.member!.title && <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{orgData!.member!.title}</div>}
              </div>
            )}
            {orgData!.members && orgData!.members.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">{orgData!.members.filter(m => m.status === 'active').length} MEMBERS</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-4"
            >
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">FINANCIAL SNAPSHOT</span>
              </div>

              <div className="space-y-3">
                <StatRow
                  label="NET PROFIT"
                  value={fmt(Math.abs(netProfit))}
                  prefix={isPositive ? '+' : '-'}
                  icon={isPositive ? ArrowUpRight : ArrowDownRight}
                  color={isPositive ? 'text-emerald-400' : 'text-red-400'}
                  bg={isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}
                  border={isPositive ? 'border-emerald-500/20' : 'border-red-500/20'}
                  highlight
                />
                <StatRow label="GROSS INCOME" value={fmt(summary.financials.grossIncome)} icon={DollarSign} color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/20" />
                <StatRow label="TOTAL OUTGOINGS" value={fmt(summary.financials.payrollTotal + summary.financials.billsTotal + summary.financials.expensesTotal)} icon={ArrowDownRight} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20" />

                <div className="border-t border-border/30 pt-3 space-y-2">
                  <StatRow label="PAYROLL" value={fmt(summary.payroll.total)} sub={`${summary.payroll.runs} RUNS`} icon={DollarSign} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" />
                  <StatRow label="BILLS" value={fmt(summary.financials.billsTotal)} sub={summary.bills.overdue > 0 ? `${summary.bills.overdue} OVERDUE` : `${summary.bills.total} TOTAL`} subColor={summary.bills.overdue > 0 ? 'text-red-400' : undefined} icon={Receipt} color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/20" />
                  <StatRow label="EXPENSES" value={fmt(summary.expenses.amount)} sub={`${summary.expenses.total} ENTRIES`} icon={CreditCard} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" />
                </div>

                <div className="border-t border-border/30 pt-3 space-y-2">
                  <StatRow label="INVOICES" value={String(summary.invoices.total)} sub={summary.invoices.open > 0 ? `${summary.invoices.open} OPEN` : `${summary.invoices.paid} PAID`} icon={FileText} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" />
                  <StatRow label="EMPLOYEES" value={String(summary.employees.active)} sub="ACTIVE" icon={Users} color="text-violet-400" bg="bg-violet-500/10" border="border-violet-500/20" />
                </div>
              </div>
            </motion.div>
          )}

          {summary && (summary.bills.overdue > 0 || summary.invoices.overdue > 0 || summary.invoices.open > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">ACTION REQUIRED</span>
              </div>
              <div className="space-y-2">
                {summary.bills.overdue > 0 && (
                  <Link href="/business/bills" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <Receipt className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{summary.bills.overdue} OVERDUE {summary.bills.overdue === 1 ? 'BILL' : 'BILLS'} — REVIEW AND PAY NOW</span>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                  </Link>
                )}
                {summary.invoices.overdue > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{summary.invoices.overdue} OVERDUE {summary.invoices.overdue === 1 ? 'INVOICE' : 'INVOICES'} — FOLLOW UP WITH CLIENTS</span>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                  </Link>
                )}
                {summary.invoices.open > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{summary.invoices.open} OPEN {summary.invoices.open === 1 ? 'INVOICE' : 'INVOICES'} — SEND OR FINALIZE</span>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">QUICK ACTIONS</span>
            </div>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.path + action.label}
                    href={action.path}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg ${action.bg} border ${action.border} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${action.color}`} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider flex-1">{action.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </motion.div>

          {SECTIONS.map((section, si) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + si * 0.03 }}
              className="rounded-xl bg-card/50 border border-border/50 overflow-hidden"
            >
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.15em]">{section.title}</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{section.subtitle}</p>
              </div>
              <div className="divide-y divide-border/30">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className="group flex items-start gap-3 px-4 py-3.5 hover:bg-muted/10 transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold uppercase tracking-wider">{boomerMode ? item.boomer : item.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">TIPS & BEST PRACTICES</span>
            </div>
            <div className="space-y-2">
              {TIPS.map((tip, i) => {
                const Icon = tip.icon;
                return (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-muted/10">
                    <Icon className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-relaxed">{tip.text}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {!hasOrg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="rounded-xl bg-primary/5 border border-primary/20 p-6 text-center space-y-3"
            >
              <Building2 className="w-10 h-10 text-primary/60 mx-auto" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider">NO ORGANIZATION YET</h3>
                <p className="text-xs text-muted-foreground tracking-wider mt-1 uppercase">
                  CREATE OR JOIN AN ORGANIZATION TO UNLOCK TEAM MANAGEMENT, SHARED BILLING, AND COLLABORATIVE FEATURES.
                </p>
              </div>
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                GO TO PROFILE
              </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function StatRow({ label, value, prefix, sub, subColor, icon: Icon, color, bg, border, highlight }: {
  label: string;
  value: string;
  prefix?: string;
  sub?: string;
  subColor?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${highlight ? `${bg} border ${border}` : ''}`}>
      <div className={`w-8 h-8 rounded-lg ${bg} border ${border} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex-1">{label}</span>
      {sub && <span className={`text-[10px] font-bold uppercase tracking-wider ${subColor || 'text-muted-foreground/60'}`}>{sub}</span>}
      <span className={`text-sm font-bold tracking-wider ${color} tabular-nums`}>{prefix}{value}</span>
    </div>
  );
}
