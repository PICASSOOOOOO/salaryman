import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import "./ProfessionalHome.css";

export default function ProfessionalHome() {
  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] px-5 text-black sm:px-8">
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-mono text-xs tracking-[0.2em]"
          aria-label="SALARYMAN home"
          data-testid="link-brand-home"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-7 w-7 rounded-md"
          />
          SALARYMAN
          <span className="border border-black px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em]">
            ALPHA {typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "DEV"}
          </span>
        </Link>
        <Link
          href="/sign-in"
          className="font-sans text-[10px] font-bold tracking-[0.14em]"
          data-testid="link-home-login"
        >
          LOG IN
        </Link>
      </header>

      <section
        className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-5xl items-center py-16"
        aria-labelledby="home-title"
        data-testid="section-hero"
      >
        <div className="max-w-2xl">
          <h1
            id="home-title"
            className="m-0 max-w-xl font-sans text-[clamp(3.4rem,12vw,7rem)] font-semibold leading-[0.9] tracking-[-0.065em]"
          >
            Make work possible.
          </h1>
          <p className="mb-0 mt-8 max-w-sm text-base leading-relaxed text-black/60">
            One place for the company.
          </p>
          <Link
            href="/business"
            className="mt-10 inline-flex h-12 items-center gap-8 bg-black px-6 font-sans text-[11px] font-bold tracking-[0.14em] text-[#FAFAF7]"
            data-testid="link-hero-workspace"
          >
            START WORK
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}