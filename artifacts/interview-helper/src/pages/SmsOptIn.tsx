import { useState } from "react";
import { Check, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const TWILIO_NUMBER = "+18882307698";

export default function SmsOptIn() {
  const [agreed, setAgreed] = useState(false);
  const [started, setStarted] = useState(false);

  const startSmsOptIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agreed) return;
    setStarted(true);
    window.location.href = `sms:${TWILIO_NUMBER}?body=START`;
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-200">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[360px] w-[680px] -translate-x-1/2 rounded-full bg-sky-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-8">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-sky-300">
            SALARYMAN
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400/70">
            SMS consent
          </span>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
            <MessageSquare className="h-6 w-6" aria-hidden="true" />
          </div>

          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-sky-400/70">
            Stay connected
          </p>
          <h1 className="max-w-lg text-3xl font-semibold tracking-tight text-zinc-100">
            Enable SALARYMAN text messages
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">
            Receive important account, phone-system, and service updates by SMS from SALARYMAN.
            Message frequency varies based on your activity and settings.
          </p>

          {started ? (
            <div className="mt-8 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm leading-6 text-emerald-200">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                  Your SMS app should now be ready with the word <strong>START</strong>.
                  Send that message to finish confirming your opt-in.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={startSmsOptIn} className="mt-8">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-sky-400/30">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-sky-400"
                />
                <span className="text-sm leading-6 text-zinc-300">
                  I agree to receive recurring automated text messages from SALARYMAN at the
                  mobile number I use to send the confirmation. Consent is not a condition of
                  purchasing anything.
                </span>
              </label>

              <button
                type="submit"
                disabled={!agreed}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sky-400 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue to SMS confirmation
              </button>
            </form>
          )}

          <div className="mt-7 flex gap-3 border-t border-zinc-800 pt-6 text-xs leading-6 text-zinc-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/70" aria-hidden="true" />
            <p>
              Message and data rates may apply. Reply <strong className="text-zinc-300">STOP</strong> to
              opt out or <strong className="text-zinc-300">HELP</strong> for help. See our{" "}
              <a className="text-sky-400 underline underline-offset-2 hover:text-sky-300" href="/legal/privacy">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a className="text-sky-400 underline underline-offset-2 hover:text-sky-300" href="/legal/terms">
                Terms of Service
              </a>.
            </p>
          </div>
        </section>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
          PICASSO AI LLC · SALARYMAN
        </p>
      </div>
    </main>
  );
}