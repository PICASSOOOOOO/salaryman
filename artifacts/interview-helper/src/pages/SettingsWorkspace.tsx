import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";

type SettingsView = "settings" | "profile" | "admin" | "data" | "connections";

const AccountSettings = lazy(() => import("./Profile").then((module) => ({ default: module.SettingsPage })));
const Profile = lazy(() => import("./Profile"));
const AdminHub = lazy(() => import("./Profile").then((module) => ({ default: module.AdminHub })));
const DataVault = lazy(() => import("./DataVault"));
const PlatformAPI = lazy(() => import("./PlatformAPI"));

const TABS: Array<{ id: SettingsView; label: string }> = [
  { id: "settings", label: "SETTINGS" },
  { id: "profile", label: "PROFILE" },
  { id: "admin", label: "ADMIN" },
  { id: "data", label: "DATA VAULT" },
  { id: "connections", label: "PLATFORM CONNECTIONS" },
];

function readSettingsView(): SettingsView {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "profile" || tab === "admin" || tab === "data" || tab === "connections"
    ? tab
    : "settings";
}

export default function SettingsWorkspace() {
  const { isOwner, loading: planLoading } = usePlan();
  const [activeView, setActiveView] = useState<SettingsView>(readSettingsView);

  useEffect(() => {
    const syncFromUrl = () => setActiveView(readSettingsView());
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const selectView = useCallback((view: SettingsView) => {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === "settings") url.searchParams.delete("tab");
    else url.searchParams.set("tab", view);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (activeView === "admin" && !planLoading && !isOwner) selectView("settings");
  }, [activeView, isOwner, planLoading, selectView]);

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#11110f]">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6">
        <nav
          aria-label="Settings and account"
          className="flex gap-2 overflow-x-auto border-b border-[#d8d1c3] pb-2"
        >
          {TABS.filter((tab) => tab.id !== "admin" || isOwner || planLoading).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`settings-workspace-${tab.id}`}
              aria-current={activeView === tab.id ? "page" : undefined}
              onClick={() => selectView(tab.id)}
              className={`min-h-11 shrink-0 rounded border px-3 py-2 text-xs font-semibold tracking-wider ${
                activeView === tab.id
                  ? "border-[#11110f] bg-[#EEE8DC] text-[#11110f]"
                  : "border-[#d8d1c3] bg-[#fffdf8] text-[#514b42] hover:bg-[#eee8dc]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <Suspense fallback={
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#625c52]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading account workspace…
        </div>
      }>
        {activeView === "settings" && <AccountSettings />}
        {activeView === "profile" && <Profile />}
        {activeView === "admin" && planLoading && (
          <div className="flex min-h-48 items-center justify-center text-sm text-[#625c52]" role="status">
            Checking admin access…
          </div>
        )}
        {activeView === "admin" && !planLoading && isOwner && <AdminHub />}
        {activeView === "data" && <DataVault />}
        {activeView === "connections" && <PlatformAPI />}
      </Suspense>
    </div>
  );
}
