import { apiFetch } from '@/lib/api-client';
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Layers,
  Zap,
  TrendingUp,
  Users,
  Globe,
  Target,
  AlertCircle,
  Check,
  Loader2,
  ChevronLeft,
  Scale,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${BASE ? BASE + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}

const INVESTMENT_RANGES = [
  "Under $25K",
  "$25K – $100K",
  "$100K – $500K",
  "$500K – $1M",
  "$1M+",
  "Prefer not to say",
];

function InvestorForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    investmentRange: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await apiFetch(apiUrl("investors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-start gap-4 px-6 py-5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
        <Check className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm mb-1">Inquiry received.</p>
          <p className="text-sky-400/70 text-xs leading-relaxed">
            Thank you, {form.name}. We read every investor inquiry personally and will be in touch if there's a fit. Check your inbox at {form.email} for a confirmation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
            Your Name <span className="text-sky-500/60">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full Name"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
            Email Address <span className="text-sky-500/60">*</span>
          </label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@fund.com"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
            Company / Fund <span className="text-zinc-700">(optional)</span>
          </label>
          <input
            type="text"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            placeholder="Acme Capital"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
            Investment Range <span className="text-zinc-700">(optional)</span>
          </label>
          <select
            value={form.investmentRange}
            onChange={(e) => setForm((f) => ({ ...f, investmentRange: e.target.value }))}
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all font-mono"
          >
            <option value="">Select a range...</option>
            {INVESTMENT_RANGES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
          Message / Notes <span className="text-sky-500/60">*</span>
        </label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder="Tell us about your investment thesis, why SALARYMAN resonates with you, or any questions you have..."
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all resize-none font-mono"
        />
      </div>
      {status === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium hover:bg-sky-500/25 transition-all disabled:opacity-50 font-mono tracking-wide"
      >
        {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {status === "loading" ? "Sending..." : "Submit Inquiry"}
      </button>
      <p className="text-[10px] font-mono text-zinc-700 tracking-wide">
        No spam. No automated follow-ups. We read every message personally.
      </p>
    </form>
  );
}

export default function InvestorsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-mono">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-sky-500/3 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-sky-500/2 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">

        <div className="flex items-center justify-between mb-12">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-sky-400 transition-colors uppercase tracking-widest"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to SALARYMAN
          </button>
          <div className="flex items-center gap-2 text-sky-400/70 text-xs tracking-widest uppercase">
            <Scale className="w-3.5 h-3.5" />
            PICASSO AI LLC
          </div>
        </div>

        <div className="mb-4">
          <span className="inline-flex items-center gap-2 text-[9px] font-mono tracking-widest uppercase text-sky-500/70 border border-sky-500/25 bg-sky-500/8 px-2.5 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            ALPHA {__BUILD_VERSION__} · Alpha Stage
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-zinc-100 tracking-tight mb-3 leading-tight">
          SALARYMAN
        </h1>
        <p className="text-lg text-zinc-400 mb-2 max-w-2xl leading-relaxed">
          The professional intelligence platform for the modern career-driven individual.
        </p>
        <p className="text-sm text-zinc-600 mb-16 max-w-xl">
          A PICASSO AI LLC product &mdash; seeking aligned angel investors.
        </p>

        <div className="space-y-20">

          <section>
            <SectionLabel label="The Problem" icon={AlertCircle} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              Professionals are drowning in disconnected tools.
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              The modern professional juggles a dozen SaaS subscriptions — a CRM here, a notetaker there, a phone dialer somewhere else. None of them talk to each other. None of them understand context. None of them give you an edge.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              Interviews are high-stakes. Sales calls are high-stakes. Every negotiation, every pitch, every networking conversation is high-stakes. Yet professionals walk into them completely naked — relying on memory, instinct, and whatever they scribbled in a notepad.
            </p>
          </section>

          <section>
            <SectionLabel label="The Product" icon={Zap} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              One platform. Every edge.
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              SALARYMAN is a unified professional intelligence platform. It listens in real-time, reads your screen, coaches your speech, manages your relationships, and deploys AI agents to work alongside you — all from a single, dark, fast interface designed for people who take their career seriously.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "ECHO-7", desc: "Live AI listening & real-time coaching during calls and interviews" },
                { label: "OPTIC-9", desc: "Screen scanner that reads context and delivers instant insights" },
                { label: "VOX-4", desc: "Speech analysis and real-time coaching for cadence and clarity" },
                { label: "TTC Phone System", desc: "AI-powered phone & SMS with call coaching and transcription" },
                { label: "CRM & Contacts", desc: "Intelligent contact management with AI-enhanced relationship context" },
                { label: "Agent Team", desc: "Deployable AI agents for research, outreach, and intelligence tasks" },
                { label: "Dark Room", desc: "Creative studio — graphics, copy, social, image production & video scripts" },
                { label: "Hiring Module", desc: "Candidate pipeline, job descriptions, and interview tooling" },
              ].map((item) => (
                <div key={item.label} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/20">
                  <p className="text-[10px] font-mono tracking-widest uppercase text-sky-400/70 mb-1">{item.label}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel label="What's Built" icon={Layers} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              Alpha — live, functional, and growing.
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              SALARYMAN is not a mockup or a landing page. It is a live, working product with real users onboarding, using features daily, and providing feedback that directly shapes the roadmap.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Layers,
                  label: "Built & Live",
                  color: "text-sky-400",
                  border: "border-sky-500/20",
                  bg: "bg-sky-500/5",
                  items: [
                    "Live AI listening (ECHO-7)",
                    "Screen scanner (OPTIC-9)",
                    "Real-time speech coaching (VOX-4)",
                    "Phone & SMS system (TTC)",
                    "CRM & contact manager",
                    "Content studio & calendar",
                    "AI agent team (8 agents)",
                    "Hiring & recruiting tools",
                    "Document management",
                    "World / social layer (beta)",
                    "Stripe billing & subscriptions",
                    "Resend transactional emails",
                  ],
                },
                {
                  icon: Zap,
                  label: "In Progress",
                  color: "text-amber-400",
                  border: "border-amber-500/20",
                  bg: "bg-amber-500/5",
                  items: [
                    "FIAT (ƒ) in-game economy",
                    "Cosmetic store & avatar system (in-game)",
                    "Passport (seasonal in-game)",
                    "Sustaining patron tier",
                    "Advanced analytics & intel",
                    "Expanded phone features",
                  ],
                },
                {
                  icon: TrendingUp,
                  label: "Roadmap",
                  color: "text-sky-400",
                  border: "border-sky-500/20",
                  bg: "bg-sky-500/5",
                  items: [
                    "Mobile app (iOS / Android)",
                    "API access for power users",
                    "PABLO CORP Merch Dept",
                    "SEO & web intelligence module",
                    "Team / multi-seat accounts",
                    "General Availability launch",
                  ],
                },
              ].map(({ icon: Icon, label, color, border, bg, items }) => (
                <div key={label} className={`border ${border} rounded-lg p-4 ${bg}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{label}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li key={item} className="text-xs text-zinc-600 leading-relaxed flex items-start gap-1.5">
                        <span className={`${color} opacity-50 shrink-0 mt-0.5`}>›</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel label="Market Opportunity" icon={Globe} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              Every professional is a potential user.
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              The global workforce numbers in the billions. Even a narrow slice — the ambitious, career-driven professional who invests in their own performance — represents an enormous addressable market. SALARYMAN targets the user who already pays for multiple productivity tools and is frustrated by the fragmentation.
            </p>
            <p className="text-zinc-400 leading-relaxed mb-6">
              AI-native professional tools are projected to be one of the largest software categories of the decade. We are building the platform for that future.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Target User", value: "Career-driven professionals", sub: "Knowledge workers, sales, founders, recruiters" },
                { label: "Monetization", value: "Per-module subscriptions", sub: "Plus cosmetics, season passes, and merch" },
                { label: "Model", value: "Freemium → Pro", sub: "Free base tier with premium module upgrades" },
              ].map((item) => (
                <div key={item.label} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/20">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">{item.label}</p>
                  <p className="text-sm font-semibold text-zinc-200 mb-1">{item.value}</p>
                  <p className="text-xs text-zinc-600">{item.sub}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel label="Team" icon={Users} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              PICASSO AI LLC
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              SALARYMAN is built and operated by PICASSO AI LLC, a software company headquartered in Long Beach, California. We are a lean, technical team building fast and shipping continuously. Our focus is product quality, user leverage, and sustainable growth.
            </p>
            <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Entity</p>
                  <p className="text-zinc-300">PICASSO AI LLC</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Headquarters</p>
                  <p className="text-zinc-300">Long Beach, California, USA</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Product</p>
                  <p className="text-zinc-300">SALARYMAN platform</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Current Stage</p>
                  <p className="text-sky-400">Alpha — live and shipping</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel label="Current Stage" icon={Target} />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 tracking-tight">
              Alpha. Live. Real users.
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We are in <strong className="text-zinc-300">Alpha</strong>. The core platform is live and functional. Real users are onboarding, using features daily, and providing feedback that directly shapes the roadmap. Current pricing reflects early-supporter access and will increase as the product matures toward a public General Availability launch.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Stage", value: "Alpha", desc: "Live product with active users" },
                { label: "Funding", value: "Bootstrapped", desc: "Self-funded to this point" },
                { label: "Seeking", value: "Angel investors", desc: "Aligned individuals, not institutions" },
              ].map((item) => (
                <div key={item.label} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/20 text-center">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">{item.label}</p>
                  <p className="text-base font-bold text-sky-400 mb-1">{item.value}</p>
                  <p className="text-xs text-zinc-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="border border-zinc-700/50 rounded-xl p-8 bg-zinc-900/20">
              <SectionLabel label="Investor Interest Form" icon={TrendingUp} />
              <h2 className="text-2xl font-bold text-zinc-100 mb-2 tracking-tight">
                Reach out.
              </h2>
              <p className="text-zinc-500 text-sm leading-relaxed mb-8 max-w-xl">
                We are open to angel investment and strategic conversations with individuals who understand consumer software, AI-native products, or professional productivity tooling. We keep initial conversations simple — if the product resonates with you, tell us why.
              </p>
              <InvestorForm />
            </div>
          </section>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/10">
            <p className="text-xs text-zinc-700 leading-relaxed">
              <strong className="text-zinc-600">Legal Notice:</strong> Nothing on this page constitutes an offer to sell securities or a solicitation of an investment. All forward-looking statements reflect current expectations only and are subject to change without notice. PICASSO AI LLC operates in accordance with applicable US law. This page is provided for informational purposes only and does not constitute legal, financial, or investment advice.
            </p>
          </div>
        </div>

        <footer className="mt-16 pt-8 border-t border-zinc-900 text-center">
          <button
            onClick={() => navigate("/legal")}
            className="text-[10px] font-mono text-zinc-700 hover:text-sky-500/70 transition-colors uppercase tracking-widest mb-2 block mx-auto"
          >
            Legal & Policy Center
          </button>
          <p className="text-[10px] font-mono text-zinc-800 uppercase tracking-[0.2em]">
            &copy; {new Date().getFullYear()} PICASSO AI LLC &mdash; All rights reserved
          </p>
        </footer>
      </div>
    </div>
  );
}

function SectionLabel({ label, icon: Icon }: { label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5 text-sky-400/50" />
      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em]">{label}</span>
    </div>
  );
}
