import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

type Status = {
  daysIdle: number;
  warning: boolean;
  deletionImminent: boolean;
  daysUntilDeletion: number;
  warningThresholdDays: number;
  deletionThresholdDays: number;
};

// Only renders after the 23-day warning threshold; the user receives seven
// days' notice before personal app data is cleared.
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

  const tone = status.daysUntilDeletion <= 2
    ? "bg-red-950/95 border-red-500 text-red-100"
    : "bg-amber-50 border-amber-500 text-amber-950";

  return (
    <div className={`abandonment-banner fixed top-0 left-0 right-0 z-[60] border-b-2 ${tone} shadow-[0_0_30px_rgba(217,70,239,0.4)]`}>
      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-start sm:items-center gap-2 sm:gap-3 text-xs sm:text-sm font-mono">
        <span className="font-bold uppercase tracking-wider shrink-0">Notice</span>
        <span className="flex-1 min-w-0 break-words pr-6 sm:pr-0">
          {`Inactive ${status.daysIdle} days. Sign in within ${status.daysUntilDeletion} days to keep your personal SALARYMAN data. Identity, billing history, and audit records are retained.`}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-1.5 sm:static px-2 py-0.5 text-xs uppercase border border-current/40 hover:bg-current/10 rounded shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
