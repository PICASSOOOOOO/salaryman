/**
 * Stub for the notification sound module. Upstream plays short WebAudio
 * tones when an agent finishes a task or asks for a permission. We don't
 * have those events in our integration, so all of these are no-ops.
 */
export function unlockAudio(): void {
  /* no-op */
}
export function playDoneSound(): void {
  /* no-op */
}
export function playPermissionSound(): void {
  /* no-op */
}
export function setSoundEnabled(_enabled: boolean): void {
  /* no-op */
}
