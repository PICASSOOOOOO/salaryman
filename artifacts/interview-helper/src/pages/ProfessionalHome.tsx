import { ArrowUpRight, Bot, Users } from "lucide-react";
import { Link } from "wouter";
import { AppBrand } from "@/components/AppBrand";
import { StartWorkMenu } from "@/components/StartWorkMenu";
import "./ProfessionalHome.css";

const MODULES = [
  {
    id: "pablo-ai",
    title: "PABLO AI",
    description: "Chat with Pablo and run business automations from the same assistant.",
    icon: Bot,
    links: [
      { label: "Open Pablo", href: "/pablo" },
      { label: "Open automation", href: "/business/autopilot" },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    description: "Your customer records stay under your organization’s control. CALLL HOME connects calls, texts, and follow-up notes to those same contacts.",
    icon: Users,
    links: [
      { label: "Open CRM", href: "/business/contacts" },
      { label: "CALLL HOME", href: "/phone" },
    ],
  },
] as const;

export default function ProfessionalHome() {
  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] text-black overflow-x-hidden flex flex-col">
      <header className="home-header relative shrink-0 px-3 sm:px-4 h-14 flex items-center justify-between gap-2 border-b border-black/10">
        <AppBrand />
        <div className="home-header-actions">
          <StartWorkMenu />
        </div>
      </header>

      <section className="home-stage">
        <h1 className="home-title">
          Make work possible.
        </h1>

        <div className="home-modules" aria-label="SALARYMAN features">
          {MODULES.map(({ id, title, description, icon: Icon, links }) => (
            <article key={id} className={`home-module home-module--${id}`}>
              <div className="home-module-visual" aria-hidden="true">
                <Icon className="home-module-icon" strokeWidth={1.5} />
              </div>
              <div className="home-module-copy">
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
              <div className="home-module-actions">
                {links.map((link) => (
                  <Link key={link.href} href={link.href} className="home-module-link">
                    {link.label}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
