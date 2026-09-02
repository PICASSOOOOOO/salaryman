---
name: Startup art bake
description: Keep paid image generation out of the API readiness path.
---

API boot may register the art catalog, but must not launch paid image-generation jobs automatically. Image generation belongs behind an explicit admin/manual action.

**Why:** Provider credit exhaustion caused repeated portrait requests during every restart, making the app appear hung and competing with normal API startup.

**How to apply:** Keep the boot seeder at zero provider kickoffs and preserve the explicit portrait-bake route for intentional generation after credits and provider health are confirmed.