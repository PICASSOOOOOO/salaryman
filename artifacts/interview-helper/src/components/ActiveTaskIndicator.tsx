import { useEffect, useState } from "react";
import { Check, ChevronDown, ClipboardList, MapPin } from "lucide-react";
import {
  getActivePlayerTask,
  getBuildingOnboardingStage,
  getPlayerTasks,
  subscribeBuildingOnboarding,
  type BuildingOnboardingStage,
} from "@/lib/building-onboarding";

export function ActiveTaskIndicator() {
  const [stage, setStage] = useState<BuildingOnboardingStage>(() => getBuildingOnboardingStage());
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeBuildingOnboarding(setStage), []);

  const activeTask = getActivePlayerTask(stage);
  if (!activeTask) return null;

  const tasks = getPlayerTasks(stage);

  return (
    <aside
      className="fixed left-3 top-[calc(52px+env(safe-area-inset-top,0px))] z-[820] w-[min(320px,calc(100vw-24px))] font-sans"
      data-testid="active-task-indicator"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 border border-cyan-300/50 bg-[#07111c]/95 px-3 py-2.5 text-left shadow-[0_10px_35px_rgba(0,0,0,.45),0_0_24px_rgba(34,211,238,.12)] backdrop-blur"
        aria-expanded={open}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
          <MapPin className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_10px_#fcd34d]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold tracking-[.24em] text-amber-300">ACTIVE TASK</span>
          <span className="block truncate text-xs font-bold tracking-[.06em] text-white">{activeTask.title}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-cyan-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-x border-b border-cyan-300/30 bg-[#050a12]/95 p-3 backdrop-blur" data-testid="player-task-log">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-[.22em] text-zinc-400">
            <ClipboardList className="h-3.5 w-3.5" /> TASK LOG
          </div>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className={`flex gap-2 border px-2.5 py-2 ${task.status === "active" ? "border-cyan-300/35 bg-cyan-300/5" : "border-white/10 bg-white/[.02]"}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${task.status === "complete" ? "border-emerald-300/50 text-emerald-300" : task.status === "active" ? "border-amber-300/60 text-amber-300" : "border-zinc-700 text-zinc-700"}`}>
                  {task.status === "complete" ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span>
                  <span className={`block text-[11px] font-bold ${task.status === "locked" ? "text-zinc-600" : "text-zinc-100"}`}>{task.title}</span>
                  {task.status === "active" && <span className="mt-0.5 block text-[10px] leading-4 text-zinc-400">{task.hint}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}