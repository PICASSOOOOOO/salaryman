---
name: Pygame real-time wage floor
description: Production Pygame follows local wall time and applies the FIAT minimum wage while employer rates remain configurable above the floor.
---

The player-facing Pygame client uses local wall-clock time; accelerated time exists only as an explicit deterministic simulation mode for tests.

The economy conversion is $1 = ƒ100, so the $3/hour minimum is ƒ300/hour. Worker rates may be higher by employer/local policy, but never lower than ƒ300/hour.

**Why:** The user wants the game clock to match real life and wages to reflect the canonical FIAT conversion without silently underpaying workers.

**How to apply:** Keep production scheduling tied to local time and treat ƒ300/hour as the server/client simulation floor whenever new Pygame worker or employer wage paths are added.