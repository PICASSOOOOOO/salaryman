import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

type Status = {
  daysIdle: number;
  warning: boolean;
  seizureImminent: boolean;
  daysUntilSeizure: number;
  warningThresholdDays: number;
  seizureThresholdDays: number;
};

// Pablo's voice: only renders if the API says we're past the warning
// threshold. Hidden while healthy.
export default function AbandonmentBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/lifecycle/status", { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as Status;
        if (active) setStatus(j);
      } catch {
        // silent
      }
    };
    load();
    const id = window.setInterval(load, 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(id); };
  }, [user?.id]);

  if (!status?.warning || dismissed) return null;

  const tone = status.seizureImminent
    ? "bg-red-950/95 border-red-500 text-red-100"
    : "bg-fuchsia-950/95 border-fuchsia-500 text-fuchsia-100";

  return (
    <div className={`fixed top-0 left-0 right-0 z-[60] border-b-2 ${tone} shadow-[0_0_30px_rgba(217,70,239,0.4)]`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-sm font-mono">
        <span className="font-bold uppercase tracking-wider">[Pablo]</span>
        <span className="flex-1">
          {status.seizureImminent
            ? `Final notice. ${status.daysIdle} days dark. Pablo Corp absorbs your assets at ${status.seizureThresholdDays} days. Sleep in your bed, touch your terminal, do something — now.`
            : `Idle ${status.daysIdle} days. ${status.daysUntilSeizure} days until Pablo Corp absorbs everything you own. Show up.`}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="px-2 py-0.5 text-xs uppercase border border-current/40 hover:bg-current/10 rounded"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
