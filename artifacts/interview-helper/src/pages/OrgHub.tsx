import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Building2, Users, Briefcase, BookOpen, ArrowRight,
  ShieldCheck, Loader2, Plus, Settings,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useOrg } from '@/hooks/use-org';
import { OrgConstructionOverview } from '@/components/ConstructionOverview';

// ORG hub — a dedicated home for running your organization. It does NOT
// reimplement any management features; it surfaces the EXISTING org-management
// surfaces (team roster, hiring/firing, roles & permissions, finances) as
// linked cards. Distinct from the OFFICE tab (the playable office floor).
const MANAGEMENT_SECTIONS = [
  {
    path: '/business/team',
    label: 'EMPLOYEES',
    desc: 'Complete team roster — names, roles, departments, and compensation.',
    icon: Users,
    color: 'text-black',
    bg: 'bg-[#fffaf0]',
    border: 'border-black',
  },
  {
    path: '/business/hiring',
    label: 'HIRING & FIRING',
    desc: 'Post jobs, review applicants, make offers, and manage offboarding.',
    icon: Briefcase,
    color: 'text-black',
    bg: 'bg-[#fffaf0]',
    border: 'border-black',
  },
  {
    path: '/business/accounting',
    label: 'FINANCES',
    desc: 'Accounting, payroll, bills, expenses, P&L, and the balance sheet.',
    icon: BookOpen,
    color: 'text-black',
    bg: 'bg-[#fffaf0]',
    border: 'border-black',
  },
];

const SETTINGS_SECTIONS = [
  {
    path: '/business',
    label: 'ORG SETTINGS',
    desc: 'Identity, roles and permissions, public presence, protected paperwork, and ownership controls.',
    icon: Settings,
    color: 'text-black',
    bg: 'bg-[#fffaf0]',
    border: 'border-black',
  },
  {
    path: '/tower',
    label: 'LAND & CONSTRUCTION',
    desc: 'Claim land, review plot status, and submit approved construction designs.',
    icon: Building2,
    color: 'text-black',
    bg: 'bg-[#fffaf0]',
    border: 'border-black',
  },
];

function roleLabel(role: string | null | undefined): string {
  if (!role) return 'MEMBER';
  return role.toUpperCase();
}

export default function OrgHub() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const { org, member, loading } = useOrg();

  if (!isLoading && !isAuthenticated) {
    return <SignInPage />;
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Org identity header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-black bg-[#fffaf0] p-5 sm:p-6 mb-6"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#fffaf0] border border-black flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-black" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-zinc-500 tracking-widest uppercase mb-1">
              Organization
            </p>
            <h1 className="font-mono text-xl sm:text-2xl text-zinc-100 tracking-wide truncate">
              {org?.name ?? 'NO ORGANIZATION'}
            </h1>
            {org && (
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase border text-black bg-[#fffaf0] border-black">
                  <ShieldCheck className="w-3 h-3" />
                  {roleLabel(member?.role)}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {org ? (
        <>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-3">
            Team management · people and daily operations
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MANAGEMENT_SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.button
                  key={s.path}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.05 * i }}
                  onClick={() => navigate(s.path)}
                  className={`group text-left rounded-xl border ${s.border} bg-white/[0.02] hover:bg-white/[0.04] p-5 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`w-10 h-10 rounded-lg ${s.bg} border ${s.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${s.color}`} />
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  </div>
                  <h2 className="font-mono text-sm text-zinc-100 tracking-widest uppercase mt-4">
                    {s.label}
                  </h2>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">
                    {s.desc}
                  </p>
                </motion.button>
              );
            })}
          </div>

          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-3 mt-7">
            Organization settings · identity, permissions and ownership
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {SETTINGS_SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.button
                  key={s.path}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.2 + 0.05 * i }}
                  onClick={() => navigate(s.path)}
                  className={`group text-left rounded-xl border ${s.border} bg-white/[0.02] hover:bg-white/[0.04] p-5 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`w-10 h-10 rounded-lg ${s.bg} border ${s.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${s.color}`} />
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  </div>
                  <h2 className="font-mono text-sm text-zinc-100 tracking-widest uppercase mt-4">{s.label}</h2>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1.5">{s.desc}</p>
                </motion.button>
              );
            })}
          </div>

          <OrgConstructionOverview orgId={org.id} />
        </>
      ) : (
        // Graceful empty state — the user has no org yet. Point them to the
        // Business Hub where orgs are created.
        <div className="rounded-xl border border-black bg-[#fffaf0] p-8 text-center">
          <div className="w-12 h-12 rounded-lg bg-[#fffaf0] border border-black flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-zinc-500" />
          </div>
          <h2 className="font-mono text-base text-zinc-200 tracking-wide mb-2">
            You're not in an organization yet
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-5">
            Create or join an organization to manage employees, hiring, roles &
            permissions, and finances from one place.
          </p>
          <button
            onClick={() => navigate('/business')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-widest uppercase text-black border-2 border-black bg-[#fffaf0] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Set up organization
          </button>
        </div>
      )}
    </div>
  );
}
