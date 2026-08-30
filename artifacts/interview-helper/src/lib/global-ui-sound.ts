// Global UI sound — installs ONE document-level listener so every interactive
// control in the app makes a sound when activated, without editing hundreds of
// call sites. Volume / mute are honored downstream by soundEngine, and ui-sound
// debounces repeats so this never double-fires with handlers that also call
// playClick() on the same gesture.
import { playClick, playNav, getSoundEpoch } from "./ui-sound";

// Things that should make a sound when clicked. Kept broad but deliberate: real
// controls only, never plain text / containers.
const INTERACTIVE = [
  "button",
  'a[href]',
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

// Elements that "navigate" get the affirmative blip; everything else the tick.
const NAV_LIKE = 'a[href], [role="tab"], .crt-tab';

let installed = false;

export function playGlobalUiSoundForElement(el: HTMLElement) {
  if (
    el.hasAttribute("disabled") ||
    el.getAttribute("aria-disabled") === "true" ||
    el.closest("[data-no-sfx]")
  ) {
    return;
  }
  const epoch = getSoundEpoch();
  const nav = el.matches(NAV_LIKE);
  setTimeout(() => {
    if (getSoundEpoch() !== epoch) return;
    if (nav) playNav();
    else playClick();
  }, 0);
}

export function installGlobalUiSound() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // Capture phase so we still fire even when a handler calls stopPropagation().
  // `click` (not pointerdown) so keyboard activation (Enter/Space) also sounds.
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(INTERACTIVE) as HTMLElement | null;
      if (!el) return;
      // Defer to a fallback: this capture-phase listener runs BEFORE the
      // element's own onClick (target/bubble). If that handler plays its own
      // sound, the epoch advances and we stay silent — otherwise we supply the
      // generic tick/blip. setTimeout(0) lets the full dispatch (incl. React's
      // synthetic onClick at the root) complete before we decide.
      playGlobalUiSoundForElement(el);
    },
    { capture: true, passive: true },
  );
}
