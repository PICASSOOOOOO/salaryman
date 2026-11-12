---
name: Dead-code auditing (interview-helper)
description: How to safely find/remove dead pages & components in interview-helper; pitfalls of reachability scans.
---

# Dead-code auditing in interview-helper

No dead-code tooling is installed (no knip/ts-prune/depcheck). Only `typecheck` (tsc --noEmit) per package.

**Rule:** to find dead files, prefer reference-counting ("is the file's basename imported anywhere via a `/Base` path?") + manual grep verification. Only delete files with provably ZERO real importers.

**Why:** A transitive reachability graph (BFS from main.tsx/App.tsx following `import`/`import()`/`lazy()`) gives FALSE NEGATIVES here — it reported the entire `pixel-office/*` subsystem as unreachable, but it is LIVE (`pages/PabloOffice.tsx` imports `@/pixel-office/LiveOffice`). A barrel/alias hop defeated the parser, so reachability UNDER-counts reachable files and would cause over-deletion. Treat reachability output as a candidate list only, never as deletion authority.

**How to apply:**
- Substring matches are misleading: `Terminal` page vs lucide `Terminal` icon / `TerminalBootAnimation` / `PabloTerminal` / `MobileTerminal`; `World` page vs `WorldMenu`/`WorldPlay`/`WorldMapPanel`/`WorldBuildStation`. Always grep for the exact import path `/<Base>'`.
- Deletion cascades: removing a file can newly-orphan a component that was only imported by it (e.g. AudioDeviceSelector, world/ServerSelect were orphaned only after their importers were deleted). Re-run the orphan scan until it returns 0.
- Do NOT delete `components/ui/*` (shadcn design-system library, kept intentionally) — they show as unreachable but are a kept library.
- Live duplicate features (Colleagues vs ColleaguesPanel, BotCommandCenter vs BotCommandPanel, MediaCenter vs MediaLibrary, WorldMenu vs WorldMapPanel) are all routed/used — merging them is a product decision, NOT dead-code removal.
- The live phone UI is `components/PhoneDialer.tsx` (tabbed, has its own `numbers` tab); the `/phone` route renders `pages/phone/CalllHomePage.tsx` and `/phone/:rest*` only redirects. `pages/phone/PhoneNumbersPage.tsx` was a superseded orphan.
