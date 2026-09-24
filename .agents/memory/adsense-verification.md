---
name: AdSense verification
description: Verify publisher ownership without enabling ads globally.
---

Keep AdSense ownership verification separate from ad delivery. Prefer Google's static publisher meta tag in the HTML head (or ads.txt when that method is selected) so verification does not require loading `adsbygoogle.js` across the site. Keep ad-script loading gated by an actual configured slot and the logged-out eligible-page check; globally loading the library could activate Auto ads outside the single-banner requirement.

**Why:** The publisher snippet was absent from the crawler-visible HTML because client-side injection only ran when a slot ID was configured, and the slot and site approval were unknown.

**How to apply:** For verification failures, inspect the published HTML source and crawler access first. If using the meta-tag method, make sure the user selects that method in AdSense; do not enable the ad loader globally just to verify ownership.

Keep responsive ad units in normal document flow after page content; do not pin them over the viewport.

**Why:** Auto-sized creatives can be taller than the familiar 50px/90px banner sizes, so a fixed bottom slot can intercept clicks on nearby links and controls.

**How to apply:** Let the ad container grow with its creative and add visual spacing around it. Do not use pointer-events tricks or raise page controls over the ad.