import { ArrowUpRight, Bot, Download, Phone, Workflow } from "lucide-react";
import { Link } from "wouter";
import { AppBrand } from "@/components/AppBrand";
import { StartWorkMenu } from "@/components/StartWorkMenu";
import "./ProfessionalHome.css";

const MODULES = [
  {
    id: "pixel-agents",
    title: "PIXEL AGENTS",
    href: "/business/autopilot",
    icon: Workflow,
    logoSrc: undefined,
  },
  {
    id: "pablo",
    title: "PABLO AI",
    href: "/pablo",
    icon: Bot,
    logoSrc: undefined,
  },
  {
    id: "phone",
    title: "CALLL HOME",
    href: "/phone",
    icon: Phone,
    logoSrc: `${import.meta.env.BASE_URL}brand/callhome/calll-home-logo-2.png`,
  },
  {
    id: "desktop",
    title: "SALARYMAN OS",
    href: "/desktop",
    icon: Download,
    logoSrc: undefined,
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

        <div className="home-modules">
          {MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className={`home-module home-module--${mod.id}`}
            >
              <div className="home-module-visual" aria-hidden="true">
                {mod.logoSrc ? (
                  <img
                    src={mod.logoSrc}
                    alt=""
                    className="home-module-logo"
                  />
                ) : (
                  <mod.icon className="home-module-icon" strokeWidth={1.35} />
                )}
                <div className="home-signal">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="home-module-action">
                <h2>
                  {mod.title}
                </h2>
                <ArrowUpRight aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
