import { useLocation } from "wouter";
import { Scale, FileText, Shield, Package, XCircle, Gift, Globe, Mail, Lock, TrendingUp } from "lucide-react";

const PAGES = [
  { path: "/legal/terms", label: "Terms of Service", icon: FileText, desc: "Rules governing use of the SALARYMAN platform." },
  { path: "/legal/privacy", label: "Privacy Policy", icon: Lock, desc: "How we collect, use, and protect your data." },
  { path: "/legal/contact", label: "Contact Us", icon: Mail, desc: "Reach our support team through the contact form." },
  { path: "/legal/refunds", label: "Refund & Dispute Policy", icon: Shield, desc: "Digital goods, FIAT (ƒ) virtual currency, donations, and dispute process." },
  { path: "/legal/returns", label: "Return Policy", icon: Package, desc: "Physical merch returns via PABLO CORP Merch Dept." },
  { path: "/legal/cancellation", label: "Cancellation Policy", icon: XCircle, desc: "Passport and recurring billing." },
  { path: "/legal/promotions", label: "Promotions Terms & Conditions", icon: Gift, desc: "In-game promotions, seasonal events, bonus currency." },
  { path: "/legal/restrictions", label: "Legal & Export Restrictions", icon: Globe, desc: "Age requirements, geographic restrictions, export compliance." },
];

export default function LegalHub() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-mono">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-sky-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-sky-400 transition-colors uppercase tracking-widest mb-12"
        >
          ‹ Back to SALARYMAN
        </button>

        <div className="flex items-center gap-3 mb-4">
          <Scale className="w-6 h-6 text-sky-400/70" />
          <span className="text-[10px] text-zinc-600 uppercase tracking-[0.25em]">PICASSO AI LLC</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 mb-2 tracking-tight">Legal & Policy Center</h1>
        <p className="text-zinc-500 text-sm mb-12 max-w-xl">
          SALARYMAN is a product of PICASSO AI LLC. The following policies govern your use of the platform, marketplace, and associated services.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
          {PAGES.map(({ path, label, icon: Icon, desc }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="group text-left border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-sky-400/60 group-hover:text-sky-400 transition-colors" />
                <span className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">{label}</span>
              </div>
              <p className="text-xs text-zinc-600 group-hover:text-zinc-500 transition-colors leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate("/investors")}
          className="group w-full text-left border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-sky-400/60 group-hover:text-sky-400 transition-colors" />
            <span className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">About & Investors</span>
          </div>
          <p className="text-xs text-zinc-600 group-hover:text-zinc-500 transition-colors leading-relaxed">Project overview, current stage, roadmap, and investor contact information.</p>
        </button>

        <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/20">
          <p className="text-xs text-zinc-600 leading-relaxed">
            <strong className="text-zinc-500">PICASSO AI LLC</strong> · 375 Redondo Ave #287 · Long Beach, CA 90814 · operates the SALARYMAN platform and the PABLO CORP Merch Dept.
            By accessing any PICASSO AI LLC service you agree to the policies listed above. For questions, use the{" "}
            <button onClick={() => navigate("/legal/contact")} className="text-sky-500/70 underline hover:text-sky-400">Contact Us</button>{" "}
            page. These documents are provided for informational purposes and do not constitute legal advice.
          </p>
        </div>

        <footer className="mt-12 pt-8 border-t border-zinc-900 text-center">
          <p className="text-[10px] text-zinc-700 uppercase tracking-[0.2em]">
            &copy; {new Date().getFullYear()} PICASSO AI LLC &mdash; All rights reserved
          </p>
        </footer>
      </div>
    </div>
  );
}
