---
name: Nav module index resolver
description: getModuleForPath in modules.ts maps paths to modules by hardcoded array index — fragile on reorder/removal.
---

# Nav module index resolver (interview-helper)

`src/lib/modules.ts` exports `MODULES: Module[]` and a `getModuleForPath(pathname)`
that returns a module by **hardcoded array index** (e.g. `return MODULES[4]` for
`/business`, `MODULES[7]` for `/armory`).

**Rule:** any time you add, remove, or reorder an entry in the `MODULES` array, you
MUST re-check every `MODULES[n]` index inside `getModuleForPath` in the same edit.
Removing one module silently shifts the index of every module after it.

**Why:** there is no id-based lookup; the resolver trusts positional indices, so a
shift produces the *wrong* sub-nav with no type error.

**How to apply:** to fold one module's pages under another (e.g. INTEL folded into
BUSINESS), move the subs into the host module, delete the standalone Module object,
then point that path prefix at the host's index (`/intel` -> `MODULES[4]` business)
and decrement any later indices (armory `8` -> `7`). Pages/routes in App.tsx can keep
their original path prefixes; the sub-nav still highlights them via exact-path match.
Also drop the standalone entry from NavBar `NAV_MORE` and MobileBottomBar
`DROPDOWN_ITEMS`, and remove any now-unused lucide icon imports (noUnusedLocals).
