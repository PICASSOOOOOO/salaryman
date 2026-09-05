const INTERACTIVE = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  "select",
  ".crt-btn",
  ".crt-btn-primary",
  ".crt-tab",
].join(",");

let ready = false;
let loading: ReturnType<typeof importUiSound> | null = null;

function importUiSound() {
  return import("./global-ui-sound");
}

function load() {
  loading ??= importUiSound().then((module) => {
    module.installGlobalUiSound();
    ready = true;
    return module;
  });
  return loading;
}

/**
 * Installs only a tiny capture shim synchronously. If a visitor interacts
 * before the full UI-sound chunk is warm, that first qualifying activation is
 * replayed after import instead of being silently lost.
 */
export function installDeferredGlobalUiSound() {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "click",
    (event) => {
      if (ready) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest(INTERACTIVE) as HTMLElement | null;
      if (!element) return;
      void load().then(({ playGlobalUiSoundForElement }) => {
        playGlobalUiSoundForElement(element);
      });
    },
    { capture: true, passive: true },
  );
}

export function warmGlobalUiSound() {
  void load();
}