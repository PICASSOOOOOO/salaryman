import { ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Scale } from "lucide-react";

const LEGAL_LINKS = [
  { path: "/legal", label: "Legal Terminal" },
  { path: "/legal/terms", label: "Terms of Service" },
  { path: "/legal/privacy", label: "Privacy Policy" },
  { path: "/legal/contact", label: "Contact Us" },
  { path: "/legal/refunds", label: "Refund & Dispute Policy" },
  { path: "/legal/returns", label: "Return Policy" },
  { path: "/legal/cancellation", label: "Cancellation Policy" },
  { path: "/legal/promotions", label: "Promotions T&C" },
  { path: "/legal/restrictions", label: "Legal & Export Restrictions" },
  { path: "/investors", label: "About & Investors" },
];

interface LegalLayoutProps {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  const [location, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-mono">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-sky-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-sky-400 transition-colors uppercase tracking-widest"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to SALARYMAN
          </button>
          <div className="flex items-center gap-2 text-sky-400/70 text-xs tracking-widest uppercase">
            <Scale className="w-3.5 h-3.5" />
            PICASSO AI LLC Legal
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
          <nav className="md:sticky md:top-8 md:self-start">
            <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
              <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] mb-3">Policy Pages</p>
              <ul className="space-y-1">
                {LEGAL_LINKS.map((link) => {
                  const active = location === link.path;
                  return (
                    <li key={link.path}>
                      <button
                        onClick={() => navigate(link.path)}
                        className={`w-full text-left text-xs px-3 py-1.5 rounded transition-colors ${
                          active
                            ? "bg-sky-500/15 text-sky-300 border border-sky-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        {link.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          <main>
            <div className="border-b border-zinc-800 pb-6 mb-8">
              <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] mb-2">PICASSO AI LLC · SALARYMAN</p>
              <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-2">{title}</h1>
              {lastUpdated && (
                <p className="text-xs text-zinc-600">Last updated: {lastUpdated}</p>
              )}
            </div>
            <div className="prose-legal">{children}</div>
          </main>
        </div>

        <footer className="mt-16 pt-8 border-t border-zinc-900 text-center">
          <p className="text-[10px] text-zinc-700 uppercase tracking-[0.2em] mb-3">
            PICASSO AI LLC &mdash; Parent company of SALARYMAN &amp; PABLO CORP Merch Dept
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-[10px] text-zinc-700">
            {LEGAL_LINKS.filter(l => l.path !== "/legal").map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="hover:text-sky-500/70 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
        </footer>
      </div>

      <style>{`
        .prose-legal p { margin-bottom: 1rem; line-height: 1.75; color: #a1a1aa; font-size: 0.875rem; }
        .prose-legal h2 { font-size: 1rem; font-weight: 700; color: #e4e4e7; margin-top: 2rem; margin-bottom: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 1px solid #27272a; padding-bottom: 0.5rem; }
        .prose-legal h3 { font-size: 0.875rem; font-weight: 600; color: #d4d4d8; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .prose-legal ul { list-style: none; padding: 0; margin-bottom: 1rem; }
        .prose-legal ul li { position: relative; padding-left: 1.25rem; margin-bottom: 0.4rem; color: #a1a1aa; font-size: 0.875rem; line-height: 1.6; }
        .prose-legal ul li::before { content: "›"; position: absolute; left: 0; color: rgba(56,189,248,0.5); }
        .prose-legal a { color: rgba(56,189,248,0.8); text-decoration: underline; }
        .prose-legal a:hover { color: rgba(56,189,248,1); }
        .prose-legal .highlight-box { background: rgba(56,189,248,0.05); border: 1px solid rgba(56,189,248,0.15); border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; }
        .prose-legal .highlight-box p { margin-bottom: 0; }
        .prose-legal strong { color: #e4e4e7; }
      `}</style>
    </div>
  );
}
