// Tiny global event bus so any surface (the nav search box, a keyboard
// shortcut, etc.) can open the site-wide command palette without threading
// props or context through the tree. The palette itself subscribes once.
const listeners = new Set<() => void>();

export function openCommandPalette() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

export function onOpenCommandPalette(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
