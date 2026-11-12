---
name: Paywall escape ("Maybe Later")
description: How pay windows must offer a decline path, and why the escape target is home ("/") rather than back().
---

# Pay windows must always offer a decline path

Every pay window in the SALARYMAN web app must give users a way to decline and
continue. The two full pages are `pages/Pricing.tsx` and `pages/Upgrade.tsx`;
both have a "MAYBE LATER" button (`data-testid` `pricing-maybe-later` /
`upgrade-maybe-later`) that calls `navigate("/")`.

**Why home and not `history.back()`:** `components/ProGate.tsx` redirects
non-inline gated routes (`featureKey && !inline && !hasAccess`) to `/pricing`
via a `useEffect`. If "Maybe Later" used `back()`, returning to the originating
gated route would immediately re-redirect to `/pricing` — an infinite loop.
`/` is NOT ProGate-gated, so it is the safe neutral escape.

**How to apply:** Leave ProGate's redirect logic intact (keeps gating blast
radius minimal). Any new pay window / upsell surface must include a decline
control that lands on a non-gated route (default `/`). Do not point decline
controls at gated deep links or at `/pricing` itself.

Other dismiss paths already exist and are fine: `PrimeAdInterstitial.tsx` has
"MAYBE LATER"; `JeanClawGreeter` (in `TheOffice.tsx`) is Esc-dismissable.
