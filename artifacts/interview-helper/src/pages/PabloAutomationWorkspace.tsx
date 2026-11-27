import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PabloAutomationNav,
  type PabloAutomationCapability,
} from "@/components/PabloAutomationNav";

const Workflows = lazy(() => import("./Autopilot"));
const AgentTools = lazy(() => import("./BotFactory"));
const AdBots = lazy(() => import("./Marketing"));
const Secretary = lazy(() => import("./phone/PhoneSecretaryPage"));

export function getPabloAutomationCapability(search: string): PabloAutomationCapability {
  const value = new URLSearchParams(search).get("cap");
  return value === "agents" || value === "ads" || value === "secretary"
    ? value
    : "workflows";
}

function readCapability() {
  return getPabloAutomationCapability(window.location.search);
}

export default function PabloAutomationWorkspace() {
  const [activeCapability, setActiveCapability] = useState<PabloAutomationCapability>(readCapability);

  useEffect(() => {
    const syncFromUrl = () => setActiveCapability(readCapability());
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const selectCapability = useCallback((capability: PabloAutomationCapability) => {
    setActiveCapability(capability);
    const url = new URL(window.location.href);
    url.searchParams.set("cap", capability);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFAF0] text-[#111111]">
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <PabloAutomationNav
          activeCapability={activeCapability}
          onSelect={selectCapability}
        />
      </div>
      <Suspense fallback={
        <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-zinc-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          Opening PABLO PRIME…
        </div>
      }>
        {activeCapability === "workflows" && <Workflows />}
        {activeCapability === "agents" && <AgentTools embedded />}
        {activeCapability === "ads" && <AdBots />}
        {activeCapability === "secretary" && <Secretary embedded />}
      </Suspense>
    </div>
  );
}
