import { ArrowUpRight, Bot, Download, Phone, Workflow } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import "./ProfessionalHome.css";

const MODULES = [
  {
    id: "automation",
    title: "PIXEL AGENT AUTOMATION",
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
    title: "APP DOWNLOAD",
    href: "/desktop",
    icon: Download,
    logoSrc: undefined,
  },
] as const;

export default function ProfessionalHome() {
  const { isAuthenticated, isLoading } = useAuth();
  const accountHref = isAuthenticated
    ? "/business"
    : "/sign-in?returnTo=%2Fbusiness";

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] text-black overflow-x-hidden flex flex-col">
      <header className="home-header shrink-0 px-4 sm:px-8 h-14 flex items-center justify-between border-b border-black/10">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-7 w-7 rounded-md"
          />
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase">SALARYMAN</span>
          <span className="border border-black px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em] bg-black text-[#FAFAF7]">
            ALPHA {typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "DEV"}
          </span>
        </Link>
        <Link
          href={accountHref}
          className="font-sans text-[10px] font-bold tracking-[0.14em] uppercase hover:opacity-60 transition-opacity"
        >
          {isLoading ? "···" : isAuthenticated ? "START WORK" : "LOG IN"}
        </Link>
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
