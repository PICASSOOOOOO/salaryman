export type BuildingOnboardingStage = "not_started" | "reception" | "work" | "complete";

export interface PlayerTask {
  id: "report-to-reception" | "enter-work-floor";
  title: string;
  hint: string;
  destination: string;
  status: "active" | "locked" | "complete";
}

const STORAGE_KEY = "salaryman_building_onboarding_v1";
const CHANGE_EVENT = "salaryman:building-onboarding-change";

function readStage(): BuildingOnboardingStage {
  if (typeof window === "undefined") return "not_started";
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "reception" || value === "work" || value === "complete"
    ? value
    : "not_started";
}

function writeStage(stage: BuildingOnboardingStage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, stage);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: stage }));
}

export function getBuildingOnboardingStage() {
  return readStage();
}

export function startBuildingOnboarding() {
  writeStage("reception");
}

export function resetBuildingOnboarding() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: "not_started" }));
}

export function completeReceptionTask() {
  if (readStage() === "reception") writeStage("work");
}

export function completeWorkArrivalTask() {
  if (readStage() === "work") writeStage("complete");
}

export function subscribeBuildingOnboarding(listener: (stage: BuildingOnboardingStage) => void) {
  if (typeof window === "undefined") return () => undefined;
  const onChange = (event: Event) => {
    const custom = event as CustomEvent<BuildingOnboardingStage>;
    listener(custom.detail ?? readStage());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(readStage());
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getPlayerTasks(stage = readStage()): PlayerTask[] {
  return [
    {
      id: "report-to-reception",
      title: "Speak with the receptionist",
      hint: "Follow the cyan marker to the front desk.",
      destination: "/tower#reception",
      status: stage === "reception" ? "active" : stage === "not_started" ? "locked" : "complete",
    },
    {
      id: "enter-work-floor",
      title: "Report to the work floor",
      hint: "Use the marked WORK ACCESS door.",
      destination: "/tower/mezzanine?focus=classifieds",
      status: stage === "work" ? "active" : stage === "complete" ? "complete" : "locked",
    },
  ];
}

export function getActivePlayerTask(stage = readStage()) {
  return getPlayerTasks(stage).find((task) => task.status === "active") ?? null;
}