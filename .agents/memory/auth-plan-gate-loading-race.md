---
name: Plan/auth gate loading race
description: Why usePlan (and any gate) must key off useAuth().isLoading, not isAuthenticated alone
---

# Plan/auth gate must wait on auth loading

`useAuth()` (lib/replit-auth-web) initializes `isAuthenticated = !!user = false` with
`isLoading = true` during its initial `/api/auth/user` fetch. It **never** returns
`undefined`. So any consumer that decides access from `isAuthenticated` alone treats a
still-loading session as "logged out".

**Concrete failure:** `usePlan` guarded only on `isAuthenticated === undefined` (never
true), so on a cold load / hard refresh of a gated route it committed a non-loading free
plan (`isOwner:false`) before auth resolved, and `PhoneGate` redirected a real owner/paid
user to `/upgrade`.

**Rule:** a plan/entitlement hook (and the gates that read it) must stay in `loading:true`
while `useAuth().isLoading` is true — gate the fetch, the effect, and the useState cache
initializer on it. The server `/api/plan` is correct on its own; this was purely a
client loading-order bug.

**Why:** matches the city-access-control lesson — any authz hook feeding a gate must keep
loading=true on every (re)fetch or the gate fires on stale/default state.

**How to apply:** when adding a new gated route or a new usePlan consumer, never branch on
`isAuthenticated` without also respecting the auth loading flag; render null/skeleton until
both auth and plan have resolved. Also guard async plan fetches with a monotonic request-id
so a response from a prior auth state can't overwrite newer state.

## Auth probe has a hard timeout (don't reintroduce an unbounded gate)

`useAuth()`'s `/api/auth/user` probe is wrapped in an 8s `AbortController` timeout; on
timeout it resolves to **logged-out** (`user=null`, `isLoading=false`). Any loading gate
keyed on `isLoading` (home front door `HomeOrCover`, `AppShell` `holdForAuth`) therefore
can't freeze forever if the probe stalls (the classic symptom after an aborted external
OAuth flow / flaky network).

**Why:** without the timeout a stalled probe pinned `isLoading=true` indefinitely and froze
the front door with no way forward. Timeout→logged-out is strictly safer than an unbounded
hang — a real session re-resolves on the next load.

**How to apply:** never add an unbounded `await` before flipping `isLoading=false`, and
don't gate a route behind `isLoading` without trusting that it WILL resolve. If you add a
new auth-derived gate, the timeout is your safety net — keep it.
