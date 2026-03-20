import { useLocation } from "wouter";
import { LegalLayout } from "@/components/LegalLayout";
import { Mail, TrendingUp, Layers, Zap } from "lucide-react";

export default function InvestorsPage() {
  const [, navigate] = useLocation();

  return (
    <LegalLayout title="About & Investors">
      <div className="highlight-box">
        <p>
          SALARYMAN is currently in <strong>Alpha</strong>. We are actively building toward our first public release and are open to conversations with aligned angel investors and strategic partners.
        </p>
      </div>

      <h2>What Is SALARYMAN?</h2>
      <p>
        SALARYMAN is a professional intelligence platform built for people who take their career seriously. It combines live AI listening, screen analysis, real-time coaching, a phone/SMS system, CRM, content studio, hiring tools, and a full agent team — all inside a single, unified product.
      </p>
      <p>
        The platform is designed to be <strong>the operating system for a modern professional</strong> — one tool that replaces a dozen disconnected SaaS subscriptions. Every feature is designed for active leverage: not dashboards, but actions.
      </p>

      <h2>Company</h2>
      <p>
        SALARYMAN is a product of <strong>PICASSO AI LLC</strong>, a software company headquartered in Long Beach, California.
      </p>
      <ul>
        <li>Entity: PICASSO AI LLC</li>
        <li>Address: 375 Redondo Ave #287, Long Beach, CA 90814</li>
        <li>Product brand: SALARYMAN</li>
        <li>Current stage: Alpha</li>
      </ul>

      <h2>Current Stage</h2>
      <p>
        We are in <strong>Alpha</strong>. The core platform is live and functional. Real users are onboarding, using features daily, and providing feedback that is directly shaping the roadmap. Pricing at this stage reflects early-supporter access and will increase as the product matures toward a public General Availability launch.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
        {[
          {
            icon: Layers,
            label: "Built",
            items: [
              "Live AI listening (ECHO-7)",
              "Screen scanner (OPTIC-9)",
              "Real-time speech coaching (VOX-4)",
              "Phone & SMS system (TTC)",
              "CRM & contact manager",
              "Content studio & calendar",
              "AI agent team",
              "Hiring & recruiting tools",
              "Presentation builder",
              "World / social layer (beta)",
            ],
          },
          {
            icon: Zap,
            label: "In Progress",
            items: [
              "PABLO COIN in-app currency",
              "Cosmetic store & avatar system",
              "Season pass / battle pass",
              "Sustaining patron tier",
              "Advanced analytics & intel",
              "Expanded phone features",
            ],
          },
          {
            icon: TrendingUp,
            label: "Roadmap",
            items: [
              "Mobile app (iOS / Android)",
              "API access for power users",
              "PABLO CORP Merch Dept",
              "SEO & web intelligence module",
              "Team / multi-seat accounts",
              "General Availability launch",
            ],
          },
        ].map(({ icon: Icon, label, items }) => (
          <div
            key={label}
            className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-emerald-400/60" />
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">{label}</span>
            </div>
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item} className="text-xs text-zinc-600 leading-relaxed flex items-start gap-1.5">
                  <span className="text-emerald-500/40 shrink-0 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2>Interested in Investing?</h2>
      <p>
        We are open to angel investment and strategic conversations with individuals who understand consumer software, AI-native products, or professional productivity tooling. We are not seeking institutional funding at this stage.
      </p>
      <p>
        There is no pitch deck or financial information on this page — we keep initial conversations simple. If the product resonates with you, reach out and let's talk.
      </p>

      <div className="border border-emerald-500/20 rounded-lg p-5 bg-emerald-500/5 my-6">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-emerald-400/70" />
          <span className="text-sm font-semibold text-emerald-300">Get in Touch</span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed mb-4">
          Use the contact form below and select <strong className="text-zinc-400">Legal Inquiry</strong> as the subject, or simply describe your interest in the message. We read every inquiry personally.
        </p>
        <button
          onClick={() => navigate("/legal/contact")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-all"
        >
          Open Contact Form <Mail className="w-4 h-4" />
        </button>
      </div>

      <h2>Legal Notice</h2>
      <p>
        Nothing on this page constitutes an offer to sell securities or a solicitation of an investment. All forward-looking statements reflect current expectations only and are subject to change. PICASSO AI LLC operates in accordance with applicable US law.
      </p>
    </LegalLayout>
  );
}
