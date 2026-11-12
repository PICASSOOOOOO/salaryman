---
name: interview-helper web client test harness (vitest + jsdom)
description: How the first frontend vitest suite in artifacts/interview-helper is set up and the non-obvious traps for testing React effects + the procedural audio engine.
---

# interview-helper web tests

The web client now has its own vitest config (`artifacts/interview-helper/vitest.config.ts`,
`pnpm --filter @workspace/interview-helper run test`) using the Vite React plugin
+ jsdom. This is separate from the api-server suite. Tests live next to source as
`*.test.ts(x)`.

## Non-obvious traps

- **Render-to-null to test effects cheaply.** ChatPanel returns `null` when
  `isAuthenticated` is false, but every notification `useEffect` is registered
  *before* that early return, so they still run. Mock `useAuth` to false and you
  test the toast/chime effects without rendering the giant component tree or
  mocking its UI children. Drive `messages`/`pendingRequests` via hoisted mock
  state and call `root.render()` again inside `act()` to re-fire effects.
- **`vi.hoisted` for controllable mocks.** `vi.mock` factories can't close over
  ordinary test-file vars (hoisting). Put shared spies + mutable state in a
  `vi.hoisted(() => ({...}))` object and reference it from both factory and test.
- **Module state leaks across tests in a file.** `ui-sound`'s `safe()` debounce
  (`lastPlayed`) and `soundEngine`'s volume/mute/ambient state are module-level
  singletons. Without `vi.resetModules()` in `beforeEach`, a second test sees the
  first test's debounce timestamp and the chime is silently skipped. Reset
  modules (and `localStorage`, since audio-settings persists there) per test, and
  re-`await import(...)` inside each test.
- **Stub Web Audio, record ONLY GainNode.gain.** To prove the chime is silent
  when muted, a fake `AudioContext` records gain peaks. Oscillator
  `frequency`/`detune` and filter params flow through the same AudioParam shape —
  if you record those you'll capture frequencies (e.g. 1320 Hz) as "loudness".
  Only mark `GainNode.gain` as recording. Snapshot peaks only during the
  `playNotify()` call so the muted-ambient drone (started by `setMuted(true)` →
  `_startMutedAmbient`) doesn't pollute the measurement.
- **Mute path zeroes volume, not `_sfxMuted`.** audio-settings mute calls
  soundEngine `setMuted` (sets `_muted`, used by ambient) AND `setSfxVolume(0)`.
  SFX silence comes from `getSfxVol() === 0`, not `getSfxMuted()`. Assert on
  `getSfxVol`.
