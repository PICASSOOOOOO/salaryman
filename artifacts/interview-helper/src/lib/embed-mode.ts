// Chrome-free "embed" / monitor mode detection (?embed=1 or ?chrome=0).
//
// Used by the /my-office surveillance iframe, which loads /office?embed=1 to
// show ONE clean CCTV feed instead of a miniature copy of the whole app. When
// embed is active, both the app shell (alpha banner, audio control, toaster)
// and the office page chrome (header, economy drawer, help/tutorial overlays)
// are suppressed.
//
// The flag LATCHES once detected: several in-page paths rebuild the /office URL
// and drop its query string (mode toggles via replaceState, funnel redirects to
// a clean /office, etc.). Without latching, the chrome would flash back in mid
// session the moment any of those fired. The latch is module-scoped, so a
// same-origin iframe — which runs its own copy of the bundle in its own JS
// context — can never leak the flag back to the parent /my-office window.
let latched = false;

export function isEmbedMode(): boolean {
  if (typeof window === "undefined") return false;
  if (latched) return true;
  // A nested browsing context (the /my-office surveillance iframe) is always an
  // embed. This is the robust signal: it survives a hard reload INSIDE the frame
  // (a redirect that strips ?embed= would otherwise un-hide the chrome) and it
  // can never leak to the parent /my-office window, where top === self.
  let inFrame = false;
  try { inFrame = window.top !== window.self; } catch { inFrame = true; }
  const q = new URLSearchParams(window.location.search);
  if (inFrame || q.get("embed") === "1" || q.get("chrome") === "0") latched = true;
  return latched;
}
