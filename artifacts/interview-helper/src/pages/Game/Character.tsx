import { Link } from "wouter";
import { ChevronLeft, Heart, Wallet, Skull, Briefcase } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { SignInPage } from "@/components/SignInPrompt";
import { resolveAvatarUrl } from "@/lib/avatar";
import { useStreamerMode } from "@/hooks/use-streamer-mode";
import { STREAMER_MASK } from "@/lib/streamer-mode";

export default function GameCharacter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const streamerMode = useStreamerMode();
  if (isLoading) return null;
  if (!isAuthenticated) return <SignInPage />;

  const name = user?.firstName || user?.email?.split("@")[0] || "SALARYMAN";

  const COLOR: Record<string, { border: string; label: string; value: string }> = {
    emerald: { border: "border-emerald-700/40", label: "text-emerald-300", value: "text-emerald-200" },
    fuchsia: { border: "border-fuchsia-700/40", label: "text-fuchsia-300", value: "text-fuchsia-200" },
    red:     { border: "border-red-700/40",     label: "text-red-300",     value: "text-red-200" },
    cyan:    { border: "border-cyan-700/40",    label: "text-cyan-300",    value: "text-cyan-200" },
  };
  const Stat = ({ icon: Icon, label, value, color }: any) => {
    const c = COLOR[color] ?? COLOR.cyan;
    return (
      <div className={`rounded-lg border bg-zinc-950/60 p-3 ${c.border}`}>
        <div className={`flex items-center gap-2 text-[9px] tracking-widest font-mono ${c.label}`}>
          <Icon className="w-3 h-3" /> {label}
        </div>
        <div className={`mt-1 text-lg font-mono ${c.value}`}>{value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(60,90,120,0.3) 0%, transparent 70%), #060708",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link href="/game" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
          <ChevronLeft className="w-4 h-4" /> GAME
        </Link>

        <header className="mb-6 flex items-center gap-3">
          {resolveAvatarUrl(user?.profileImageUrl) ? (
            <img src={resolveAvatarUrl(user?.profileImageUrl)} alt={name} className="w-14 h-14 rounded-md object-cover border border-cyan-500/30" />
          ) : (
            <div className="w-14 h-14 rounded-md flex items-center justify-center font-mono text-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
              {name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest">CHARACTER</p>
            <h1 className="text-xl font-mono tracking-[0.15em] text-cyan-100">{name.toUpperCase()}</h1>
            <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{streamerMode ? STREAMER_MASK : user?.email}</p>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Heart} label="HP" value="100/100" color="emerald" />
          <Stat icon={Wallet} label="WALLET" value="ƒ —" color="fuchsia" />
          <Stat icon={Skull} label="BOUNTY" value="ƒ 0" color="red" />
          <Stat icon={Briefcase} label="JOB" value="—" color="cyan" />
        </div>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-[10px] font-mono tracking-[0.3em] text-zinc-300 mb-2">HOSPITAL RECORD</h2>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Each death pulls a hospital fee from your wallet and clocks you out for the rest of the shift. No respawn penalty bigger than what's in your account.
          </p>
        </section>

        <p className="mt-6 text-[10px] font-mono text-zinc-600 tracking-widest uppercase text-center">
          Live wallet & bounty wire-up ships with the economy ledger.
        </p>
      </div>
    </div>
  );
}
