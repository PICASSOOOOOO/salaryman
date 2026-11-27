import { useLocation } from "wouter";

export const PABLO_AUTOMATION_CAPABILITIES = [
  { id: "workflows", path: "/business/autopilot?cap=workflows", label: "WORKFLOWS" },
  { id: "agents", path: "/business/autopilot?cap=agents", label: "AI AGENTS" },
  { id: "ads", path: "/business/autopilot?cap=ads", label: "AD BOTS" },
  { id: "secretary", path: "/business/autopilot?cap=secretary", label: "AI SECRETARY" },
] as const;

export type PabloAutomationCapability = typeof PABLO_AUTOMATION_CAPABILITIES[number]["id"];

const LEGACY_CAPABILITY_PATHS: Record<string, PabloAutomationCapability> = {
  "/business/autopilot": "workflows",
  "/bots/factory": "agents",
  "/bots/ad-studio": "ads",
  "/marketing/ads": "ads",
  "/phone/secretary": "secretary",
};

export function PabloAutomationNav({
  activeCapability,
  onSelect,
}: {
  activeCapability?: PabloAutomationCapability;
  onSelect?: (capability: PabloAutomationCapability) => void;
} = {}) {
  const [location, navigate] = useLocation();
  const pathname = location.split(/[?#]/, 1)[0];
  const queryCapability = new URLSearchParams(location.split("?")[1] ?? "").get("cap");
  const activeId = activeCapability
    ?? (PABLO_AUTOMATION_CAPABILITIES.some((item) => item.id === queryCapability)
      ? queryCapability as PabloAutomationCapability
      : LEGACY_CAPABILITY_PATHS[pathname]);

  return (
    <div className="mb-5 overflow-x-auto">
      <nav
        aria-label="PABLO PRIME features"
        className="flex min-w-max gap-2 border-b border-[#D8D1C3] pb-2"
      >
        {PABLO_AUTOMATION_CAPABILITIES.map((capability) => {
          const active = activeId === capability.id;
          return (
            <button
              key={capability.id}
              type="button"
              data-testid={`pablo-automation-${capability.id}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect
                ? onSelect(capability.id)
                : navigate(capability.path)}
              className={`min-h-10 shrink-0 rounded border px-3 py-2 font-mono text-[10px] font-bold tracking-wider transition-colors ${
                active
                  ? "border-[#111111] bg-[#EEE8DC] text-[#111111]"
                  : "border-[#D8D1C3] bg-[#FFFCF5] text-[#514B42] hover:bg-[#EEE8DC]"
              }`}
            >
              {capability.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
