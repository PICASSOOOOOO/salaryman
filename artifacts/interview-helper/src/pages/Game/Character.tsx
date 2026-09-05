import { Link } from "wouter";
import { ChevronLeft, Wallet, Briefcase } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
      background: "linear-gradient(180deg, rgba(6,9,14,.82), rgba(6,9,14,.97)), url('/pixel-agents/shadow-tower/spaces/tower_space_founder.jpg') center / cover fixed",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link href="/office" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
          <ChevronLeft className="w-4 h-4" /> OFFICE
        </Link>

        <header className="mb-6 flex items-center gap-3">
          {resolveAvatarUrl(user?.profileImageUrl) ? (
            <img src={resolveAvatarUrl(user?.profileImageUrl)} alt={name} className="w-20 h-20 rounded-md object-contain bg-zinc-900 border border-cyan-500/30" />
          ) : (
              <div className="w-20 h-20 rounded-md flex items-center justify-center font-mono text-3xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
              {name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-mono tracking-[0.15em] text-cyan-100">{name.toUpperCase()}</h1>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat icon={Wallet} label="WALLET" value="ƒ —" color="fuchsia" />
          <Stat icon={Briefcase} label="JOB" value="—" color="cyan" />
        </div>
      </div>
    </div>
  );
}
