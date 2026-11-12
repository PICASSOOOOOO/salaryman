---
name: Public route auth gating
description: Protected background reads must wait for resolved auth before running on public pages.
---

Public pages such as `/`, `/pablo`, and `/sign-in` mount shared providers and navigation. Any provider that reads user-scoped data must wait for auth resolution and skip the request when signed out; otherwise harmless public visits create noisy 401s and can leak stale user state across accounts.

**Why:** Shared React providers outlive individual routes, so route-level access checks do not protect their mount effects. A stale local call snapshot or user-specific metadata cache can also trigger protected polling after logout or display another account's result.

**How to apply:** Gate authenticated reads and polling with `isLoading` plus `isAuthenticated`, clear anonymous local state, and key module-level caches by user identity. Keep the public fallback local and avoid using a protected endpoint to discover whether a visitor is signed in.