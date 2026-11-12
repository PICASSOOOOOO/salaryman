// Module-level bridge that lets the global ActiveCallContext tear down the
// browser-side WebRTC leg owned by TwilioDeviceProvider, even though the two
// providers live in different parts of the tree.

let disconnectFn: (() => void) | null = null;

export function registerDeviceDisconnect(fn: () => void): () => void {
  disconnectFn = fn;
  return () => {
    if (disconnectFn === fn) disconnectFn = null;
  };
}

export function disconnectLocalDeviceCalls(): void {
  if (!disconnectFn) return;
  try { disconnectFn(); } catch (e) {
    console.warn('[twilio-device-bridge] disconnect failed:', e instanceof Error ? e.message : e);
  }
}
