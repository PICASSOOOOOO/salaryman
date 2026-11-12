---
name: Site-wide command palette (Pablo nav search)
description: How the global "Ask Pablo" nav search bar / Cmd+K command palette routes users to pages.
---

# Command palette / nav search

A site-wide search bar + ⌘K palette that turns Pablo into a navigation router.

- **Catalog is client-derived, shipped per-request.** `lib/page-catalog.ts` derives the navigable page list from `MODULES`/`PROFILE_MODULES`/`SETTINGS_MODULES` + curated `EXTRA_PAGES` + an `ALIASES` map; excludes `/phone*` and `/api*`. The palette POSTs a compact form (`catalogForPrompt()`) to `/chat/pablo/command` as a `pages` body so Pablo only ever picks REAL paths. **Why:** avoids a new workspace package / composite build for a server-side catalog. The `/pablo` front door sends no `pages`, so it keeps its prior behavior (backward-compatible).

- **Two safe-path layers.** `lib/safe-path.ts#sanitizeReturnPath` (client) was extracted from PabloTerminal and reused. The server has its own `sanitizeNavPath` in `chat.ts` (same rules: same-origin in-app only, no `/api`, no `/phone`, no protocol-relative). Both navigate AND every suggest item are sanitized server-side before returning.

- **`suggest` action.** When Pablo isn't confident in one page he returns `{kind:"suggest",items:[{label,path}]}` (2–5 ranked). The catalog grounding + suggest shape are only injected into the prompt when `pages` is present. Validation whitelist in chat.ts now includes `"suggest"`.

- **Free local matches.** As you type, `searchCatalog()` renders instant page matches with NO Pablo call (no ƒ charge). Only the explicit "Ask Pablo" row (Enter on a query) hits the metered endpoint.

- **Mounting/gating.** `CommandPalette` is mounted in `App.tsx` gated by `showNavBar` (same gate as the NavBar) — never on `/pablo`, embeds, or fullscreen routes. Opener is a module-level bus (`lib/command-palette-bus.ts`) used by the NavBar search button; ⌘/Ctrl+K listener lives inside the palette.

- **cmdk gotcha.** Must pass `commandProps={{ shouldFilter: false }}` (added to the shared `ui/command.tsx` `CommandDialog`) or cmdk's built-in filter fights the custom matching. Also added sr-only `DialogTitle`/`DialogDescription` to `CommandDialog` to silence Radix a11y warnings.
