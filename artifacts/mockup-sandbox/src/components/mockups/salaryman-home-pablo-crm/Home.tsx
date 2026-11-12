import type { MouseEvent } from "react";
import { ArrowUpRight, Bot, LogIn, Users } from "lucide-react";
import "./_group.css";

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

function stopPreviewNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

export function Home() {
  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#FAFAF7] text-black flex flex-col">
      <header className="home-header relative shrink-0 px-3 sm:px-4 h-14 flex items-center justify-between gap-2 border-b border-black/10">
        <a className="app-brand" href="/" aria-label="SALARYMAN home" onClick={stopPreviewNavigation}>
          <img
            src="/__mockup/images/salaryman-home/icon-192.png"
            alt=""
            className="app-brand-logo"
          />
          <span className="app-brand-name">SALARYMAN</span>
          <span className="app-brand-meta">
            <span className="app-alpha-badge">ALPHA DEV</span>
            <span className="app-powered-by">Powered by Picasso Artificial Intelligence</span>
          </span>
        </a>
        <div className="home-header-actions">
          <a
            href="/sign-in?returnTo=%2F"
            className="start-work-login home-login-link"
            aria-label="Log in to your SALARYMAN account"
            onClick={stopPreviewNavigation}
          >
            <LogIn aria-hidden="true" />
            <span>LOG IN</span>
          </a>
        </div>
      </header>

      <section className="home-stage">
        <h1 className="home-title">Make work possible.</h1>

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
                  <a
                    key={link.href}
                    href={link.href}
                    className="home-module-link"
                    onClick={stopPreviewNavigation}
                  >
                    {link.label}
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
